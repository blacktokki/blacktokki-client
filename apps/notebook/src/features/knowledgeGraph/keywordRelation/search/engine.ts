import { yieldGraphSearch } from './snapshot';
import type {
  GraphPath,
  GraphQueryPlan,
  GraphSearchResult,
  GraphSearchSnapshot,
  SearchDocument,
} from './types';
import { checkRelationCancelled } from '../relationDiscovery';

export const normalizeGraphQuery = (text: string) =>
  text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const stopWords =
  /^(?:관련|관련된|연결|연결된|관계|문서|노드|알려줘|알려주세요|찾아줘|찾아주세요|어떤|무엇|어디|사이|경로|the|a|an|is|are|of|to|and|or|related|connected|between|find|show|what|which|with)$/i;
const queryTerms = (text: string) => [
  ...new Set(
    normalizeGraphQuery(text)
      .split(/[\s,!?"'“”‘’]+/)
      .map((word) => word.replace(/(?:에서|으로|에게|와의|과의|의|은|는|을|를|와|과|에|가)$/u, ''))
      .filter((word) => word && !stopWords.test(word))
  ),
];
const containsName = (query: string, name: string) => {
  if (!name || !query.includes(name)) return false;
  if (!/^[a-z0-9]$/i.test(name)) return true;
  return new RegExp(`(?:^|[^a-z0-9])${name}(?:$|[^a-z0-9])`, 'i').test(query);
};

export function graphSearchDocuments(snapshot: GraphSearchSnapshot): SearchDocument[] {
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const sources = new Map(snapshot.sources.map((source) => [source.id, source]));
  return [
    ...snapshot.nodes.map((node) => ({
      id: node.id,
      kind: 'node' as const,
      name: node.name,
      text: [node.name, node.typeLabel, node.noteTitle, node.url, node.body]
        .filter(Boolean)
        .join('\n'),
    })),
    ...snapshot.edges.map((edge) => ({
      id: edge.id,
      kind: 'edge' as const,
      name: edge.label,
      text: [
        edge.label,
        edge.type,
        nodes.get(edge.source)?.name,
        nodes.get(edge.target)?.name,
        ...edge.sourceIds.map((id) => sources.get(id)?.text || ''),
      ].join('\n'),
    })),
  ];
}

export async function createGraphSearchIndex(snapshot: GraphSearchSnapshot, signal?: AbortSignal) {
  const documents = graphSearchDocuments(snapshot);
  const entries: (SearchDocument & { normalizedName: string; normalizedText: string })[] = [];
  for (const [index, document] of documents.entries()) {
    if (index % 128 === 0) await yieldGraphSearch(signal);
    entries.push({
      ...document,
      normalizedName: normalizeGraphQuery(document.name),
      normalizedText: normalizeGraphQuery(document.text),
    });
  }
  const byNode = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const byEdge = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
  const adjacent = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    for (const id of [edge.source, edge.target]) {
      let list = adjacent.get(id);
      if (!list) adjacent.set(id, (list = []));
      list.push(edge.id);
    }
  }
  return { snapshot, documents, entries, byNode, byEdge, adjacent };
}
export type GraphSearchIndex = Awaited<ReturnType<typeof createGraphSearchIndex>>;

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
  }: {
    maxHops?: number;
    signal?: AbortSignal;
    semanticScores?: Map<string, number>;
    maxNodes?: number;
    maxEdges?: number;
    maxSeeds?: number;
    contextChars?: number;
  } = {}
): Promise<GraphSearchResult> {
  checkRelationCancelled(signal);
  maxNodes = Math.min(120, Math.max(1, Math.floor(maxNodes) || 120));
  maxEdges = Math.min(180, Math.max(1, Math.floor(maxEdges) || 180));
  maxSeeds = Math.min(12, maxNodes, Math.max(1, Math.floor(maxSeeds) || 12));
  const normalized = normalizeGraphQuery(query);
  const terms = queryTerms(query);
  const ranked: { id: string; kind: 'node' | 'edge'; score: number; anchor: boolean }[] = [];
  for (const [position, entry] of index.entries.entries()) {
    if (position % 256 === 0) await yieldGraphSearch(signal);
    if (!normalized) break;
    const name = entry.normalizedName;
    const anchor = containsName(normalized, name);
    const nameMatches = terms.filter((term) => name.includes(term)).length;
    const bodyMatches = terms.filter((term) => entry.normalizedText.includes(term)).length;
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
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
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
  const directEdges = ranked.filter((item) => item.kind === 'edge').slice(0, maxSeeds);
  const directNodes = ranked.filter((item) => item.kind === 'node').slice(0, maxSeeds);
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
    query,
    terms,
    anchorNodeIds: seeds,
    matchedEdgeIds: directEdges.map((item) => item.id),
    intent:
      anchors.length >= 2 && /사이|경로|연결|between|path|connect/i.test(query)
        ? 'connection'
        : 'related',
    maxHops: Math.min(4, Math.max(1, Math.floor(maxHops) || 2)),
  };
  const scores = new Map(ranked.map((item) => [item.id, item.score]));
  const foundNodes = new Map(seeds.slice(0, maxNodes).map((id) => [id, scores.get(id) || 1]));
  const foundEdges = new Map<string, number>();
  const paths: GraphPath[] = [];
  let limited = ranked.length > maxSeeds;
  let examined = 0;
  for (const seed of seeds) {
    const visited = new Set([seed]);
    const queue: GraphPath[] = [{ nodes: [seed], edges: [], disputed: false }];
    let cursor = 0;
    while (cursor < queue.length) {
      if (examined >= maxEdges * 8 || foundEdges.size >= maxEdges) {
        limited = true;
        break;
      }
      const path = queue[cursor++];
      const last = path.nodes.at(-1)!;
      if (path.edges.length >= plan.maxHops) continue;
      // A root/category is searchable, but should not turn every unrelated query into the entire notebook.
      if (
        last !== seed &&
        ['builtInClass', 'boardClass', 'templateGroup'].includes(index.byNode.get(last)!.kind) &&
        (index.adjacent.get(last)?.length || 0) > 24
      )
        continue;
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
        if (++examined % 128 === 0) await yieldGraphSearch(signal);
        if (examined >= maxEdges * 8 || foundEdges.size >= maxEdges) {
          limited = true;
          break;
        }
        const edge = index.byEdge.get(edgeId)!;
        const next = edge.source === last ? edge.target : edge.source;
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
        if (visited.has(next)) continue;
        visited.add(next);
        const extension = {
          nodes: [...path.nodes, next],
          edges: [...path.edges, edgeId],
          disputed: path.disputed || edge.verdict === 'contradicted',
        };
        queue.push(extension);
        if (
          paths.length < 40 &&
          (plan.intent !== 'connection' ||
            anchors.some((anchor) => anchor.id === next && anchor.id !== seed))
        )
          paths.push(extension);
      }
    }
  }
  const result: GraphSearchResult = {
    scope: index.snapshot.scope,
    revision: index.snapshot.revision,
    query,
    plan,
    nodes: [...foundNodes]
      .map(([id, score]) => ({ node: index.byNode.get(id)!, score, direct: scores.has(id) }))
      .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)),
    edges: [...foundEdges]
      .map(([id, score]) => ({ edge: index.byEdge.get(id)!, score, direct: scores.has(id) }))
      .sort((a, b) => b.score - a.score || a.edge.id.localeCompare(b.edge.id)),
    paths,
    sources: [],
    context: { text: '', citations: [], entries: [], truncated: false },
    limited,
  };
  const sourceIds = new Set([
    ...result.edges.flatMap((item) => item.edge.sourceIds),
    ...result.nodes.flatMap((item) => item.node.sourceIds),
  ]);
  result.sources = index.snapshot.sources.filter((source) => sourceIds.has(source.id));
  result.context = buildGraphSearchContext(result, Math.max(256, contextChars));
  checkRelationCancelled(signal);
  return result;
}

/** Serialize evidence, not an answer. Structural links and disputed claims retain their semantics. */
export function buildGraphSearchContext(
  result: GraphSearchResult,
  maxChars = 16000
): GraphSearchResult['context'] {
  const budget = Math.max(0, Math.floor(maxChars) || 0);
  const citations: GraphSearchResult['sources'] = [];
  const entries: GraphSearchResult['context']['entries'] = [];
  let text = '';
  let truncated = result.query.length > Math.min(1000, Math.floor(budget / 8));
  const append = (line: string) => {
    if (text.length + line.length + 1 > budget) {
      truncated = true;
      return false;
    }
    text += line + '\n';
    return true;
  };
  append(
    'Retrieved evidence only. Structure is not a semantic claim; source-order pairs have no inferred direction.'
  );
  append(`Query: ${result.query.slice(0, Math.min(1000, Math.floor(budget / 8)))}`);
  const nodes = new Map(result.nodes.map(({ node }) => [node.id, node]));
  const sources = new Map(result.sources.map((source) => [source.id, source]));
  const citationById = new Map<string, string>();
  // Commit each fact and its new citations atomically so no citation points to omitted evidence.
  const statement = (
    line: string,
    sourceIds: string[],
    entry: { kind: 'node' | 'edge'; id: string }
  ) => {
    const fresh = [...new Set(sourceIds)]
      .filter((id) => !citationById.has(id) && sources.has(id))
      .slice(0, 2);
    const evidence = fresh.map((id, i) => {
      const source = sources.get(id)!;
      const lower = source.text.toLowerCase();
      const matches = result.plan.terms
        .map((term) => lower.indexOf(term))
        .filter((position) => position >= 0);
      const start = matches.length ? Math.max(0, Math.min(...matches) - 100) : 0;
      if (source.text.length > 600) truncated = true;
      return {
        source: { ...source, text: source.text.slice(start, start + 600) },
        label: `[S${citations.length + i + 1}]`,
      };
    });
    const references = [
      ...sourceIds.map((id) => citationById.get(id)).filter(Boolean),
      ...evidence.map((item) => item.label),
    ];
    const block = [
      line + ' ' + [...new Set(references)].join(' '),
      ...evidence.map(
        ({ source, label }) =>
          `${label} ${JSON.stringify({
            title: source.title,
            paragraph: source.paragraph,
            section: source.section,
            href: source.href,
            text: source.text,
          })}`
      ),
    ].join('\n');
    if (append(block)) {
      entries.push({
        ...entry,
        citationIds: [...new Set(sourceIds)].filter(
          (id) => citationById.has(id) || fresh.includes(id)
        ),
      });
      for (const { source, label } of evidence) {
        citations.push(source);
        citationById.set(source.id, label);
      }
    }
  };
  // Relations precede standalone nodes; long source documents cannot consume their entire budget.
  for (const { edge } of result.edges.slice(0, 40))
    statement(
      `[Edge] ${JSON.stringify({
        source: nodes.get(edge.source)?.name,
        relation: edge.label,
        target: nodes.get(edge.target)?.name,
        type: edge.type,
        directed: edge.directed,
        ...(edge.verdict && { verdict: edge.verdict }),
      })}`,
      edge.sourceIds,
      { kind: 'edge', id: edge.id }
    );
  for (const { node } of result.nodes.slice(0, 24))
    statement(`[Node] ${JSON.stringify([node.typeLabel, node.name])}`, node.sourceIds, {
      kind: 'node',
      id: node.id,
    });
  for (const [index, path] of result.paths.slice(0, 12).entries())
    if (
      append(
        `[Path] ${JSON.stringify({
          nodes: path.nodes.map((id) => nodes.get(id)?.name),
          edges: path.edges,
          disputed: path.disputed,
        })}`
      )
    )
      entries.push({ kind: 'path', index, citationIds: [] });
  return {
    text,
    citations,
    entries,
    truncated:
      truncated || result.edges.length > 40 || result.nodes.length > 24 || result.paths.length > 12,
  };
}
