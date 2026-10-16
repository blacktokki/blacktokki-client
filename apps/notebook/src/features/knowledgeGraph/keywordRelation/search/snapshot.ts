import { toRaw } from '@blacktokki/editor';

import type { GraphSearchSnapshot, GraphSource, SearchNode, SearchEdge } from './types';
import { base64Decode, parseHtmlToParagraphs } from '../../../../components/HeaderSelectBar';
import type { KnowledgeGraphData, KnowledgeGraphNode } from '../../types';
import {
  getKnowledgeGraphNodeKind,
  getKnowledgeGraphNodeKindLabel,
  getKnowledgeGraphRelationDisplayLabel,
} from '../../utils/relations';
import { relationCacheHash } from '../relationCheckpoint';
import { checkRelationCancelled } from '../relationDiscovery';
import type { InductiveRelationCandidate } from '../relationDiscovery';

export const yieldGraphSearch = async (signal?: AbortSignal) => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  checkRelationCancelled(signal);
};

/** Build a text-only, scoped inventory. Rendering flags and layout coordinates never enter it. */
export async function createGraphSearchSnapshot({
  graph,
  scope,
  notes,
  boards = [],
  candidates = [],
  coverage,
  translate,
  usageMode,
  signal,
}: {
  graph: Pick<KnowledgeGraphData, 'nodes' | 'edges'>;
  scope: string;
  notes: { title: string; description?: string }[];
  boards?: { title: string; description?: string }[];
  candidates?: InductiveRelationCandidate[];
  coverage: GraphSearchSnapshot['coverage'];
  translate: (value: string) => string;
  usageMode?: string;
  signal?: AbortSignal;
}): Promise<GraphSearchSnapshot> {
  checkRelationCancelled(signal);
  const documents = new Map([...notes, ...boards].map((note) => [note.title, note]));
  const sources = new Map<string, GraphSource>();
  const paragraphs = new Map<string, ReturnType<typeof parseHtmlToParagraphs>>();
  const findParagraph = (title: string, path: string[]) => {
    if (!path.length || !documents.has(title)) return undefined;
    if (!paragraphs.has(title))
      paragraphs.set(title, parseHtmlToParagraphs(documents.get(title)?.description || ''));
    return paragraphs
      .get(title)!
      .find(
        (paragraph) =>
          JSON.stringify(paragraph.path.split(',').filter(Boolean).map(base64Decode)) ===
          JSON.stringify(path)
      );
  };
  const plain = new Map<string, string>();
  const raw = (html: string) => {
    if (!plain.has(html)) plain.set(html, toRaw(html));
    return plain.get(html)!;
  };
  const addSource = (
    title: string,
    paragraph?: KnowledgeGraphNode['paragraph'],
    text?: string,
    href?: string
  ) => {
    if (!documents.has(title)) return;
    const section = paragraph?.autoSection || paragraph?.section;
    const name = paragraph?.title;
    const id = JSON.stringify([
      title,
      paragraph?.path || name || '',
      section || '',
      href || '',
      text || '',
    ]);
    if (!sources.has(id))
      sources.set(id, {
        id,
        title,
        ...(name && { paragraph: name }),
        ...(section && { section }),
        ...(paragraph?.path && { path: paragraph.path }),
        ...(href && { href }),
        text:
          text ??
          raw(paragraph ? paragraph.description || '' : documents.get(title)?.description || ''),
      });
    return id;
  };
  const nodes: SearchNode[] = [];
  const rawNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const [index, node] of graph.nodes.entries()) {
    if (index % 64 === 0) await yieldGraphSearch(signal);
    const kind = getKnowledgeGraphNodeKind(node);
    const sourceIds = new Set<string>();
    const add = (id?: string) => {
      if (id) sourceIds.add(id);
    };
    const external = kind === 'externalLink' || kind === 'connectedExternalLink';
    if (node.paragraphOccurrences?.length) {
      for (const paragraph of node.paragraphOccurrences)
        add(addSource(paragraph.origin || node.noteTitle, paragraph));
    } else if (!external) add(addSource(node.paragraph?.origin || node.noteTitle, node.paragraph));
    for (const source of node.keyword?.sources || []) {
      const path = source.sectionPath || source.section.split(' / ').filter(Boolean);
      add(
        addSource(source.noteTitle, findParagraph(source.noteTitle, path), undefined, source.href)
      );
    }
    for (const title of node.template?.sourceTitles || []) add(addSource(title));
    // External nodes acquire accessible provenance from their reference edges below.
    if (!external && kind !== 'builtInClass' && kind !== 'templateGroup' && !sourceIds.size)
      continue;
    nodes.push({
      id: node.id,
      name: node.name,
      kind,
      typeLabel: getKnowledgeGraphNodeKindLabel(kind, translate, usageMode),
      noteTitle: [...sourceIds].map((id) => sources.get(id)?.title).find(Boolean) || '',
      body: [
        Object.keys(node.properties || {}).length ? JSON.stringify(node.properties) : '',
        ...[...sourceIds].map((id) => sources.get(id)!.text),
      ]
        .filter(Boolean)
        .join('\n'),
      sourceIds: [...sourceIds],
      ...(external && node.description && { url: node.description }),
    });
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byCandidate = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const edges: SearchEdge[] = [];
  for (const [index, edge] of graph.edges.entries()) {
    if (index % 128 === 0) await yieldGraphSearch(signal);
    const source = byId.get(edge.source),
      target = byId.get(edge.target);
    if (!source || !target) continue;
    const sourceIds = new Set(source.sourceIds);
    const verdict = edge.keywordRelation?.verdict;
    if (edge.type === 'KEYWORD_RELATION') {
      if (verdict !== 'supported' && verdict !== 'contradicted') continue;
      sourceIds.clear();
      const candidate = byCandidate.get(edge.keywordRelation!.candidateId);
      candidate?.observations.forEach((observation, position) => {
        const originalSource = rawNodes.get(edge.source)?.name;
        const originalTarget = rawNodes.get(edge.target)?.name;
        if (
          candidate.validations[position]?.verdict !== verdict ||
          observation.source.normalize('NFC').toLowerCase() !==
            originalSource?.normalize('NFC').toLowerCase() ||
          observation.target.normalize('NFC').toLowerCase() !==
            originalTarget?.normalize('NFC').toLowerCase()
        )
          return;
        const path = observation.sectionPath || observation.section.split(' / ').filter(Boolean);
        const id = addSource(
          observation.noteTitle,
          findParagraph(observation.noteTitle, path),
          observation.evidence
        );
        if (id) sourceIds.add(id);
      });
      if (!sourceIds.size) continue;
    }
    if (
      edge.type === 'KEYWORD_SOURCE' ||
      edge.type === 'DERIVED_FROM' ||
      edge.type === 'REPRESENTED_BY_NOTE'
    )
      target.sourceIds.forEach((id) => sourceIds.add(id));
    if (edge.type === 'EXTERNAL_REFERENCE') {
      if (!sourceIds.size) continue;
      target.sourceIds = [...new Set([...target.sourceIds, ...sourceIds])];
    }
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: getKnowledgeGraphRelationDisplayLabel(edge, translate),
      directed: edge.directed !== false,
      ...(edge.type === 'KEYWORD_RELATION' &&
        (verdict === 'supported' || verdict === 'contradicted') && { verdict }),
      sourceIds: [...sourceIds],
    });
  }
  const keptNodes = nodes.filter((node) => !node.url || node.sourceIds.length);
  const ids = new Set(keptNodes.map((node) => node.id));
  const keptEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const usedSources = new Set([
    ...keptNodes.flatMap((node) => node.sourceIds),
    ...keptEdges.flatMap((edge) => edge.sourceIds),
  ]);
  const data = {
    version: 1 as const,
    scope,
    nodes: keptNodes,
    edges: keptEdges,
    sources: [...sources.values()].filter((source) => usedSources.has(source.id)),
    coverage,
  };
  const revision = await relationCacheHash(JSON.stringify(data));
  checkRelationCancelled(signal);
  return { ...data, revision };
}
