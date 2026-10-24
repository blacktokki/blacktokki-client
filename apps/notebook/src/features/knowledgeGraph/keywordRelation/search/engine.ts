import { buildGraphSearchContextAsync } from './context';
import { normalizeGraphQuery, resolveQueryNames, retrieveGraph } from './retrieval/query';
import { yieldGraphSearch } from './snapshot';
import { checkRelationCancelled } from '../keyword/keywordUtils';
import { GRAPH_SEARCH_EMBEDDING_CHARS } from '../types';
import type {
  GraphQueryPlan,
  GraphSearchResult,
  GraphSearchSnapshot,
  SearchDocument,
  SearchNode,
  GraphSource,
} from '../types';

export { buildGraphSearchContext } from './context';

/** Stop before joining shared source bodies; embeddings consume only this prefix. */
function embeddingText(parts: Iterable<string | undefined>, skipEmpty = false): string {
  let text = '';
  let first = true;
  for (const part of parts) {
    if (skipEmpty && !part) continue;
    if (!first) text += '\n';
    first = false;
    text += (part || '').slice(0, GRAPH_SEARCH_EMBEDDING_CHARS - text.length);
    if (text.length === GRAPH_SEARCH_EMBEDDING_CHARS) break;
  }
  return text;
}

function* nodeText(node: SearchNode, sources: Map<string, GraphSource>) {
  yield node.name;
  yield node.typeLabel;
  yield node.noteTitle;
  yield node.url;
  yield node.body;
  for (const id of node.sourceIds) yield sources.get(id)?.text;
}

export function graphSearchDocuments(
  snapshot: GraphSearchSnapshot,
  signal?: AbortSignal
): SearchDocument[] {
  checkRelationCancelled(signal);
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const sources = new Map(snapshot.sources.map((source) => [source.id, source]));
  const documents: SearchDocument[] = [];
  for (const node of snapshot.nodes) {
    documents.push({
      id: node.id,
      kind: 'node',
      name: node.name,
      text: embeddingText(nodeText(node, sources), true),
    });
  }
  for (const edge of snapshot.edges) {
    documents.push({
      id: edge.id,
      kind: 'edge',
      name: edge.label,
      text: embeddingText(
        (function* () {
          yield edge.label;
          yield edge.type;
          yield nodes.get(edge.source)?.name;
          yield nodes.get(edge.target)?.name;
          for (const id of edge.sourceIds) yield sources.get(id)?.text;
        })()
      ),
    });
  }
  return documents;
}

export async function createGraphSearchIndex(
  snapshot: GraphSearchSnapshot,
  signal?: AbortSignal,
  onProgress?: (processed: number, total: number) => void
) {
  const documents = graphSearchDocuments(snapshot, signal);
  const total = documents.length + snapshot.edges.length;
  onProgress?.(0, total);
  const byNode = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const byEdge = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
  const bySource = new Map(snapshot.sources.map((source) => [source.id, source]));
  const normalized = new Map<string, string>();
  const normalize = (text = '') => {
    let value = normalized.get(text);
    if (value === undefined) {
      value = normalizeGraphQuery(text);
      normalized.set(text, value);
    }
    return value;
  };
  const entries: {
    id: string;
    kind: SearchDocument['kind'];
    normalizedName: string;
    normalizedParts: string[];
    sourceIds: string[];
  }[] = [];
  for (const [index, document] of documents.entries()) {
    onProgress?.(index, total);
    if (index % 128 === 0) await yieldGraphSearch(signal);
    const node = document.kind === 'node' ? byNode.get(document.id) : undefined;
    const edge = document.kind === 'edge' ? byEdge.get(document.id) : undefined;
    const parts = node
      ? [node.name, node.typeLabel, node.noteTitle, node.url, node.body]
      : [edge!.label, edge!.type, byNode.get(edge!.source)?.name, byNode.get(edge!.target)?.name];
    entries.push({
      id: document.id,
      kind: document.kind,
      normalizedName: normalize(document.name),
      normalizedParts: parts.filter(Boolean).map((part) => normalize(part)),
      sourceIds: node?.sourceIds || edge!.sourceIds,
    });
  }
  const adjacent = new Map<string, string[]>();
  const names = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.kind !== 'node' || !entry.normalizedName) continue;
    const ids = names.get(entry.normalizedName) || [];
    ids.push(entry.id);
    names.set(entry.normalizedName, ids);
  }
  for (const [index, edge] of snapshot.edges.entries()) {
    onProgress?.(documents.length + index, total);
    if (index % 128 === 0) await yieldGraphSearch(signal);
    for (const id of [edge.source, edge.target]) {
      let list = adjacent.get(id);
      if (!list) adjacent.set(id, (list = []));
      list.push(edge.id);
    }
  }
  onProgress?.(total, total);
  return {
    snapshot,
    documents,
    entries,
    byNode,
    byEdge,
    bySource,
    adjacent,
    names,
    normalizedSource: (id: string) => normalize(bySource.get(id)?.text),
  };
}
export type GraphSearchIndex = Awaited<ReturnType<typeof createGraphSearchIndex>>;

type RankedEntry = { id: string; kind: 'node' | 'edge'; score: number };
const queryRankings = new WeakMap<
  GraphSearchIndex,
  {
    query: string;
    semantic: Map<string, number>;
    entries: RankedEntry[];
    resolved: ReturnType<typeof resolveQueryNames>;
    results: Map<string, GraphSearchResult>;
    selection?: { seeds: string[]; roots: string[]; edges: Set<string> };
  }
>();

/** Query words are resolved against the current graph vocabulary, including discovered predicates. */
export async function searchKnowledgeGraph(
  index: GraphSearchIndex,
  query: string,
  {
    maxHops = 2,
    signal,
    semanticScores = new Map<string, number>(),
    maxNodes = Infinity,
    maxEdges = Infinity,
    maxSeeds = Infinity,
    contextChars = 16000,
    translate,
  }: {
    maxHops?: number;
    signal?: AbortSignal;
    semanticScores?: Map<string, number>;
    maxNodes?: number;
    maxEdges?: number;
    maxSeeds?: number;
    contextChars?: number;
    translate?: (value: string) => string;
  } = {}
): Promise<GraphSearchResult> {
  checkRelationCancelled(signal);
  maxNodes = Math.max(1, Math.floor(maxNodes) || Infinity);
  maxEdges = Math.max(1, Math.floor(maxEdges) || Infinity);
  maxSeeds = Math.max(1, Math.floor(maxSeeds) || Infinity);
  const normalized = normalizeGraphQuery(query);
  const sourceMatches = new Map<string, boolean[]>();
  const sourceMatchesTerm = (id: string, termIndex: number) => {
    let matches = sourceMatches.get(id);
    if (!matches) {
      const text = index.normalizedSource(id);
      matches = terms.map((term) => text.includes(term));
      sourceMatches.set(id, matches);
    }
    return matches[termIndex];
  };
  const previous = queryRankings.get(index);
  const reused =
    previous?.query === normalized &&
    previous.semantic.size === semanticScores.size &&
    [...semanticScores].every(([id, score]) => previous.semantic.get(id) === score);
  const resolved = reused ? previous.resolved : resolveQueryNames(normalized, index.names);
  const { terms, groups } = resolved;
  const anchors = new Set(groups.flat());
  const ranked: RankedEntry[] = reused ? previous.entries : [];
  for (const [position, entry] of reused ? [] : index.entries.entries()) {
    if (position % 256 === 0) await yieldGraphSearch(signal);
    if (!normalized) break;
    const name = entry.normalizedName;
    const anchor = anchors.has(entry.id);
    const nameMatches = terms.filter((term) => name.includes(term)).length;
    const bodyMatches = terms.filter(
      (term, termIndex) =>
        entry.normalizedParts.some((part) => part.includes(term)) ||
        entry.sourceIds.some((id) => sourceMatchesTerm(id, termIndex))
    ).length;
    const coverage = terms.length ? bodyMatches / terms.length : 0;
    const semantic = Math.max(0, semanticScores.get(entry.id) || 0);
    const score =
      name === normalized
        ? 100
        : anchor
        ? 90 + Math.min(name.length / 100, 1)
        : (nameMatches ? (40 * nameMatches) / Math.max(1, terms.length) : 0) +
          (coverage === 1 ? 25 : coverage >= 0.5 ? 8 * coverage : 0) +
          (semantic >= 0.35 ? semantic * 30 : 0);
    if (score > 0) ranked.push({ id: entry.id, kind: entry.kind, score });
  }
  if (!reused) {
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    queryRankings.set(index, {
      query: normalized,
      semantic: new Map(semanticScores),
      entries: ranked,
      resolved,
      results: new Map(),
    });
  }
  const maxDepth = Math.min(4, Math.max(1, Math.floor(maxHops) || 2));
  const cacheKey = JSON.stringify([query, maxDepth, maxNodes, maxEdges, maxSeeds]);
  const resultCache = queryRankings.get(index)!.results;
  const cached = resultCache.get(cacheKey);
  if (cached) {
    const context = await buildGraphSearchContextAsync(cached, contextChars, translate, signal);
    return { ...cached, context };
  }
  const ranking = queryRankings.get(index)!;
  if (!ranking.selection) {
    const named = index.entries.filter(
      (entry) => entry.kind === 'node' && terms.some((term) => entry.normalizedName.includes(term))
    );
    const directEdges = new Set(
      index.entries
        .filter(
          (entry) =>
            entry.kind === 'edge' &&
            (!named.length ||
              terms.some((term) => entry.normalizedParts.some((part) => part.includes(term))))
        )
        .map((entry) => entry.id)
    );
    const seeds = new Set(anchors);
    // A shared source alone does not make every relationship in that source a query subject.
    // Other direct node matches stay available; named subjects define the neighborhood.
    for (const item of ranked) {
      if (item.kind === 'node') seeds.add(item.id);
      else if (directEdges.has(item.id)) {
        const edge = index.byEdge.get(item.id)!;
        seeds.add(edge.source);
        seeds.add(edge.target);
      }
    }
    const top = ranked[0]?.score;
    const roots = anchors.size
      ? [...anchors]
      : named.length
      ? named.map((entry) => entry.id)
      : [
          ...new Set(
            ranked
              .filter((item) => item.score === top)
              .flatMap((item) => {
                const edge = item.kind === 'edge' && index.byEdge.get(item.id);
                return edge ? [edge.source, edge.target] : [item.id];
              })
          ),
        ];
    ranking.selection = { seeds: [...seeds], roots, edges: directEdges };
  }
  const plan: GraphQueryPlan = {
    terms,
    intent: groups.length >= 2 ? 'connection' : 'related',
    maxHops: maxDepth,
    targetGroups: groups,
    targetIds: [...anchors],
    targetNames: Object.fromEntries([...anchors].map((id) => [id, index.byNode.get(id)!.name])),
    targetTypes: Object.fromEntries(
      [...anchors].map((id) => [id, index.byNode.get(id)!.typeLabel])
    ),
    targetNotes: Object.fromEntries(
      [...anchors].flatMap((id) => {
        const node = index.byNode.get(id)!;
        return ['connectedParagraph', 'paragraph', 'boardParagraph', 'card'].includes(node.kind)
          ? [
              [
                id,
                [
                  ...new Set([
                    node.noteTitle,
                    ...node.sourceIds.map((sourceId) => index.bySource.get(sourceId)?.title),
                  ]),
                ].filter((title): title is string => !!title),
              ],
            ]
          : [];
      })
    ),
  };
  const scores = new Map<string, number>();
  for (const item of ranked) {
    scores.set(item.id, item.score);
  }
  const found = await retrieveGraph(
    index,
    ranking.selection.seeds,
    scores,
    plan,
    { nodes: maxNodes, edges: maxEdges, seeds: maxSeeds },
    signal,
    ranking.selection.roots,
    ranking.selection.edges
  );
  const result: GraphSearchResult = {
    scope: index.snapshot.scope,
    revision: index.snapshot.revision,
    query,
    plan,
    nodes: [...found.nodes]
      .map(([id, score]) => ({ node: index.byNode.get(id)!, score }))
      .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)),
    edges: [...found.edges]
      .map(([id, score]) => ({ edge: index.byEdge.get(id)!, score }))
      .sort((a, b) => b.score - a.score || a.edge.id.localeCompare(b.edge.id)),
    paths: found.paths,
    sources: [],
    context: {
      text: '',
      citations: [],
      entries: [],
      truncated: false,
      usage: { characters: 0, limit: contextChars },
    },
    limited: found.limited,
    pathSearchComplete: found.complete,
  };
  const sourceIds = new Set([
    ...result.edges.flatMap((item) => item.edge.sourceIds),
    ...result.nodes.flatMap((item) => item.node.sourceIds),
  ]);
  for (const id of sourceIds) {
    const origin = index.bySource.get(id)?.origin;
    if (origin) sourceIds.add(origin.sourceId);
    for (const reference of index.bySource.get(id)?.references || [])
      for (const target of reference.targets || []) sourceIds.add(target.sourceId);
  }
  result.sources = index.snapshot.sources.filter((source) => sourceIds.has(source.id));
  result.context = await buildGraphSearchContextAsync(
    result,
    Math.max(256, contextChars),
    translate,
    signal
  );
  resultCache.set(cacheKey, result);
  checkRelationCancelled(signal);
  return result;
}
