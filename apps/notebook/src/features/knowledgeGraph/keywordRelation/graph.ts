import type { KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';
import type { InductiveRelationCandidate, RelationEntityResult } from './relationDiscovery';
import {
  normalizeRelationText,
  relationKeywordEntityKey,
  relationKeywordKey,
} from './relationKeywords';
import { findKnowledgeGraphLinkTargetNodeId } from '../utils/links';
import type { getKnowledgeGraphPalette, getKeywordRelationColors } from '../utils/palette';

type Graph = Pick<KnowledgeGraphData, 'nodes' | 'edges'>;
type Source = NonNullable<KnowledgeGraphNode['keyword']>['sources'][number];
type LinkTarget = { title: string; paragraph?: string; section?: string };
const sectionKey = (title: string, path: string[]) =>
  JSON.stringify([title.normalize('NFC'), path.map(normalizeRelationText)]);
const linkKey = (href: string) => {
  try {
    return new URL(href).href;
  } catch {
    return href;
  }
};

/** Project the shared analysis without merging original names, executing inference or changing note metadata. */
export function addKeywordRelationGraph(
  graph: Graph,
  extraction: RelationEntityResult | undefined,
  candidates: InductiveRelationCandidate[],
  palette: ReturnType<typeof getKnowledgeGraphPalette>,
  relationColors: ReturnType<typeof getKeywordRelationColors>,
  resolveNoteLink?: (href: string, noteTitle: string) => LinkTarget | undefined
): Graph {
  if (!extraction?.entities.length) return graph;
  const keywords = new Map<string, KnowledgeGraphNode>();
  const locations = new Map<string, Set<string>>();
  const sourceNodes = new Map<string, KnowledgeGraphNode>();
  const sectionNodes = new Map<string, KnowledgeGraphNode>();
  const nodesByTitle = new Map<string, KnowledgeGraphNode[]>();
  const externalLinks = new Map<string, KnowledgeGraphNode[]>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const decoder = new TextDecoder();
  for (const node of graph.nodes) {
    for (const title of new Set([
      node.noteTitle,
      ...(node.paragraphOccurrences || []).map((item) => item.origin),
    ])) {
      if (!title) continue;
      const key = title.normalize('NFC');
      const group = nodesByTitle.get(key) || [];
      group.push(node);
      nodesByTitle.set(key, group);
    }
    if (
      (node.instanceKind === 'EXTERNAL_LINK' || node.instanceKind === 'CONNECTED_EXTERNAL_LINK') &&
      node.description
    ) {
      const key = linkKey(node.description);
      const group = externalLinks.get(key) || [];
      group.push(node);
      externalLinks.set(key, group);
    }
    for (const paragraph of node.paragraphOccurrences || (node.paragraph ? [node.paragraph] : [])) {
      if (!paragraph.path) continue;
      try {
        const path = paragraph.path
          .split(',')
          .map((part) =>
            decoder.decode(Uint8Array.from(atob(part), (character) => character.charCodeAt(0)))
          );
        sectionNodes.set(sectionKey(paragraph.origin || node.noteTitle, path), node);
      } catch {
        // A malformed legacy heading path can still fall back to its containing note.
      }
    }
  }
  // Full notes take precedence over board documents represented by cards or paragraphs.
  for (const node of [
    ...graph.nodes.filter((item) => item.instanceKind === 'NOTE'),
    ...graph.nodes,
  ]) {
    if (
      node.instanceKind !== 'NOTE' &&
      node.instanceKind !== 'CARD' &&
      node.instanceKind !== 'BOARD_PARAGRAPH' &&
      node.classKind !== 'BOARD_CARD'
    )
      continue;
    for (const title of [
      node.noteTitle,
      node.paragraph?.origin,
      ...(node.paragraphOccurrences || []).map((item) => item.origin),
    ]) {
      if (title && !sourceNodes.has(title.normalize('NFC')))
        sourceNodes.set(title.normalize('NFC'), node);
    }
  }
  const addSource = (node: KnowledgeGraphNode, source: Source) => {
    const key = JSON.stringify([
      source.noteTitle,
      source.section,
      source.sectionPath || [],
      source.kind,
      source.href,
    ]);
    const seen = locations.get(node.id)!;
    if (seen.has(key)) return;
    seen.add(key);
    node.keyword!.sources.push({
      noteTitle: source.noteTitle,
      section: source.section,
      sectionPath: source.sectionPath,
      kind: source.kind,
      href: source.href,
      keyword: source.keyword,
    });
  };
  const noteIds = new Map([...sourceNodes].map(([title, node]) => [title, node.id]));
  const resolveSource = (source: Source) => {
    if (source.kind === 'link' && source.href) {
      const links = externalLinks.get(linkKey(source.href)) || [];
      const link =
        links.find(
          (node) => relationKeywordKey(node.name) === relationKeywordKey(source.keyword || '')
        ) || (links.length === 1 ? links[0] : undefined);
      if (link) return link;
      const target = resolveNoteLink?.(source.href, source.noteTitle);
      if (target) {
        const id = findKnowledgeGraphLinkTargetNodeId(
          nodesByTitle.get(target.title.normalize('NFC')) || [],
          noteIds,
          target
        );
        const node = id && nodeById.get(id);
        if (node) return node;
      }
    }
    const path = source.sectionPath ?? source.section.split(' / ').filter(Boolean);
    return (
      sectionNodes.get(sectionKey(source.noteTitle, path)) ||
      sourceNodes.get(source.noteTitle.normalize('NFC'))
    );
  };
  for (const entity of extraction.entities) {
    const key = relationKeywordEntityKey(entity);
    if (keywords.has(key)) continue;
    const node: KnowledgeGraphNode = {
      id: 'keyword:' + encodeURIComponent(key),
      name: entity.text,
      role: 'INSTANCE',
      instanceKind: 'KEYWORD',
      noteTitle: '',
      properties: {},
      keyword: { key, type: entity.type, sources: [] },
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 12,
      color: palette.keyword.fill,
      strokeColor: palette.keyword.stroke,
    };
    keywords.set(key, node);
    locations.set(node.id, new Set());
    for (const source of extraction.details?.[key]?.sources || []) addSource(node, source);
  }
  const pairs = new Map<string, KnowledgeGraphEdge>();
  for (const candidate of candidates) {
    candidate.observations.forEach((observation, index) => {
      const verdict = candidate.validations[index]?.verdict;
      if (verdict !== 'supported' && verdict !== 'contradicted') return;
      const source = keywords.get(relationKeywordKey(observation.source));
      const target = keywords.get(relationKeywordKey(observation.target));
      if (!source || !target) return;
      addSource(source, observation);
      addSource(target, observation);
      if (source === target) return;
      const key = JSON.stringify([candidate.id, source.id, target.id, verdict]);
      let edge = pairs.get(key);
      if (!edge) {
        edge = {
          id: 'edge:keywordRelation:' + key,
          source: source.id,
          target: target.id,
          type: 'KEYWORD_RELATION',
          label: candidate.label,
          directed: false,
          color: relationColors[verdict],
          dashed: verdict === 'contradicted',
          keywordRelation: { candidateId: candidate.id, verdict, observations: 0 },
        };
        pairs.set(key, edge);
      }
      edge.keywordRelation!.observations++;
    });
  }
  const edges = [...pairs.values()];
  const sourceTargets = new Set<string>();
  for (const node of keywords.values()) {
    const targets = new Set(
      node.keyword!.sources.flatMap((source) => {
        const target = resolveSource(source);
        return target ? [target.id] : [];
      })
    );
    for (const target of targets) {
      sourceTargets.add(target);
      edges.push({
        id: `edge:keywordSource:${node.id}->${target}`,
        source: node.id,
        target,
        type: 'KEYWORD_SOURCE',
        propertyLabel: 'keywordSource',
        color: palette.keyword.stroke,
      });
    }
  }
  // Source paragraphs and links must remain visible while their keyword connections are shown.
  const nodes = graph.nodes.map((node): KnowledgeGraphNode => {
    if (!sourceTargets.has(node.id)) return node;
    if (node.instanceKind === 'PARAGRAPH')
      return {
        ...node,
        instanceKind: 'CONNECTED_PARAGRAPH',
        color: palette.connectedParagraph.fill,
        strokeColor: palette.connectedParagraph.stroke,
      };
    if (node.instanceKind === 'EXTERNAL_LINK')
      return {
        ...node,
        instanceKind: 'CONNECTED_EXTERNAL_LINK',
        color: palette.connectedExternalLink.fill,
        strokeColor: palette.connectedExternalLink.stroke,
      };
    return node;
  });
  return { nodes: [...nodes, ...keywords.values()], edges: [...graph.edges, ...edges] };
}
