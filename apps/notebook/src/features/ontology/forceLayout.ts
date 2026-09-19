import { isInferredRelationType } from './relations';
import { OntologyEdge, OntologyNode } from './types';

/**
 * 온톨로지 그래프 물리 시뮬레이션 기본 파라미터
 */
export const DEFAULT_LAYOUT_CONFIG = {
  minDistance: {
    classNode: 170, // 클래스(Class) 노드 최소 안전거리
    instanceNode: 120, // 인스턴스(카드, 노트, 문단) 노드 간 최소 거리
    literalNode: 75, // 속성값(리터럴 사각형) 노드 간 최소 거리
  },
  edgeLength: {
    references: 190, // 문서 참조 관계 (references)
    inferred: 240, // 추론된 관계 (inferred)
    instanceOf: 150, // 인스턴스화 관계 (instanceOf)
    subClassOf: 150, // 상속 관계 (subClassOf)
    partOf: 160, // 귀속/포함 관계 (partOf, parentChild)
    datatypeProperty: 75, // 인스턴스 -> 속성값(리터럴) 관계
    defaultEdge: 160, // 기타 기본 엣지 길이
  },
  physics: {
    repulsion: 360, // 기본 물리 반발력
    spring: 0.018, // 엣지 탄성 스프링 계수
    gravity: 0.0006, // 중심 인력 계수 (대형 그래프 발산 방지)
    collisionForce: 0.75, // 충돌 반발 계수
    topicClusterSpring: 0.008, // 최상위 주제 클래스를 중심으로 한 군집 인력
    topicRootMinDistanceScale: 0.76, // 주제 루트 주변의 국소 충돌 거리 배율
    topicMemberMinDistanceScale: 0.88, // 같은 주제 군집 구성원 사이의 국소 충돌 거리 배율
    maxRepulsionDistance: 550, // 장거리 반발력 상한 거리
    maxVelocity: 40, // 노드당 최대 속도 상한
  },
  canvas: {
    nodeSpanMultiplier: 260,
    minLayoutSpan: 1500,
  },
};

export interface ForceSimulationOptions {
  width: number;
  height: number;
  iterations?: number;
  spacingScale?: number; // UI에서 실시간으로 조절하는 노드 간격 배율 (기본값: 1.0)
  centerOrigin?: boolean; // 중심점을 (0, 0)으로 고정할지 여부
}

export interface TopicClusterIndex {
  rootIds: Set<string>;
  rootsByNodeId: Map<string, Set<string>>;
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

export interface ForceSimulationContext {
  simNodes: SimNode[];
  nodeMap: Map<string, SimNode>;
  pairMinDist: Float32Array;
  precomputedEdges: PrecomputedEdge[];
  precomputedTopicPulls: PrecomputedTopicPull[];
  cx: number;
  cy: number;
  kRepulse: number;
  maxRepulseDistSq: number;
  kSpring: number;
  kGravity: number;
  collisionForce: number;
  topicClusterSpring: number;
  maxVelocity: number;
  nodeCount: number;
}

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
  const topicParentsByChild = new Map<string, Set<string>>();
  const topicChildrenByParent = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (
      edge.type !== 'SUBCLASS_OF' ||
      !topicClassIds.has(edge.source) ||
      !topicClassIds.has(edge.target)
    ) {
      continue;
    }
    const parents = topicParentsByChild.get(edge.source) || new Set<string>();
    parents.add(edge.target);
    topicParentsByChild.set(edge.source, parents);
    const children = topicChildrenByParent.get(edge.target) || new Set<string>();
    children.add(edge.source);
    topicChildrenByParent.set(edge.target, children);
  }

  const rootIds = new Set(
    [...topicClassIds].filter((classId) => !topicParentsByChild.has(classId))
  );
  const instancesByClass = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (
      edge.type !== 'INSTANCE_OF' ||
      !topicClassIds.has(edge.target) ||
      !nodeIds.has(edge.source)
    ) {
      continue;
    }
    const instances = instancesByClass.get(edge.target) || new Set<string>();
    instances.add(edge.source);
    instancesByClass.set(edge.target, instances);
  }

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
      for (const childId of topicChildrenByParent.get(classId) || []) {
        pending.push(childId);
      }
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

  // Build adjacency map to seed newly added nodes close to their connected neighbors
  const existingPosMap = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    if (node.x !== 0 || node.y !== 0) {
      existingPosMap.set(node.id, { x: node.x, y: node.y });
    }
  });

  const neighborMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    const listS = neighborMap.get(edge.source) || [];
    listS.push(edge.target);
    neighborMap.set(edge.source, listS);
    const listT = neighborMap.get(edge.target) || [];
    listT.push(edge.source);
    neighborMap.set(edge.target, listT);
  });

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const initialRadius = Math.min(fieldWidth, fieldHeight) * 0.38;

  const topicClusters = buildTopicClusterIndex(nodes, edges);

  // 1. 앵커 노드(주제 클래스 및 일반 클래스)와 멤버 노드(문단, 카드, 노트) 분리
  const isAnchorNode = (node: OntologyNode) =>
    node.role === 'CLASS' || topicClusters.rootIds.has(node.id);

  const anchorNodes = nodes.filter((n) => isAnchorNode(n) && !existingPosMap.has(n.id));
  const memberNodes = nodes.filter((n) => !isAnchorNode(n) && !existingPosMap.has(n.id));

  // 2. 앵커 노드(주제 클래스)를 필드 전역에 균등하게 분산 배치
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

  // 3. 멤버 노드(문단, 카드, 노트)를 자신이 속한 주제 클래스 또는 연결된 이웃 주변에 배치
  memberNodes.forEach((node, idx) => {
    // 1순위: 소속된 주제 클래스(Topic Root)의 위치 참조
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

    // 2순위: 연결된 이웃 노드의 위치 참조
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
      const hasClass = n1.type === 'CLASS' || n2.type === 'CLASS';
      const isLiteral = n1.type === 'LITERAL' || n2.type === 'LITERAL';
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
    } else if (edge.type === 'PART_OF' || edge.type === 'PARENT_CHILD') {
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

  return {
    simNodes,
    nodeMap,
    pairMinDist,
    precomputedEdges,
    precomputedTopicPulls,
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    topicClusterSpring,
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
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    topicClusterSpring,
    maxVelocity,
    nodeCount,
  } = context;

  if (nodeCount === 0) return 0;

  // 1. Repulsion & Collision avoidance between all node pairs
  let pIdx = 0;
  for (let i = 0; i < nodeCount; i++) {
    const n1 = simNodes[i];
    for (let j = i + 1; j < nodeCount; j++) {
      const n2 = simNodes[j];
      const minDist = pairMinDist[pIdx++];
      let dx = n1.x - n2.x;
      let dy = n1.y - n2.y;
      let distSq = dx * dx + dy * dy;
      if (distSq > maxRepulseDistSq) continue;
      if (distSq < 1) {
        const pseudoAngle = ((i * 31 + j * 17) % 628) / 100;
        dx = Math.cos(pseudoAngle) * 2;
        dy = Math.sin(pseudoAngle) * 2;
        distSq = dx * dx + dy * dy + 1;
      }

      const dist = Math.sqrt(distSq);
      let repulsion = kRepulse / Math.max(25, dist);

      if (dist < minDist) {
        const overlap = (minDist - dist) * collisionForce;
        n1.vx += (dx / dist) * overlap;
        n1.vy += (dy / dist) * overlap;
        n2.vx -= (dx / dist) * overlap;
        n2.vy -= (dy / dist) * overlap;
        repulsion += (minDist - dist) * 0.3;
      }

      const fx = (dx / dist) * repulsion;
      const fy = (dy / dist) * repulsion;

      n1.vx += fx;
      n1.vy += fy;
      n2.vx -= fx;
      n2.vy -= fy;
    }
  }

  // 2. Attraction along edges
  for (let eIdx = 0; eIdx < precomputedEdges.length; eIdx++) {
    const { source, target, targetLen } = precomputedEdges[eIdx];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const displacement = dist - targetLen;
    const force = displacement * kSpring;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    source.vx += fx;
    source.vy += fy;
    target.vx -= fx;
    target.vy -= fy;
  }

  // 3. Pull each topic member toward its top-level topic class
  for (let tIdx = 0; tIdx < precomputedTopicPulls.length; tIdx++) {
    const { node, root, targetRadius, rootReactionScale } = precomputedTopicPulls[tIdx];
    const dx = root.x - node.x;
    const dy = root.y - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist <= targetRadius) continue;
    const force = (dist - targetRadius) * topicClusterSpring;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    node.vx += fx;
    node.vy += fy;
    root.vx -= fx * rootReactionScale;
    root.vy -= fy * rootReactionScale;
  }

  // 4. Centering gravity & Damped motion
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

/**
 * 일괄 물리 시뮬레이션 계산 (동기식)
 */
export const computeForceLayout = (
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  options: ForceSimulationOptions
): OntologyNode[] => {
  if (nodes.length === 0) return [];
  const { iterations = 160 } = options;
  const nodeCount = nodes.length;

  const totalSteps = Math.min(
    iterations,
    Math.max(65, Math.round(150 - Math.min(nodeCount, 600) * 0.08))
  );

  const context = initForceSimulation(nodes, edges, options);

  const warmCount = nodes.filter((n) => n.x !== 0 || n.y !== 0).length;
  const isWarm = warmCount >= nodeCount * 0.7;
  const startAlpha = isWarm ? 0.45 : 1.0;

  for (let step = 0; step < totalSteps; step++) {
    const progress = step / totalSteps;
    const alpha = Math.max(0.05, startAlpha * (1 - progress));
    stepForceSimulation(context, alpha);
  }

  return context.simNodes;
};
