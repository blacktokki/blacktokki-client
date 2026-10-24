import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';

/**
 * 지식 그래프 물리 시뮬레이션 기본 파라미터
 */
export const DEFAULT_LAYOUT_CONFIG = {
  minDistance: {
    classNode: 95.625,
    instanceNode: 78.75,
    keyword: 140,
    externalLink: 90,
  },
  edgeLength: {
    references: 106.875,
    instanceOf: 84.375,
    subClassOf: 84.375,
    partOf: 90,
    noteContainment: 90,
    paragraphContainment: 90,
    defaultEdge: 160,
  },
  physics: {
    repulsion: 113.90625,
    spring: 0.018,
    gravity: 0.0006,
    collisionForce: 0.75,
    rootRingSpring: 0.026,
    focusSpring: 0.32,
    focusSpacingMultiplier: 2.5,
    ordinaryExternalReferenceSpringScale: 0.15,
    rootAnchorSpring: 0.018,
    familyGravity: 0.001,
    rootFirstRingRadius: 87.1875,
    rootRingStep: 70.3125,
    maxRepulsionDistance: 550,
    maxVelocity: 40,
  },
  canvas: {
    nodeSpanMultiplier: 146.25,
    minLayoutSpan: 843.75,
    initialAreaMultiplier: 4,
  },
};

export interface ForceSimulationOptions {
  /** Apply changed family areas before drawing, then use only small visible corrections. */
  balanceRootAreas?: boolean;
  width: number;
  height: number;
  spacingScale?: number;
  centerOrigin?: boolean;
  selectedNodeId?: string | null;
  focusDepth?: number;
  focusedNodeIds?: Set<string> | null;
  rootAnchorPositions?: Map<string, { x: number; y: number }>;
  previousContext?: ForceSimulationContext | null;
}

export interface ClassRootDistanceIndex {
  rootIds: string[];
  rootByNodeId: Map<string, string>;
  hopByNodeId: Map<string, number>;
}

export interface SimNode extends KnowledgeGraphNode {
  vx: number;
  vy: number;
}

export interface PrecomputedEdge {
  source: SimNode;
  target: SimNode;
  targetLen: number;
  springScale: number;
  placement?: boolean;
  sourceScale?: number;
  targetScale?: number;
  sourceFamily?: { root: SimNode; scale: number };
  targetFamily?: { root: SimNode; scale: number };
}

export interface HierarchyConstraint {
  child: number;
  parent: number;
  length: number;
}

export interface HierarchyConstraints {
  tree: HierarchyConstraint[];
  cyclic: HierarchyConstraint[];
}

type FixedRelationKind = 'notePartOf' | 'paragraphPartOf' | 'connectedPartOf';
/** Unscaled child lengths, grouped by parent and semantic connection type. */
type FixedRelationLengths = Map<string, Partial<Record<FixedRelationKind, Map<string, number>>>>;

export interface PrecomputedRootPull {
  node: SimNode;
  root: SimNode;
  targetRadius: number;
  branchOffset?: { x: number; y: number };
  fixedContainment?: boolean;
}

export interface PrecomputedRootAnchor {
  root: SimNode;
  x: number;
  y: number;
}

export interface PrecomputedFocusPull {
  node: SimNode;
  selected: SimNode;
  targetRadius: number;
}

export interface CentroidConstraint {
  node: SimNode;
  members: SimNode[];
}

interface SourcePositionConstraint {
  node: SimNode;
  positions: { origin: SimNode; x: number; y: number }[];
  lastTarget?: { x: number; y: number };
  reservedRootId?: string;
}

export interface ForceSimulationContext {
  simNodes: SimNode[];
  collisionFlags: Uint8Array;
  rootIndices: Int32Array;
  collisionDistances: Float32Array;
  repulsionCellSize: number;
  spatialCells: Map<number, Map<number, { start: number; end: number }>>;
  spatialOrder: Int32Array;
  candidateCellRanges: Int32Array;
  positionX: Float64Array;
  positionY: Float64Array;
  velocityX: Float64Array;
  velocityY: Float64Array;
  repulsionCursor: number | null;
  pendingAlpha: number;
  precomputedEdges: PrecomputedEdge[];
  hierarchyConstraints: HierarchyConstraints;
  focusHierarchyConstraints?: HierarchyConstraints;
  precomputedRootPulls: PrecomputedRootPull[];
  precomputedRootAnchors: PrecomputedRootAnchor[];
  precomputedFocusPulls: PrecomputedFocusPull[];
  focusedNodeIds: Set<string>;
  externalClassNode: SimNode | null;
  externalLinkNodes: SimNode[];
  noteClassNode: SimNode | null;
  noteInstanceNodes: SimNode[];
  derivedCentroids: CentroidConstraint[];
  derivedCentroidFlags: Uint8Array;
  externalPositionConstraints: SourcePositionConstraint[];
  keywordPositionConstraints: SourcePositionConstraint[];
  sourceRootByNodeId: Map<string, string>;
  cx: number;
  cy: number;
  kRepulse: number;
  maxRepulseDistSq: number;
  kSpring: number;
  kGravity: number;
  collisionForce: number;
  rootRingSpring: number;
  rootAnchorSpring: number;
  focusSpring: number;
  maxVelocity: number;
  spacingScale: number;
  nodeCount: number;
  densityScale: number;
  layoutNodeCount: number;
  rootPopulations: Map<string, number>;
  rootFootprints: Map<string, number>;
  compactFamilies: boolean;
  rootLayoutOrder: string[];
  rootLayoutSnake: boolean;
  placementSignature: string;
  spaceReservationPending: boolean;
  restartAlpha: number;
  hierarchyLengths: FixedRelationLengths;
  fixedNeighbors: Map<number, Set<number>>;
}

const COLLISION_CLASS = 1;
const COLLISION_ROOT = 2;
const COLLISION_FOCUSED = 4;
const COLLISION_CONTAINMENT = 8;
const COLLISION_EXTERNAL = 16;
const COLLISION_KEYWORD = 32;
const SPATIAL_INDEX_THRESHOLD = 128;
const SOURCE_RESERVATION_MIN_POPULATION = 64;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_PITCH_SCALE = 1.65;
const SPIRAL_STEP_SCALE = 1.05;
const circularCapacity = (radius: number, gap: number): number =>
  Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(1, gap / (2 * radius))) + 1e-8));

/** Keep small groups circular; alternate opposite arms of an expanding Archimedean spiral. */
const densityRadius = (count: number, index: number, radius: number, gap: number): number => {
  const capacity = circularCapacity(radius, gap);
  const pitch = (gap * SPIRAL_PITCH_SCALE) / Math.PI;
  return count <= capacity
    ? radius
    : Math.sqrt(radius * radius + Math.floor(index / 2) * 2 * pitch * gap * SPIRAL_STEP_SCALE);
};

const densityAngle = (count: number, index: number, radius: number, gap: number): number =>
  count <= circularCapacity(radius, gap)
    ? ((index + 0.5) * 2 * Math.PI) / count
    : (densityRadius(count, index, radius, gap) - radius) / ((gap * SPIRAL_PITCH_SCALE) / Math.PI) +
      (index % 2) * Math.PI;

/** Share one two-arm path across mixed kinds, with shorter steps for consecutive external links. */
const mixedDensityPositions = (
  gaps: number[],
  radius: number
): { radius: number; angle: number }[] => {
  const gap = gaps.reduce((max, value) => Math.max(max, value), 0);
  if (gaps.length <= circularCapacity(radius, gap))
    return gaps.map((_, index) => ({ radius, angle: ((index + 0.5) * 2 * Math.PI) / gaps.length }));
  const pitch = (gap * SPIRAL_PITCH_SCALE) / Math.PI;
  let currentRadius = radius,
    previousGap = gaps[0];
  return gaps.map((_, index) => {
    if (index % 2 === 0) {
      const pairGap = Math.max(gaps[index], gaps[index + 1] || gaps[index]);
      if (index)
        currentRadius = Math.sqrt(
          currentRadius ** 2 + 2 * pitch * Math.max(previousGap, pairGap) * SPIRAL_STEP_SCALE
        );
      previousGap = pairGap;
    }
    return {
      radius: currentRadius,
      angle: (currentRadius - radius) / pitch + (index % 2) * Math.PI,
    };
  });
};

/** Grow descendant branches along spiral curves, reserving clearance before placing each node. */
const hierarchyBranchPositions = (
  members: { id: string; parent: string; gap: number }[],
  root: string,
  rootGap: number,
  firstRadius: number,
  phase: number,
  sourcePriority = new Map<string, number>()
): Map<string, { x: number; y: number }> => {
  const children = new Map<string, typeof members>();
  for (const member of members) append(children, member.parent, member);
  const order = [root];
  for (let i = 0; i < order.length; i++)
    for (const child of children.get(order[i]) || []) order.push(child.id);
  const weights = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--)
    weights.set(
      order[i],
      1 + (children.get(order[i]) || []).reduce((n, child) => n + weights.get(child.id)!, 0)
    );
  for (const siblings of children.values())
    siblings.sort(
      (a, b) =>
        (sourcePriority.get(b.id) || 0) - (sourcePriority.get(a.id) || 0) ||
        weights.get(b.id)! - weights.get(a.id)! ||
        a.id.localeCompare(b.id)
    );

  const cellSize = members.reduce((max, n) => Math.max(max, n.gap), rootGap);
  const cells = new Map<string, { x: number; y: number; gap: number }[]>();
  const vacancyGrids = new Map<number, Map<number, Set<number>>>();
  const blockGrid = (
    grid: Map<number, Set<number>>,
    gap: number,
    point: { x: number; y: number; gap: number }
  ) => {
    const step = gap / 2;
    const clearance = Math.max(gap, point.gap);
    for (
      let row = Math.ceil((point.y - clearance) / step);
      row <= (point.y + clearance) / step;
      row++
    ) {
      const half = Math.sqrt(Math.max(0, clearance ** 2 - (row * step - point.y) ** 2));
      let columns = grid.get(row);
      if (!columns) grid.set(row, (columns = new Set()));
      for (
        let column = Math.ceil((point.x - half) / step);
        column <= (point.x + half) / step;
        column++
      )
        columns.add(column);
    }
  };
  const reserve = (p: { x: number; y: number }, gap: number) => {
    append(cells, `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)}`, { ...p, gap });
    for (const [childGap, grid] of vacancyGrids) blockGrid(grid, childGap, { ...p, gap });
  };
  const free = (p: { x: number; y: number }, gap: number) => {
    const x = Math.floor(p.x / cellSize),
      y = Math.floor(p.y / cellSize);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const other of cells.get(`${x + dx},${y + dy}`) || [])
          if (Math.hypot(p.x - other.x, p.y - other.y) < Math.max(gap, other.gap) - 1e-7)
            return false;
    return true;
  };
  const positions = new Map([[root, { x: 0, y: 0 }]]);
  reserve(positions.get(root)!, rootGap);
  const queue = [root];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const parent = queue[cursor];
    const siblings = children.get(parent) || [];
    if (!siblings.length) continue;
    const origin = positions.get(parent)!;
    const gap = siblings.reduce((max, n) => Math.max(max, n.gap), 0);
    const placed: string[] = [];
    const place = (child: (typeof members)[number], point: { x: number; y: number }) => {
      positions.set(child.id, point);
      reserve(point, child.gap);
      placed.push(child.id);
    };
    // Reserve source-bearing branches first, then short branches before populous siblings.
    const enqueue = () => {
      queue.push(
        ...placed.sort(
          (a, b) =>
            (children.get(a)?.length || 0) - (children.get(b)?.length || 0) ||
            weights.get(b)! - weights.get(a)! ||
            a.localeCompare(b)
        )
      );
      if (sourcePriority.size) {
        const pending = queue
          .splice(cursor + 1)
          .sort(
            (a, b) =>
              (sourcePriority.get(b) || 0) - (sourcePriority.get(a) || 0) ||
              weights.get(a)! - weights.get(b)! ||
              a.localeCompare(b)
          );
        queue.push(...pending);
      }
    };
    let index = 0;
    if (parent === root) {
      const population = siblings.reduce((sum, child) => sum + weights.get(child.id)!, 0);
      const baseRadius = Math.max(
        rootGap,
        firstRadius,
        gap * Math.sqrt(population / siblings.length) * 0.3
      );
      if (siblings.length > circularCapacity(baseRadius, gap)) {
        // Shallow, crowded hierarchies still form spirals instead of concentric rings.
        const arms = Math.max(2, Math.min(6, Math.ceil(Math.cbrt(siblings.length / 6))));
        const pitch = (gap * 2.9 * arms) / (Math.PI * 2);
        const radii = Array(arms * 2).fill(baseRadius);
        for (let i = 0; i < siblings.length; i++) {
          const channel = i % (arms * 2);
          const arm = channel % arms;
          const offset = (channel < arms ? -1 : 1) * gap * 0.55;
          for (;;) {
            const radius = radii[channel];
            const angle = phase + (arm * Math.PI * 2) / arms + (radius - baseRadius) / pitch;
            const normal = Math.hypot(radius, pitch);
            const radial = radius + (offset * radius) / normal;
            const tangent = (-offset * pitch) / normal;
            const point = {
              x: Math.cos(angle) * radial - Math.sin(angle) * tangent,
              y: Math.sin(angle) * radial + Math.cos(angle) * tangent,
            };
            if (!free(point, siblings[i].gap)) {
              radii[channel] = radius + gap * 0.08;
              continue;
            }
            radii[channel] = Math.sqrt(radius * radius + 2 * pitch * gap * 1.05);
            place(siblings[i], point);
            break;
          }
        }
        enqueue();
        continue;
      }
      let pending = siblings;
      for (let row = 0; pending.length; row++) {
        const radius = baseRadius + row * gap;
        const count = Math.min(circularCapacity(radius, gap), pending.length);
        const group = pending.slice(0, count);
        const total = group.reduce((sum, child) => sum + weights.get(child.id)!, 0);
        const minSector = 2 * Math.asin(Math.min(1, gap / (2 * radius)));
        const spare = Math.max(0, Math.PI * 2 - minSector * count);
        let angle = phase + row * GOLDEN_ANGLE;
        for (const child of group) {
          // Every branch gets minimum clearance; the remaining angle follows descendant counts.
          const sector = minSector + (spare * weights.get(child.id)!) / total;
          const point = {
            x: Math.cos(angle + sector / 2) * radius,
            y: Math.sin(angle + sector / 2) * radius,
          };
          angle += sector;
          if (!free(point, child.gap)) continue;
          place(child, point);
        }
        // A collision with an earlier ring leaves the unplaced members for the next ring.
        pending = pending.filter((child) => !positions.has(child.id));
      }
      enqueue();
      continue;
    }

    const parentRadius = Math.hypot(origin.x, origin.y);
    const parentAngle = Math.atan2(origin.y, origin.x);
    // A blocked spiral must be able to use neighboring lanes before extending a long tail.
    const nearbyVacancy = (childGap: number) => {
      let grid = vacancyGrids.get(childGap);
      if (!grid) {
        vacancyGrids.set(childGap, (grid = new Map()));
        for (const points of cells.values())
          for (const point of points) blockGrid(grid, childGap, point);
      }
      const step = childGap / 2;
      const column = Math.round(origin.x / step),
        row = Math.round(origin.y / step);
      const direction = parentAngle + Math.atan2(2, 1);
      let bestRing = Infinity,
        alignment = -Infinity,
        best = origin;
      const candidate = (column: number, row: number) => {
        if (grid!.get(row)?.has(column)) return;
        const point = { x: column * step, y: row * step };
        if (Math.hypot(point.x, point.y) <= parentRadius + childGap * 1e-7) return;
        const dx = point.x - origin.x,
          dy = point.y - origin.y;
        const distance = Math.hypot(dx, dy);
        const ring = Math.ceil(distance / step);
        const score = (dx * Math.cos(direction) + dy * Math.sin(direction)) / (distance || 1);
        if (ring < bestRing || (ring === bestRing && score > alignment)) {
          bestRing = ring;
          alignment = score;
          best = point;
        }
      };
      for (let radius = 0; radius - 0.5 <= bestRing; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
          candidate(column + dx, row + radius);
          if (radius) candidate(column + dx, row - radius);
        }
        for (let dy = -radius + 1; dy < radius; dy++) {
          candidate(column + radius, row + dy);
          candidate(column - radius, row + dy);
        }
      }
      return best;
    };
    // theta = 2 * log(r): advance by arc length so adjacent hierarchy levels stay close.
    const curl = 2;
    const norm = Math.hypot(1, curl);
    if (siblings.length > 4) {
      // A broad sibling group follows complete local spiral arms, not a fan of nearest points.
      const arms = Math.max(2, Math.min(6, Math.ceil(Math.cbrt(siblings.length / 6))));
      const pitch = (gap * 2.9 * arms) / (Math.PI * 2);
      const radii = Array(arms * 2).fill(gap);
      for (let i = 0; i < siblings.length; i++) {
        const channel = i % (arms * 2);
        const arm = channel % arms;
        const offset = (channel < arms ? -1 : 1) * gap * 0.55;
        for (;;) {
          const radius = radii[channel];
          if (radius > gap * Math.max(3, Math.sqrt(siblings.length) * 1.3)) {
            place(siblings[i], nearbyVacancy(siblings[i].gap));
            break;
          }
          const angle =
            parentAngle + Math.PI / 2 + (arm * Math.PI * 2) / arms + (radius - gap) / pitch;
          const normal = Math.hypot(radius, pitch);
          const radial = radius + (offset * radius) / normal;
          const tangent = (-offset * pitch) / normal;
          const point = {
            x: origin.x + Math.cos(angle) * radial - Math.sin(angle) * tangent,
            y: origin.y + Math.sin(angle) * radial + Math.cos(angle) * tangent,
          };
          if (Math.hypot(point.x, point.y) <= parentRadius || !free(point, siblings[i].gap)) {
            radii[channel] = radius + gap * 0.08;
            continue;
          }
          radii[channel] = Math.sqrt(radius * radius + 2 * pitch * gap * 1.05);
          place(siblings[i], point);
          break;
        }
      }
      enqueue();
      continue;
    }
    const offsets = [0];
    for (let lane = 1; lane <= 6; lane++) offsets.push((-lane * gap) / 4, (lane * gap) / 4);
    for (let row = 0; index < siblings.length; row++) {
      const advance = gap * (1.1 + row * 0.15);
      const radius = parentRadius + advance / norm;
      const angle = parentAngle + curl * Math.log(radius / parentRadius);
      if (
        Math.hypot(Math.cos(angle) * radius - origin.x, Math.sin(angle) * radius - origin.y) >
        gap * 3
      ) {
        place(siblings[index], nearbyVacancy(siblings[index].gap));
        if (++index === siblings.length) break;
        continue;
      }
      for (const offset of offsets) {
        // Parallel lanes give each splitting arm width without spreading a whole depth band.
        const laneRadius = radius + (curl / norm) * offset;
        const laneAngle = angle - offset / norm / radius;
        if (laneRadius <= parentRadius || laneAngle <= parentAngle + 0.12) continue;
        const point = { x: Math.cos(laneAngle) * laneRadius, y: Math.sin(laneAngle) * laneRadius };
        const child = siblings[index];
        if (!free(point, child.gap)) continue;
        place(child, point);
        if (++index === siblings.length) break;
      }
    }
    enqueue();
  }
  // Fill vacant inner lanes before extending source-bearing branches toward the perimeter.
  // Reinsert in parent order and keep the same clearance and outward hierarchy direction.
  if (sourcePriority.size && members.length >= SOURCE_RESERVATION_MIN_POPULATION) {
    const old = new Map(positions);
    positions.clear();
    cells.clear();
    vacancyGrids.clear();
    const parentById = new Map(members.map((n) => [n.id, n.parent]));
    const gapById = new Map(members.map((n) => [n.id, n.gap]));
    positions.set(root, { x: 0, y: 0 });
    reserve(positions.get(root)!, rootGap);
    for (const [id, point] of old) {
      if (id === root) continue;
      const childGap = gapById.get(id)!;
      const parent = positions.get(parentById.get(id)!)!;
      const parentRadius = Math.hypot(parent.x, parent.y);
      const oldParent = old.get(parentById.get(id)!)!;
      const direction = Math.atan2(point.y - oldParent.y, point.x - oldParent.x);
      let ideal = { x: point.x * 0.62, y: point.y * 0.62 };
      const r = Math.hypot(ideal.x, ideal.y),
        minRadius = parentRadius + childGap * 0.1;
      if (r < minRadius)
        ideal = { x: (ideal.x * minRadius) / (r || 1), y: (ideal.y * minRadius) / (r || 1) };
      const step = childGap / 2;
      const column = Math.round(ideal.x / step),
        row = Math.round(ideal.y / step);
      let bestRing = Infinity,
        score = Infinity,
        best = ideal;
      const candidate = (x: number, y: number) => {
        const p = { x: x * step, y: y * step };
        if (Math.hypot(p.x, p.y) < minRadius || !free(p, childGap)) return;
        const distance = Math.hypot(p.x - ideal.x, p.y - ideal.y);
        const ring = Math.ceil(distance / step);
        const penalty =
          (p.x - parent.x) * Math.cos(direction) + (p.y - parent.y) * Math.sin(direction);
        if (ring < bestRing || (ring === bestRing && distance - penalty * 0.01 < score)) {
          bestRing = ring;
          score = distance - penalty * 0.01;
          best = p;
        }
      };
      if (!free(ideal, childGap)) {
        for (let radius = 0; radius - 0.5 <= bestRing; radius++) {
          for (let dx = -radius; dx <= radius; dx++) {
            candidate(column + dx, row + radius);
            if (radius) candidate(column + dx, row - radius);
          }
          for (let dy = -radius + 1; dy < radius; dy++) {
            candidate(column + radius, row + dy);
            candidate(column - radius, row + dy);
          }
        }
      }
      positions.set(id, best);
      reserve(best, childGap);
    }
  }
  positions.delete(root);
  return positions;
};

/** Consecutive cells stay adjacent while the occupied area grows linearly. */
const squareSpiral = (index: number): { x: number; y: number } => {
  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  if (!ring) return { x: 0, y: 0 };
  const side = ring * 2;
  const offset = (side + 1) ** 2 - 1 - index;
  if (offset < side) return { x: ring - offset, y: -ring };
  if (offset < side * 2) return { x: -ring, y: -ring + offset - side };
  if (offset < side * 3) return { x: -ring + offset - side * 2, y: ring };
  return { x: ring, y: ring - offset + side * 3 };
};

const getHierarchyKind = (
  edge: KnowledgeGraphEdge,
  source: KnowledgeGraphNode
): FixedRelationKind | undefined => {
  if (edge.type !== 'PART_OF') return undefined;
  const kind = source.instanceKind;
  const label =
    edge.propertyLabel ||
    (kind === 'NOTE'
      ? 'notePartOf'
      : kind === 'PARAGRAPH' || kind === 'BOARD_PARAGRAPH' || kind === 'CONNECTED_PARAGRAPH'
      ? 'paragraphPartOf'
      : undefined);
  if (label === 'notePartOf' || label === 'paragraphPartOf' || label === 'connectedPartOf')
    return label;
  return undefined;
};

const getHierarchyLength = (
  edge: KnowledgeGraphEdge,
  source: KnowledgeGraphNode,
  lengths?: FixedRelationLengths
): number | undefined => {
  const kind = getHierarchyKind(edge, source);
  return kind
    ? lengths?.get(edge.target)?.[kind]?.get(edge.source) ??
        (kind === 'notePartOf'
          ? DEFAULT_LAYOUT_CONFIG.edgeLength.noteContainment
          : DEFAULT_LAYOUT_CONFIG.edgeLength.paragraphContainment)
    : undefined;
};

/** Order acyclic containment components from their roots so one pass fixes every edge. */
const buildHierarchyConstraints = (
  nodes: SimNode[],
  edges: KnowledgeGraphEdge[],
  nodeIndex: Map<string, number>,
  spacingScale: number,
  lengths: FixedRelationLengths
): HierarchyConstraints => {
  const neighbors = new Map<number, HierarchyConstraint[]>();
  const childIds = new Set<number>();
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== 'PART_OF') continue;
    const child = nodeIndex.get(edge.source);
    const parent = nodeIndex.get(edge.target);
    if (child === undefined || parent === undefined || child === parent) continue;
    const length = getHierarchyLength(edge, nodes[child], lengths);
    if (length === undefined) continue;
    const key = `${child}:${parent}:${length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const constraint = {
      child,
      parent,
      length: length * spacingScale,
    };
    for (const index of [child, parent]) {
      const adjacent = neighbors.get(index) || [];
      adjacent.push(constraint);
      neighbors.set(index, adjacent);
    }
    childIds.add(child);
  }
  const result: HierarchyConstraints = { tree: [], cyclic: [] };
  const visited = new Set<number>();
  const starts = [...neighbors.keys()].sort(
    (left, right) => Number(childIds.has(left)) - Number(childIds.has(right))
  );
  for (const root of starts) {
    if (visited.has(root)) continue;
    const queue = [root];
    visited.add(root);
    const componentEdges = new Set<HierarchyConstraint>();
    const ordered: HierarchyConstraint[] = [];
    for (let i = 0; i < queue.length; i++) {
      const parent = queue[i];
      for (const edge of neighbors.get(parent) || []) {
        componentEdges.add(edge);
        const child = edge.child === parent ? edge.parent : edge.child;
        if (visited.has(child)) continue;
        visited.add(child);
        queue.push(child);
        ordered.push({ child, parent, length: edge.length });
      }
    }
    const destination = componentEdges.size === ordered.length ? result.tree : result.cyclic;
    for (const edge of destination === result.tree ? ordered : componentEdges) {
      destination.push(edge);
    }
  }
  return result;
};

/** Enforce containment distances independently of repulsion, focus pulls and cooling. */
export const applyHierarchyConstraints = (
  constraints: HierarchyConstraints,
  nodes: KnowledgeGraphNode[]
): boolean => {
  let changed = false;
  const project = (edge: HierarchyConstraint, symmetric: boolean): number => {
    const child = nodes[edge.child];
    const parent = nodes[edge.parent];
    let dx = child.x - parent.x;
    let dy = child.y - parent.y;
    const distance = Math.hypot(dx, dy);
    const error = distance - edge.length;
    if (Math.abs(error) < 0.000001) return 0;
    if (distance === 0) {
      const angle = ((edge.child * 31 + edge.parent * 17) % 628) / 100;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    } else {
      dx /= distance;
      dy /= distance;
    }
    const correction = error * (symmetric ? 0.5 : 1);
    child.x -= dx * correction;
    child.y -= dy * correction;
    if (symmetric) {
      parent.x += dx * correction;
      parent.y += dy * correction;
    }
    changed = true;
    return Math.abs(error);
  };
  for (const edge of constraints.tree) project(edge, false);
  // Shared board paragraphs can close cycles across note branches. Relax the whole
  // component together rather than overwriting one of the paragraph's parents.
  let previousError = Infinity;
  for (let iteration = 0; iteration < 64 && constraints.cyclic.length > 0; iteration++) {
    let maxError = 0;
    for (const edge of constraints.cyclic) maxError = Math.max(maxError, project(edge, true));
    if (maxError < 0.01) break;
    if (iteration % 8 === 7 && maxError >= previousError * 0.999) {
      // A collinear cycle cannot open into a polygon using radial corrections alone.
      for (const edge of constraints.cyclic) {
        const child = nodes[edge.child];
        const parent = nodes[edge.parent];
        const dx = child.x - parent.x;
        const dy = child.y - parent.y;
        const distance = Math.hypot(dx, dy) || 1;
        const offset = edge.length * 0.01;
        child.x -= (dy / distance) * offset;
        child.y += (dx / distance) * offset;
      }
    }
    previousError = maxError;
  }
  return changed;
};

const focusedPairSpacing = (context: ForceSimulationContext, i: number, j: number): number =>
  context.focusedNodeIds.size &&
  (context.collisionFlags[i] | context.collisionFlags[j]) & COLLISION_FOCUSED
    ? DEFAULT_LAYOUT_CONFIG.physics.focusSpacingMultiplier
    : 1;

/** Compute the existing class/root collision rules only for nearby pairs. */
const getPairMinDistance = (context: ForceSimulationContext, i: number, j: number): number => {
  const { collisionFlags, collisionDistances } = context;
  const left = collisionFlags[i];
  const right = collisionFlags[j];
  const distance =
    collisionDistances[
      (left | right) & COLLISION_KEYWORD
        ? 3
        : (left | right) & COLLISION_CLASS
        ? 1
        : left & right & COLLISION_EXTERNAL
        ? 2
        : 0
    ];
  if (
    !context.compactFamilies &&
    left & right & COLLISION_ROOT &&
    !((left | right) & COLLISION_FOCUSED)
  )
    return Math.max(
      distance,
      ((context.rootFootprints.get(context.simNodes[i].id) || 0) +
        (context.rootFootprints.get(context.simNodes[j].id) || 0)) /
        2
    );
  if (!context.compactFamilies && !((left | right) & COLLISION_FOCUSED)) {
    const member = left & COLLISION_ROOT ? j : right & COLLISION_ROOT ? i : -1;
    const otherRoot = member === j ? i : j;
    const ownRoot = member >= 0 ? context.rootIndices[member] : -1;
    if (ownRoot >= 0 && ownRoot !== otherRoot) {
      const node = context.simNodes[member],
        root = context.simNodes[ownRoot];
      return Math.max(
        distance,
        Math.hypot(node.x - root.x, node.y - root.y) + collisionDistances[0] / 2
      );
    }
  }
  if ((left | right) & COLLISION_FOCUSED)
    return (distance / context.densityScale) * focusedPairSpacing(context, i, j);
  return left & right & COLLISION_CONTAINMENT && context.fixedNeighbors.get(i)?.has(j)
    ? distance / context.densityScale
    : distance;
};

/** Pack cell members in ascending node order into a reusable contiguous buffer. */
const indexNearbyNodes = (context: ForceSimulationContext): void => {
  const { simNodes, spatialCells, spatialOrder, repulsionCellSize, positionX, positionY } = context;
  spatialCells.clear();
  for (let i = 0; i < simNodes.length; i++) {
    const node = simNodes[i];
    if (
      node === context.noteClassNode ||
      node === context.externalClassNode ||
      context.derivedCentroidFlags[i]
    )
      continue;
    const x = Math.floor(positionX[i] / repulsionCellSize);
    const y = Math.floor(positionY[i] / repulsionCellSize);
    let column = spatialCells.get(x);
    if (!column) {
      column = new Map();
      spatialCells.set(x, column);
    }
    let cell = column.get(y);
    if (!cell) {
      cell = { start: 0, end: 0 };
      column.set(y, cell);
    }
    cell.end++;
  }
  let offset = 0;
  for (const column of spatialCells.values()) {
    for (const cell of column.values()) {
      const count = cell.end;
      cell.start = offset;
      cell.end = offset;
      offset += count;
    }
  }
  for (let i = 0; i < simNodes.length; i++) {
    const node = simNodes[i];
    if (
      node === context.noteClassNode ||
      node === context.externalClassNode ||
      context.derivedCentroidFlags[i]
    )
      continue;
    const x = Math.floor(positionX[i] / repulsionCellSize);
    const y = Math.floor(positionY[i] / repulsionCellSize);
    const cell = spatialCells.get(x)!.get(y)!;
    spatialOrder[cell.end++] = i;
  }
};

/** Binary-search each nearby cell so already processed pairs are never scanned again. */
const collectNearbyIndices = (context: ForceSimulationContext, i: number): number => {
  const {
    positionX,
    positionY,
    spatialCells,
    spatialOrder,
    repulsionCellSize,
    candidateCellRanges,
  } = context;
  let count = 0;
  const x = Math.floor(positionX[i] / repulsionCellSize);
  const y = Math.floor(positionY[i] / repulsionCellSize);
  for (let dx = -1; dx <= 1; dx++) {
    const column = spatialCells.get(x + dx);
    if (!column) continue;
    for (let dy = -1; dy <= 1; dy++) {
      const cell = column.get(y + dy);
      if (!cell) continue;
      let start = cell.start;
      let end = cell.end;
      while (start < end) {
        const middle = (start + end) >>> 1;
        if (spatialOrder[middle] <= i) start = middle + 1;
        else end = middle;
      }
      if (start < cell.end) {
        candidateCellRanges[count * 2] = start;
        candidateCellRanges[count * 2 + 1] = cell.end;
        count++;
      }
    }
  }
  return count;
};

const append = <K, T>(map: Map<K, T[]>, key: K, value: T) => {
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
};

interface RootLayoutPlan {
  positions: Map<string, { x: number; y: number }>;
  order: string[];
  snake: boolean;
  area: number;
}

/** Fill the lowest available strip, instead of leaving a tall family's entire row empty. */
const packUnequalFamilies = (
  order: string[],
  sizes: Map<string, number>,
  cx: number,
  cy: number,
  aspect: number,
  snake: boolean
): RootLayoutPlan => {
  const largest = order.reduce((max, id) => Math.max(max, sizes.get(id)!), 0);
  const area = order.reduce((sum, id) => sum + sizes.get(id)! ** 2, 0);
  const width = Math.max(largest, Math.sqrt(area * Math.min(1.6, Math.max(0.7, aspect))));
  let skyline = [{ x: 0, y: 0, width }];
  const positions = new Map<string, { x: number; y: number }>();
  let height = 0,
    usedWidth = 0;
  for (const id of order) {
    const size = sizes.get(id)!;
    let bestX = 0,
      bestY = Infinity,
      bestWaste = Infinity;
    for (let i = 0; i < skyline.length; i++) {
      const x = skyline[i].x;
      if (x + size > width + 1e-6) continue;
      let y = 0,
        waste = 0;
      for (let j = i; j < skyline.length && skyline[j].x < x + size - 1e-6; j++)
        y = Math.max(y, skyline[j].y);
      for (let j = i; j < skyline.length && skyline[j].x < x + size - 1e-6; j++)
        waste += (y - skyline[j].y) * Math.min(skyline[j].width, x + size - skyline[j].x);
      if (
        y < bestY ||
        (y === bestY && (waste < bestWaste || (waste === bestWaste && snake && x > bestX)))
      ) {
        bestX = x;
        bestY = y;
        bestWaste = waste;
      }
    }
    positions.set(id, { x: bestX + size / 2, y: bestY + size / 2 });
    const next: typeof skyline = [];
    for (const strip of skyline) {
      const end = strip.x + strip.width;
      if (end <= bestX + 1e-6 || strip.x >= bestX + size - 1e-6) next.push(strip);
      else {
        if (strip.x < bestX) next.push({ ...strip, width: bestX - strip.x });
        if (end > bestX + size) next.push({ ...strip, x: bestX + size, width: end - bestX - size });
      }
    }
    next.push({ x: bestX, y: bestY + size, width: size });
    next.sort((a, b) => a.x - b.x);
    skyline = [];
    for (const strip of next) {
      const last = skyline[skyline.length - 1];
      if (last && Math.abs(last.y - strip.y) < 1e-6) last.width += strip.width;
      else skyline.push({ ...strip });
    }
    height = Math.max(height, bestY + size);
    usedWidth = Math.max(usedWidth, bestX + size);
  }
  for (const position of positions.values()) {
    position.x += cx - usedWidth / 2;
    position.y += cy - height / 2;
  }
  return { positions, order: [...order], snake, area: usedWidth * height };
};

/** Pack whole families without changing their reserved footprints. */
const packRootFamilies = (
  order: string[],
  sizes: Map<string, number>,
  cx: number,
  cy: number,
  aspect: number,
  snake: boolean
): RootLayoutPlan => {
  const positions = new Map<string, { x: number; y: number }>();
  const largest = order.reduce((max, id) => Math.max(max, sizes.get(id)!), 0);
  const smallest = order.reduce((min, id) => Math.min(min, sizes.get(id)!), Infinity);
  if (largest > smallest * 1.5) return packUnequalFamilies(order, sizes, cx, cy, aspect, snake);
  if (order.length <= 8 && !snake && largest <= smallest * 1.5) {
    const radius = order.length <= 1 ? 0 : largest / (2 * Math.sin(Math.PI / order.length));
    order.forEach((id, index) => {
      const angle = (index * 2 * Math.PI) / order.length;
      positions.set(id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    });
    return { positions, order: [...order], snake, area: (2 * radius + largest) ** 2 };
  }
  const area = order.reduce((sum, id) => sum + sizes.get(id)! ** 2, 0);
  const rowWidth = Math.max(largest, Math.sqrt(area * Math.min(1.6, aspect)));
  const rows = new Map<string, number>();
  let x = 0,
    y = 0,
    rowHeight = 0,
    packedWidth = 0,
    row = 0;
  for (const id of order) {
    const size = sizes.get(id)!;
    if (x > 0 && x + size > rowWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
      row++;
    }
    positions.set(id, { x: x + size / 2, y: y + size / 2 });
    rows.set(id, row);
    x += size;
    rowHeight = Math.max(rowHeight, size);
    packedWidth = Math.max(packedWidth, x);
  }
  for (const [id, position] of positions) {
    if (snake && rows.get(id)! % 2) position.x = packedWidth - position.x;
    position.x += cx - packedWidth / 2;
    position.y += cy - (y + rowHeight) / 2;
  }
  return { positions, order: [...order], snake, area: packedWidth * (y + rowHeight) };
};

/** Place highly connected families centrally without overlapping their reserved areas. */
const centerConnectedFamilies = (
  baseline: RootLayoutPlan,
  sizes: Map<string, number>,
  neighbors: Map<string, Map<string, number>>,
  cx: number,
  cy: number
): RootLayoutPlan => {
  const weights = new Map(
    [...neighbors].map(([id, adjacent]) => [
      id,
      [...adjacent.values()].reduce((sum, weight) => sum + weight, 0),
    ])
  );
  const order = [...baseline.order].sort(
    (a, b) =>
      (weights.get(b) || 0) - (weights.get(a) || 0) ||
      sizes.get(b)! - sizes.get(a)! ||
      a.localeCompare(b)
  );
  const highest = weights.get(order[0]) || 0;
  const mean = [...weights.values()].reduce((sum, weight) => sum + weight, 0) / order.length;
  if (order.length < 3 || highest <= mean * 1.2) return baseline;
  const positions = new Map([[order[0], { x: cx, y: cy }]]);
  if (order.length <= 64) {
    const sortedSizes = [...sizes.values()].sort((a, b) => a - b);
    const packingSizes = new Map(sizes);
    // A small hub can occupy the center of the surrounding families' natural grid.
    packingSizes.set(
      order[0],
      Math.max(sizes.get(order[0])!, sortedSizes[Math.floor(sortedSizes.length / 2)])
    );
    for (const id of order.slice(1)) {
      const size = packingSizes.get(id)!;
      let best: { x: number; y: number } | undefined,
        bestDistance = Infinity;
      for (const [other, position] of positions) {
        const gap = (size + packingSizes.get(other)!) / 2;
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ]) {
          const point = { x: position.x + dx * gap, y: position.y + dy * gap };
          const distance = (point.x - cx) ** 2 + (point.y - cy) ** 2;
          if (distance >= bestDistance) continue;
          let available = true;
          for (const [placedId, placed] of positions) {
            if (
              Math.max(Math.abs(point.x - placed.x), Math.abs(point.y - placed.y)) <
              (size + packingSizes.get(placedId)!) / 2 - 1e-7
            ) {
              available = false;
              break;
            }
          }
          if (available) {
            best = point;
            bestDistance = distance;
          }
        }
      }
      positions.set(id, best!);
    }
  } else {
    const half = sizes.get(order[0])! / 2;
    const regions = Array.from({ length: 4 }, () => ({ area: 0, order: [] as string[] }));
    for (const id of order.slice(1)) {
      const region = regions.reduce((best, item) => (item.area < best.area ? item : best));
      region.order.push(id);
      region.area += sizes.get(id)! ** 2;
    }
    regions.forEach((region, index) => {
      if (!region.order.length) return;
      const packed = packUnequalFamilies(region.order, sizes, 0, 0, 1, false);
      let left = Infinity,
        top = Infinity;
      for (const [id, p] of packed.positions) {
        left = Math.min(left, p.x - sizes.get(id)! / 2);
        top = Math.min(top, p.y - sizes.get(id)! / 2);
      }
      for (const [id, p] of packed.positions) {
        const x = p.x - left - half,
          y = p.y - top + half;
        const offset =
          index === 0
            ? { x, y: -y }
            : index === 1
            ? { x: y, y: x }
            : index === 2
            ? { x: -x, y }
            : { x: -y, y: -x };
        positions.set(id, { x: cx + offset.x, y: cy + offset.y });
      }
    });
  }
  const bounds = (points: Map<string, { x: number; y: number }>) => {
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    for (const [id, p] of points) {
      const half = sizes.get(id)! / 2;
      left = Math.min(left, p.x - half);
      right = Math.max(right, p.x + half);
      top = Math.min(top, p.y - half);
      bottom = Math.max(bottom, p.y + half);
    }
    return { x: (left + right) / 2, y: (top + bottom) / 2, area: (right - left) * (bottom - top) };
  };
  const centrality = (points: Map<string, { x: number; y: number }>) => {
    const center = bounds(points);
    return [...points].reduce(
      (sum, [id, p]) =>
        sum + (weights.get(id) || 0) * ((p.x - center.x) ** 2 + (p.y - center.y) ** 2),
      0
    );
  };
  const extent = bounds(positions);
  if (extent.area > baseline.area * 1.3 || centrality(positions) >= centrality(baseline.positions))
    return baseline;
  return { positions, order, snake: false, area: extent.area };
};

/** Compare reference-aware orders, then improve equal-size slots with a bounded local search. */
const optimizeReferencePlacement = (
  baseline: RootLayoutPlan,
  sizes: Map<string, number>,
  neighbors: Map<string, Map<string, number>>,
  pack: (order: string[], snake: boolean) => RootLayoutPlan,
  fixedPositions?: Map<string, { x: number; y: number }>
): RootLayoutPlan => {
  if (!neighbors.size) return baseline;
  const cost = ({ positions }: RootLayoutPlan) => {
    let total = 0,
      squared = 0,
      max = 0;
    for (const [id, adjacent] of neighbors) {
      const a = positions.get(id)!;
      for (const [other, weight] of adjacent) {
        if (positions.has(other) && id >= other) continue;
        const b = (positions.get(other) || fixedPositions?.get(other))!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        total += weight * distance;
        squared += weight * distance * distance;
        max = Math.max(max, distance);
      }
    }
    return { total, squared, max };
  };
  const weights = new Map(
    [...neighbors].map(([id, adjacent]) => [
      id,
      [...adjacent.values()].reduce((sum, weight) => sum + weight, 0),
    ])
  );
  const compare = (a: string, b: string) =>
    (weights.get(b) || 0) - (weights.get(a) || 0) || a.localeCompare(b);
  const orderedNeighbors = new Map(
    [...neighbors].map(([id, adjacent]) => [
      id,
      [...adjacent.keys()].sort((a, b) => adjacent.get(b)! - adjacent.get(a)! || compare(a, b)),
    ])
  );
  const starts = [...baseline.order].sort(compare);
  const baselineCost = cost(baseline);
  let best = baseline,
    bestCost = baselineCost;
  for (const depthFirst of [false, true]) {
    const visited = new Set<string>(),
      order: string[] = [];
    for (const start of starts) {
      if (visited.has(start)) continue;
      const queue = [start];
      visited.add(start);
      for (let cursor = 0; cursor < queue.length; ) {
        const id = depthFirst ? queue.pop()! : queue[cursor++];
        order.push(id);
        const adjacent = orderedNeighbors.get(id) || [];
        for (const other of depthFirst ? [...adjacent].reverse() : adjacent) {
          if (visited.has(other) || !sizes.has(other)) continue;
          visited.add(other);
          queue.push(other);
        }
      }
    }
    for (const snake of [false, true]) {
      const candidate = pack(order, snake),
        candidateCost = cost(candidate);
      if (
        candidate.area <= baseline.area * 1.15 &&
        candidateCost.total <= baselineCost.total &&
        candidateCost.max <= baselineCost.max &&
        candidateCost.squared < bestCost.squared
      ) {
        best = candidate;
        bestCost = candidateCost;
      }
    }
  }
  const indices = new Map(best.order.map((id, index) => [id, index]));
  let budget = Math.min(200000, 2000 + best.order.length * 32);
  const incidentCost = (
    id: string,
    position: { x: number; y: number },
    swapped: string,
    otherPosition: { x: number; y: number }
  ) => {
    let total = 0,
      squared = 0,
      max = 0;
    for (const [other, weight] of neighbors.get(id) || []) {
      const target =
        other === swapped
          ? otherPosition
          : (best.positions.get(other) || fixedPositions?.get(other))!;
      const distance = Math.hypot(position.x - target.x, position.y - target.y);
      total += weight * distance;
      squared += weight * distance * distance;
      max = Math.max(max, distance);
    }
    return { total, squared, max };
  };
  for (let pass = 0; pass < 2 && budget > 0; pass++) {
    for (let rank = 0; rank < starts.length; rank++) {
      const id = starts[rank];
      if (budget <= 0) break;
      const candidates = new Set([best.order[Math.floor(best.order.length / 2)]]);
      if (rank < 16) {
        let tx = 0,
          ty = 0,
          weightSum = 0;
        for (const [other, weight] of neighbors.get(id) || []) {
          const target = (best.positions.get(other) || fixedPositions?.get(other))!;
          tx += target.x * weight;
          ty += target.y * weight;
          weightSum += weight;
        }
        if (weightSum) {
          tx /= weightSum;
          ty /= weightSum;
          let nearest = id,
            nearestDistance = Infinity;
          for (const other of best.order) {
            if (other === id || sizes.get(id) !== sizes.get(other)) continue;
            const position = best.positions.get(other)!;
            const distance = (position.x - tx) ** 2 + (position.y - ty) ** 2;
            if (distance < nearestDistance) {
              nearest = other;
              nearestDistance = distance;
            }
          }
          candidates.add(nearest);
        }
      }
      for (const other of (orderedNeighbors.get(id) || []).slice(0, 4)) {
        const index = indices.get(other);
        if (index === undefined) continue;
        for (const offset of [-1, 1])
          candidates.add(best.order[(index + offset + best.order.length) % best.order.length]);
      }
      for (const other of candidates) {
        if (id === other || sizes.get(id) !== sizes.get(other)) continue;
        budget -= (neighbors.get(id)?.size || 0) + (neighbors.get(other)?.size || 0) + 1;
        if (budget < 0) break;
        const a = best.positions.get(id)!,
          b = best.positions.get(other)!;
        const beforeA = incidentCost(id, a, other, b),
          beforeB = incidentCost(other, b, id, a);
        const afterA = incidentCost(id, b, other, a),
          afterB = incidentCost(other, a, id, b);
        if (
          afterA.squared + afterB.squared >= beforeA.squared + beforeB.squared - 1e-6 ||
          afterA.total + afterB.total > beforeA.total + beforeB.total + 1e-6 ||
          Math.max(afterA.max, afterB.max) > baselineCost.max + 1e-6
        )
          continue;
        best.positions.set(id, b);
        best.positions.set(other, a);
        const i = indices.get(id)!,
          j = indices.get(other)!;
        best.order[i] = other;
        best.order[j] = id;
        indices.set(id, j);
        indices.set(other, i);
      }
    }
  }
  return best;
};

const isExternalLinkInstance = (node: KnowledgeGraphNode): boolean =>
  node.instanceKind === 'EXTERNAL_LINK' || node.instanceKind === 'CONNECTED_EXTERNAL_LINK';

const nodeMinDistance = (node: KnowledgeGraphNode): number =>
  node.role === 'CLASS'
    ? DEFAULT_LAYOUT_CONFIG.minDistance.classNode
    : node.instanceKind === 'KEYWORD'
    ? DEFAULT_LAYOUT_CONFIG.minDistance.keyword
    : isExternalLinkInstance(node)
    ? DEFAULT_LAYOUT_CONFIG.minDistance.externalLink
    : DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode;

/** Position the class from its instances without pulling those instances toward the class. */
const centerExternalClass = (classNode: SimNode | null, linkNodes: SimNode[]): number => {
  if (!classNode || linkNodes.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const node of linkNodes) {
    x += node.x;
    y += node.y;
  }
  x /= linkNodes.length;
  y /= linkNodes.length;
  if (linkNodes.length === 1) {
    const hitRadius = (node: SimNode) => Math.max(node.radius + 8, 18);
    x += hitRadius(classNode) + hitRadius(linkNodes[0]) + 8;
  }
  const movement = Math.hypot(x - classNode.x, y - classNode.y);
  classNode.x = x;
  classNode.y = y;
  classNode.vx = 0;
  classNode.vy = 0;
  return movement;
};

/** Position the Note class at the centroid of its note instances, matching External Link class behavior. */
const centerNoteClass = (classNode: SimNode | null, noteNodes: SimNode[]): number => {
  if (!classNode || noteNodes.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const node of noteNodes) {
    x += node.x;
    y += node.y;
  }
  x /= noteNodes.length;
  y /= noteNodes.length;
  if (noteNodes.length === 1) {
    const hitRadius = (node: SimNode) => Math.max(node.radius + 8, 18);
    x += hitRadius(classNode) + hitRadius(noteNodes[0]) + 8;
  }
  const movement = Math.hypot(x - classNode.x, y - classNode.y);
  classNode.x = x;
  classNode.y = y;
  classNode.vx = 0;
  classNode.vy = 0;
  return movement;
};

/** Center derived nodes on distinct members, with templates preceding their groups. */
const centerDerivedNodes = (constraints: CentroidConstraint[]): number => {
  let maxMovement = 0;
  for (const { node, members } of constraints) {
    const x = members.reduce((sum, member) => sum + member.x, 0) / members.length;
    const y = members.reduce((sum, member) => sum + member.y, 0) / members.length;
    maxMovement = Math.max(maxMovement, Math.hypot(x - node.x, y - node.y));
    node.x = x;
    node.y = y;
    node.vx = 0;
    node.vy = 0;
  }
  return maxMovement;
};

/** Prefer the source-count centroid, then find nearby vacant space without pushing other nodes. */
const positionSourceNodes = (context: ForceSimulationContext): number => {
  // Resolve source links before their keywords in one pass. A future target's old
  // position must not displace its own source and make the pair chase each other.
  const constraints = [
    ...context.externalPositionConstraints,
    ...context.keywordPositionConstraints,
  ];
  if (!constraints.length) return 0;
  const targetIds = new Set(constraints.map(({ node }) => node.id));
  const scale = context.spacingScale * context.densityScale;
  const focusSpacing = DEFAULT_LAYOUT_CONFIG.physics.focusSpacingMultiplier;
  const sourceGap = (node: SimNode) =>
    nodeMinDistance(node) * scale * 1.04 * (context.focusedNodeIds.has(node.id) ? focusSpacing : 1);
  const cellSize =
    Math.max(...Object.values(DEFAULT_LAYOUT_CONFIG.minDistance)) *
    scale *
    1.04 *
    (context.focusedNodeIds.size ? focusSpacing : 1);
  let linkGap = 0,
    gridStep = 0;
  type Obstacle = { id: string; x: number; y: number; gap: number };
  const cells = new Map<number, Map<number, Obstacle[]>>();
  const sourceFamilies = context.sourceRootByNodeId;
  const nodeMap = new Map(context.simNodes.map((node) => [node.id, node]));
  type SourceBias = { x: number; y: number; minimum: number };
  let blockedRows: Map<number, [number, number][]> | undefined;
  /** Merge occupied grid intervals so every link can skip whole crowded regions. */
  const block = ({ x, y, gap }: Obstacle) => {
    const clearance = Math.max(linkGap, gap);
    for (
      let row = Math.ceil((y - clearance) / gridStep);
      row <= (y + clearance) / gridStep;
      row++
    ) {
      const dy = row * gridStep - y;
      const halfWidth = Math.sqrt(Math.max(0, clearance * clearance - dy * dy));
      let start = Math.ceil((x - halfWidth) / gridStep);
      let end = Math.floor((x + halfWidth) / gridStep);
      if (start > end) continue;
      let intervals = blockedRows!.get(row);
      if (!intervals) blockedRows!.set(row, (intervals = []));
      let low = 0,
        high = intervals.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (intervals[middle][1] < start - 1) low = middle + 1;
        else high = middle;
      }
      let until = low;
      while (until < intervals.length && intervals[until][0] <= end + 1) {
        start = Math.min(start, intervals[until][0]);
        end = Math.max(end, intervals[until++][1]);
      }
      intervals.splice(low, until - low, [start, end]);
    }
  };
  const reserve = (node: SimNode) => {
    const cx = Math.floor(node.x / cellSize);
    let column = cells.get(cx);
    if (!column) cells.set(cx, (column = new Map()));
    const obstacle = {
      id: node.id,
      x: node.x,
      y: node.y,
      gap: sourceGap(node),
    };
    const cy = Math.floor(node.y / cellSize);
    const obstacles = column.get(cy);
    if (obstacles) obstacles.push(obstacle);
    else column.set(cy, [obstacle]);
    if (blockedRows) block(obstacle);
  };
  for (let i = 0; i < context.simNodes.length; i++)
    if (!context.derivedCentroidFlags[i] && !targetIds.has(context.simNodes[i].id))
      reserve(context.simNodes[i]);
  // Retain warm slots until their owners move. A repaired early node must not steal
  // a later node's slot and displace an entire dense collection in a chain reaction.
  for (const { node, lastTarget, reservedRootId } of constraints)
    if (lastTarget || reservedRootId) reserve(node);
  const free = (x: number, y: number, id: string, warm: boolean) => {
    const cx = Math.floor(x / cellSize),
      cy = Math.floor(y / cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      const column = cells.get(cx + dx);
      if (!column) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (const other of column.get(cy + dy) || []) {
          if (other.id === id) continue;
          const gap = Math.max(linkGap, other.gap) / (warm ? 1.04 : 1);
          // Reusing a grid position can differ by a few ulps after centroid translation.
          if ((x - other.x) ** 2 + (y - other.y) ** 2 < gap * gap * (1 - 1e-12)) return false;
        }
    }
    return true;
  };
  const vacancy = (x: number, y: number, biases: SourceBias[]) => {
    if (!blockedRows) {
      blockedRows = new Map();
      for (const column of cells.values())
        for (const obstacles of column.values()) for (const obstacle of obstacles) block(obstacle);
    }
    const firstRow = Math.round(y / gridStep),
      firstColumn = Math.round(x / gridStep);
    // Several bisectors can enclose an area too small for all shared links. Once every
    // occupied row has been searched, let the caller retain the single source-bias direction.
    const rowLimit =
      biases.length > 1
        ? Math.max(0, ...[...blockedRows.keys()].map((row) => Math.abs(row - firstRow))) + 2
        : Infinity;
    const directionX = biases[0]?.x ?? 1,
      directionY = biases[0]?.y ?? 0;
    let bestRing = Infinity,
      bestAlignment = -Infinity,
      placedX = x,
      placedY = y;
    const candidate = (column: number, row: number) => {
      const px = column * gridStep,
        py = row * gridStep;
      const dx = px - x,
        dy = py - y;
      const distance = Math.hypot(dx, dy);
      const ring = Math.ceil(distance / gridStep);
      const alignment = (dx * directionX + dy * directionY) / (distance || 1);
      if (ring < bestRing || (ring === bestRing && alignment > bestAlignment)) {
        bestRing = ring;
        bestAlignment = alignment;
        placedX = px;
        placedY = py;
      }
    };
    for (let offset = 0; offset - 0.5 <= bestRing && offset <= rowLimit; offset++) {
      for (const row of offset ? [firstRow + offset, firstRow - offset] : [firstRow]) {
        if (Math.abs(row * gridStep - y) > bestRing * gridStep) continue;
        let minColumn = -Infinity,
          maxColumn = Infinity;
        for (const bias of biases) {
          const remaining = bias.minimum - bias.y * row * gridStep;
          if (Math.abs(bias.x) < 1e-9) {
            if (remaining > 1e-7) minColumn = Infinity;
          } else if (bias.x > 0)
            minColumn = Math.max(minColumn, Math.ceil(remaining / bias.x / gridStep));
          else maxColumn = Math.min(maxColumn, Math.floor(remaining / bias.x / gridStep));
        }
        if (minColumn > maxColumn || minColumn === Infinity) continue;
        const column = Math.max(minColumn, Math.min(maxColumn, firstColumn));
        const intervals = blockedRows.get(row) || [];
        let low = 0,
          high = intervals.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (intervals[middle][1] < column) low = middle + 1;
          else high = middle;
        }
        const interval = intervals[low];
        if (interval && interval[0] <= column) {
          if (interval[0] - 1 >= minColumn) candidate(interval[0] - 1, row);
          if (interval[1] + 1 <= maxColumn) candidate(interval[1] + 1, row);
        } else candidate(column, row);
      }
    }
    return Number.isFinite(bestRing) ? { x: placedX, y: placedY } : undefined;
  };
  let movement = 0;
  for (const constraint of constraints) {
    const { node, positions, lastTarget } = constraint;
    const gap = sourceGap(node);
    if (gap !== linkGap) {
      linkGap = gap;
      gridStep = gap / 2;
      blockedRows = undefined;
    }
    const groups = new Map<string, { x: number; y: number; count: number; root: SimNode }>();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const { origin } of positions) {
      const family = sourceFamilies.get(origin.id) || origin.id;
      let group = groups.get(family);
      if (!group)
        groups.set(family, (group = { x: 0, y: 0, count: 0, root: nodeMap.get(family)! }));
      group.x += origin.x;
      group.y += origin.y;
      group.count++;
      minX = Math.min(minX, origin.x);
      maxX = Math.max(maxX, origin.x);
      minY = Math.min(minY, origin.y);
      maxY = Math.max(maxY, origin.y);
    }
    const families = [...groups.values()].sort((a, b) => b.count - a.count);
    // Count every source once when several families share a keyword without a majority.
    // A majority keeps a visible source-count preference instead of drifting toward sparse families.
    // Counts are deduplicated when constraints are collected; duplicate edges add no weight.
    const majority =
      families.length === 1 ||
      (families[0].count > families[1].count && families[0].count * 2 >= positions.length);
    const weight = families.reduce(
      (sum, group) => sum + (majority ? group.count ** 2 : group.count),
      0
    );
    const sourceX =
      families.reduce((sum, group) => sum + group.x * (majority ? group.count : 1), 0) / weight;
    const sourceY =
      families.reduce((sum, group) => sum + group.y * (majority ? group.count : 1), 0) / weight;
    const x = sourceX + positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
    const y = sourceY + positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
    const unequalFamilies = families.some((g) => g.count !== families[0].count);
    const neutralX = unequalFamilies
      ? families.reduce((sum, g) => sum + g.x / g.count, 0) / families.length
      : (minX + maxX) / 2;
    const neutralY = unequalFamilies
      ? families.reduce((sum, g) => sum + g.y / g.count, 0) / families.length
      : (minY + maxY) / 2;
    const biasLength = Math.hypot(sourceX - neutralX, sourceY - neutralY);
    // Vacancies may add clearance, but cannot erase the source-count displacement.
    const bias: SourceBias | undefined =
      (majority || !unequalFamilies) && biasLength > gridStep * 0.05
        ? {
            x: (sourceX - neutralX) / biasLength,
            y: (sourceY - neutralY) / biasLength,
            minimum: (sourceX * (sourceX - neutralX) + sourceY * (sourceY - neutralY)) / biasLength,
          }
        : undefined;
    const biases = bias ? [bias] : [];
    if (families.length > 1 && majority) {
      const dominant = families[0];
      const dominantX = dominant.x / dominant.count,
        dominantY = dominant.y / dominant.count;
      // With three or more families, one global direction can still favor a minority family.
      // Reserved slots already follow their source branch; retain its side without ejecting
      // the target to satisfy an additional count-weighted translation.
      biases.length = 0;
      for (const other of families.slice(1)) {
        const otherX = other.x / other.count,
          otherY = other.y / other.count;
        const length = Math.hypot(dominantX - otherX, dominantY - otherY);
        if (length < 1e-7) continue;
        const x = (dominantX - otherX) / length,
          y = (dominantY - otherY) / length;
        const share = constraint.reservedRootId
          ? 0.5
          : dominant.count / (dominant.count + other.count);
        biases.push({
          x,
          y,
          minimum:
            (otherX + (dominantX - otherX) * share) * x +
            (otherY + (dominantY - otherY) * share) * y,
        });
      }
    }
    const visibleBiases = constraint.reservedRootId && families.length === 1 ? [] : [...biases];
    if (families.length > 1 && majority) {
      const dominant = families[0].root;
      for (const { root: other } of families.slice(1)) {
        const length = Math.hypot(dominant.x - other.x, dominant.y - other.y);
        if (length < 1e-7) continue;
        const x = (dominant.x - other.x) / length,
          y = (dominant.y - other.y) / length;
        visibleBiases.push({
          x,
          y,
          minimum:
            ((dominant.x + other.x) * x + (dominant.y + other.y) * y) / 2 +
            Math.min(linkGap / 2, length * 0.05),
        });
      }
    }
    const retainsBias = (px: number, py: number) =>
      visibleBiases.every(
        (bias) => px * bias.x + py * bias.y >= bias.minimum - (lastTarget ? linkGap / 2 : 1e-7)
      );
    let placedX = lastTarget ? node.x + x - lastTarget.x : constraint.reservedRootId ? node.x : x;
    let placedY = lastTarget ? node.y + y - lastTarget.y : constraint.reservedRootId ? node.y : y;
    if (!retainsBias(placedX, placedY) || !free(placedX, placedY, node.id, Boolean(lastTarget))) {
      // Repair near the translated slot. Returning to the source centroid can flip
      // a settled node to the opposite edge of a dense family after a tiny collision.
      const point =
        vacancy(placedX, placedY, visibleBiases) ||
        vacancy(placedX, placedY, constraint.reservedRootId ? [] : biases) ||
        vacancy(placedX, placedY, bias ? [bias] : [])!;
      placedX = point.x;
      placedY = point.y;
    }
    if (!lastTarget && constraint.reservedRootId) {
      const point =
        retainsBias(x, y) && free(x, y, node.id, false) ? { x, y } : vacancy(x, y, visibleBiases);
      if (point && Math.hypot(point.x - x, point.y - y) < Math.hypot(placedX - x, placedY - y)) {
        placedX = point.x;
        placedY = point.y;
      }
    }
    constraint.lastTarget = { x, y };
    movement = Math.max(movement, Math.hypot(node.x - placedX, node.y - placedY));
    node.x = placedX;
    node.y = placedY;
    node.vx = 0;
    node.vy = 0;
    reserve(node);
  }
  return movement;
};

/** ADR-2602: Place note branches by their top-level note and board branches by their Board class. */
export const buildClassRootDistanceIndex = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[]
): ClassRootDistanceIndex => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const noteClassIds = new Set(
    nodes
      .filter((node) => node.role === 'CLASS' && node.classKind === 'NOTE')
      .map((node) => node.id)
  );
  const noteMemberIds = new Set(
    edges
      .filter(
        (edge) =>
          edge.type === 'INSTANCE_OF' &&
          noteClassIds.has(edge.target) &&
          nodeById.get(edge.source)?.role === 'INSTANCE'
      )
      .map((edge) => edge.source)
  );
  const nestedNoteIds = new Set(
    edges
      .filter(
        (edge) =>
          edge.type === 'PART_OF' &&
          noteMemberIds.has(edge.source) &&
          (noteMemberIds.has(edge.target) || nodeById.get(edge.target)?.instanceKind === 'NOTE')
      )
      .map((edge) => edge.source)
  );
  const rootIds = [
    ...[...noteMemberIds].filter((id) => !nestedNoteIds.has(id)).sort(),
    ...nodes
      .filter((node) => node.role === 'CLASS' && node.classKind === 'BOARD_CARD')
      .map((node) => node.id)
      .sort(),
  ];
  const rootOrder = new Map(rootIds.map((rootId, index) => [rootId, index]));
  if (rootIds.length === 0) {
    return { rootIds, rootByNodeId: new Map(), hopByNodeId: new Map() };
  }
  const classNodeIds = new Set(
    nodes.filter((node) => node.role === 'CLASS').map((node) => node.id)
  );
  const children = new Map<string, string[]>();
  const fallbackNeighbors = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    if (edge.type === 'INSTANCE_OF' || edge.type === 'PART_OF') {
      append(children, edge.target, edge.source);
    }
    if (edge.type !== 'DERIVED_FROM') {
      append(fallbackNeighbors, edge.source, edge.target);
      append(fallbackNeighbors, edge.target, edge.source);
    }
  }

  const rootByNodeId = new Map<string, string>();
  const hopByNodeId = new Map<string, number>();
  const queue = [...rootIds];
  for (const rootId of rootIds) {
    rootByNodeId.set(rootId, rootId);
    hopByNodeId.set(rootId, 0);
  }
  for (let index = 0; index < queue.length; index++) {
    const nodeId = queue[index];
    const rootId = rootByNodeId.get(nodeId)!;
    const nextHop = hopByNodeId.get(nodeId)! + 1;
    for (const childId of children.get(nodeId) || []) {
      if (hopByNodeId.has(childId)) continue;
      hopByNodeId.set(childId, nextHop);
      rootByNodeId.set(childId, rootId);
      queue.push(childId);
    }
  }

  // Links cited by several classes belong to the best-supported class. Spread exact
  // ties across those classes instead of assigning every link to the first root.
  const externalLinkIds = nodes
    .filter(
      (node) =>
        node.instanceKind === 'EXTERNAL_LINK' || node.instanceKind === 'CONNECTED_EXTERNAL_LINK'
    )
    .map((node) => node.id)
    .sort();
  const externalSources = new Map<string, string[]>();
  for (const edge of edges) {
    if (
      edge.type === 'EXTERNAL_REFERENCE' &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target)
    ) {
      append(externalSources, edge.target, edge.source);
    }
  }
  const externalRootLoads = new Map<string, number>();
  const externalFamilyLoads = new Map<string, number>();
  const rootFamily = (rootId: string) => (noteMemberIds.has(rootId) ? 'note' : rootId);
  for (const linkId of externalLinkIds) {
    if (hopByNodeId.has(linkId)) continue;
    const support = new Map<string, { count: number; sourceHop: number }>();
    for (const sourceId of externalSources.get(linkId) || []) {
      const rootId = rootByNodeId.get(sourceId);
      if (!rootId) continue;
      const sourceHop = hopByNodeId.get(sourceId)!;
      const previous = support.get(rootId);
      support.set(rootId, {
        count: (previous?.count || 0) + 1,
        sourceHop: Math.min(previous?.sourceHop ?? Infinity, sourceHop),
      });
    }
    const familySupport = new Map<string, number>();
    for (const [rootId, value] of support) {
      const family = rootFamily(rootId);
      familySupport.set(family, (familySupport.get(family) || 0) + value.count);
    }
    const [rootId, best] = [...support].sort(
      ([leftId, left], [rightId, right]) =>
        (familySupport.get(rootFamily(rightId)) || 0) -
          (familySupport.get(rootFamily(leftId)) || 0) ||
        (externalFamilyLoads.get(rootFamily(leftId)) || 0) -
          (externalFamilyLoads.get(rootFamily(rightId)) || 0) ||
        left.sourceHop - right.sourceHop ||
        (externalRootLoads.get(leftId) || 0) - (externalRootLoads.get(rightId) || 0) ||
        rootOrder.get(leftId)! - rootOrder.get(rightId)!
    )[0] || [undefined, undefined];
    if (!rootId || !best) continue;
    rootByNodeId.set(linkId, rootId);
    hopByNodeId.set(linkId, best.sourceHop + 1);
    externalRootLoads.set(rootId, (externalRootLoads.get(rootId) || 0) + 1);
    const family = rootFamily(rootId);
    externalFamilyLoads.set(family, (externalFamilyLoads.get(family) || 0) + 1);
    queue.push(linkId);
  }

  // References only place nodes without a membership or containment path.
  for (let index = 0; index < queue.length; index++) {
    const nodeId = queue[index];
    const rootId = rootByNodeId.get(nodeId)!;
    const nextHop = hopByNodeId.get(nodeId)! + 1;
    for (const neighborId of fallbackNeighbors.get(nodeId) || []) {
      if (hopByNodeId.has(neighborId)) continue;
      if (classNodeIds.has(neighborId)) continue;
      hopByNodeId.set(neighborId, nextHop);
      rootByNodeId.set(neighborId, rootId);
      queue.push(neighborId);
    }
  }
  return { rootIds, rootByNodeId, hopByNodeId };
};

/**
 * 물리 시뮬레이션 상태 컨텍스트 초기화
 */
export const initForceSimulation = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  options: ForceSimulationOptions
): ForceSimulationContext => {
  const {
    width,
    height,
    spacingScale = 1.0,
    centerOrigin = false,
    selectedNodeId,
    focusDepth,
    focusedNodeIds,
    rootAnchorPositions,
    previousContext,
    balanceRootAreas = false,
  } = options;
  const nodeCount = nodes.length;
  const initialDensityScale = Math.sqrt(DEFAULT_LAYOUT_CONFIG.canvas.initialAreaMultiplier);
  const seedScale = spacingScale * initialDensityScale;

  const existingPosMap = new Map<string, { x: number; y: number }>();
  const previousNodes = new Map((previousContext?.simNodes || []).map((node) => [node.id, node]));
  nodes.forEach((node) => {
    // The central family may legitimately occupy (0, 0) in an established layout.
    const position = node.x !== 0 || node.y !== 0 ? node : previousNodes.get(node.id);
    if (position) {
      existingPosMap.set(node.id, { x: position.x, y: position.y });
    }
  });
  const warmNodeIds = new Set(existingPosMap.keys());

  const neighborMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    append(neighborMap, edge.source, edge.target);
    append(neighborMap, edge.target, edge.source);
  });

  const goldenAngle = GOLDEN_ANGLE;

  const classRootDistances = buildClassRootDistanceIndex(nodes, edges);
  const inputNodeById = new Map(nodes.map((node) => [node.id, node]));
  const placementEdges = edges
    .filter(
      (edge) =>
        (edge.type === 'REFERENCES' ||
          edge.type === 'EXTERNAL_REFERENCE' ||
          edge.type === 'KEYWORD_SOURCE') &&
        inputNodeById.has(edge.source) &&
        inputNodeById.has(edge.target)
    )
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.target.localeCompare(b.target) ||
        a.type.localeCompare(b.type)
    );
  const placementNeighbors = new Map<string, Map<string, number>>();
  const placementSignature = JSON.stringify(
    placementEdges.map(({ source, target, type }) => JSON.stringify([source, target, type])).sort()
  );
  const placementChanged = Boolean(
    previousContext && previousContext.placementSignature !== placementSignature
  );
  for (const edge of placementEdges) {
    for (const [id, other] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      const adjacent = placementNeighbors.get(id) || new Map<string, number>();
      adjacent.set(other, (adjacent.get(other) || 0) + 1);
      placementNeighbors.set(id, adjacent);
    }
  }
  const keywordSources = new Map<string, Set<string>>();
  const externalSources = new Map<string, Set<string>>();
  const externalTargets = new Map<string, string[]>();
  for (const edge of placementEdges) {
    if (
      edge.type === 'EXTERNAL_REFERENCE' &&
      isExternalLinkInstance(inputNodeById.get(edge.target)!)
    ) {
      const sources = externalSources.get(edge.target) || new Set<string>();
      if (!sources.has(edge.source)) append(externalTargets, edge.source, edge.target);
      sources.add(edge.source);
      externalSources.set(edge.target, sources);
    }
    if (
      edge.type !== 'KEYWORD_SOURCE' ||
      inputNodeById.get(edge.source)?.instanceKind !== 'KEYWORD'
    )
      continue;
    const sources = keywordSources.get(edge.source) || new Set<string>();
    sources.add(edge.target);
    keywordSources.set(edge.source, sources);
  }
  for (const targets of externalTargets.values()) targets.sort();
  const sharedExternalIds = new Set(
    [...externalSources].filter(([, sources]) => sources.size > 1).map(([id]) => id)
  );
  const noteRootIds = classRootDistances.rootIds.filter(
    (rootId) => inputNodeById.get(rootId)?.role === 'INSTANCE'
  );
  const boardRootIds = classRootDistances.rootIds.filter(
    (rootId) => inputNodeById.get(rootId)?.classKind === 'BOARD_CARD'
  );
  const noteClass = nodes.find((node) => node.role === 'CLASS' && node.classKind === 'NOTE');
  const boardRootIndex = new Map(boardRootIds.map((rootId, index) => [rootId, index]));
  const externalClass = nodes.find(
    (node) => node.role === 'CLASS' && node.classKind === 'EXTERNAL_LINK'
  );

  const templateMembers = new Map<KnowledgeGraphNode, Set<KnowledgeGraphNode>>();
  const groupMembers = new Map<KnowledgeGraphNode, Set<KnowledgeGraphNode>>();
  const keywordTypeMembers = new Map<KnowledgeGraphNode, Set<KnowledgeGraphNode>>();
  for (const edge of edges) {
    const source = inputNodeById.get(edge.source);
    const target = inputNodeById.get(edge.target);
    if (!source || !target) continue;
    if (
      edge.type === 'INSTANCE_OF' &&
      source.instanceKind === 'KEYWORD' &&
      target.classKind === 'KEYWORD_TYPE'
    ) {
      if (!keywordTypeMembers.has(target)) keywordTypeMembers.set(target, new Set());
      keywordTypeMembers.get(target)!.add(source);
      continue;
    }
    if (source.instanceKind !== 'TEMPLATE') continue;
    const members =
      edge.type === 'DERIVED_FROM'
        ? templateMembers
        : edge.type === 'INSTANCE_OF' && target.classKind === 'TEMPLATE_GROUP'
        ? groupMembers
        : undefined;
    if (!members) continue;
    const node = members === templateMembers ? source : target;
    const member = members === templateMembers ? target : source;
    if (!members.has(node)) members.set(node, new Set());
    members.get(node)!.add(member);
  }
  const derivedMemberNodes = [...templateMembers, ...groupMembers, ...keywordTypeMembers];
  const centeredNodeIds = new Set(
    nodes
      .filter(
        (node) =>
          node.instanceKind === 'TEMPLATE' ||
          node.classKind === 'TEMPLATE_GROUP' ||
          node.classKind === 'KEYWORD_TYPE'
      )
      .map((node) => node.id)
  );
  if (externalClass) centeredNodeIds.add(externalClass.id);
  if (noteClass) centeredNodeIds.add(noteClass.id);

  const layoutNodeCount = nodeCount - centeredNodeIds.size;
  const layoutSpan = Math.max(
    DEFAULT_LAYOUT_CONFIG.canvas.minLayoutSpan,
    Math.sqrt(Math.max(1, layoutNodeCount)) *
      DEFAULT_LAYOUT_CONFIG.canvas.nodeSpanMultiplier *
      Math.max(0.7, spacingScale)
  );
  const fieldWidth = Math.max(width * 1.8, layoutSpan) * initialDensityScale;
  const fieldHeight = Math.max(height * 1.8, layoutSpan) * initialDensityScale;
  const cx = previousContext?.cx ?? (centerOrigin ? 0 : fieldWidth / 2);
  const cy = previousContext?.cy ?? (centerOrigin ? 0 : fieldHeight / 2);
  const initialRadius = Math.min(fieldWidth, fieldHeight) * 0.38;

  const rootPopulations = new Map<string, number>();
  const rootAreaUnits = new Map<string, number>();
  for (const node of nodes) {
    if (
      centeredNodeIds.has(node.id) ||
      keywordSources.has(node.id) ||
      sharedExternalIds.has(node.id)
    )
      continue;
    let rootId = classRootDistances.rootByNodeId.get(node.id);
    if (!rootId) {
      for (const id of neighborMap.get(node.id) || []) {
        rootId = classRootDistances.rootByNodeId.get(id);
        if (rootId) break;
      }
    }
    if (rootId) {
      rootPopulations.set(rootId, (rootPopulations.get(rootId) || 0) + 1);
      rootAreaUnits.set(
        rootId,
        (rootAreaUnits.get(rootId) || 0) +
          (nodeMinDistance(node) / DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode) ** 2
      );
    }
  }
  const nodesByRootRing = new Map<string, KnowledgeGraphNode[]>();
  const rootSeedRadii = new Map<string, number>();
  const containmentNodeIds = new Set<string>();
  const fixedNeighborIds = new Map<string, Set<string>>();
  const fixedGroups = new Map<string, Map<FixedRelationKind, Set<string>>>();
  for (const edge of edges) {
    const source = inputNodeById.get(edge.source);
    const kind = source && getHierarchyKind(edge, source);
    if (!source || !inputNodeById.has(edge.target) || edge.source === edge.target || !kind)
      continue;
    const groups = fixedGroups.get(edge.target) || new Map();
    const children = groups.get(kind) || new Set<string>();
    children.add(edge.source);
    groups.set(kind, children);
    fixedGroups.set(edge.target, groups);
    containmentNodeIds.add(edge.source);
    containmentNodeIds.add(edge.target);
    for (const [id, neighbor] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      const adjacent = fixedNeighborIds.get(id) || new Set<string>();
      adjacent.add(neighbor);
      fixedNeighborIds.set(id, adjacent);
    }
  }
  const fixedGap = DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode * initialDensityScale * 1.1;
  const hierarchyLengths: FixedRelationLengths = new Map();
  for (const [parent, groups] of fixedGroups) {
    const lengths: Partial<Record<FixedRelationKind, Map<string, number>>> = {};
    const children = [...new Set([...groups.values()].flatMap((ids) => [...ids]))].sort();
    let radius = Math.max(
      ...[...groups.keys()].map((kind) =>
        kind === 'notePartOf'
          ? DEFAULT_LAYOUT_CONFIG.edgeLength.noteContainment
          : DEFAULT_LAYOUT_CONFIG.edgeLength.paragraphContainment
      )
    );
    // Small sibling groups share one ring instead of sending a single child to a distant ring.
    if (children.length >= 3)
      radius = Math.max(radius, fixedGap / (2 * Math.sin(Math.PI / Math.min(4, children.length))));
    // Parallel relations reuse a position; crowded groups expand along two opposite arms.
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      const length = densityRadius(children.length, index, radius, fixedGap);
      for (const [kind, members] of groups) {
        if (!members.has(child)) continue;
        const group = lengths[kind] || new Map<string, number>();
        group.set(child, length);
        lengths[kind] = group;
      }
    }
    hierarchyLengths.set(parent, lengths);
  }
  const ringRadius = (hop: number) =>
    hop > 0
      ? (DEFAULT_LAYOUT_CONFIG.physics.rootFirstRingRadius +
          (hop - 1) * DEFAULT_LAYOUT_CONFIG.physics.rootRingStep) *
        seedScale
      : 0;
  for (const node of nodes) {
    const rootId = classRootDistances.rootByNodeId.get(node.id);
    const hop = classRootDistances.hopByNodeId.get(node.id);
    if (
      !rootId ||
      !hop ||
      centeredNodeIds.has(node.id) ||
      keywordSources.has(node.id) ||
      externalSources.has(node.id)
    )
      continue;
    const key = JSON.stringify([rootId, hop]);
    append(nodesByRootRing, key, node);
  }
  const rootExtents = new Map<string, number>();
  const localPlans = new Map<string, { root: string; x: number; y: number }>();
  const branchNodeIds = new Set<string>();
  const externalPlans = new Map<string, { origin: string; x: number; y: number }[]>();
  const branchIds = new Set([...nodesByRootRing.values()].flat().map((node) => node.id));
  for (const id of externalSources.keys())
    if (!sharedExternalIds.has(id) && classRootDistances.rootByNodeId.has(id)) branchIds.add(id);
  const parents = new Map<string, string>();
  for (const edge of edges) {
    const child = edge.type === 'EXTERNAL_REFERENCE' ? edge.target : edge.source;
    const parent = edge.type === 'EXTERNAL_REFERENCE' ? edge.source : edge.target;
    if (
      !['PART_OF', 'INSTANCE_OF', 'EXTERNAL_REFERENCE'].includes(edge.type) ||
      !branchIds.has(child)
    )
      continue;
    const root = classRootDistances.rootByNodeId.get(child)!;
    if (
      classRootDistances.rootByNodeId.get(parent) !== root ||
      (classRootDistances.hopByNodeId.get(parent) ?? Infinity) >=
        classRootDistances.hopByNodeId.get(child)! ||
      (parent !== root && !branchIds.has(parent))
    )
      continue;
    const previous = parents.get(child);
    if (
      !previous ||
      classRootDistances.hopByNodeId.get(parent)! > classRootDistances.hopByNodeId.get(previous)! ||
      (classRootDistances.hopByNodeId.get(parent) ===
        classRootDistances.hopByNodeId.get(previous) &&
        parent.localeCompare(previous) < 0)
    )
      parents.set(child, parent);
  }
  const sourceSlots = new Map<string, string>();
  const sourcePriority = new Map<string, number>();
  // Reserve shared targets before physical descendants fill every inner lane.
  // A source's nearest common ancestor keeps large fans near their whole source branch.
  const reserveSource = (id: string, sources: Set<string>) => {
    if (!balanceRootAreas || sources.size < 2) return;
    const support = new Map<string, string[]>();
    for (const source of [...sources].sort()) {
      const root = classRootDistances.rootByNodeId.get(source);
      if (root) append(support, root, source);
    }
    const ranked = [...support].sort(
      ([a, left], [b, right]) => right.length - left.length || a.localeCompare(b)
    );
    const [root, members] = ranked[0] || [];
    if (
      !root ||
      ![...support.keys()].some(
        (root) => (rootPopulations.get(root) || 0) >= SOURCE_RESERVATION_MIN_POPULATION
      )
    )
      return;
    if (
      ranked.length > 1 &&
      (members.length <= ranked[1][1].length || members.length * 2 < sources.size)
    ) {
      return;
    }
    const ancestors = (source: string) => {
      if (!branchIds.has(source)) source = root;
      const chain = [source],
        visited = new Set(chain);
      while (source !== root) {
        source = parents.get(source) || root;
        if (visited.has(source)) break;
        chain.push(source);
        visited.add(source);
      }
      return chain;
    };
    let common = ancestors(members[0]);
    for (const source of members.slice(1)) {
      const chain = new Set(ancestors(source));
      common = common.filter((id) => chain.has(id));
    }
    let parent = common[0] || root;
    const anchors = members.filter((source) => source === root || branchIds.has(source));
    // Small fans spanning branches need a local source slot, rather than all claiming the root.
    if (
      sources.size < 16 &&
      anchors.length &&
      members.some((source) => parents.get(source) !== parent && source !== parent)
    )
      parent = anchors
        .slice()
        .sort(
          (a, b) =>
            (classRootDistances.hopByNodeId.get(a) || 0) -
              (classRootDistances.hopByNodeId.get(b) || 0) || a.localeCompare(b)
        )[0];
    sourceSlots.set(id, root);
    sourcePriority.set(id, 1e9 + sources.size);
    parents.set(id, parent);
    branchIds.add(id);
    classRootDistances.rootByNodeId.set(id, root);
    classRootDistances.hopByNodeId.set(id, (classRootDistances.hopByNodeId.get(parent) || 0) + 1);
  };
  for (const [id, sources] of [...externalSources].sort(([a], [b]) => a.localeCompare(b)))
    reserveSource(id, sources);
  for (const [id, sources] of [...keywordSources].sort(([a], [b]) => a.localeCompare(b)))
    reserveSource(id, sources);
  const directSourcePriority = new Map<string, number>();
  for (const sources of [...externalSources.values(), ...keywordSources.values()]) {
    if (sources.size < 2) continue;
    const priority = Math.sqrt(sources.size);
    for (const source of sources) {
      const root = classRootDistances.rootByNodeId.get(source);
      if (
        !balanceRootAreas ||
        !root ||
        (rootPopulations.get(root) || 0) < SOURCE_RESERVATION_MIN_POPULATION
      )
        continue;
      directSourcePriority.set(source, (directSourcePriority.get(source) || 0) + priority);
    }
  }
  for (const [source, priority] of directSourcePriority) {
    const visited = new Set<string>();
    let id = source;
    while (!visited.has(id)) {
      visited.add(id);
      if (!sourceSlots.has(id))
        sourcePriority.set(id, Math.max(sourcePriority.get(id) || 0, priority));
      const parent = parents.get(id);
      if (!parent) break;
      id = parent;
    }
  }
  const branches = new Map<string, { id: string; parent: string; gap: number }[]>();
  for (const id of branchIds) {
    const root = classRootDistances.rootByNodeId.get(id)!;
    append(branches, root, {
      id,
      parent: parents.get(id) || root,
      gap: nodeMinDistance(inputNodeById.get(id)!) * seedScale * 1.1,
    });
  }
  for (const [root, members] of branches) {
    const positions = hierarchyBranchPositions(
      members,
      root,
      nodeMinDistance(inputNodeById.get(root)!) * seedScale * 1.1,
      ringRadius(1),
      goldenAngle + (boardRootIndex.get(root) || 0) * goldenAngle,
      sourcePriority
    );
    let extent = 0;
    for (const [id, point] of positions) {
      localPlans.set(id, { root, ...point });
      branchNodeIds.add(id);
      extent = Math.max(extent, Math.hypot(point.x, point.y));
    }
    rootExtents.set(root, extent);
  }
  for (const [id, sources] of externalSources) {
    if (sharedExternalIds.has(id)) continue;
    const plan = localPlans.get(id);
    if (plan) externalPlans.set(id, [{ origin: plan.root, x: plan.x, y: plan.y }]);
    else
      externalPlans.set(
        id,
        [...sources].map((origin) => ({ origin, x: ringRadius(1), y: 0 }))
      );
  }
  // Shared links occupy space around their actual sources, not a separate outer ring in every family.
  const sharedSourceGroups = new Map<string, string[]>();
  for (const id of sharedExternalIds)
    append(sharedSourceGroups, JSON.stringify([...externalSources.get(id)!].sort()), id);
  for (const [key, ids] of sharedSourceGroups) {
    ids.sort();
    const sources: string[] = JSON.parse(key);
    const gap = DEFAULT_LAYOUT_CONFIG.minDistance.externalLink * seedScale * 1.1;
    const points = mixedDensityPositions(
      ids.map(() => gap),
      ids.length === 1 ? 0 : gap
    );
    const offsets = points.map(({ radius, angle }) => ({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }));
    const center = {
      x: offsets.reduce((sum, p) => sum + p.x, 0) / ids.length,
      y: offsets.reduce((sum, p) => sum + p.y, 0) / ids.length,
    };
    ids.forEach((id, index) => {
      const offset = { x: offsets[index].x - center.x, y: offsets[index].y - center.y };
      externalPlans.set(
        id,
        sources.map((origin) => ({ origin, ...offset }))
      );
    });
  }
  const rootSizes = [...noteRootIds, ...boardRootIds].map((id) => ({
    id,
    // Reserve the occupied rings and local node spacing, without padding every family as a board.
    size: Math.max(
      ((Math.sqrt(rootAreaUnits.get(id) || 1) - 1) *
        DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode *
        1.1 +
        (inputNodeById.get(id)?.role === 'CLASS'
          ? DEFAULT_LAYOUT_CONFIG.minDistance.classNode
          : DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode) *
          1.4) *
        seedScale,
      (rootExtents.get(id) || 0) * 2 +
        DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode * seedScale * 1.1
    ),
  }));
  const rootFootprints = new Map(rootSizes.map(({ id, size }) => [id, size]));
  const rootAreasChanged = Boolean(
    previousContext &&
      (previousContext.rootFootprints.size !== rootFootprints.size ||
        [...rootFootprints].some(([id, size]) => previousContext.rootFootprints.get(id) !== size))
  );
  const pack = (order: string[], snake: boolean) =>
    packRootFamilies(order, rootFootprints, cx, cy, width / Math.max(1, height), snake);
  const defaultOrder = [...rootSizes]
    .sort((left, right) => right.size - left.size || left.id.localeCompare(right.id))
    .map(({ id }) => id);
  const retainedOrder =
    previousContext?.rootLayoutOrder.filter((id) => rootFootprints.has(id)) || [];
  const retainedIds = new Set(retainedOrder);
  let rootPlan = pack(
    [...retainedOrder, ...defaultOrder.filter((id) => !retainedIds.has(id))],
    previousContext?.rootLayoutSnake || false
  );
  if (
    (!previousContext && !classRootDistances.rootIds.some((id) => existingPosMap.has(id))) ||
    (balanceRootAreas && previousContext)
  ) {
    const referenceNeighbors = new Map<string, Map<string, number>>();
    const connectRoots = (source: string | undefined, target: string | undefined, weight = 1) => {
      if (
        !source ||
        !target ||
        source === target ||
        !rootFootprints.has(source) ||
        !rootFootprints.has(target)
      )
        return;
      for (const [id, other] of [
        [source, target],
        [target, source],
      ]) {
        const adjacent = referenceNeighbors.get(id) || new Map<string, number>();
        adjacent.set(other, (adjacent.get(other) || 0) + weight);
        referenceNeighbors.set(id, adjacent);
      }
    };
    const counted = new Set<string>();
    for (const edge of placementEdges) {
      if (edge.type !== 'REFERENCES') continue;
      const key = JSON.stringify([edge.source, edge.target]);
      if (counted.has(key)) continue;
      counted.add(key);
      const source = classRootDistances.rootByNodeId.get(edge.source);
      const target = classRootDistances.rootByNodeId.get(edge.target);
      connectRoots(source, target);
    }
    for (const sources of [...keywordSources.values(), ...externalSources.values()]) {
      const roots = [
        ...new Set(
          [...sources]
            .map((id) => classRootDistances.rootByNodeId.get(id))
            .filter((id): id is string => Boolean(id && rootFootprints.has(id)))
        ),
      ].sort();
      if (roots.length <= 32) {
        for (let i = 0; i < roots.length; i++)
          for (let j = i + 1; j < roots.length; j++) connectRoots(roots[i], roots[j]);
      } else {
        // Preserve every family's connection count without expanding a shared source into O(n²) pairs.
        roots.forEach((id, i) =>
          connectRoots(id, roots[(i + 1) % roots.length], (roots.length - 1) / 2)
        );
      }
    }
    rootPlan = optimizeReferencePlacement(rootPlan, rootFootprints, referenceNeighbors, pack);
    rootPlan = centerConnectedFamilies(rootPlan, rootFootprints, referenceNeighbors, cx, cy);
  }
  const rootLayoutPositions = rootPlan.positions;
  const previousAnchors =
    rootAnchorPositions ||
    new Map(
      (previousContext?.precomputedRootAnchors || []).map(({ root, x, y }) => [root.id, { x, y }])
    );
  const matchingRoots = [...rootLayoutPositions].flatMap(([id, planned]) => {
    const reference = previousAnchors.get(id) || existingPosMap.get(id);
    return reference ? [{ planned, reference }] : [];
  });
  if (matchingRoots.length) {
    const center = (key: 'planned' | 'reference') => ({
      x: matchingRoots.reduce((sum, item) => sum + item[key].x, 0) / matchingRoots.length,
      y: matchingRoots.reduce((sum, item) => sum + item[key].y, 0) / matchingRoots.length,
    });
    const plannedCenter = center('planned'),
      referenceCenter = center('reference');
    let dot = 0,
      cross = 0;
    for (const { planned, reference } of matchingRoots) {
      const px = planned.x - plannedCenter.x,
        py = planned.y - plannedCenter.y;
      const rx = reference.x - referenceCenter.x,
        ry = reference.y - referenceCenter.y;
      dot += px * rx + py * ry;
      cross += px * ry - py * rx;
    }
    const angle = Math.atan2(cross, dot),
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    for (const position of rootLayoutPositions.values()) {
      const x = position.x - plannedCenter.x,
        y = position.y - plannedCenter.y;
      position.x = referenceCenter.x + x * cos - y * sin;
      position.y = referenceCenter.y + x * sin + y * cos;
    }
  }
  const compactRadius = Math.sqrt(
    [...rootFootprints.values()].reduce((sum, size) => sum + size ** 2, 0) / Math.PI
  );
  const warmRoots = [...rootLayoutPositions.keys()].flatMap((id) => {
    const position = existingPosMap.get(id);
    return position ? [position] : [];
  });
  const rootCenter = {
    x: warmRoots.reduce((sum, p) => sum + p.x, 0) / Math.max(1, warmRoots.length),
    y: warmRoots.reduce((sum, p) => sum + p.y, 0) / Math.max(1, warmRoots.length),
  };
  const compactionNeeded = warmRoots.some(
    (root) => Math.hypot(root.x - rootCenter.x, root.y - rootCenter.y) > compactRadius * 3
  );
  const rebalance = balanceRootAreas && (rootAreasChanged || placementChanged || compactionNeeded);
  const rootShifts = new Map<string, { x: number; y: number }>();
  for (const [id, position] of rootLayoutPositions) {
    const previous = existingPosMap.get(id);
    if (rebalance && previous)
      rootShifts.set(id, { x: position.x - previous.x, y: position.y - previous.y });
    if (!previous || rebalance) existingPosMap.set(id, position);
  }
  if (rebalance)
    for (const node of nodes) {
      const position = existingPosMap.get(node.id);
      if (!position || rootLayoutPositions.has(node.id)) continue;
      const sources = keywordSources.get(node.id);
      const roots = sources
        ? [...sources].map((id) => classRootDistances.rootByNodeId.get(id))
        : [classRootDistances.rootByNodeId.get(node.id)];
      let x = 0,
        y = 0;
      for (const id of roots) {
        const shift = id && rootShifts.get(id);
        if (shift) {
          x += shift.x;
          y += shift.y;
        }
      }
      existingPosMap.set(node.id, {
        x: position.x + x / roots.length,
        y: position.y + y / roots.length,
      });
    }

  if (balanceRootAreas) {
    // Repair stale, remote keyword coordinates before drawing instead of accelerating them on screen.
    const reach = Math.max(
      8 * DEFAULT_LAYOUT_CONFIG.edgeLength.defaultEdge * seedScale,
      4 *
        Math.sqrt(keywordSources.size) *
        DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode *
        seedScale *
        1.1
    );
    for (const [id, sources] of keywordSources) {
      const position = existingPosMap.get(id);
      const points = [...sources].flatMap((source) => {
        const point = existingPosMap.get(source);
        return point ? [point] : [];
      });
      if (!position || !points.length) continue;
      const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      const spread = points.reduce((max, p) => Math.max(max, Math.hypot(p.x - x, p.y - y)), 0);
      if (Math.hypot(position.x - x, position.y - y) > reach + spread * 2) {
        existingPosMap.delete(id);
        warmNodeIds.delete(id);
      }
    }
  }
  const anchorGap = Math.max(...Object.values(DEFAULT_LAYOUT_CONFIG.minDistance)) * seedScale * 1.1;
  const seedCells = new Map<string, { x: number; y: number; gap: number }[]>();
  const cellKey = (x: number, y: number) => `${x}:${y}`;
  const reserveSeed = (node: KnowledgeGraphNode, position: { x: number; y: number }) => {
    const key = cellKey(Math.floor(position.x / anchorGap), Math.floor(position.y / anchorGap));
    append(seedCells, key, {
      ...position,
      gap: nodeMinDistance(node) * seedScale * 1.1,
    });
  };
  for (const node of nodes) {
    const position = existingPosMap.get(node.id);
    if (position && !centeredNodeIds.has(node.id) && !externalSources.has(node.id))
      reserveSeed(node, position);
  }
  const seedIsFree = (position: { x: number; y: number }, gap: number) => {
    const x = Math.floor(position.x / anchorGap),
      y = Math.floor(position.y / anchorGap);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const occupied of seedCells.get(cellKey(x + dx, y + dy)) || []) {
          if (
            Math.hypot(position.x - occupied.x, position.y - occupied.y) <
            Math.max(gap, occupied.gap)
          )
            return false;
        }
      }
    }
    return true;
  };

  for (const [id, plan] of localPlans) {
    const root = existingPosMap.get(plan.root)!;
    rootSeedRadii.set(id, Math.hypot(plan.x, plan.y));
    const reshape =
      balanceRootAreas &&
      previousContext &&
      previousContext.rootFootprints.get(plan.root) !== rootFootprints.get(plan.root);
    if (existingPosMap.has(id) && !reshape) continue;
    const position = { x: root.x + plan.x, y: root.y + plan.y };
    existingPosMap.set(id, position);
    reserveSeed(inputNodeById.get(id)!, position);
  }

  for (const [id, plans] of externalPlans) {
    if (sourceSlots.has(id)) continue;
    const positions = plans.flatMap(({ origin, x, y }) => {
      const anchor = existingPosMap.get(origin);
      return anchor ? [{ x: anchor.x + x, y: anchor.y + y }] : [];
    });
    if (!positions.length) continue;
    const position = {
      x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
      y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
    };
    if (!existingPosMap.has(id) || sharedExternalIds.has(id) || rebalance)
      existingPosMap.set(id, position);
    reserveSeed(inputNodeById.get(id)!, existingPosMap.get(id)!);
    const root = existingPosMap.get(classRootDistances.rootByNodeId.get(id)!);
    if (root) rootSeedRadii.set(id, Math.hypot(position.x - root.x, position.y - root.y));
  }

  const anchorNodes = nodes.filter(
    (node) => node.role === 'CLASS' && !existingPosMap.has(node.id) && !centeredNodeIds.has(node.id)
  );
  anchorNodes.forEach((node, index) => {
    const radius = Math.sqrt(index + 0.5) * anchorGap * 0.66;
    existingPosMap.set(node.id, {
      x: cx + Math.cos(index * goldenAngle) * radius,
      y: cy + Math.sin(index * goldenAngle) * radius,
    });
    reserveSeed(node, existingPosMap.get(node.id)!);
  });

  const memberGroups = new Map<string, KnowledgeGraphNode[]>();
  for (const node of nodes) {
    if (existingPosMap.has(node.id) || centeredNodeIds.has(node.id) || keywordSources.has(node.id))
      continue;
    const anchorId = (neighborMap.get(node.id) || []).find(
      (id) => existingPosMap.has(id) && !centeredNodeIds.has(id)
    );
    append(memberGroups, JSON.stringify([anchorId || '', isExternalLinkInstance(node)]), node);
  }
  for (const [key, members] of memberGroups) {
    const [anchorId]: [string, boolean] = JSON.parse(key);
    members.sort((left, right) => left.id.localeCompare(right.id));
    const anchor = existingPosMap.get(anchorId);
    const gap = nodeMinDistance(members[0]) * seedScale * 1.1;
    const baseRadius = anchorGap;
    const orderedMembers: KnowledgeGraphNode[] = [];
    if (!anchor) {
      // Keep neighboring unanchored nodes near one another instead of scattering their edges.
      const pending = new Map(members.map((node) => [node.id, node]));
      for (const start of members) {
        if (!pending.delete(start.id)) continue;
        const queue = [start];
        for (let i = 0; i < queue.length; i++) {
          const node = queue[i];
          orderedMembers.push(node);
          for (const id of neighborMap.get(node.id) || []) {
            const neighbor = pending.get(id);
            if (!neighbor) continue;
            pending.delete(id);
            queue.push(neighbor);
          }
        }
      }
    }
    const gridGap = Math.max(gap, initialRadius * Math.sqrt(Math.PI / members.length));
    let spiralIndex = 0;
    (anchor ? members : orderedMembers).forEach((node, index) => {
      const radius = densityRadius(members.length, index, baseRadius, gap);
      const angle = densityAngle(members.length, index, baseRadius, gap);
      const cell = squareSpiral(index + 1);
      let position = anchor
        ? {
            x: anchor.x + Math.cos(angle) * radius,
            y: anchor.y + Math.sin(angle) * radius,
          }
        : { x: cx + cell.x * gridGap, y: cy + cell.y * gridGap };
      // Reuse free space around warm nodes and adjacent families without moving existing nodes.
      while (!seedIsFree(position, gap)) {
        const radius = Math.sqrt(
          (anchor ? baseRadius * baseRadius : 0) + (spiralIndex + 0.5) * gap * gap * 0.4
        );
        const angle = spiralIndex++ * goldenAngle;
        position = {
          x: (anchor?.x ?? cx) + Math.cos(angle) * radius,
          y: (anchor?.y ?? cy) + Math.sin(angle) * radius,
        };
      }
      existingPosMap.set(node.id, position);
      reserveSeed(node, position);
    });
  }

  // A shared keyword belongs near all of its sources, independently of their traversal order.
  const sourceGroups = new Map<string, string[]>();
  for (const [id, sources] of [...keywordSources].sort(([a], [b]) => a.localeCompare(b)))
    append(sourceGroups, JSON.stringify([...sources].sort()), id);
  for (const members of sourceGroups.values()) {
    const sources = [...keywordSources.get(members[0])!]
      .map((id) => existingPosMap.get(id))
      .filter((position): position is { x: number; y: number } => Boolean(position));
    if (!sources.length) continue;
    const center = {
      x: sources.reduce((sum, p) => sum + p.x, 0) / sources.length,
      y: sources.reduce((sum, p) => sum + p.y, 0) / sources.length,
    };
    const gap = DEFAULT_LAYOUT_CONFIG.minDistance.keyword * seedScale * 1.1;
    const baseRadius = DEFAULT_LAYOUT_CONFIG.edgeLength.defaultEdge * seedScale;
    let cursor = 0;
    for (const id of members.sort()) {
      if (existingPosMap.has(id)) continue;
      let position: { x: number; y: number };
      do {
        const radius = densityRadius(members.length, cursor, baseRadius, gap);
        const angle = densityAngle(members.length, cursor++, baseRadius, gap);
        position = {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        };
        // Once a circular ring is occupied, continue into vacant outer space.
        if (cursor > members.length) {
          const radius = Math.sqrt(baseRadius * baseRadius + cursor * gap * gap * 0.4);
          position = {
            x: center.x + Math.cos(cursor * goldenAngle) * radius,
            y: center.y + Math.sin(cursor * goldenAngle) * radius,
          };
        }
      } while (!seedIsFree(position, gap));
      existingPosMap.set(id, position);
      reserveSeed(inputNodeById.get(id)!, position);
    }
  }

  const freePlacementGroups = new Map<string, KnowledgeGraphNode[]>();
  for (const node of nodes) {
    if (
      warmNodeIds.has(node.id) ||
      sourceSlots.has(node.id) ||
      containmentNodeIds.has(node.id) ||
      node.instanceKind !== 'KEYWORD'
    )
      continue;
    append(
      freePlacementGroups,
      `${classRootDistances.rootByNodeId.get(node.id) || ''}:${node.instanceKind}`,
      node
    );
  }
  for (const members of freePlacementGroups.values()) {
    if (members.length < 2) continue;
    const order = members.map((node) => node.id);
    const positions = new Map(order.map((id) => [id, existingPosMap.get(id)!]));
    const neighbors = new Map(
      order.flatMap((id) => {
        const adjacent = new Map(
          [...(placementNeighbors.get(id) || [])].filter(([other]) => existingPosMap.has(other))
        );
        return adjacent.size ? [[id, adjacent] as const] : [];
      })
    );
    if (!neighbors.size) continue;
    const slots = [...positions.values()];
    const plan = optimizeReferencePlacement(
      { positions, order, snake: false, area: 1 },
      new Map(order.map((id) => [id, 1])),
      neighbors,
      (nextOrder) => ({
        positions: new Map(nextOrder.map((id, index) => [id, slots[index]])),
        order: [...nextOrder],
        snake: false,
        area: 1,
      }),
      existingPosMap
    );
    for (const [id, position] of plan.positions) {
      existingPosMap.set(id, position);
      const root = existingPosMap.get(classRootDistances.rootByNodeId.get(id) || '');
      if (root) rootSeedRadii.set(id, Math.hypot(position.x - root.x, position.y - root.y));
    }
  }

  const simNodes: SimNode[] = nodes.map((node) => {
    const pos = existingPosMap.get(node.id) || { x: cx, y: cy };
    const result = Object.assign(
      {
        // Keep a stable property layout across all node kinds in simulation and rendering.
        id: node.id,
        name: node.name,
        role: node.role,
        instanceKind: node.instanceKind,
        classKind: node.classKind,
        classCategory: node.classCategory,
        boardTitle: node.boardTitle,
        noteTitle: node.noteTitle,
        paragraph: node.paragraph,
        paragraphOccurrences: node.paragraphOccurrences,
        description: node.description,
        properties: node.properties,
        x: node.x,
        y: node.y,
        vx: 0,
        vy: 0,
        radius: node.radius,
        color: node.color,
        strokeColor: node.strokeColor,
      },
      node
    );
    result.x = pos.x;
    result.y = pos.y;
    result.vx = 0;
    result.vy = 0;
    return result;
  });

  const nodeMap = new Map<string, SimNode>();
  simNodes.forEach((n) => nodeMap.set(n.id, n));
  // Parent-relative branches determine initial geometry; containment keeps those actual lengths.
  for (const [parent, groups] of fixedGroups) {
    const target = nodeMap.get(parent)!;
    for (const [kind, children] of groups) {
      for (const child of children) {
        if (!localPlans.has(child)) continue;
        const source = nodeMap.get(child)!;
        hierarchyLengths
          .get(parent)!
          [kind]!.set(child, Math.hypot(source.x - target.x, source.y - target.y) / spacingScale);
      }
    }
  }
  const previousExternalPositions = new Map(
    (previousContext?.externalPositionConstraints || []).map((constraint) => [
      constraint.node.id,
      constraint,
    ])
  );
  const externalPositionConstraints = [...sharedExternalIds].sort().flatMap((id) => {
    const positions = (externalPlans.get(id) || []).flatMap(({ origin, x, y }) => {
      const node = nodeMap.get(origin);
      return node ? [{ origin: node, x, y }] : [];
    });
    if (!positions.length) return [];
    const node = nodeMap.get(id)!;
    const previous = previousExternalPositions.get(id);
    const preserve =
      previous &&
      !rebalance &&
      previousContext?.spacingScale === spacingScale &&
      previous.positions.length === positions.length &&
      positions.every(
        (p, i) =>
          p.origin.id === previous.positions[i].origin.id &&
          p.x === previous.positions[i].x &&
          p.y === previous.positions[i].y
      );
    if (preserve) {
      node.x = previous.node.x;
      node.y = previous.node.y;
    }
    return [
      {
        node,
        positions,
        lastTarget: preserve ? previous.lastTarget : undefined,
        reservedRootId: sourceSlots.get(id),
      },
    ];
  });
  const previousKeywords = new Map(
    (previousContext?.keywordPositionConstraints || []).map((constraint) => [
      constraint.node.id,
      constraint,
    ])
  );
  const keywordPositionConstraints = [...sourceGroups.values()]
    .flatMap((ids) => {
      const members = ids.map((id) => nodeMap.get(id)!);
      const center = {
        x: members.reduce((sum, node) => sum + node.x, 0) / members.length,
        y: members.reduce((sum, node) => sum + node.y, 0) / members.length,
      };
      return members.flatMap((node) => {
        const sources = [...keywordSources.get(node.id)!].sort();
        const previous = previousKeywords.get(node.id);
        const preserve =
          previous &&
          !rebalance &&
          previousContext?.spacingScale === spacingScale &&
          previous.positions.length === sources.length &&
          sources.every((id, i) => id === previous.positions[i].origin.id);
        const offset = preserve
          ? previous.positions[0]
          : { x: node.x - center.x, y: node.y - center.y };
        const positions = sources.flatMap((id) => {
          const origin = nodeMap.get(id);
          return origin ? [{ origin, x: offset.x, y: offset.y }] : [];
        });
        if (!positions.length) return [];
        if (preserve) {
          node.x = previous.node.x;
          node.y = previous.node.y;
        }
        return [
          {
            node,
            positions,
            lastTarget: preserve ? previous.lastTarget : undefined,
            reservedRootId: sourceSlots.get(node.id),
          },
        ];
      });
    })
    .sort((a, b) => a.node.id.localeCompare(b.node.id));
  const externalClassNode = externalClass ? nodeMap.get(externalClass.id) || null : null;
  const externalLinkNodes = simNodes.filter(isExternalLinkInstance);
  centerExternalClass(externalClassNode, externalLinkNodes);

  const noteClassNode = noteClass ? nodeMap.get(noteClass.id) || null : null;
  const noteMemberIds = new Set(
    edges
      .filter(
        (edge) =>
          edge.type === 'INSTANCE_OF' &&
          edge.target === noteClass?.id &&
          inputNodeById.get(edge.source)?.role === 'INSTANCE'
      )
      .map((edge) => edge.source)
  );
  const noteInstanceNodes = simNodes.filter(
    (node) =>
      noteMemberIds.has(node.id) ||
      (noteMemberIds.size === 0 && node.role === 'INSTANCE' && node.instanceKind === 'NOTE')
  );
  centerNoteClass(noteClassNode, noteInstanceNodes);

  const {
    repulsion: baseRepulse,
    spring: kSpring,
    gravity: kGravity,
    collisionForce,
    rootRingSpring,
    focusSpring,
    rootAnchorSpring,
    maxRepulsionDistance,
    maxVelocity: baseMaxVelocity,
  } = DEFAULT_LAYOUT_CONFIG.physics;
  const kRepulse = baseRepulse * seedScale;
  const maxRepulseDist = maxRepulsionDistance * Math.max(0.8, seedScale);
  const maxRepulseDistSq = maxRepulseDist * maxRepulseDist;
  const maxVelocity = (balanceRootAreas ? 12 : baseMaxVelocity) * spacingScale;
  const { minDistance, edgeLength } = DEFAULT_LAYOUT_CONFIG;

  const rootIdSet = new Set(classRootDistances.rootIds);
  const nodeIndex = new Map(simNodes.map((node, index) => [node.id, index]));
  const derivedCentroids = derivedMemberNodes.map(([node, members]) => ({
    node: nodeMap.get(node.id)!,
    members: [...members].map((member) => nodeMap.get(member.id)!),
  }));
  const derivedCentroidFlags = new Uint8Array(nodeCount);
  for (const id of centeredNodeIds) derivedCentroidFlags[nodeIndex.get(id)!] = 1;
  for (const id of sharedExternalIds) derivedCentroidFlags[nodeIndex.get(id)!] = 1;
  for (const { node } of keywordPositionConstraints)
    derivedCentroidFlags[nodeIndex.get(node.id)!] = 1;
  const collisionFlags = new Uint8Array(nodeCount);
  const rootIndices = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const node = simNodes[i];
    collisionFlags[i] =
      (node.role === 'CLASS' ? COLLISION_CLASS : 0) |
      (rootIdSet.has(node.id) ? COLLISION_ROOT : 0) |
      (containmentNodeIds.has(node.id) ? COLLISION_CONTAINMENT : 0) |
      (isExternalLinkInstance(node) ? COLLISION_EXTERNAL : 0) |
      (node.instanceKind === 'KEYWORD' ? COLLISION_KEYWORD : 0) |
      (focusedNodeIds?.has(node.id) ? COLLISION_FOCUSED : 0);
    const rootId = classRootDistances.rootByNodeId.get(node.id);
    rootIndices[i] =
      rootId && !keywordSources.has(node.id) && !sharedExternalIds.has(node.id)
        ? nodeIndex.get(rootId) ?? -1
        : -1;
  }

  const precomputedEdges: PrecomputedEdge[] = [];
  for (const edge of edges) {
    if (
      edge.type === 'INSTANCE_OF' &&
      (inputNodeById.get(edge.target)?.classKind === 'EXTERNAL_LINK' ||
        inputNodeById.get(edge.target)?.classKind === 'NOTE')
    ) {
      continue;
    }
    const sourceRoot = classRootDistances.rootByNodeId.get(edge.source);
    const targetRoot = classRootDistances.rootByNodeId.get(edge.target);
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;
    const containmentLength = getHierarchyLength(edge, source, hierarchyLengths);
    const placement =
      edge.type === 'REFERENCES' ||
      edge.type === 'EXTERNAL_REFERENCE' ||
      edge.type === 'KEYWORD_SOURCE';
    if (
      containmentLength === undefined &&
      !placement &&
      sourceRoot &&
      targetRoot &&
      sourceRoot !== targetRoot
    ) {
      continue;
    }
    // Derived centroids follow their members without pulling source nodes toward them.
    if (
      derivedCentroidFlags[nodeIndex.get(source.id)!] ||
      derivedCentroidFlags[nodeIndex.get(target.id)!]
    )
      continue;

    let baseTargetLen = edgeLength.defaultEdge;
    if (edge.type === 'INSTANCE_OF') {
      baseTargetLen = edgeLength.instanceOf;
    } else if (edge.type === 'SUBCLASS_OF') {
      baseTargetLen = edgeLength.subClassOf;
    } else if (edge.type === 'PART_OF') {
      baseTargetLen = getHierarchyLength(edge, source) ?? edgeLength.partOf;
    } else if (edge.type === 'REFERENCES') {
      baseTargetLen = edgeLength.references;
    }
    const targetLen =
      containmentLength === undefined
        ? baseTargetLen * seedScale
        : containmentLength * spacingScale;
    precomputedEdges.push({
      source,
      target,
      targetLen,
      springScale:
        edge.type === 'EXTERNAL_REFERENCE' && target.instanceKind === 'EXTERNAL_LINK'
          ? DEFAULT_LAYOUT_CONFIG.physics.ordinaryExternalReferenceSpringScale
          : 1,
      placement,
    });
  }
  const pairCounts = new Map<string, number>();
  const springDegrees = new Map<SimNode, number>();
  const placementDegrees = new Map<SimNode, number>();
  const placementPairs = new Set<string>();
  const familyDegrees = new Map<number, number>();
  const springPairKey = ({ source, target }: PrecomputedEdge) => {
    const left = nodeIndex.get(source.id)!,
      right = nodeIndex.get(target.id)!;
    return left < right ? `${left}:${right}` : `${right}:${left}`;
  };
  for (const edge of precomputedEdges) {
    const key = springPairKey(edge);
    const count = pairCounts.get(key) || 0;
    pairCounts.set(key, count + 1);
    if (!count)
      for (const node of [edge.source, edge.target])
        springDegrees.set(node, (springDegrees.get(node) || 0) + 1);
    if (edge.placement && !placementPairs.has(key)) {
      placementPairs.add(key);
      const familyIds = new Set<number>();
      const sourceIndex = nodeIndex.get(edge.source.id)!;
      const targetIndex = nodeIndex.get(edge.target.id)!;
      for (const node of [edge.source, edge.target]) {
        placementDegrees.set(node, (placementDegrees.get(node) || 0) + 1);
        const index = nodeIndex.get(node.id)!;
        const root = rootIndices[index];
        if (root >= 0 && (root === index || rootIndices[sourceIndex] !== rootIndices[targetIndex]))
          familyIds.add(root);
      }
      for (const root of familyIds) familyDegrees.set(root, (familyDegrees.get(root) || 0) + 1);
    }
  }
  for (const edge of precomputedEdges) {
    if (edge.placement) {
      // Normalize each endpoint separately so a busy source does not strand its keywords.
      // Cross-family forces also move the structural root, not just its constrained descendants.
      const sourceIndex = nodeIndex.get(edge.source.id)!;
      const targetIndex = nodeIndex.get(edge.target.id)!;
      const sourceRoot = rootIndices[sourceIndex],
        targetRoot = rootIndices[targetIndex];
      const scale = edge.springScale / pairCounts.get(springPairKey(edge))!;
      edge.sourceScale =
        scale /
        Math.max(
          1,
          sourceRoot === sourceIndex
            ? familyDegrees.get(sourceRoot) || 1
            : placementDegrees.get(edge.source) || 1
        );
      edge.targetScale =
        scale /
        Math.max(
          1,
          targetRoot === targetIndex
            ? familyDegrees.get(targetRoot) || 1
            : placementDegrees.get(edge.target) || 1
        );
      if (sourceRoot !== targetRoot) {
        if (sourceRoot >= 0 && sourceRoot !== sourceIndex)
          edge.sourceFamily = {
            root: simNodes[sourceRoot],
            scale: scale / (familyDegrees.get(sourceRoot) || 1),
          };
        if (targetRoot >= 0 && targetRoot !== targetIndex)
          edge.targetFamily = {
            root: simNodes[targetRoot],
            scale: scale / (familyDegrees.get(targetRoot) || 1),
          };
      }
    }
    // Several relation types for one pair share a spring budget; hubs do not multiply attraction.
    edge.springScale /=
      pairCounts.get(springPairKey(edge))! *
      Math.max(springDegrees.get(edge.source) || 1, springDegrees.get(edge.target) || 1);
  }

  const precomputedRootPulls: PrecomputedRootPull[] = [];
  for (const [nodeId, hop] of classRootDistances.hopByNodeId) {
    if (hop === 0) continue;
    const node = nodeMap.get(nodeId);
    const root = nodeMap.get(classRootDistances.rootByNodeId.get(nodeId)!);
    if (!node || !root) continue;
    if (derivedCentroidFlags[nodeIndex.get(node.id)!] || keywordSources.has(node.id)) continue;
    precomputedRootPulls.push({
      node,
      root,
      fixedContainment: containmentNodeIds.has(node.id),
      branchOffset:
        balanceRootAreas && branchNodeIds.has(nodeId)
          ? { x: node.x - root.x, y: node.y - root.y }
          : undefined,
      targetRadius:
        rootSeedRadii.get(nodeId) ??
        (DEFAULT_LAYOUT_CONFIG.physics.rootFirstRingRadius +
          (hop - 1) * DEFAULT_LAYOUT_CONFIG.physics.rootRingStep) *
          spacingScale,
    });
  }
  const hierarchyConstraints = buildHierarchyConstraints(
    simNodes,
    edges,
    nodeIndex,
    spacingScale,
    hierarchyLengths
  );
  const fixedNeighbors = new Map<number, Set<number>>();
  for (const [id, neighbors] of fixedNeighborIds) {
    fixedNeighbors.set(
      nodeIndex.get(id)!,
      new Set([...neighbors].map((neighbor) => nodeIndex.get(neighbor)!))
    );
  }
  const components = new Map<number, number>();
  const componentOf = (index: number): number => {
    let root = index;
    while (components.has(root) && components.get(root) !== root) root = components.get(root)!;
    while (components.has(index) && components.get(index) !== root) {
      const parent = components.get(index)!;
      components.set(index, root);
      index = parent;
    }
    return root;
  };
  for (const edge of [...hierarchyConstraints.tree, ...hierarchyConstraints.cyclic]) {
    const left = componentOf(edge.child),
      right = componentOf(edge.parent);
    if (left !== right) components.set(right, left);
  }
  const fixedComponentRoots = new Set<number>();
  const followerRoots = new Set<string>();
  for (const id of classRootDistances.rootIds) {
    const component = componentOf(nodeIndex.get(id)!);
    if (fixedComponentRoots.has(component)) followerRoots.add(id);
    else fixedComponentRoots.add(component);
  }
  const previousPopulations = previousContext?.rootPopulations;
  const populationChanged =
    previousPopulations &&
    (previousPopulations.size !== rootPopulations.size ||
      [...rootPopulations].some(([id, count]) => previousPopulations.get(id) !== count));
  const footprintChanged =
    previousContext &&
    (previousContext.rootFootprints.size !== rootFootprints.size ||
      [...rootFootprints].some(([id, size]) => previousContext.rootFootprints.get(id) !== size));
  const precomputedRootAnchors = classRootDistances.rootIds.flatMap((rootId) => {
    if (followerRoots.has(rootId)) return [];
    const root = nodeMap.get(rootId);
    const position =
      (populationChanged ||
      footprintChanged ||
      compactionNeeded ||
      (!previousContext && !rootAnchorPositions && matchingRoots.length)
        ? rootLayoutPositions.get(rootId)
        : previousAnchors.get(rootId)) || existingPosMap.get(rootId);
    return root && position ? [{ root, ...position }] : [];
  });
  const context: ForceSimulationContext = {
    simNodes,
    collisionFlags,
    rootIndices,
    collisionDistances: new Float32Array(
      [
        minDistance.instanceNode,
        minDistance.classNode,
        minDistance.externalLink,
        minDistance.keyword,
      ].map((distance) => distance * seedScale)
    ),
    repulsionCellSize: maxRepulseDist,
    spatialCells: new Map(),
    spatialOrder: new Int32Array(nodeCount),
    candidateCellRanges: new Int32Array(18),
    positionX: new Float64Array(nodeCount),
    positionY: new Float64Array(nodeCount),
    velocityX: new Float64Array(nodeCount),
    velocityY: new Float64Array(nodeCount),
    repulsionCursor: null,
    pendingAlpha: 1,
    precomputedEdges,
    hierarchyConstraints,
    precomputedRootPulls,
    precomputedRootAnchors,
    precomputedFocusPulls: [],
    focusedNodeIds: new Set(),
    externalClassNode,
    externalLinkNodes,
    noteClassNode,
    noteInstanceNodes,
    derivedCentroids,
    derivedCentroidFlags,
    externalPositionConstraints,
    keywordPositionConstraints,
    sourceRootByNodeId: classRootDistances.rootByNodeId,
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    rootRingSpring,
    rootAnchorSpring,
    focusSpring,
    maxVelocity,
    spacingScale,
    nodeCount,
    densityScale: initialDensityScale,
    layoutNodeCount,
    rootPopulations,
    rootFootprints,
    compactFamilies: balanceRootAreas === true,
    rootLayoutOrder: rootPlan.order,
    rootLayoutSnake: rootPlan.snake,
    placementSignature,
    hierarchyLengths,
    fixedNeighbors,
    spaceReservationPending:
      !balanceRootAreas &&
      Boolean(
        compactionNeeded ||
          (previousContext &&
            (populationChanged ||
              footprintChanged ||
              previousContext.layoutNodeCount !== layoutNodeCount ||
              previousContext.spacingScale !== spacingScale))
      ),
    restartAlpha: balanceRootAreas
      ? 0.25
      : compactionNeeded ||
        precomputedEdges.some(
          ({ placement, source, target, targetLen }) =>
            placement && Math.hypot(source.x - target.x, source.y - target.y) > targetLen * 8
        )
      ? 1
      : 0.4,
  };
  applyHierarchyConstraints(context.hierarchyConstraints, simNodes);
  if (balanceRootAreas && (warmNodeIds.size === 0 || rebalance)) compactFamilyPositions(context);
  for (const pull of precomputedRootPulls) {
    if (!pull.branchOffset) continue;
    pull.branchOffset = { x: pull.node.x - pull.root.x, y: pull.node.y - pull.root.y };
  }
  positionSourceNodes(context);
  centerExternalClass(externalClassNode, externalLinkNodes);
  centerNoteClass(noteClassNode, noteInstanceNodes);
  centerDerivedNodes(derivedCentroids);
  setSimulationFocus(context, edges, selectedNodeId, focusDepth, focusedNodeIds);
  return context;
};

/** Close empty inter-family space by translating whole families with actual node clearance. */
const compactFamilyPositions = (context: ForceSimulationContext): void => {
  const { simNodes, rootIndices, derivedCentroidFlags, spacingScale, densityScale } = context;
  const groups = new Map<number, number[]>();
  const sourceRoots = new Map(
    [...context.externalPositionConstraints, ...context.keywordPositionConstraints]
      .filter((c) => c.reservedRootId)
      .map((c) => [c.node.id, c.reservedRootId!])
  );
  const index = new Map(simNodes.map((n, i) => [n.id, i]));
  const gaps = simNodes.map((node) => nodeMinDistance(node) * spacingScale * densityScale * 1.1);
  const cellSize =
    Math.max(...Object.values(DEFAULT_LAYOUT_CONFIG.minDistance)) *
    spacingScale *
    densityScale *
    1.1;
  const cells = new Map<string, Set<number>>();
  const key = (x: number, y: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  const reserve = (i: number) => {
    const cell = key(simNodes[i].x, simNodes[i].y);
    let bucket = cells.get(cell);
    if (!bucket) cells.set(cell, (bucket = new Set()));
    bucket.add(i);
  };
  simNodes.forEach((node, i) => {
    if (derivedCentroidFlags[i] && !sourceRoots.has(node.id)) return;
    reserve(i);
    const root =
      rootIndices[i] >= 0
        ? rootIndices[i]
        : sourceRoots.has(node.id)
        ? index.get(sourceRoots.get(node.id)!) ?? -1
        : -1;
    if (root >= 0) append(groups, root, i);
  });
  if (groups.size < 2) return;
  const roots = [...groups.keys()];
  const center = {
    x: roots.reduce((sum, i) => sum + simNodes[i].x, 0) / roots.length,
    y: roots.reduce((sum, i) => sum + simNodes[i].y, 0) / roots.length,
  };
  const available = (members: number[], dx: number, dy: number) => {
    for (const i of members) {
      const x = simNodes[i].x + dx,
        y = simNodes[i].y + dy;
      const cx = Math.floor(x / cellSize),
        cy = Math.floor(y / cellSize);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const j of cells.get(`${cx + a},${cy + b}`) || [])
            if (
              Math.hypot(x - simNodes[j].x, y - simNodes[j].y) <
              Math.max(gaps[i], gaps[j]) - 1e-7
            )
              return false;
    }
    return true;
  };
  for (let pass = 0; pass < 6; pass++) {
    roots.sort(
      (a, b) =>
        Math.hypot(simNodes[a].x - center.x, simNodes[a].y - center.y) -
          Math.hypot(simNodes[b].x - center.x, simNodes[b].y - center.y) ||
        simNodes[a].id.localeCompare(simNodes[b].id)
    );
    for (const root of roots) {
      const members = groups.get(root)!;
      for (const i of members) cells.get(key(simNodes[i].x, simNodes[i].y))!.delete(i);
      const dx = (center.x - simNodes[root].x) * 0.18,
        dy = (center.y - simNodes[root].y) * 0.18;
      let shiftX = 0,
        shiftY = 0,
        bestGain = 0;
      // Slide around an occupied neighbor instead of stopping at the first radial obstruction.
      for (const angle of [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3]) {
        const tx = dx * Math.cos(angle) - dy * Math.sin(angle),
          ty = dx * Math.sin(angle) + dy * Math.cos(angle);
        let fraction = 1;
        for (let attempt = 0; attempt < 8; attempt++, fraction /= 2) {
          const x = tx * fraction,
            y = ty * fraction;
          const gain = (2 * (dx * x + dy * y)) / 0.18 - x * x - y * y;
          if (gain <= bestGain) break;
          if (!available(members, x, y)) continue;
          shiftX = x;
          shiftY = y;
          bestGain = gain;
          break;
        }
      }
      for (const i of members) {
        simNodes[i].x += shiftX;
        simNodes[i].y += shiftY;
      }
      for (const i of members) reserve(i);
    }
  }
  for (const anchor of context.precomputedRootAnchors) {
    anchor.x = anchor.root.x;
    anchor.y = anchor.root.y;
  }
};

/** Apply selection priority without resetting the settled layout and its root anchors. */
export const setSimulationFocus = (
  context: ForceSimulationContext,
  edges: KnowledgeGraphEdge[],
  selectedNodeId?: string | null,
  focusDepth?: number,
  focusedNodeIds?: Set<string> | null
): void => {
  context.repulsionCursor = null;
  for (let i = 0; i < context.nodeCount; i++) {
    context.collisionFlags[i] =
      (context.collisionFlags[i] & ~COLLISION_FOCUSED) |
      (focusedNodeIds?.has(context.simNodes[i].id) ? COLLISION_FOCUSED : 0);
  }
  context.precomputedFocusPulls = [];
  context.focusedNodeIds = new Set();
  context.focusHierarchyConstraints = undefined;
  if (!selectedNodeId || (focusDepth !== 1 && focusDepth !== 2) || !focusedNodeIds) return;

  const nodeMap = new Map(context.simNodes.map((node) => [node.id, node]));
  const selected = nodeMap.get(selectedNodeId);
  if (!selected) return;
  context.focusedNodeIds.add(selected.id);
  const neighborMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    append(neighborMap, edge.source, edge.target);
    append(neighborMap, edge.target, edge.source);
  }
  const visited = new Set<string>([selected.id]);
  const queue = [{ id: selected.id, hop: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const { id, hop } = queue[index];
    if (hop >= focusDepth) continue;
    for (const neighborId of neighborMap.get(id) || []) {
      if (visited.has(neighborId) || !focusedNodeIds.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, hop: hop + 1 });
      const node = nodeMap.get(neighborId)!;
      context.focusedNodeIds.add(neighborId);
      context.precomputedFocusPulls.push({
        node,
        selected,
        targetRadius:
          (hop === 0 ? 101.25 : 187.5) *
          context.spacingScale *
          DEFAULT_LAYOUT_CONFIG.physics.focusSpacingMultiplier,
      });
    }
  }
  // Compact related containment edges temporarily; keep the base lengths for overview recovery.
  const retain = (edge: HierarchyConstraint) =>
    !(
      visited.has(context.simNodes[edge.child].id) && visited.has(context.simNodes[edge.parent].id)
    );
  context.focusHierarchyConstraints = {
    tree: context.hierarchyConstraints.tree.filter(retain),
    cyclic: context.hierarchyConstraints.cyclic.filter(retain),
  };
};

/**
 * 시간 예산을 기준으로 물리 계산을 나누고, 완료 시에만 노드 좌표를 반영합니다.
 * @param context 시뮬레이션 상태 컨텍스트
 * @param alpha 쿨링 계수 (1.0 -> 0.05)
 * @param budgetMs 반발력 계산의 양보 기준 시간. 마지막 좌표 갱신은 한 번에 완료합니다.
 * @returns 완료된 스텝의 최대 이동 거리 또는 다음 프레임에서 이어갈 경우 null
 */
export const advanceForceSimulation = (
  context: ForceSimulationContext,
  alpha: number,
  budgetMs: number
): number | null => {
  const deadline = Number.isFinite(budgetMs) ? performance.now() + Math.max(0, budgetMs) : Infinity;
  const {
    simNodes,
    positionX,
    positionY,
    velocityX,
    velocityY,
    precomputedEdges,
    precomputedRootPulls,
    precomputedRootAnchors,
    precomputedFocusPulls,
    focusedNodeIds,
    externalClassNode,
    externalLinkNodes,
    noteClassNode,
    noteInstanceNodes,
    derivedCentroids,
    derivedCentroidFlags,
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    rootRingSpring,
    focusSpring,
    rootAnchorSpring,
    maxVelocity,
    nodeCount,
  } = context;

  if (nodeCount === 0) return 0;

  const useSpatialIndex = nodeCount >= SPATIAL_INDEX_THRESHOLD;
  if (context.repulsionCursor === null) {
    context.pendingAlpha = alpha;
    // Use contiguous numeric buffers in the hot pair loop; nodes retain their public shape.
    for (let i = 0; i < nodeCount; i++) {
      const node = simNodes[i];
      positionX[i] = node.x;
      positionY[i] = node.y;
      velocityX[i] = node.vx;
      velocityY[i] = node.vy;
    }
    if (useSpatialIndex) indexNearbyNodes(context);
    context.repulsionCursor = 0;
  }
  for (let i = context.repulsionCursor; i < nodeCount; i++) {
    const n1 = simNodes[i];
    if (n1 === externalClassNode || n1 === noteClassNode || derivedCentroidFlags[i]) continue;
    const x1 = positionX[i];
    const y1 = positionY[i];
    let vx1 = velocityX[i];
    let vy1 = velocityY[i];

    const cellCount = useSpatialIndex ? collectNearbyIndices(context, i) : 1;
    for (let cell = 0; cell < cellCount; cell++) {
      const start = useSpatialIndex ? context.candidateCellRanges[cell * 2] : i + 1;
      const end = useSpatialIndex ? context.candidateCellRanges[cell * 2 + 1] : nodeCount;
      for (let index = start; index < end; index++) {
        const j = useSpatialIndex ? context.spatialOrder[index] : index;
        if (!useSpatialIndex) {
          const n2 = simNodes[j];
          if (n2 === externalClassNode || n2 === noteClassNode || derivedCentroidFlags[j]) continue;
        }
        let dx = x1 - positionX[j];
        let dy = y1 - positionY[j];
        let distSq = dx * dx + dy * dy;
        if (distSq > maxRepulseDistSq) continue;

        const minDist = getPairMinDistance(context, i, j);
        const pairRepulse =
          focusedPairSpacing(context, i, j) ** 2 *
          (context.collisionFlags[i] & context.collisionFlags[j] & COLLISION_EXTERNAL
            ? kRepulse *
              (DEFAULT_LAYOUT_CONFIG.minDistance.externalLink /
                DEFAULT_LAYOUT_CONFIG.minDistance.instanceNode) **
                2
            : kRepulse);
        if (distSq >= minDist * minDist && distSq >= 625) {
          const forceScale = pairRepulse / distSq;
          const fx = dx * forceScale;
          const fy = dy * forceScale;
          vx1 += fx;
          vy1 += fy;
          velocityX[j] -= fx;
          velocityY[j] -= fy;
          continue;
        }
        if (distSq < 1) {
          const pseudoAngle = ((i * 31 + j * 17) % 628) / 100;
          dx = Math.cos(pseudoAngle) * 2;
          dy = Math.sin(pseudoAngle) * 2;
          distSq = dx * dx + dy * dy + 1;
        }

        const dist = Math.sqrt(distSq);
        const invDist = 1 / dist;
        const overlap = Math.max(0, minDist - dist);
        const forceScale =
          (pairRepulse * (dist < 25 ? 0.04 : invDist) + overlap * (collisionForce + 0.3)) * invDist;
        const fx = dx * forceScale;
        const fy = dy * forceScale;

        vx1 += fx;
        vy1 += fy;
        velocityX[j] -= fx;
        velocityY[j] -= fy;
        // Let colliding descendants separate their families instead of bunching on one side.
        if (overlap > 0 && precomputedRootAnchors.length) {
          const leftRoot = context.rootIndices[i],
            rightRoot = context.rootIndices[j];
          if (leftRoot !== rightRoot) {
            if (leftRoot >= 0 && leftRoot !== i) {
              const mass = context.rootPopulations.get(simNodes[leftRoot].id) || 1;
              velocityX[leftRoot] += fx / mass;
              velocityY[leftRoot] += fy / mass;
            }
            if (rightRoot >= 0 && rightRoot !== j) {
              const mass = context.rootPopulations.get(simNodes[rightRoot].id) || 1;
              velocityX[rightRoot] -= fx / mass;
              velocityY[rightRoot] -= fy / mass;
            }
          }
        }
      }
    }

    velocityX[i] = vx1;
    velocityY[i] = vy1;
    context.repulsionCursor = i + 1;
    if (deadline !== Infinity && i + 1 < nodeCount && i % 8 === 0 && performance.now() >= deadline)
      return null;
  }
  const stepAlpha = context.pendingAlpha;
  context.repulsionCursor = null;
  for (let i = 0; i < nodeCount; i++) {
    simNodes[i].vx = velocityX[i];
    simNodes[i].vy = velocityY[i];
  }

  const velocityLimits = new Map<SimNode, number>();
  for (let eIdx = 0; eIdx < precomputedEdges.length; eIdx++) {
    const {
      source,
      target,
      targetLen,
      springScale,
      sourceScale,
      targetScale,
      sourceFamily,
      targetFamily,
    } = precomputedEdges[eIdx];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const invDist = 1 / dist;

    const focusedLength =
      focusedNodeIds.has(source.id) && focusedNodeIds.has(target.id)
        ? Math.min(targetLen, 160 * context.spacingScale) *
          DEFAULT_LAYOUT_CONFIG.physics.focusSpacingMultiplier
        : targetLen;
    const displacement = dist - focusedLength;
    const force = displacement * kSpring;
    const fx = dx * invDist * force;
    const fy = dy * invDist * force;

    source.vx += fx * (sourceScale ?? springScale);
    source.vy += fy * (sourceScale ?? springScale);
    target.vx -= fx * (targetScale ?? springScale);
    target.vy -= fy * (targetScale ?? springScale);
    if (sourceFamily) {
      sourceFamily.root.vx += fx * sourceFamily.scale;
      sourceFamily.root.vy += fy * sourceFamily.scale;
    }
    if (targetFamily) {
      targetFamily.root.vx -= fx * targetFamily.scale;
      targetFamily.root.vy -= fy * targetFamily.scale;
    }
  }

  for (let rIdx = 0; rIdx < precomputedRootPulls.length; rIdx++) {
    const { node, root, targetRadius } = precomputedRootPulls[rIdx];
    const branchOffset = precomputedRootPulls[rIdx].branchOffset;
    if (focusedNodeIds.has(node.id)) continue;
    const dx = node.x - root.x;
    const dy = node.y - root.y;
    const distance = Math.hypot(dx, dy) || 1;
    const invDist = 1 / distance;
    const delta = distance - targetRadius;
    const force = delta * rootRingSpring;
    const fx = branchOffset ? (dx - branchOffset.x) * rootRingSpring : dx * invDist * force;
    const fy = branchOffset ? (dy - branchOffset.y) * rootRingSpring : dy * invDist * force;
    node.vx -= fx;
    node.vy -= fy;
    const reaction = 0.06 / Math.max(1, context.rootPopulations.get(root.id) || 1);
    root.vx += fx * reaction;
    root.vy += fy * reaction;
  }
  for (const { node, selected, targetRadius } of precomputedFocusPulls) {
    const dx = node.x - selected.x;
    const dy = node.y - selected.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance <= targetRadius) continue;
    const force = (distance - targetRadius) * focusSpring;
    node.vx -= (dx / distance) * force;
    node.vy -= (dy / distance) * force;
    // Selection must be able to cover a large distance before cooling, while each step stays bounded.
    velocityLimits.set(
      node,
      Math.max(
        maxVelocity,
        Math.min(72 * context.spacingScale, (distance - targetRadius) * 0.05) /
          Math.max(0.02, stepAlpha)
      )
    );
  }
  // Anchors reserve room after a toggle, then release families to shorten their connections.
  for (let aIdx = 0; aIdx < precomputedRootAnchors.length; aIdx++) {
    const { root, x, y } = precomputedRootAnchors[aIdx];
    if (focusedNodeIds.has(root.id) || !context.spaceReservationPending) continue;
    const cooling = Math.max(0.15, stepAlpha);
    // Finish the temporary space plan before releasing roots to their connection springs.
    // Competing attraction must not leave a root permanently tethered to its old slot.
    root.vx = ((x - root.x) * rootAnchorSpring) / cooling;
    root.vy = ((y - root.y) * rootAnchorSpring) / cooling;
    velocityLimits.set(
      root,
      Math.max(maxVelocity, (Math.hypot(x - root.x, y - root.y) * 0.02) / cooling)
    );
  }
  for (let i = 0; i < nodeCount; i++) {
    const node = simNodes[i];
    if (node === externalClassNode || node === noteClassNode || derivedCentroidFlags[i]) continue;
    const rootIndex = context.rootIndices[i];
    const isRoot = rootIndex === i;
    const gravityCenter = rootIndex >= 0 && !isRoot ? simNodes[rootIndex] : { x: cx, y: cy };
    const dx = gravityCenter.x - node.x;
    const dy = gravityCenter.y - node.y;
    const gravity =
      isRoot && !focusedNodeIds.has(node.id) && precomputedRootAnchors.length
        ? DEFAULT_LAYOUT_CONFIG.physics.familyGravity
        : kGravity;
    node.vx += dx * gravity;
    node.vy += dy * gravity;

    const vel = Math.hypot(node.vx, node.vy);
    const velocityLimit = velocityLimits.get(node) || maxVelocity;
    if (vel > velocityLimit) {
      node.vx = (node.vx / vel) * velocityLimit;
      node.vy = (node.vy / vel) * velocityLimit;
    }

    const moveX = node.vx * stepAlpha;
    const moveY = node.vy * stepAlpha;
    node.x += moveX;
    node.y += moveY;

    node.vx *= 0.72;
    node.vy *= 0.72;
  }

  // Move structural families with their roots, preserving local angles and lengths.
  if (context.compactFamilies && !precomputedFocusPulls.length)
    for (const { root, x, y } of precomputedRootAnchors) {
      root.x = x;
      root.y = y;
      root.vx = 0;
      root.vy = 0;
    }
  if (precomputedRootAnchors.length)
    for (let i = 0; i < nodeCount; i++) {
      const rootIndex = context.rootIndices[i];
      if (
        rootIndex < 0 ||
        rootIndex === i ||
        derivedCentroidFlags[i] ||
        focusedNodeIds.has(simNodes[i].id)
      )
        continue;
      simNodes[i].x += simNodes[rootIndex].x - positionX[rootIndex];
      simNodes[i].y += simNodes[rootIndex].y - positionY[rootIndex];
    }
  // The overview geometry already has clearance. Keep each family rigid so small
  // angular drift cannot close its holes and eject source nodes across the graph.
  if (context.compactFamilies && !precomputedFocusPulls.length)
    for (const { node, root, branchOffset } of precomputedRootPulls) {
      if (!branchOffset) continue;
      node.x = root.x + branchOffset.x;
      node.y = root.y + branchOffset.y;
      node.vx = 0;
      node.vy = 0;
    }
  applyHierarchyConstraints(
    context.focusHierarchyConstraints || context.hierarchyConstraints,
    simNodes
  );
  // Measure final displacement, including projection, so balanced forces do not
  // keep a stationary constrained layout running indefinitely.
  let maxMovement = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (
      simNodes[i] === externalClassNode ||
      simNodes[i] === noteClassNode ||
      derivedCentroidFlags[i]
    )
      continue;
    maxMovement = Math.max(
      maxMovement,
      Math.hypot(simNodes[i].x - positionX[i], simNodes[i].y - positionY[i])
    );
  }

  maxMovement = Math.max(maxMovement, positionSourceNodes(context));
  maxMovement = Math.max(maxMovement, centerExternalClass(externalClassNode, externalLinkNodes));
  maxMovement = Math.max(maxMovement, centerNoteClass(noteClassNode, noteInstanceNodes));
  maxMovement = Math.max(maxMovement, centerDerivedNodes(derivedCentroids));

  if (context.spaceReservationPending) {
    const tolerance =
      DEFAULT_LAYOUT_CONFIG.minDistance.classNode * context.spacingScale * context.densityScale;
    context.spaceReservationPending =
      precomputedRootAnchors.some(
        ({ root, x, y }) =>
          !focusedNodeIds.has(root.id) &&
          Math.hypot(root.x - x, root.y - y) >
            Math.max(
              tolerance,
              Math.sqrt(context.rootPopulations.get(root.id) || 1) * tolerance * 0.15
            )
      ) ||
      precomputedRootPulls.some(
        ({ node, root, targetRadius, fixedContainment }) =>
          !focusedNodeIds.has(node.id) &&
          !fixedContainment &&
          targetRadius - Math.hypot(node.x - root.x, node.y - root.y) >
            Math.max(tolerance, targetRadius * 0.15)
      );
  }

  return maxMovement;
};

/** Run one complete step for callers that do not need to yield between frames. */
export const stepForceSimulation = (context: ForceSimulationContext, alpha: number): number =>
  advanceForceSimulation(context, alpha, Infinity) ?? 0;
