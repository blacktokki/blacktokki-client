import { buildGraphSearchContext } from './context';
import { yieldGraphSearch } from './snapshot';
import { checkRelationCancelled } from '../keyword/keywordUtils';
import { GRAPH_SEARCH_EMBEDDING_CHARS } from '../types';
import type {
  GraphPath,
  GraphQueryPlan,
  GraphSearchResult,
  GraphSearchSnapshot,
  SearchDocument,
  SearchNode,
  GraphSource,
} from '../types';

export { buildGraphSearchContext } from './context';

const normalizeGraphQuery = (text: string) =>
  text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const queryTerms = (text: string) => [
  ...new Set(
    normalizeGraphQuery(text)
      .split(/[\s,!?"'“”‘’]+/)
      .map((word) => word.replace(/(?:에서|으로|에게|와의|과의|의|은|는|을|를|와|과|에|가)$/u, ''))
      .filter(Boolean)
  ),
];
const containsName = (query: string, name: string) => {
  if (!name || !query.includes(name)) return false;
  if (!/^[a-z0-9]$/i.test(name)) return true;
  return new RegExp(`(?:^|[^a-z0-9])${name}(?:$|[^a-z0-9])`, 'i').test(query);
};

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
    normalizedSource: (id: string) => normalize(bySource.get(id)?.text),
  };
}
export type GraphSearchIndex = Awaited<ReturnType<typeof createGraphSearchIndex>>;

type RankedEntry = { id: string; kind: 'node' | 'edge'; score: number; anchor: boolean };
const queryRankings = new WeakMap<
  GraphSearchIndex,
  { query: string; semantic: Map<string, number>; entries: RankedEntry[] }
>();

/** Query words are resolved against the current graph vocabulary, including discovered predicates. */
export async function searchKnowledgeGraph(
  index: GraphSearchIndex,
  query: string,
  {
    maxHops = 2,
    signal,
    semanticScores = new Map<string, number>(),
    maxNodes = 120,
    maxEdges = 180,
    maxSeeds = 12,
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
  maxNodes = Math.min(120, Math.max(1, Math.floor(maxNodes) || 120));
  maxEdges = Math.min(180, Math.max(1, Math.floor(maxEdges) || 180));
  maxSeeds = Math.min(12, maxNodes, Math.max(1, Math.floor(maxSeeds) || 12));
  const normalized = normalizeGraphQuery(query);
  const terms = queryTerms(query);
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
  const ranked: RankedEntry[] = reused ? previous.entries : [];
  for (const [position, entry] of reused ? [] : index.entries.entries()) {
    if (position % 256 === 0) await yieldGraphSearch(signal);
    if (!normalized) break;
    const name = entry.normalizedName;
    const anchor = containsName(normalized, name);
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
    if (score > 0) ranked.push({ id: entry.id, kind: entry.kind, score, anchor });
  }
  if (!reused) {
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    queryRankings.set(index, {
      query: normalized,
      semantic: new Map(semanticScores),
      entries: ranked,
    });
  }
  const exactNodes = ranked.filter((item) => item.kind === 'node' && item.anchor);
  // Prefer longer names when a shorter keyword occurs entirely inside another matched name.
  const anchors = exactNodes.filter(
    (item) =>
      !exactNodes.some(
        (other) =>
          other.id !== item.id &&
          index.byNode.get(other.id)!.name.length > index.byNode.get(item.id)!.name.length &&
          normalizeGraphQuery(index.byNode.get(other.id)!.name).includes(
            normalizeGraphQuery(index.byNode.get(item.id)!.name)
          )
      )
  );
  const directEdges = ranked.filter((item) => item.kind === 'edge');
  const directNodes = ranked.filter((item) => item.kind === 'node');
  const seeds = [
    ...new Set([
      ...anchors.map((item) => item.id),
      ...directEdges.flatMap((item) => {
        const edge = index.byEdge.get(item.id)!;
        return [edge.source, edge.target];
      }),
      ...directNodes.map((item) => item.id),
    ]),
  ].slice(0, maxSeeds);
  const plan: GraphQueryPlan = {
    terms,
    intent: anchors.length >= 2 ? 'connection' : 'related',
    maxHops: Math.min(4, Math.max(1, Math.floor(maxHops) || 2)),
    targetIds: anchors.map((anchor) => anchor.id),
    targetNames: Object.fromEntries(
      anchors.map((anchor) => [anchor.id, index.byNode.get(anchor.id)!.name])
    ),
    targetTypes: Object.fromEntries(
      anchors.map((anchor) => [anchor.id, index.byNode.get(anchor.id)!.typeLabel])
    ),
    targetNotes: Object.fromEntries(
      anchors.flatMap(({ id }) => {
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
  const targets = new Set(plan.targetIds);
  const scores = new Map(ranked.map((item) => [item.id, item.score]));
  const foundNodes = new Map(seeds.slice(0, maxNodes).map((id) => [id, scores.get(id) || 1]));
  const foundEdges = new Map<string, number>();
  const paths: GraphPath[] = [];
  let limited = false;
  let examined = 0;
  traversal: for (const seed of seeds) {
    const queue: GraphPath[] = [{ nodes: [seed], edges: [] }];
    let cursor = 0;
    while (cursor < queue.length) {
      const path = queue[cursor++];
      const last = path.nodes.at(-1)!;
      if (path.edges.length >= plan.maxHops) continue;
      // A root/category is searchable, but should not turn every unrelated query into the entire notebook.
      if (
        last !== seed &&
        ['builtInClass', 'boardClass', 'templateGroup'].includes(index.byNode.get(last)!.kind) &&
        (index.adjacent.get(last)?.length || 0) > 24
      ) {
        limited ||= (index.adjacent.get(last) || []).some((id) => !foundEdges.has(id));
        continue;
      }
      const candidates = [...(index.adjacent.get(last) || [])].sort((a, b) => {
        const neighborScore = (id: string) => {
          const edge = index.byEdge.get(id)!;
          return (
            (scores.get(id) || 0) +
            (scores.get(edge.source === last ? edge.target : edge.source) || 0)
          );
        };
        return neighborScore(b) - neighborScore(a) || a.localeCompare(b);
      });
      for (const edgeId of candidates) {
        const edge = index.byEdge.get(edgeId)!;
        const next = edge.source === last ? edge.target : edge.source;
        if (examined >= maxEdges * 8) {
          if (foundEdges.has(edgeId) && path.nodes.includes(next)) continue;
          limited = true;
          break traversal;
        }
        if (++examined % 128 === 0) await yieldGraphSearch(signal);
        if (!foundEdges.has(edgeId) && foundEdges.size >= maxEdges) {
          limited = true;
          break traversal;
        }
        if (!foundNodes.has(next) && foundNodes.size >= maxNodes) {
          limited = true;
          continue;
        }
        foundEdges.set(
          edge.id,
          Math.max(
            foundEdges.get(edge.id) || 0,
            scores.get(edge.id) || (scores.get(seed) || 1) / (path.edges.length + 2)
          )
        );
        foundNodes.set(
          next,
          Math.max(
            foundNodes.get(next) || 0,
            scores.get(next) || (scores.get(seed) || 1) / (path.edges.length + 2)
          )
        );
        // A repeated endpoint can represent a different explanation; only cycles in this route are excluded.
        if (path.nodes.includes(next)) continue;
        const extension = {
          nodes: [...path.nodes, next],
          edges: [...path.edges, edgeId],
        };
        queue.push(extension);
        paths.push({
          ...extension,
          kind:
            plan.intent === 'connection' && !(targets.has(seed) && targets.has(next))
              ? 'surrounding'
              : 'connection',
        });
      }
    }
  }
  limited ||= ranked.some((item) =>
    item.kind === 'node' ? !foundNodes.has(item.id) : !foundEdges.has(item.id)
  );
  const result: GraphSearchResult = {
    scope: index.snapshot.scope,
    revision: index.snapshot.revision,
    query,
    plan,
    nodes: [...foundNodes]
      .map(([id, score]) => ({ node: index.byNode.get(id)!, score }))
      .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)),
    edges: [...foundEdges]
      .map(([id, score]) => ({ edge: index.byEdge.get(id)!, score }))
      .sort((a, b) => b.score - a.score || a.edge.id.localeCompare(b.edge.id)),
    paths,
    sources: [],
    context: {
      text: '',
      citations: [],
      entries: [],
      truncated: false,
      usage: { characters: 0, limit: contextChars },
    },
    limited,
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
  result.context = buildGraphSearchContext(result, Math.max(256, contextChars), translate);
  checkRelationCancelled(signal);
  return result;
}
