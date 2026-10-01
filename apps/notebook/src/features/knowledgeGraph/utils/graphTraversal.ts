import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';

export interface GraphTraversalStep {
  edgeId: string;
  fromId: string;
  toId: string;
  depth: number;
  /** Pixels per second at 100% zoom; Canvas scales the visible speed. */
  speedPxPerSecond: number;
}

export interface GraphTraversalPlan {
  levels: GraphTraversalStep[][];
  rootIds: string[];
  reachableNodeCount: number;
  outgoingSteps: Map<string, GraphTraversalStep[]>;
  initialSpeedPxPerSecond: number;
}

interface AnimatedTraversalStep extends GraphTraversalStep {
  cycle: GraphTraversalCycle;
  startedAtMs: number;
  from: KnowledgeGraphNode | null;
  to: KnowledgeGraphNode | null;
  ux: number;
  uy: number;
  glintLength: number;
  along: number;
}

export interface GraphTraversalCycle {
  startedAtMs: number;
  activatedAtMs: Map<string, number>;
  latestNodeArrivalAtMs: number;
  allNodesReachedAtMs: number | null;
}

export interface GraphTraversalAnimation {
  plan: GraphTraversalPlan;
  cycle: GraphTraversalCycle;
  nextCycleAtMs: number | null;
  pauseUntilMs: number | null;
  steps: AnimatedTraversalStep[];
}

const INITIAL_SPEED_PX_PER_SECOND = 600;
const SPEED_DECREMENT_PX_PER_SECOND = INITIAL_SPEED_PX_PER_SECOND * 0.1;
const MINIMUM_SPEED_PX_PER_SECOND = INITIAL_SPEED_PX_PER_SECOND * 0.5;
const ZERO_DURATION_CYCLE_INTERVAL_MS = 300;
const HISTORY_SKIP_THRESHOLD_MS = 1000;
const GLINT_LENGTH_PX = 32;

/** Traverse from Note and Board classes, treating external-link instances as endpoints. */
export const buildGraphTraversalPlan = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[]
): GraphTraversalPlan => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const terminalNodeIds = new Set(
    nodes
      .filter(
        (node) =>
          node.role === 'INSTANCE' &&
          (node.instanceKind === 'EXTERNAL_LINK' || node.instanceKind === 'CONNECTED_EXTERNAL_LINK')
      )
      .map((node) => node.id)
  );
  const roots = nodes
    .filter(
      (node) =>
        node.role === 'CLASS' && (node.classKind === 'NOTE' || node.classKind === 'BOARD_CARD')
    )
    .sort((left, right) => {
      if (left.classKind !== right.classKind) return left.classKind === 'NOTE' ? -1 : 1;
      return left.id.localeCompare(right.id);
    });
  const neighbors = new Map<
    string,
    { edge: KnowledgeGraphEdge; otherId: string; index: number }[]
  >();
  edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target)
      return;
    const sourceNeighbors = neighbors.get(edge.source) || [];
    sourceNeighbors.push({ edge, otherId: edge.target, index });
    neighbors.set(edge.source, sourceNeighbors);
    const targetNeighbors = neighbors.get(edge.target) || [];
    targetNeighbors.push({ edge, otherId: edge.source, index });
    neighbors.set(edge.target, targetNeighbors);
  });
  for (const adjacent of neighbors.values()) {
    adjacent.sort(
      (left, right) =>
        left.edge.id.localeCompare(right.edge.id) ||
        left.otherId.localeCompare(right.otherId) ||
        left.index - right.index
    );
  }

  const visitedNodes = new Set(roots.map((node) => node.id));
  const visitedEdges = new Set<number>();
  const queue = roots.map((node) => ({ id: node.id, depth: 0 }));
  const levels: GraphTraversalStep[][] = [];
  for (let index = 0; index < queue.length; index++) {
    const { id, depth } = queue[index];
    if (terminalNodeIds.has(id)) continue;
    for (const { edge, otherId, index: edgeIndex } of neighbors.get(id) || []) {
      if (visitedEdges.has(edgeIndex)) continue;
      visitedEdges.add(edgeIndex);
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push({
        edgeId: edge.id,
        fromId: id,
        toId: otherId,
        depth,
        speedPxPerSecond: Math.max(
          MINIMUM_SPEED_PX_PER_SECOND,
          INITIAL_SPEED_PX_PER_SECOND - depth * SPEED_DECREMENT_PX_PER_SECOND
        ),
      });
      if (visitedNodes.has(otherId)) continue;
      visitedNodes.add(otherId);
      queue.push({ id: otherId, depth: depth + 1 });
    }
  }

  const outgoingSteps = new Map<string, GraphTraversalStep[]>();
  for (const level of levels) {
    for (const step of level) {
      const outgoing = outgoingSteps.get(step.fromId) || [];
      outgoing.push(step);
      outgoingSteps.set(step.fromId, outgoing);
    }
  }
  return {
    levels,
    rootIds: roots.map((node) => node.id),
    reachableNodeCount: visitedNodes.size,
    outgoingSteps,
    initialSpeedPxPerSecond: INITIAL_SPEED_PX_PER_SECOND,
  };
};

const activateTraversalNode = (
  animation: GraphTraversalAnimation,
  cycle: GraphTraversalCycle,
  nodeId: string,
  arrivedAtMs: number
) => {
  if (cycle.activatedAtMs.has(nodeId)) return;
  cycle.activatedAtMs.set(nodeId, arrivedAtMs);
  cycle.latestNodeArrivalAtMs = Math.max(cycle.latestNodeArrivalAtMs, arrivedAtMs);
  for (const step of animation.plan.outgoingSteps.get(nodeId) || []) {
    animation.steps.push({
      ...step,
      cycle,
      startedAtMs: arrivedAtMs,
      from: null,
      to: null,
      ux: 0,
      uy: 0,
      glintLength: 0,
      along: 0,
    });
  }
  if (cycle.activatedAtMs.size === animation.plan.reachableNodeCount) {
    cycle.allNodesReachedAtMs = cycle.latestNodeArrivalAtMs;
    if (cycle === animation.cycle) {
      animation.nextCycleAtMs =
        cycle.allNodesReachedAtMs > cycle.startedAtMs
          ? cycle.allNodesReachedAtMs
          : cycle.startedAtMs + ZERO_DURATION_CYCLE_INTERVAL_MS;
    }
  }
};

const startTraversalCycle = (animation: GraphTraversalAnimation, startedAtMs: number) => {
  const cycle: GraphTraversalCycle = {
    startedAtMs,
    activatedAtMs: new Map(),
    latestNodeArrivalAtMs: startedAtMs,
    allNodesReachedAtMs: null,
  };
  animation.cycle = cycle;
  animation.nextCycleAtMs = null;
  for (const rootId of animation.plan.rootIds) {
    activateTraversalNode(animation, cycle, rootId, startedAtMs);
  }
};

export const createGraphTraversalAnimation = (
  plan: GraphTraversalPlan
): GraphTraversalAnimation => {
  const animation: GraphTraversalAnimation = {
    plan,
    cycle: {
      startedAtMs: 0,
      activatedAtMs: new Map(),
      latestNodeArrivalAtMs: 0,
      allNodesReachedAtMs: null,
    },
    nextCycleAtMs: null,
    pauseUntilMs: null,
    steps: [],
  };
  startTraversalCycle(animation, 0);
  return animation;
};

interface TraversalArrival {
  cycle: GraphTraversalCycle;
  nodeId: string;
  atMs: number;
}

const pushArrival = (heap: TraversalArrival[], arrival: TraversalArrival) => {
  let index = heap.length;
  heap.push(arrival);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].atMs <= arrival.atMs) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = arrival;
};

const popArrival = (heap: TraversalArrival[]) => {
  const arrival = heap[0];
  const last = heap.pop();
  if (last && heap.length) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1].atMs < heap[child].atMs) child++;
      if (last.atMs <= heap[child].atMs) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return arrival;
};

/** Upper bound on a cycle's lifetime, following the BFS order of its directed edges. */
const maximumCycleDuration = (
  plan: GraphTraversalPlan,
  nodeMap: Map<string, KnowledgeGraphNode>
) => {
  const latestStarts = new Map(plan.rootIds.map((id) => [id, 0]));
  let maximumMs = 0;
  for (const level of plan.levels) {
    for (const step of level) {
      const from = nodeMap.get(step.fromId);
      const to = nodeMap.get(step.toId);
      if (!from || !to) return Infinity;
      const openLength = Math.max(
        0,
        Math.hypot(to.x - from.x, to.y - from.y) - from.radius - to.radius
      );
      const travelLength = openLength - Math.min(GLINT_LENGTH_PX, openLength * 0.4);
      const arrivalMs =
        (latestStarts.get(step.fromId) || 0) + (travelLength / step.speedPxPerSecond) * 1000;
      latestStarts.set(step.toId, Math.max(latestStarts.get(step.toId) || 0, arrivalMs));
      maximumMs = Math.max(maximumMs, arrivalMs);
    }
  }
  return maximumMs;
};

/** Overlap cycles once every reachable node arrives, keeping each edge's current motion. */
export const advanceGraphTraversal = (
  animation: GraphTraversalAnimation,
  elapsedMs: number,
  nodeMap: Map<string, KnowledgeGraphNode>
) => {
  const { plan } = animation;
  if (!plan.levels.length || !nodeMap.size) return;

  const arrivals: TraversalArrival[] = [];
  const advanceSteps = (startIndex: number) => {
    let activeIndex = startIndex;
    for (let index = startIndex; index < animation.steps.length; index++) {
      const step = animation.steps[index];
      const from = nodeMap.get(step.fromId);
      const to = nodeMap.get(step.toId);
      if (!from || !to) {
        step.from = null;
        step.to = null;
        animation.steps[activeIndex++] = step;
        continue;
      }
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      const openLength = Math.max(0, distance - from.radius - to.radius);
      const glintLength = Math.min(GLINT_LENGTH_PX, openLength * 0.4);
      const travelLengthPx = openLength - glintLength;
      const durationMs = (travelLengthPx / step.speedPxPerSecond) * 1000;
      const arrivedAtMs = step.startedAtMs + durationMs;
      const stepElapsedMs = elapsedMs - step.startedAtMs;
      if (elapsedMs >= arrivedAtMs) {
        pushArrival(arrivals, { cycle: step.cycle, nodeId: step.toId, atMs: arrivedAtMs });
        continue;
      }

      step.from = from;
      step.to = to;
      step.ux = dx / distance;
      step.uy = dy / distance;
      step.glintLength = glintLength;
      step.along = from.radius + glintLength / 2 + (stepElapsedMs * step.speedPxPerSecond) / 1000;
      animation.steps[activeIndex++] = step;
    }
    animation.steps.length = activeIndex;
  };

  advanceSteps(0);
  let skippedHistory = false;
  while (
    arrivals.length ||
    (animation.nextCycleAtMs !== null && animation.nextCycleAtMs <= elapsedMs)
  ) {
    let nextCycleAtMs = animation.nextCycleAtMs;
    if (
      !skippedHistory &&
      nextCycleAtMs !== null &&
      elapsedMs - nextCycleAtMs > HISTORY_SKIP_THRESHOLD_MS
    ) {
      // Skip only cycles whose longest possible path has already finished offscreen.
      const periodMs = nextCycleAtMs - animation.cycle.startedAtMs;
      const lifetimeMs = maximumCycleDuration(plan, nodeMap);
      const missedCycles = Math.max(
        0,
        Math.floor((elapsedMs - nextCycleAtMs - lifetimeMs) / periodMs)
      );
      nextCycleAtMs += missedCycles * periodMs;
      animation.nextCycleAtMs = nextCycleAtMs;
      skippedHistory = true;
    }
    const startIndex = animation.steps.length;
    if (
      nextCycleAtMs !== null &&
      nextCycleAtMs <= elapsedMs &&
      (!arrivals.length || nextCycleAtMs <= arrivals[0].atMs)
    ) {
      startTraversalCycle(animation, nextCycleAtMs);
    } else {
      // Older cycles cannot activate successors or schedule repetitions in a newer cycle.
      const arrival = popArrival(arrivals);
      activateTraversalNode(animation, arrival.cycle, arrival.nodeId, arrival.atMs);
    }
    advanceSteps(startIndex);
  }
  animation.pauseUntilMs = animation.steps.length ? null : animation.nextCycleAtMs;
};
