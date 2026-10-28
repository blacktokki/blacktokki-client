import { checkRelationCancelled, yieldRelationWork } from '../keyword/keywordUtils';
import type { GraphPath, GraphQueryPlan, GraphSource, SearchEdge, SearchNode } from '../types';
import type {
  graphSourceRanges as sourceRanges,
  graphSourceSearch as sourceSearch,
} from './evidence';

export const normalizeGraphQuery = (text: string) =>
  text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

const nameTermPositions = new WeakMap<Map<string, string[]>, Map<string, Map<string, number>>>();

/** Index literal name components once; query subjects may also occur inside longer titles. */
export function indexQueryNameTerms(names: Map<string, string[]>) {
  const terms = new Map<string, string[]>();
  const positions = new Map<string, Map<string, number>>();
  for (const [name, ids] of names) {
    const seen = new Set<string>();
    for (const match of name.matchAll(/[\p{L}\p{M}\p{N}_]+/gu)) {
      const term = match[0];
      if (seen.has(term)) continue;
      seen.add(term);
      const found = terms.get(term);
      if (found) found.push(...ids);
      else terms.set(term, [...ids]);
      let offsets = positions.get(term);
      if (!offsets) positions.set(term, (offsets = new Map()));
      for (const id of ids) offsets.set(id, match.index! + term.length);
    }
  }
  nameTermPositions.set(terms, positions);
  return terms;
}

/** Keep substring retrieval separate from subject identity; no word fragments become extra subjects. */
export function resolveQueryNames(
  query: string,
  names: Map<string, string[]>,
  nameTerms = indexQueryNameTerms(names)
) {
  const words = [...query.matchAll(/[\p{L}\p{M}\p{N}_]+/gu)];
  const spans: { start: number; end: number; name: string }[] = [];
  for (const name of names.keys()) {
    if (!name) continue;
    let start = query.indexOf(name);
    while (start >= 0) {
      const end = start + name.length;
      const before = /[\p{L}\p{M}\p{N}_]$/u.test(query.slice(0, start));
      const after = /^[\p{L}\p{M}\p{N}_]/u.test(query.slice(end));
      const word =
        before !== after &&
        words.find((word) => word.index! <= start && word.index! + word[0].length >= end);
      if (
        (!before && !after) ||
        (word && !nameTerms.has(word[0]) && name.length > word[0].length - name.length)
      )
        spans.push({ start, end, name });
      start = query.indexOf(name, end);
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const selected = new Set<string>();
  const mentions: { start: number; end: number; ids: string[] }[] = [];
  let end = -1;
  for (const span of spans) {
    if (span.start < end) continue;
    selected.add(span.name);
    mentions.push({ ...span, ids: names.get(span.name)! });
    end = span.end;
  }
  // A later title component can qualify an explicit name. A preceding subject is
  // not a qualifier merely because a candidate also contains the later name.
  let positions = nameTermPositions.get(nameTerms);
  if (!positions) {
    positions = nameTermPositions.get(indexQueryNameTerms(names))!;
    nameTermPositions.set(nameTerms, positions);
  }
  const described = new Map<string, number>();
  for (const name of selected)
    for (const term of name.match(/[\p{L}\p{M}\p{N}_]+/gu) || [])
      for (const [id, end] of positions.get(term) || [])
        described.set(id, Math.min(described.get(id) ?? Infinity, end));
  const queryWords = new Set(words.map((word) => word[0]));
  const coverage = new Map<string, number>();
  const coverageFor = (id: string) => {
    let count = coverage.get(id);
    if (count === undefined) {
      count = 0;
      for (const word of queryWords) if (positions!.get(word)?.has(id)) count++;
      coverage.set(id, count);
    }
    return count;
  };
  for (const token of words) {
    const start = token.index!;
    const end = start + token[0].length;
    if (mentions.some((mention) => mention.start <= start && mention.end >= end)) continue;
    const ids = nameTerms.get(token[0]);
    if (!ids?.length) continue;
    const qualifies = (id: string) => {
      const prefix = described.get(id);
      const position = positions!.get(token[0])?.get(id);
      return prefix !== undefined && position !== undefined && prefix <= position - token[0].length;
    };
    if (ids.some(qualifies)) {
      let independent = 0,
        qualifier = 0;
      for (const id of ids) {
        const count = coverageFor(id);
        if (qualifies(id)) qualifier = Math.max(qualifier, count);
        else independent = Math.max(independent, count);
      }
      if (independent < qualifier) continue;
    }
    mentions.push({ start, end, ids });
  }
  mentions.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  return {
    terms: [...new Set([...query.split(/[\s\p{P}]+/u).filter(Boolean), ...selected])],
    namedIds: [...selected].flatMap((name) => names.get(name)!),
    groups: mentions.flatMap(({ ids }) => {
      const key = JSON.stringify(ids);
      if (seen.has(key)) return [];
      seen.add(key);
      return [ids];
    }),
  };
}

/** A query mention can name several distinct records; they remain alternatives of one subject. */
export function queryTargetGroups(plan: GraphQueryPlan) {
  const remaining = new Set(plan.targetIds);
  const groups = (plan.targetGroups || [])
    .map((group) => group.filter((id) => remaining.delete(id)))
    .filter((group) => group.length);
  return [...groups, ...[...remaining].map((id) => [id])];
}

export function isQueryConnection(
  plan: GraphQueryPlan,
  path: GraphPath,
  owners?: ReadonlyMap<string, unknown>
) {
  if (plan.intent !== 'connection') return true;
  if (!plan.targetIds) return path.kind !== 'surrounding';
  if (owners) {
    const first = owners.get(path.nodes[0]);
    const last = owners.get(path.nodes.at(-1)!);
    return first !== undefined && last !== undefined && first !== last;
  }
  const groups = queryTargetGroups(plan);
  return groups.some(
    (group, index) =>
      group.includes(path.nodes[0]) &&
      groups.some((other, peer) => peer !== index && other.includes(path.nodes.at(-1)!))
  );
}

type Inventory = {
  byNode: Map<string, SearchNode>;
  byEdge: Map<string, SearchEdge>;
  adjacent: Map<string, string[]>;
};

/** Visit each adjacency once per query-subject group instead of enumerating every simple walk. */
export async function retrieveGraph(
  index: Inventory,
  seeds: string[],
  scores: Map<string, number>,
  plan: GraphQueryPlan,
  limits: { nodes: number; edges: number; seeds: number },
  signal?: AbortSignal,
  expansionRoots = seeds,
  directEdges?: Set<string>
) {
  const nodes = new Map<string, number>();
  const edges = new Map<string, number>();
  const paths: GraphPath[] = [];
  const seenPaths = new Set<string>();
  const groups = queryTargetGroups(plan);
  const owners = new Map(groups.flatMap((group, index) => group.map((id) => [id, index])));
  const category = (id: string) =>
    ['builtInClass', 'boardClass', 'templateGroup'].includes(index.byNode.get(id)!.kind);
  let limited = false;
  let complete = true;
  let examined = 0;
  const addNode = (id: string, value: number) => {
    if (!nodes.has(id) && nodes.size >= limits.nodes) {
      limited = true;
      return false;
    }
    nodes.set(id, Math.max(nodes.get(id) || 0, scores.get(id) || value));
    return true;
  };
  const addPath = (path: GraphPath) => {
    if (!path.edges.length || new Set(path.nodes).size !== path.nodes.length) return;
    if (
      path.nodes.slice(1, -1).some(category) &&
      !(plan.intent === 'connection' && isQueryConnection(plan, path, owners))
    )
      return;
    if (
      plan.intent === 'connection' &&
      (owners.get(path.nodes[0]) ?? Infinity) > (owners.get(path.nodes.at(-1)!) ?? Infinity)
    )
      path = { nodes: path.nodes.slice().reverse(), edges: path.edges.slice().reverse() };
    const forward = JSON.stringify([path.nodes, path.edges]);
    const reverse = JSON.stringify([[...path.nodes].reverse(), [...path.edges].reverse()]);
    const key = forward < reverse ? forward : reverse;
    if (seenPaths.has(key)) return;
    seenPaths.add(key);
    paths.push({
      ...path,
      kind: isQueryConnection(plan, path, owners) ? 'connection' : 'surrounding',
    });
  };
  const roots = seeds.slice(0, limits.seeds);
  for (const id of roots) addNode(id, scores.get(id) || 1);
  for (const [id, score] of scores) {
    const edge = index.byEdge.get(id);
    if (
      !edge ||
      (directEdges && !directEdges.has(id)) ||
      !nodes.has(edge.source) ||
      !nodes.has(edge.target)
    )
      continue;
    if (edges.size >= limits.edges) {
      limited = true;
      complete = false;
      continue;
    }
    edges.set(id, score);
  }
  const walk = async (starts: string[], primary: boolean) => {
    const reached = new Map<string, GraphPath>();
    const queue: string[] = [];
    for (const id of starts) {
      if (!nodes.has(id)) {
        complete = false;
        continue;
      }
      reached.set(id, { nodes: [id], edges: [] });
      queue.push(id);
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const last = queue[cursor];
      const path = reached.get(last)!;
      if (path.edges.length >= plan.maxHops) continue;
      // Nearby expansion ends at a category; explicit subject-to-subject searches
      // still verify its membership connections before declaring a path absent.
      if (primary && path.edges.length && category(last)) continue;
      for (const edgeId of index.adjacent.get(last) || []) {
        if (++examined % 256 === 0) await yieldRelationWork(signal);
        const edge = index.byEdge.get(edgeId)!;
        const next = edge.source === last ? edge.target : edge.source;
        const value = (scores.get(path.nodes[0]) || 1) / (path.edges.length + 2);
        if (!addNode(next, value)) {
          complete = false;
          continue;
        }
        if (!edges.has(edgeId) && edges.size >= limits.edges) {
          limited = true;
          complete = false;
          continue;
        }
        edges.set(edgeId, Math.max(edges.get(edgeId) || 0, scores.get(edgeId) || value));
        const extension = { nodes: [...path.nodes, next], edges: [...path.edges, edgeId] };
        if (primary || isQueryConnection(plan, extension, owners)) addPath(extension);
        const previous = reached.get(next);
        if (!previous) {
          reached.set(next, extension);
          queue.push(next);
        } else if (
          primary &&
          previous.nodes[0] !== path.nodes[0] &&
          extension.edges.length + previous.edges.length <= plan.maxHops
        ) {
          addPath({
            nodes: [...extension.nodes, ...previous.nodes.slice(0, -1).reverse()],
            edges: [...extension.edges, ...previous.edges.slice().reverse()],
          });
        }
      }
    }
    return reached;
  };
  await walk(
    expansionRoots.filter((id) => nodes.has(id)),
    true
  );
  if (plan.intent === 'connection') {
    const neighborhoods = [];
    for (const group of groups) neighborhoods.push(await walk(group, false));
    for (const [first, left] of neighborhoods.entries())
      for (const right of neighborhoods.slice(first + 1))
        for (const [id, prefix] of left)
          for (const edgeId of index.adjacent.get(id) || []) {
            if (++examined % 256 === 0) await yieldRelationWork(signal);
            if (!edges.has(edgeId)) continue;
            const edge = index.byEdge.get(edgeId)!;
            const next = edge.source === id ? edge.target : edge.source;
            const suffix = right.get(next);
            if (!suffix || prefix.edges.length + 1 + suffix.edges.length > plan.maxHops) continue;
            addPath({
              nodes: [...prefix.nodes, ...suffix.nodes.slice().reverse()],
              edges: [...prefix.edges, edgeId, ...suffix.edges.slice().reverse()],
            });
          }
  }
  limited ||= seeds.some((id) => !nodes.has(id));
  checkRelationCancelled(signal);
  return { nodes, edges, paths, limited, complete };
}

export type SearchPassage = { text: string; weight: number };

/** Resolve item-local statements once per prepared index, independently of the search words. */
export function createSearchProvenance(
  sources: Map<string, GraphSource>,
  normalize: (value: string) => string,
  {
    graphSourceRanges,
    graphSourceSearch,
  }: {
    graphSourceRanges: typeof sourceRanges;
    graphSourceSearch: typeof sourceSearch;
  }
) {
  const passages = new Map<string, Map<string, SearchPassage[]>>();
  const links = new Map<string, Map<string, { start: number; end: number }[]>>();
  const labels = new Map<string, string>();
  const blocks = new Map<string, { start: number; end: number }[]>();
  const components = new Map<string, Uint32Array>();
  const linkKey = (href: string) => {
    try {
      return new URL(href).href;
    } catch {
      return href;
    }
  };
  const prepare = (id: string, owner: string, href?: string) => {
    const source = sources.get(id);
    if (!source) return [];
    let label = labels.get(id);
    if (label === undefined) {
      label = normalize([source.title, source.section, source.paragraph].filter(Boolean).join(' '));
      labels.set(id, label);
    }
    const key = href === undefined ? owner : '\0' + linkKey(href);
    let byItem = passages.get(id);
    if (!byItem) passages.set(id, (byItem = new Map()));
    let statements = byItem.get(key);
    if (!statements) {
      // One indivisible source is the only available locality when no finer structure was recorded.
      if (
        href === undefined &&
        !source.references?.length &&
        (source.blocks?.length || 0) <= 1 &&
        (source.scopes?.length || 0) <= 1 &&
        !normalize(source.text).includes(owner)
      ) {
        statements = [label, normalize(source.text)].map((text) => ({ text, weight: 1 }));
        byItem.set(key, statements);
        return statements;
      }
      const search = graphSourceSearch(source);
      let ranges: { start: number; end: number }[];
      if (href === undefined) ranges = graphSourceRanges(source.text, owner, search);
      else {
        let byHref = links.get(id);
        if (!byHref) {
          byHref = new Map();
          for (const reference of source.references || []) {
            if (
              normalize(source.text.slice(reference.start, reference.end)) !==
              normalize(reference.name)
            )
              continue;
            const href = linkKey(reference.href);
            const found = byHref.get(href) || [];
            found.push(reference);
            byHref.set(href, found);
          }
          links.set(id, byHref);
        }
        ranges = byHref.get(linkKey(href)) || [];
      }
      const distinct = new Map<string, SearchPassage>();
      let words = components.get(id);
      if (href === undefined && ranges.length && !words) {
        const coordinates: number[] = [];
        for (const match of source.text.matchAll(/[\p{L}\p{M}\p{N}_]+/gu))
          coordinates.push(match.index!, match.index! + match[0].length);
        words = Uint32Array.from(coordinates);
        components.set(id, words);
      }
      const componentAt = (position: number, end = false) => {
        let low = 0,
          high = (words?.length || 0) / 2;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (words![middle * 2] <= position) low = middle + 1;
          else high = middle;
        }
        return low && words![low * 2 - 1] > position ? words![low * 2 - (end ? 1 : 2)] : undefined;
      };
      let confidence = 0;
      let ordered = blocks.get(id);
      if (!ordered) {
        ordered = [...(source.blocks || [])].sort((a, b) => a.start - b.start || b.end - a.end);
        blocks.set(id, ordered);
      }
      for (const range of ranges) {
        // A compositional fragment stays searchable, with confidence proportional to its span.
        const start = componentAt(range.start) ?? range.start;
        const end = componentAt(range.end - 1, true) ?? range.end;
        const weight = href === undefined ? (range.end - range.start) / (end - start) : 1;
        confidence = Math.max(confidence, weight);
        const statement = search.statement(range);
        let low = 0,
          high = ordered.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (ordered[middle].start <= range.start) low = middle + 1;
          else high = middle;
        }
        const block = ordered[low - 1];
        if (block && block.end >= range.end) {
          statement.start = Math.max(statement.start, block.start);
          statement.end = Math.min(statement.end, block.end);
        }
        const key = statement.start + ':' + statement.end;
        const existing = distinct.get(key);
        if (existing) existing.weight = Math.max(existing.weight, weight);
        else
          distinct.set(key, {
            text: normalize(source.text.slice(statement.start, statement.end)),
            weight,
          });
      }
      statements = [{ text: label, weight: confidence }, ...distinct.values()].sort(
        (a, b) => b.weight - a.weight
      );
      byItem.set(key, statements);
    }
    return statements;
  };
  return prepare;
}

type Range = { start: number; end: number };

/** Index containment and the first nested scope without rescanning every section per quotation. */
export function createScopeIndex(scopes: Range[]) {
  const ordered = scopes.map(({ start, end }, id) => ({ start, end, id }));
  ordered.sort((a, b) => a.start - b.start || a.id - b.id);
  let size = 1;
  while (size < ordered.length) size *= 2;
  const maximum = new Float64Array(size * 2).fill(-Infinity);
  const minimum = new Float64Array(size * 2).fill(Infinity);
  for (const [i, range] of ordered.entries()) {
    maximum[size + i] = range.end;
    minimum[size + i] = range.end;
  }
  for (let i = size - 1; i; i--) {
    maximum[i] = Math.max(maximum[i * 2], maximum[i * 2 + 1]);
    minimum[i] = Math.min(minimum[i * 2], minimum[i * 2 + 1]);
  }
  const introductions = new Map<string, Range>();
  return {
    parents: (range: Range) => {
      const found: number[] = [];
      const visit = (node: number, left: number, right: number) => {
        if (
          left >= ordered.length ||
          ordered[left].start > range.start ||
          maximum[node] < range.end
        )
          return;
        if (right - left === 1) {
          found.push(ordered[left].id);
          return;
        }
        const middle = (left + right) >>> 1;
        visit(node * 2, left, middle);
        visit(node * 2 + 1, middle, right);
      };
      visit(1, 0, size);
      return found.sort(
        (a, b) => scopes[a].end - scopes[a].start - (scopes[b].end - scopes[b].start) || a - b
      );
    },
    introduction: (id: number) => {
      const parent = scopes[id],
        key = parent.start + ':' + parent.end;
      let cached = introductions.get(key);
      if (cached) return cached;
      const visit = (node: number, left: number, right: number): number | undefined => {
        if (
          left >= ordered.length ||
          ordered[left].start > parent.end ||
          minimum[node] > parent.end
        )
          return;
        if (right - left === 1) {
          const child = ordered[left];
          if (
            child.start >= parent.start &&
            child.end <= parent.end &&
            (child.start !== parent.start || child.end !== parent.end)
          )
            return child.start;
          return;
        }
        const middle = (left + right) >>> 1;
        // All starts in this subtree precede the parent, so they cannot be nested.
        if (ordered[Math.min(right, ordered.length) - 1].start < parent.start) return;
        return visit(node * 2, left, middle) ?? visit(node * 2 + 1, middle, right);
      };
      cached = { start: parent.start, end: visit(1, 0, size) ?? parent.end };
      introductions.set(key, cached);
      return cached;
    },
  };
}
