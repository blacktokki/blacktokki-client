import type { KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';
import {
  relationEnumerationItemKey,
  normalizeRelationText,
  relationKeywordEntityKey,
  relationKeywordKey,
} from './keyword/keywordUtils';
import {
  groupRelationEvidenceByRolePair,
  relationGroupEvidenceSatisfied,
  uniqueRelationEvidence,
} from './relationPresentation';
import {
  relationAssociationType,
  relationAssociationTypeLabels,
  compareRelationScore,
  createRelationResultsIndex,
  relationAssociationRank,
} from './relationResults';
import type { InductiveRelationCandidate, RelationEntityResult } from './types';
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
  const inventory = createRelationResultsIndex(
    extraction.entities,
    [],
    extraction.details,
    extraction.entityTypes
  ).entities;
  for (const entity of inventory.values()) {
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
    for (const source of entity.sources) addSource(node, source);
  }
  const pairs = new Map<string, KnowledgeGraphEdge>();
  const supportedGroups = groupRelationEvidenceByRolePair(
    candidates
      .map((candidate) => ({
        candidate,
        rank: candidate.association || relationAssociationRank(candidate.measurements),
      }))
      .sort((a, b) => compareRelationScore(a.rank, b.rank))
      .flatMap(({ candidate }) =>
        candidate.observations.map((observation, index) => ({
          observation,
          measurement: candidate.measurements[index],
          associationContext: candidate.association?.context ?? candidate.associationContext,
          associationFamily: candidate.associationFamily,
          associationRoles: candidate.associationRoles,
          id: JSON.stringify([candidate.id, index]),
        }))
      )
  ).filter((group) =>
    relationGroupEvidenceSatisfied(
      group.items,
      relationAssociationRank(uniqueRelationEvidence(group.items).map((item) => item.measurement))
        .score
    )
  );
  const supported = new Set(supportedGroups.flatMap((group) => group.items.map((item) => item.id)));
  for (const candidate of candidates) {
    candidate.observations.forEach((observation, index) => {
      const score =
        candidate.measurements[index]?.association?.score ?? candidate.association?.score ?? 0;
      const source = keywords.get(relationKeywordKey(observation.source));
      const target = keywords.get(relationKeywordKey(observation.target));
      if (!source || !target) return;
      addSource(source, observation);
      addSource(target, observation);
      if (!supported.has(JSON.stringify([candidate.id, index]))) return;
      if (source === target) return;
      const associationContext = relationAssociationType({
        observation,
        measurement: candidate.measurements[index],
        associationContext: candidate.association?.context ?? candidate.associationContext,
      });
      const key = JSON.stringify([associationContext, ...[source.id, target.id].sort()]);
      let edge = pairs.get(key);
      if (!edge) {
        edge = {
          id: 'edge:keywordRelation:' + key,
          source: source.id,
          target: target.id,
          type: 'KEYWORD_RELATION',
          label: relationAssociationTypeLabels[associationContext],
          directed: false,
          color: relationColors.association,
          keywordRelation: {
            candidateId: candidate.id,
            associationContext,
            score,
            observations: 0,
          },
        };
        pairs.set(key, edge);
      }
      edge.keywordRelation!.score = Math.max(edge.keywordRelation!.score, score);
      edge.keywordRelation!.observations++;
      if (edge.keywordRelation!.candidateId !== candidate.id) {
        if (!edge.keywordRelation!.candidateIds)
          edge.keywordRelation!.candidateIds = [edge.keywordRelation!.candidateId];
        const ids = edge.keywordRelation!.candidateIds;
        if (!ids.includes(candidate.id)) ids.push(candidate.id);
      }
    });
  }
  const edges = [...pairs.values()];
  for (const entity of inventory.values()) {
    const source = keywords.get(entity.key)!;
    for (const [label, members] of [
      ['Compound / contained keyword relationships', entity.generalRelations?.containedKeys || []],
      [
        'Synthetic / constituent keyword relationships',
        entity.generalRelations?.constituentKeys || [],
      ],
    ] as const) {
      for (const key of members) {
        const target = keywords.get(key);
        if (!target || source === target) continue;
        edges.push({
          id: `edge:keywordGeneral:${label}:${source.id}->${target.id}`,
          source: source.id,
          target: target.id,
          type: 'KEYWORD_GENERAL',
          propertyLabel: label,
          color: palette.keyword.stroke,
        });
      }
    }
  }
  const keywordTypes = new Map<string, KnowledgeGraphNode>();
  const addType = (
    key: string,
    kind: NonNullable<KnowledgeGraphNode['keywordType']>['kind'],
    name: string,
    memberKeys: string[],
    sources?: Source[]
  ) => {
    const members = [...new Set(memberKeys)].flatMap((key) => {
      const member = keywords.get(key);
      return member ? [member] : [];
    });
    if (!members.length) return;
    const id = `keyword-type:${kind}:${encodeURIComponent(key)}`;
    let node = keywordTypes.get(id);
    if (!node) {
      node = {
        id,
        name,
        role: 'CLASS',
        classKind: 'KEYWORD_TYPE',
        classCategory: 'DERIVED',
        noteTitle: '',
        properties: {},
        keywordType: {
          key,
          kind,
          sources: [
            ...new Map(
              (sources?.length
                ? sources
                : members.flatMap((member) => member.keyword!.sources)
              ).map((source) => [JSON.stringify(source), source])
            ).values(),
          ],
        },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 16,
        color: palette.keywordType.fill,
        strokeColor: palette.keywordType.stroke,
      };
      keywordTypes.set(id, node);
    }
    for (const member of members)
      edges.push({
        id: `edge:keywordType:${member.id}->${id}`,
        source: member.id,
        target: id,
        type: 'INSTANCE_OF',
        propertyLabel: 'keywordType',
        color: palette.keywordType.stroke,
      });
    return node;
  };
  const collectedTypes = extraction.entityTypes || [];
  const collectedNodes = collectedTypes.map((type) =>
    addType(
      JSON.stringify(type.items.map(relationEnumerationItemKey).sort()),
      'entity-type',
      type.name,
      type.items.flatMap((item) => item.keywords.map((keyword) => keyword.key)),
      type.occurrences.flatMap((occurrence) =>
        occurrence.items.map((item) => ({
          noteTitle: item.noteTitle,
          section: item.sectionPath.join(' / '),
          sectionPath: item.sectionPath,
        }))
      )
    )
  );
  for (const [index, type] of collectedTypes.entries()) {
    const child = collectedNodes[index];
    if (!child) continue;
    for (const parentIndex of type.parentIndices) {
      const parent = collectedNodes[parentIndex];
      if (!parent || parent.id === child.id) continue;
      edges.push({
        id: `edge:keywordTypeHierarchy:${child.id}->${parent.id}`,
        source: child.id,
        target: parent.id,
        type: 'SUBCLASS_OF',
        propertyLabel: 'keywordTypeHierarchy',
        color: palette.keywordType.stroke,
      });
    }
  }
  const patterns = new Map<string, string[]>();
  for (const [key, node] of keywords) {
    const pattern = node.keyword!.type;
    if (!pattern) continue;
    const members = patterns.get(pattern) || [];
    members.push(key);
    patterns.set(pattern, members);
  }
  for (const [pattern, members] of patterns) addType(pattern, 'entity-pattern', pattern, members);
  const typesByRole = new Map(
    [...keywordTypes.values()].map((node) => [
      JSON.stringify([
        node.keywordType!.kind === 'entity-type' ? 'type' : 'pattern',
        relationKeywordKey(node.name),
      ]),
      node,
    ])
  );
  const typePairs = new Map<
    string,
    {
      source: string;
      target: string;
      associationType: keyof typeof relationAssociationTypeLabels;
      items: (typeof supportedGroups)[number]['items'];
    }
  >();
  for (const group of supportedGroups) {
    if (group.sourceRole.kind === 'keyword' || group.targetRole.kind === 'keyword') continue;
    const source = typesByRole.get(
      JSON.stringify([group.sourceRole.kind, relationKeywordKey(group.sourceRole.name)])
    );
    const target = typesByRole.get(
      JSON.stringify([group.targetRole.kind, relationKeywordKey(group.targetRole.name)])
    );
    if (!source || !target || source === target) continue;
    for (const association of group.associations) {
      const key = JSON.stringify([association.associationType, ...[source.id, target.id].sort()]);
      let pair = typePairs.get(key);
      if (!pair) {
        pair = {
          source: source.id,
          target: target.id,
          associationType: association.associationType,
          items: [],
        };
        typePairs.set(key, pair);
      }
      for (const item of association.items) pair.items.push(item);
    }
  }
  for (const [key, pair] of typePairs) {
    const evidence = uniqueRelationEvidence(pair.items);
    const rank = relationAssociationRank(evidence.map((item) => item.measurement));
    edges.push({
      id: `edge:keywordTypeRelation:${key}`,
      source: pair.source,
      target: pair.target,
      type: 'KEYWORD_TYPE_RELATION',
      label: relationAssociationTypeLabels[pair.associationType],
      directed: false,
      color: relationColors.association,
      keywordTypeRelation: { ...rank, evidence: evidence.map((item) => item.observation) },
    });
  }
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
  return {
    nodes: [...nodes, ...keywords.values(), ...keywordTypes.values()],
    edges: [...graph.edges, ...new Map(edges.map((edge) => [edge.id, edge])).values()],
  };
}
