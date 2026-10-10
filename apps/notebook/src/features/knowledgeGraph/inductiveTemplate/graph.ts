import type { getKnowledgeGraphPalette } from './palette';
import type { SimilarTemplateGroup } from '../../inductiveTemplate/templateSimilarity';
import type { KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';

type Graph = Pick<KnowledgeGraphData, 'nodes' | 'edges'>;
type Palette = ReturnType<typeof getKnowledgeGraphPalette>;

const stableId = (value: string): string => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    first = Math.imul(first ^ value.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ value.charCodeAt(index), 0x85ebca6b);
  }
  return [first, second].map((hash) => (hash >>> 0).toString(16).padStart(8, '0')).join('');
};

export const isTemplateGraphNode = (node: KnowledgeGraphNode): boolean =>
  node.instanceKind === 'TEMPLATE' || node.classKind === 'TEMPLATE_GROUP';

/** ADR-2602: augment the current graph without changing source documents or validation. */
export function addTemplateGraph(
  graph: Graph,
  groups: SimilarTemplateGroup[],
  palette: Palette,
  groupLabel: string
): Graph {
  if (!groups.length) return graph;
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const sources = new Map<string, KnowledgeGraphNode>();
  // Prefer a full note. A board's corresponding document is represented by its class.
  for (const node of graph.nodes) {
    if (node.instanceKind === 'NOTE') sources.set(node.noteTitle.normalize('NFC'), node);
  }
  for (const node of graph.nodes) {
    if (node.classKind === 'BOARD_CARD' && !sources.has(node.noteTitle.normalize('NFC')))
      sources.set(node.noteTitle.normalize('NFC'), node);
  }
  // Column documents may be represented only by their cards or shared board paragraphs.
  for (const node of graph.nodes) {
    if (node.instanceKind !== 'CARD' && node.instanceKind !== 'BOARD_PARAGRAPH') continue;
    const titles = [
      node.noteTitle,
      node.paragraph?.origin,
      ...(node.paragraphOccurrences || []).map((paragraph) => paragraph.origin),
    ];
    for (const title of titles) {
      if (title && !sources.has(title.normalize('NFC'))) sources.set(title.normalize('NFC'), node);
    }
  }
  for (const group of groups) {
    const templates = group.templates.map((template) => ({
      template,
      id:
        'template:' +
        stableId(
          JSON.stringify([
            template.markdown,
            template.sourceTitles.map((title) => title.normalize('NFC')).sort(),
          ])
        ),
    }));
    const groupId =
      templates.length > 1
        ? 'class:templateGroup:' + stableId(JSON.stringify(templates.map(({ id }) => id).sort()))
        : undefined;
    if (groupId) {
      nodes.push({
        id: groupId,
        name: `${groupLabel} · ${group.templates[0].name}`,
        role: 'CLASS',
        classKind: 'TEMPLATE_GROUP',
        classCategory: 'DERIVED',
        noteTitle: '',
        properties: {},
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 17,
        color: palette.templateGroup.fill,
        strokeColor: palette.templateGroup.stroke,
      });
    }
    for (const { template, id } of templates) {
      nodes.push({
        id,
        name: template.name,
        role: 'INSTANCE',
        instanceKind: 'TEMPLATE',
        noteTitle: '',
        template,
        properties: {},
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 9,
        color: palette.template.fill,
        strokeColor: palette.template.stroke,
      });
      if (groupId) {
        edges.push({
          id: `edge:templateGroup:${id}->${groupId}`,
          source: id,
          target: groupId,
          type: 'INSTANCE_OF',
          propertyLabel: 'templateGroup',
          dashed: true,
          color: palette.templateGroup.stroke,
        });
      }
      const targets = new Set(
        template.sourceTitles.flatMap((title) => {
          const source = sources.get(title.normalize('NFC'));
          return source ? [source.id] : [];
        })
      );
      for (const target of targets) {
        edges.push({
          id: `edge:templateSource:${id}->${target}`,
          source: id,
          target,
          type: 'DERIVED_FROM',
          propertyLabel: 'templateSource',
          color: palette.template.stroke,
        });
      }
    }
  }
  return { nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...edges] };
}

/** Include template membership and provenance in the ordinary bidirectional N-hop traversal. */
export function templateGraphNeighbors(edges: KnowledgeGraphEdge[]) {
  const adjacent = new Map<string, Set<string>>();
  for (const { source, target } of edges) {
    if (!adjacent.has(source)) adjacent.set(source, new Set());
    if (!adjacent.has(target)) adjacent.set(target, new Set());
    adjacent.get(source)!.add(target);
    adjacent.get(target)!.add(source);
  }
  return (id: string, depth = 1): Set<string> => {
    const found = new Set([id]);
    let layer = [id];
    for (let step = 0; step < depth && layer.length; step++) {
      const next: string[] = [];
      for (const source of layer) {
        for (const target of adjacent.get(source) || []) {
          if (found.has(target)) continue;
          found.add(target);
          next.push(target);
        }
      }
      layer = next;
    }
    return found;
  };
}
