import { isInferredRelationType } from './relations';
import { OntologyEdge, OntologyNode } from '../types';

/**
 * 지식 그래프 물리 시뮬레이션 기본 파라미터
 */
export const DEFAULT_LAYOUT_CONFIG = {
  minDistance: {
    classNode: 170,
    instanceNode: 120,
    literalNode: 75,
  },
  edgeLength: {
    references: 190,
    inferred: 240,
    instanceOf: 150,
    subClassOf: 150,
    partOf: 160,
    datatypeProperty: 75,
    defaultEdge: 160,
  },
  physics: {
    repulsion: 360,
    spring: 0.018,
    gravity: 0.0006,
    collisionForce: 0.75,
    topicClusterSpring: 0.008,
    topicRootMinDistanceScale: 0.76,
    topicMemberMinDistanceScale: 0.88,
    rootRingSpring: 0.026,
    rootAnchorSpring: 0.018,
    rootFirstRingRadius: 155,
    rootRingStep: 125,
    maxRepulsionDistance: 550,
    maxVelocity: 40,
  },
  canvas: {
    nodeSpanMultiplier: 260,
    minLayoutSpan: 1500,
  },
};

export interface ForceSimulationOptions {
  width: number;
  height: number;
  spacingScale?: number;
  centerOrigin?: boolean;
}

export interface TopicClusterIndex {
  rootIds: Set<string>;
  rootsByNodeId: Map<string, Set<string>>;
}

export interface ClassRootDistanceIndex {
  rootIds: string[];
  rootByNodeId: Map<string, string>;
  hopByNodeId: Map<string, number>;
}

export interface SimNode extends OntologyNode {
  vx: number;
  vy: number;
}

export interface PrecomputedEdge {
  source: SimNode;
  target: SimNode;
  targetLen: number;
}

export interface PrecomputedTopicPull {
  node: SimNode;
  root: SimNode;
  targetRadius: number;
  rootReactionScale: number;
}

export interface PrecomputedRootPull {
  node: SimNode;
  root: SimNode;
  targetRadius: number;
}

export interface PrecomputedRootAnchor {
  root: SimNode;
  x: number;
  y: number;
}

export interface ForceSimulationContext {
  simNodes: SimNode[];
  pairMinDist: Float32Array;
  precomputedEdges: PrecomputedEdge[];
  precomputedTopicPulls: PrecomputedTopicPull[];
  precomputedRootPulls: PrecomputedRootPull[];
  precomputedRootAnchors: PrecomputedRootAnchor[];
  cx: number;
  cy: number;
  kRepulse: number;
  maxRepulseDistSq: number;
  kSpring: number;
  kGravity: number;
  collisionForce: number;
  topicClusterSpring: number;
  rootRingSpring: number;
  rootAnchorSpring: number;
  maxVelocity: number;
  nodeCount: number;
}

const append = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
};

/**
 * Index each topic class and its directly classified instances by the top-level topic class.
 * Only asserted class/member edges participate so enabling inferred edges does not reshape clusters.
 */
export const buildTopicClusterIndex = (
  nodes: OntologyNode[],
  edges: OntologyEdge[]
): TopicClusterIndex => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const topicClassIds = new Set(
    nodes
      .filter((node) => node.role === 'CLASS' && node.classCategory === 'TOPIC')
      .map((node) => node.id)
  );
  const childIds = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const instancesByClass = new Map<string, string[]>();

  for (const edge of edges) {
    if (
      edge.type === 'SUBCLASS_OF' &&
      topicClassIds.has(edge.source) &&
      topicClassIds.has(edge.target)
    ) {
      childIds.add(edge.source);
      append(childrenByParent, edge.target, edge.source);
    } else if (
      edge.type === 'INSTANCE_OF' &&
      topicClassIds.has(edge.target) &&
      nodeIds.has(edge.source)
    ) {
      append(instancesByClass, edge.target, edge.source);
    }
  }

  const rootIds = new Set([...topicClassIds].filter((id) => !childIds.has(id)));

  const rootsByNodeId = new Map<string, Set<string>>();
  const addRoot = (nodeId: string, rootId: string) => {
    const roots = rootsByNodeId.get(nodeId) || new Set<string>();
    roots.add(rootId);
    rootsByNodeId.set(nodeId, roots);
  };

  for (const rootId of rootIds) {
    const pending = [rootId];
    const visitedClasses = new Set<string>();
    while (pending.length > 0) {
      const classId = pending.pop()!;
      if (visitedClasses.has(classId)) continue;
      visitedClasses.add(classId);
      addRoot(classId, rootId);
      for (const instanceId of instancesByClass.get(classId) || []) {
        addRoot(instanceId, rootId);
      }
      pending.push(...(childrenByParent.get(classId) || []));
    }
  }

  return { rootIds, rootsByNodeId };
};

const sharesTopicRoot = (
  leftRoots: Set<string> | undefined,
  rightRoots: Set<string> | undefined
): boolean => {
  if (!leftRoots || !rightRoots) return false;
  for (const rootId of leftRoots) {
    if (rightRoots.has(rootId)) return true;
  }
  return false;
};

/** Assign each node to its nearest Note or Board Card class by asserted graph hops. */
export const buildClassRootDistanceIndex = (
  nodes: OntologyNode[],
  edges: OntologyEdge[]
): ClassRootDistanceIndex => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rootIds = nodes
    .filter(
      (node) =>
        node.role === 'CLASS' && (node.classKind === 'NOTE' || node.classKind === 'BOARD_CARD')
    )
    .sort(
      (left, right) =>
        Number(right.classKind === 'NOTE') - Number(left.classKind === 'NOTE') ||
        left.id.localeCompare(right.id)
    )
    .map((node) => node.id);
  if (rootIds.length === 0) {
    return { rootIds, rootByNodeId: new Map(), hopByNodeId: new Map() };
  }
  const neighbors = new Map<string, string[]>();
  for (const edge of edges) {
    if (
      isInferredRelationType(edge.type) ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target)
    ) {
      continue;
    }
    append(neighbors, edge.source, edge.target);
    append(neighbors, edge.target, edge.source);
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
    for (const neighborId of neighbors.get(nodeId) || []) {
      if (hopByNodeId.has(neighborId)) continue;
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
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  options: ForceSimulationOptions
): ForceSimulationContext => {
  const { width, height, spacingScale = 1.0, centerOrigin = false } = options;
  const nodeCount = nodes.length;

  const layoutSpan = Math.max(
    DEFAULT_LAYOUT_CONFIG.canvas.minLayoutSpan,
    Math.sqrt(Math.max(1, nodeCount)) *
      DEFAULT_LAYOUT_CONFIG.canvas.nodeSpanMultiplier *
      Math.max(0.7, spacingScale)
  );
  const fieldWidth = Math.max(width * 1.8, layoutSpan);
  const fieldHeight = Math.max(height * 1.8, layoutSpan);
  const cx = centerOrigin ? 0 : fieldWidth / 2;
  const cy = centerOrigin ? 0 : fieldHeight / 2;

  const existingPosMap = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    if (node.x !== 0 || node.y !== 0) {
      existingPosMap.set(node.id, { x: node.x, y: node.y });
    }
  });
  const inputPositionIds = new Set(existingPosMap.keys());

  const neighborMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    append(neighborMap, edge.source, edge.target);
    append(neighborMap, edge.target, edge.source);
  });

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const initialRadius = Math.min(fieldWidth, fieldHeight) * 0.38;

  const topicClusters = buildTopicClusterIndex(nodes, edges);
  const classRootDistances = buildClassRootDistanceIndex(nodes, edges);
  const inputNodeById = new Map(nodes.map((node) => [node.id, node]));
  const noteRootId = classRootDistances.rootIds.find(
    (rootId) => inputNodeById.get(rootId)?.classKind === 'NOTE'
  );
  const boardRootIds = classRootDistances.rootIds.filter((rootId) => rootId !== noteRootId);
  const boardRootIndex = new Map(boardRootIds.map((rootId, index) => [rootId, index]));
  const boardCenterX = cx + (noteRootId ? fieldWidth * 0.22 : 0);
  for (const rootId of classRootDistances.rootIds) {
    if (existingPosMap.has(rootId)) continue;
    if (rootId === noteRootId) {
      existingPosMap.set(rootId, { x: cx - (boardRootIds.length ? fieldWidth * 0.22 : 0), y: cy });
      continue;
    }
    const boardIndex = boardRootIndex.get(rootId) || 0;
    const angle = (boardIndex * 2 * Math.PI) / Math.max(1, boardRootIds.length);
    const spread = boardRootIds.length > 1 ? Math.min(280, fieldHeight * 0.15) : 0;
    existingPosMap.set(rootId, {
      x: boardCenterX + Math.cos(angle) * spread,
      y: cy + Math.sin(angle) * spread,
    });
  }

  const nodesByRootRing = new Map<string, OntologyNode[]>();
  for (const node of nodes) {
    const rootId = classRootDistances.rootByNodeId.get(node.id);
    const hop = classRootDistances.hopByNodeId.get(node.id);
    if (!rootId || !hop || existingPosMap.has(node.id)) continue;
    const key = `${rootId}:${hop}`;
    append(nodesByRootRing, key, node);
  }
  for (const ring of nodesByRootRing.values()) {
    ring.sort((left, right) => left.id.localeCompare(right.id));
    ring.forEach((node, index) => {
      const rootId = classRootDistances.rootByNodeId.get(node.id)!;
      const hop = classRootDistances.hopByNodeId.get(node.id)!;
      const knownNeighborId = (neighborMap.get(node.id) || []).find((neighborId) =>
        inputPositionIds.has(neighborId)
      );
      const knownNeighbor = knownNeighborId && existingPosMap.get(knownNeighborId);
      if (knownNeighbor) {
        const angle = index * goldenAngle;
        existingPosMap.set(node.id, {
          x: knownNeighbor.x + Math.cos(angle) * 95 * spacingScale,
          y: knownNeighbor.y + Math.sin(angle) * 95 * spacingScale,
        });
        return;
      }
      const root = existingPosMap.get(rootId)!;
      const angle = (index * 2 * Math.PI) / ring.length + hop * goldenAngle;
      const radius =
        (DEFAULT_LAYOUT_CONFIG.physics.rootFirstRingRadius +
          (hop - 1) * DEFAULT_LAYOUT_CONFIG.physics.rootRingStep) *
        spacingScale;
      existingPosMap.set(node.id, {
        x: root.x + Math.cos(angle) * radius,
        y: root.y + Math.sin(angle) * radius,
      });
    });
  }

  const isAnchorNode = (node: OntologyNode) =>
    node.role === 'CLASS' || topicClusters.rootIds.has(node.id);

  const anchorNodes = nodes.filter((n) => isAnchorNode(n) && !existingPosMap.has(n.id));
  const memberNodes = nodes.filter((n) => !isAnchorNode(n) && !existingPosMap.has(n.id));

  const anchorCount = anchorNodes.length;
  anchorNodes.forEach((node, idx) => {
    // 앵커가 적으면 균등 원형 각도로, 많으면 황금비 나선으로 전역 분산
    const theta =
      anchorCount <= 12 ? (idx * 2 * Math.PI) / Math.max(1, anchorCount) : idx * goldenAngle;
    const r =
      anchorCount <= 1
        ? 0
        : Math.sqrt((idx + 0.6) / Math.max(1, anchorCount)) * (initialRadius * 0.72);
    const jitterX = Math.sin((idx + 1) * 7919) * 6;
    const jitterY = Math.cos((idx + 1) * 7919) * 6;
    existingPosMap.set(node.id, {
      x: cx + r * Math.cos(theta) + jitterX,
      y: cy + r * Math.sin(theta) + jitterY,
    });
  });

  memberNodes.forEach((node, idx) => {
    const roots = topicClusters.rootsByNodeId.get(node.id);
    let anchorPos: { x: number; y: number } | undefined;
    if (roots && roots.size > 0) {
      for (const rootId of roots) {
        if (existingPosMap.has(rootId)) {
          anchorPos = existingPosMap.get(rootId);
          break;
        }
      }
    }

    if (!anchorPos) {
      const neighbors = neighborMap.get(node.id) || [];
      const knownNeighborId = neighbors.find((nId) => existingPosMap.has(nId));
      if (knownNeighborId) {
        anchorPos = existingPosMap.get(knownNeighborId);
      }
    }

    if (anchorPos) {
      const angle = (idx * 2.39996) % (2 * Math.PI);
      const seedDist = 70 + ((idx * 31) % 110);
      existingPosMap.set(node.id, {
        x: anchorPos.x + Math.cos(angle) * seedDist,
        y: anchorPos.y + Math.sin(angle) * seedDist,
      });
    } else {
      // 독립 노드는 황금비 나선으로 중심 주변에 분산
      const r = Math.sqrt((idx + 0.5) / Math.max(1, memberNodes.length)) * initialRadius;
      const theta = idx * goldenAngle;
      existingPosMap.set(node.id, {
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta),
      });
    }
  });

  const simNodes: SimNode[] = nodes.map((node) => {
    const pos = existingPosMap.get(node.id) || { x: cx, y: cy };
    return {
      ...node,
      x: node.x !== 0 ? node.x : pos.x,
      y: node.y !== 0 ? node.y : pos.y,
      vx: 0,
      vy: 0,
    };
  });

  const nodeMap = new Map<string, SimNode>();
  simNodes.forEach((n) => nodeMap.set(n.id, n));

  const {
    repulsion: baseRepulse,
    spring: kSpring,
    gravity: kGravity,
    collisionForce,
    topicClusterSpring,
    rootRingSpring,
    rootAnchorSpring,
    topicRootMinDistanceScale,
    topicMemberMinDistanceScale,
    maxRepulsionDistance,
    maxVelocity: baseMaxVelocity,
  } = DEFAULT_LAYOUT_CONFIG.physics;
  const kRepulse = baseRepulse * spacingScale;
  const maxRepulseDist = maxRepulsionDistance * Math.max(0.8, spacingScale);
  const maxRepulseDistSq = maxRepulseDist * maxRepulseDist;
  const maxVelocity = baseMaxVelocity * spacingScale;
  const { minDistance, edgeLength } = DEFAULT_LAYOUT_CONFIG;

  const pairCount = (nodeCount * (nodeCount - 1)) / 2;
  const pairMinDist = new Float32Array(pairCount);
  let pairIdx = 0;
  for (let i = 0; i < nodeCount; i++) {
    const n1 = simNodes[i];
    const n1TopicRoots = topicClusters.rootsByNodeId.get(n1.id);
    const n1IsRoot = topicClusters.rootIds.has(n1.id);
    for (let j = i + 1; j < nodeCount; j++) {
      const n2 = simNodes[j];
      const hasClass = n1.role === 'CLASS' || n2.role === 'CLASS';
      const isLiteral = n1.role === 'LITERAL' || n2.role === 'LITERAL';
      const baseMinDist = hasClass
        ? minDistance.classNode
        : isLiteral
        ? minDistance.literalNode
        : minDistance.instanceNode;
      const n2TopicRoots = topicClusters.rootsByNodeId.get(n2.id);
      const sameTopicCluster = sharesTopicRoot(n1TopicRoots, n2TopicRoots);
      const hasTopicRoot = n1IsRoot || topicClusters.rootIds.has(n2.id);
      const localDistanceScale = sameTopicCluster
        ? hasTopicRoot
          ? topicRootMinDistanceScale
          : topicMemberMinDistanceScale
        : 1;
      pairMinDist[pairIdx++] = baseMinDist * spacingScale * localDistanceScale;
    }
  }

  const precomputedEdges: PrecomputedEdge[] = [];
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    let baseTargetLen = edgeLength.defaultEdge;
    if (edge.type === 'DATATYPE_PROPERTY') {
      baseTargetLen = edgeLength.datatypeProperty;
    } else if (edge.type === 'INSTANCE_OF') {
      baseTargetLen = edgeLength.instanceOf;
    } else if (edge.type === 'SUBCLASS_OF') {
      baseTargetLen = edgeLength.subClassOf;
    } else if (edge.type === 'PART_OF') {
      baseTargetLen = edgeLength.partOf;
    } else if (edge.type === 'REFERENCES') {
      baseTargetLen = edgeLength.references;
    } else if (isInferredRelationType(edge.type)) {
      baseTargetLen = edgeLength.inferred;
    }
    precomputedEdges.push({
      source,
      target,
      targetLen: baseTargetLen * spacingScale,
    });
  }

  const rawPulls: { node: SimNode; root: SimNode; targetRadius: number }[] = [];
  const memberCountsByRoot = new Map<string, number>();

  for (const [nodeId, rootIds] of topicClusters.rootsByNodeId) {
    if (topicClusters.rootIds.has(nodeId)) continue;
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const baseRadius = node.role === 'CLASS' ? 125 : 155;
    const targetRadius = baseRadius * spacingScale;
    for (const rootId of rootIds) {
      const root = nodeMap.get(rootId);
      if (!root) continue;
      rawPulls.push({ node, root, targetRadius });
      memberCountsByRoot.set(rootId, (memberCountsByRoot.get(rootId) || 0) + 1);
    }
  }

  const precomputedTopicPulls: PrecomputedTopicPull[] = rawPulls.map((p) => {
    const count = memberCountsByRoot.get(p.root.id) || 1;
    // 다수의 문단이 한 루트를 당길 때 루트가 외곽으로 튕겨 나가는 현상을 막기 위해 반작용 스케일링
    const rootReactionScale = Math.min(0.25, 0.4 / Math.sqrt(count));
    return {
      ...p,
      rootReactionScale,
    };
  });

  const precomputedRootPulls: PrecomputedRootPull[] = [];
  for (const [nodeId, hop] of classRootDistances.hopByNodeId) {
    if (hop === 0) continue;
    const node = nodeMap.get(nodeId);
    const root = nodeMap.get(classRootDistances.rootByNodeId.get(nodeId)!);
    if (!node || !root) continue;
    precomputedRootPulls.push({
      node,
      root,
      targetRadius:
        (DEFAULT_LAYOUT_CONFIG.physics.rootFirstRingRadius +
          (hop - 1) * DEFAULT_LAYOUT_CONFIG.physics.rootRingStep) *
        spacingScale,
    });
  }
  const precomputedRootAnchors = classRootDistances.rootIds.flatMap((rootId) => {
    const root = nodeMap.get(rootId);
    const position = existingPosMap.get(rootId);
    return root && position ? [{ root, ...position }] : [];
  });

  return {
    simNodes,
    pairMinDist,
    precomputedEdges,
    precomputedTopicPulls,
    precomputedRootPulls,
    precomputedRootAnchors,
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    topicClusterSpring,
    rootRingSpring,
    rootAnchorSpring,
    maxVelocity,
    nodeCount,
  };
};

/**
 * 프레임 단위 물리 시뮬레이션 1스텝 실행
 * @param context 시뮬레이션 상태 컨텍스트
 * @param alpha 쿨링 계수 (1.0 -> 0.05)
 * @returns 이번 스텝에서의 최대 노드 이동 거리 (수렴 감지용)
 */
export const stepForceSimulation = (context: ForceSimulationContext, alpha: number): number => {
  const {
    simNodes,
    pairMinDist,
    precomputedEdges,
    precomputedTopicPulls,
    precomputedRootPulls,
    precomputedRootAnchors,
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    topicClusterSpring,
    rootRingSpring,
    rootAnchorSpring,
    maxVelocity,
    nodeCount,
  } = context;

  if (nodeCount === 0) return 0;

  let pIdx = 0;
  for (let i = 0; i < nodeCount; i++) {
    const n1 = simNodes[i];
    const x1 = n1.x;
    const y1 = n1.y;
    let vx1 = n1.vx;
    let vy1 = n1.vy;

    for (let j = i + 1; j < nodeCount; j++) {
      const curIdx = pIdx++;
      const n2 = simNodes[j];
      let dx = x1 - n2.x;
      let dy = y1 - n2.y;
      let distSq = dx * dx + dy * dy;
      if (distSq > maxRepulseDistSq) continue;

      const minDist = pairMinDist[curIdx];
      if (distSq < 1) {
        const pseudoAngle = ((i * 31 + j * 17) % 628) / 100;
        dx = Math.cos(pseudoAngle) * 2;
        dy = Math.sin(pseudoAngle) * 2;
        distSq = dx * dx + dy * dy + 1;
      }

      const dist = Math.sqrt(distSq);
      const invDist = 1 / dist;
      let repulsion = kRepulse * (dist < 25 ? 0.04 : invDist);

      if (dist < minDist) {
        const overlap = (minDist - dist) * collisionForce;
        const ox = dx * invDist * overlap;
        const oy = dy * invDist * overlap;
        vx1 += ox;
        vy1 += oy;
        n2.vx -= ox;
        n2.vy -= oy;
        repulsion += (minDist - dist) * 0.3;
      }

      const fx = dx * invDist * repulsion;
      const fy = dy * invDist * repulsion;

      vx1 += fx;
      vy1 += fy;
      n2.vx -= fx;
      n2.vy -= fy;
    }

    n1.vx = vx1;
    n1.vy = vy1;
  }

  for (let eIdx = 0; eIdx < precomputedEdges.length; eIdx++) {
    const { source, target, targetLen } = precomputedEdges[eIdx];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const invDist = 1 / dist;

    const displacement = dist - targetLen;
    const force = displacement * kSpring;
    const fx = dx * invDist * force;
    const fy = dy * invDist * force;

    source.vx += fx;
    source.vy += fy;
    target.vx -= fx;
    target.vy -= fy;
  }

  for (let tIdx = 0; tIdx < precomputedTopicPulls.length; tIdx++) {
    const { node, root, targetRadius, rootReactionScale } = precomputedTopicPulls[tIdx];
    const dx = root.x - node.x;
    const dy = root.y - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist <= targetRadius) continue;
    const invDist = 1 / dist;
    const force = (dist - targetRadius) * topicClusterSpring;
    const fx = dx * invDist * force;
    const fy = dy * invDist * force;
    node.vx += fx;
    node.vy += fy;
    root.vx -= fx * rootReactionScale;
    root.vy -= fy * rootReactionScale;
  }

  for (let rIdx = 0; rIdx < precomputedRootPulls.length; rIdx++) {
    const { node, root, targetRadius } = precomputedRootPulls[rIdx];
    const dx = node.x - root.x;
    const dy = node.y - root.y;
    const distance = Math.hypot(dx, dy) || 1;
    const invDist = 1 / distance;
    const force = (distance - targetRadius) * rootRingSpring;
    const fx = dx * invDist * force;
    const fy = dy * invDist * force;
    node.vx -= fx;
    node.vy -= fy;
    root.vx += fx * 0.06;
    root.vy += fy * 0.06;
  }
  for (let aIdx = 0; aIdx < precomputedRootAnchors.length; aIdx++) {
    const { root, x, y } = precomputedRootAnchors[aIdx];
    root.vx += (x - root.x) * rootAnchorSpring;
    root.vy += (y - root.y) * rootAnchorSpring;
  }

  let maxMovement = 0;
  for (let i = 0; i < nodeCount; i++) {
    const node = simNodes[i];
    const dx = cx - node.x;
    const dy = cy - node.y;
    node.vx += dx * kGravity;
    node.vy += dy * kGravity;

    const vel = Math.hypot(node.vx, node.vy);
    if (vel > maxVelocity) {
      node.vx = (node.vx / vel) * maxVelocity;
      node.vy = (node.vy / vel) * maxVelocity;
    }

    const moveX = node.vx * alpha;
    const moveY = node.vy * alpha;
    node.x += moveX;
    node.y += moveY;

    const movement = Math.hypot(moveX, moveY);
    if (movement > maxMovement) {
      maxMovement = movement;
    }

    node.vx *= 0.72;
    node.vy *= 0.72;
  }

  return maxMovement;
};
