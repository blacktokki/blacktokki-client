import { buildGraphSearchContextAsync } from './context';
import {
  cachedGraphSourceText,
  createEvidenceContext,
  graphSourceRanges,
  graphSourceSearch,
} from './evidence';
import type { SearchPassage } from './retrieval';
import {
  createSearchProvenance,
  indexQueryNameTerms,
  normalizeGraphQuery,
  resolveQueryNames,
  retrieveGraph,
} from './retrieval';
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
  const sourceProvenance = createSearchProvenance(bySource, normalize, {
    graphSourceRanges,
    graphSourceSearch,
  });
  const broadSource = (node: SearchNode) =>
    ['note', 'paragraph', 'connectedParagraph', 'boardParagraph', 'card'].includes(node.kind);
  const entries: {
    id: string;
    kind: SearchDocument['kind'];
    normalizedName: string;
    normalizedParts: string[];
    sourceIds: string[];
    passages?: SearchPassage[][];
    sourceOrder?: number[];
    sourceWeights?: number[];
  }[] = [];
  const scopedNodes = new Map<
    string,
    { owner: string; sourceIds: string[]; passages: SearchPassage[][] }
  >();
  for (const [index, document] of documents.entries()) {
    onProgress?.(index, total);
    if (index % 128 === 0) await yieldGraphSearch(signal);
    const node = document.kind === 'node' ? byNode.get(document.id) : undefined;
    const edge = document.kind === 'edge' ? byEdge.get(document.id) : undefined;
    const owner =
      node && !broadSource(node)
        ? node
        : edge?.type === 'EXTERNAL_REFERENCE'
        ? byNode.get(edge.target)
        : edge && !edge.evidence?.length && !broadSource(byNode.get(edge.source)!)
        ? byNode.get(edge.source)
        : undefined;
    const parts = node
      ? [node.name, node.typeLabel, owner ? undefined : node.noteTitle, node.url, node.body]
      : [edge!.label, edge!.type, byNode.get(edge!.source)?.name, byNode.get(edge!.target)?.name];
    const sourceIds = node?.sourceIds || edge!.sourceIds;
    const passages = owner
      ? sourceIds.map((id) => sourceProvenance(id, normalize(owner.name), owner.url))
      : undefined;
    const sourceWeights = passages?.map((items) =>
      items.reduce((maximum, passage) => Math.max(maximum, passage.weight), 0)
    );
    const sourceOrder = sourceWeights
      ?.map((_, index) => index)
      .sort((a, b) => sourceWeights[b] - sourceWeights[a]);
    entries.push({
      id: document.id,
      kind: document.kind,
      normalizedName: normalize(document.name),
      normalizedParts: parts.filter(Boolean).map((part) => normalize(part)),
      sourceIds,
      ...(passages && { passages, sourceOrder, sourceWeights }),
    });
    if (node && owner)
      scopedNodes.set(node.id, { owner: normalize(owner.name), sourceIds, passages: passages! });
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
    nameTerms: indexQueryNameTerms(names),
    evidenceContext: createEvidenceContext(bySource),
    scopedNodes,
    normalizedSource: (id: string, compact = true) => {
      const source = bySource.get(id);
      if (!source) return '';
      const existing = normalized.get(source.text);
      if (existing !== undefined) return existing;
      const cached = cachedGraphSourceText(source);
      if (cached === undefined) return normalize(source.text);
      if (!compact) return cached;
      const value = cached.replace(/\s+/g, ' ').trim();
      normalized.set(source.text, value);
      return value;
    },
  };
}
export type GraphSearchIndex = Awaited<ReturnType<typeof createGraphSearchIndex>>;

type RankedEntry = { id: string; kind: 'node' | 'edge'; score: number };
type QueryRanking = {
  query: string;
  semantic: Map<string, number>;
  entries: RankedEntry[];
  resolved: ReturnType<typeof resolveQueryNames>;
  results: Map<string, GraphSearchResult>;
  selection?: { seeds: string[]; roots: string[]; edges: Set<string> };
  matchedSources: Map<string, string[]>;
};
// Bound retained contexts while allowing a user to revisit recent search words without recomputing them.
const queryRankings = new WeakMap<GraphSearchIndex, Map<string, QueryRanking>>();
const recentQueryLimit = 4;

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
  const passageMatches = new Map<SearchPassage[], number[]>();
  const passageMatchesTerm = (passages: SearchPassage[], termIndex: number) => {
    let matches = passageMatches.get(passages);
    if (!matches) {
      matches = terms.map((term) => {
        for (const passage of passages)
          if (passage.weight > 0 && passage.text.includes(term)) return passage.weight;
        return 0;
      });
      passageMatches.set(passages, matches);
    }
    return matches[termIndex];
  };
  const sourceMatchesTerm = (id: string, termIndex: number) => {
    let matches = sourceMatches.get(id);
    if (!matches) {
      const text = index.normalizedSource(id, compactSources);
      matches = terms.map((term) => text.includes(term));
      sourceMatches.set(id, matches);
    }
    return matches[termIndex];
  };
  let queries = queryRankings.get(index);
  if (!queries) queryRankings.set(index, (queries = new Map()));
  const previous = queries.get(normalized);
  const reused =
    previous?.query === normalized &&
    previous.semantic.size === semanticScores.size &&
    [...semanticScores].every(([id, score]) => previous.semantic.get(id) === score);
  const resolved = reused
    ? previous.resolved
    : resolveQueryNames(normalized, index.names, index.nameTerms);
  const { terms, groups } = resolved;
  // Collapsing whitespace cannot change a term that contains no spaces.
  const compactSources = terms.some((term) => term.includes(' '));
  const anchors = new Set(groups.flat());
  const namedIds = new Set(resolved.namedIds);
  const ranked: RankedEntry[] = reused ? previous.entries : [];
  const matchedSources = reused ? previous.matchedSources : new Map<string, string[]>();
  for (let position = 0; !reused && position < index.entries.length; position++) {
    const entry = index.entries[position];
    if (position % 256 === 0) await yieldGraphSearch(signal);
    if (!normalized) break;
    const name = entry.normalizedName;
    const anchor = namedIds.has(entry.id);
    if (name === normalized || anchor) {
      ranked.push({
        id: entry.id,
        kind: entry.kind,
        score: name === normalized ? 100 : 90 + Math.min(name.length / 100, 1),
      });
      continue;
    }
    let nameMatches = 0,
      bodyMatches = 0,
      strength = 0;
    for (let termIndex = 0; termIndex < terms.length; termIndex++) {
      const term = terms[termIndex];
      if (name.includes(term)) nameMatches++;
      let weight = 0;
      for (const part of entry.normalizedParts)
        if (part.includes(term)) {
          weight = 1;
          break;
        }
      for (let position = 0; weight < 1 && position < entry.sourceIds.length; position++) {
        const sourceIndex = entry.sourceOrder?.[position] ?? position;
        // Sources are ordered by their query-independent upper bound; later sources cannot improve it.
        if (weight >= (entry.sourceWeights?.[sourceIndex] ?? 1)) break;
        const matched = entry.passages
          ? passageMatchesTerm(entry.passages[sourceIndex], termIndex)
          : sourceMatchesTerm(entry.sourceIds[sourceIndex], termIndex)
          ? 1
          : 0;
        if (matched > weight) weight = matched;
      }
      if (weight > 0) {
        bodyMatches++;
        strength += weight;
      }
    }
    const coverage = terms.length ? bodyMatches / terms.length : 0;
    const confidence = bodyMatches ? strength / bodyMatches : 0;
    const semantic = Math.max(0, semanticScores.get(entry.id) || 0);
    const score =
      (nameMatches ? (40 * nameMatches) / Math.max(1, terms.length) : 0) +
      (coverage === 1 ? 25 : coverage >= 0.5 ? 8 * coverage : 0) * confidence +
      (semantic >= 0.35 ? semantic * 30 : 0);
    if (score > 0) {
      ranked.push({ id: entry.id, kind: entry.kind, score });
    }
  }
  if (!reused) {
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    queries.set(normalized, {
      query: normalized,
      semantic: new Map(semanticScores),
      entries: ranked,
      resolved,
      matchedSources,
      results: new Map(),
    });
  }
  const ranking = queries.get(normalized)!;
  queries.delete(normalized);
  queries.set(normalized, ranking);
  while (queries.size > recentQueryLimit) queries.delete(queries.keys().next().value!);
  const maxDepth = Math.min(4, Math.max(1, Math.floor(maxHops) || 2));
  const cacheKey = JSON.stringify([query, maxDepth, maxNodes, maxEdges, maxSeeds]);
  const resultCache = ranking.results;
  const cached = resultCache.get(cacheKey);
  if (cached) {
    const context = await buildGraphSearchContextAsync(
      cached,
      contextChars,
      translate,
      signal,
      index.evidenceContext
    );
    return { ...cached, context };
  }
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
  const connectedNodes = new Set<string>();
  for (const id of found.edges.keys()) {
    const edge = index.byEdge.get(id)!;
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  for (const id of found.nodes.keys()) {
    const item = index.scopedNodes.get(id);
    if (
      !item ||
      connectedNodes.has(id) ||
      matchedSources.has(id) ||
      terms.some((term) => item.owner.includes(term))
    )
      continue;
    const matches = item.sourceIds.filter((_, sourceIndex) =>
      terms.some((_, termIndex) => passageMatchesTerm(item.passages[sourceIndex], termIndex))
    );
    if (matches.length) matchedSources.set(id, matches);
  }
  const result: GraphSearchResult = {
    scope: index.snapshot.scope,
    revision: index.snapshot.revision,
    query,
    plan,
    nodes: [...found.nodes]
      .map(([id, score]) => ({
        node: matchedSources.has(id)
          ? { ...index.byNode.get(id)!, matchedSourceIds: matchedSources.get(id)! }
          : index.byNode.get(id)!,
        score,
      }))
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
    signal,
    index.evidenceContext
  );
  resultCache.set(cacheKey, result);
  checkRelationCancelled(signal);
  return result;
}
