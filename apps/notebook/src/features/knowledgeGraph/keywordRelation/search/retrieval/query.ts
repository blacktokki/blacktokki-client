import { checkRelationCancelled, yieldRelationWork } from '../../keyword/keywordUtils';
import type { GraphPath, GraphQueryPlan, SearchEdge, SearchNode } from '../../types';

export const normalizeGraphQuery = (text: string) =>
  text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Preserve literal query tokens; names discovered in the current index supply additional matches. */
export function resolveQueryNames(query: string, names: Map<string, string[]>) {
  const spans: { start: number; end: number; name: string }[] = [];
  for (const name of names.keys()) {
    if (!name) continue;
    let start = query.indexOf(name);
    while (start >= 0) {
      const end = start + name.length;
      if (
        [...name].length !== 1 ||
        (!/[\p{L}\p{N}]$/u.test(query.slice(0, start)) && !/^[\p{L}\p{N}]/u.test(query.slice(end)))
      )
        spans.push({ start, end, name });
      start = query.indexOf(name, end);
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const selected = new Set<string>();
  let end = -1;
  for (const span of spans) {
    if (span.start < end) continue;
    selected.add(span.name);
    end = span.end;
  }
  return {
    terms: [...new Set([...query.split(/[\s\p{P}]+/u).filter(Boolean), ...selected])],
    groups: [...selected].map((name) => names.get(name)!),
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

export function isQueryConnection(plan: GraphQueryPlan, path: GraphPath) {
  if (plan.intent !== 'connection') return true;
  if (!plan.targetIds) return path.kind !== 'surrounding';
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
      !(plan.intent === 'connection' && isQueryConnection(plan, path))
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
    paths.push({ ...path, kind: isQueryConnection(plan, path) ? 'connection' : 'surrounding' });
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
        if (primary || isQueryConnection(plan, extension)) addPath(extension);
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
