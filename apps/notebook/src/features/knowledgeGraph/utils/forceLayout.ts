import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';

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
    classClusterSpring: 0.008,
    classRootMinDistanceScale: 0.76,
    classMemberMinDistanceScale: 0.88,
    rootRingSpring: 0.026,
    ordinaryExternalReferenceSpringScale: 0.15,
    rootAnchorSpring: 0.018,
    externalClassAnchorSpring: 0.09,
    externalClassOffset: 185,
    externalClassMaxDrift: 70,
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
  clusterClassIds?: ReadonlySet<string>;
}

export interface ClassClusterIndex {
  rootIds: Set<string>;
  rootsByNodeId: Map<string, Set<string>>;
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
}

export interface PrecomputedClassPull {
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

export interface PrecomputedExternalClassAnchor {
  node: SimNode;
  root: SimNode;
  offsetX: number;
  offsetY: number;
  maxDrift: number;
}

export interface ForceSimulationContext {
  simNodes: SimNode[];
  pairMinDist: Float32Array;
  precomputedEdges: PrecomputedEdge[];
  precomputedClassPulls: PrecomputedClassPull[];
  precomputedRootPulls: PrecomputedRootPull[];
  precomputedRootAnchors: PrecomputedRootAnchor[];
  precomputedExternalClassAnchor: PrecomputedExternalClassAnchor | null;
  cx: number;
  cy: number;
  kRepulse: number;
  maxRepulseDistSq: number;
  kSpring: number;
  kGravity: number;
  collisionForce: number;
  classClusterSpring: number;
  rootRingSpring: number;
  rootAnchorSpring: number;
  externalClassAnchorSpring: number;
  maxVelocity: number;
  nodeCount: number;
}

const append = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
};

/**
 * Index selected classes and their directly classified instances by each root class.
 * Only asserted class/member edges participate so enabling inferred edges does not reshape clusters.
 */
export const buildClassClusterIndex = (
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  clusterClassIds: ReadonlySet<string> = new Set<string>()
): ClassClusterIndex => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const childIds = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const instancesByClass = new Map<string, string[]>();

  for (const edge of edges) {
    if (
      edge.type === 'SUBCLASS_OF' &&
      clusterClassIds.has(edge.source) &&
      clusterClassIds.has(edge.target)
    ) {
      childIds.add(edge.source);
      append(childrenByParent, edge.target, edge.source);
    } else if (
      edge.type === 'INSTANCE_OF' &&
      clusterClassIds.has(edge.target) &&
      nodeIds.has(edge.source)
    ) {
      append(instancesByClass, edge.target, edge.source);
    }
  }

  const rootIds = new Set([...clusterClassIds].filter((id) => !childIds.has(id)));

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

const sharesClassRoot = (
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
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[]
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
    append(fallbackNeighbors, edge.source, edge.target);
    append(fallbackNeighbors, edge.target, edge.source);
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
    const [rootId, best] = [...support].sort(
      ([leftId, left], [rightId, right]) =>
        right.count - left.count ||
        left.sourceHop - right.sourceHop ||
        (externalRootLoads.get(leftId) || 0) - (externalRootLoads.get(rightId) || 0) ||
        rootIds.indexOf(leftId) - rootIds.indexOf(rightId)
    )[0] || [undefined, undefined];
    if (!rootId || !best) continue;
    rootByNodeId.set(linkId, rootId);
    hopByNodeId.set(linkId, best.sourceHop + 1);
    externalRootLoads.set(rootId, (externalRootLoads.get(rootId) || 0) + 1);
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

  const classClusters = buildClassClusterIndex(nodes, edges, options.clusterClassIds);
  const classRootDistances = buildClassRootDistanceIndex(nodes, edges);
  const inputNodeById = new Map(nodes.map((node) => [node.id, node]));
  const noteRootId = classRootDistances.rootIds.find(
    (rootId) => inputNodeById.get(rootId)?.classKind === 'NOTE'
  );
  const boardRootIds = classRootDistances.rootIds.filter(
    (rootId) => inputNodeById.get(rootId)?.classKind === 'BOARD_CARD'
  );
  const boardRootIndex = new Map(boardRootIds.map((rootId, index) => [rootId, index]));
  const boardCenterX = cx + (noteRootId ? fieldWidth * 0.22 : 0);
  for (const rootId of classRootDistances.rootIds) {
    if (existingPosMap.has(rootId)) continue;
    if (rootId === noteRootId) {
      existingPosMap.set(rootId, {
        x: cx - (boardRootIds.length > 0 ? fieldWidth * 0.22 : 0),
        y: cy,
      });
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

  const externalClass = nodes.find(
    (node) => node.role === 'CLASS' && node.classKind === 'EXTERNAL_LINK'
  );
  const externalClassRootId = noteRootId || classRootDistances.rootIds[0];
  const externalClassRoot = externalClassRootId && existingPosMap.get(externalClassRootId);
  let externalClassOffset: { x: number; y: number } | null = null;
  if (externalClass && externalClassRoot) {
    const citedBoardRootIds = new Set(
      nodes
        .filter(
          (node) =>
            node.instanceKind === 'EXTERNAL_LINK' || node.instanceKind === 'CONNECTED_EXTERNAL_LINK'
        )
        .map((node) => classRootDistances.rootByNodeId.get(node.id))
        .filter((rootId): rootId is string => Boolean(rootId && boardRootIndex.has(rootId)))
    );
    const citedBoardRoots = [...citedBoardRootIds].flatMap((rootId) => {
      const position = existingPosMap.get(rootId);
      return position ? [position] : [];
    });
    if (noteRootId && citedBoardRoots.length > 0) {
      const roots = [externalClassRoot, ...citedBoardRoots];
      const middleX =
        (Math.min(...roots.map((root) => root.x)) + Math.max(...roots.map((root) => root.x))) / 2;
      const middleY =
        (Math.min(...roots.map((root) => root.y)) + Math.max(...roots.map((root) => root.y))) / 2;
      externalClassOffset = {
        x: middleX - externalClassRoot.x,
        y: middleY - externalClassRoot.y,
      };
    } else {
      const towardCenterX = cx - externalClassRoot.x;
      const towardCenterY = cy - externalClassRoot.y;
      const centerDistance = Math.hypot(towardCenterX, towardCenterY);
      const offset = DEFAULT_LAYOUT_CONFIG.physics.externalClassOffset * spacingScale;
      externalClassOffset = {
        x: centerDistance > 1 ? (towardCenterX / centerDistance) * offset : offset,
        y: centerDistance > 1 ? (towardCenterY / centerDistance) * offset : 0,
      };
    }
    existingPosMap.set(externalClass.id, {
      x: externalClassRoot.x + externalClassOffset.x,
      y: externalClassRoot.y + externalClassOffset.y,
    });
  }

  const nodesByRootRing = new Map<string, KnowledgeGraphNode[]>();
  for (const node of nodes) {
    const rootId = classRootDistances.rootByNodeId.get(node.id);
    const hop = classRootDistances.hopByNodeId.get(node.id);
    if (!rootId || !hop || existingPosMap.has(node.id)) continue;
    const key = `${rootId}:${hop}`;
    append(nodesByRootRing, key, node);
  }
  for (const ring of nodesByRootRing.values()) {
    ring.sort((left, right) => left.id.localeCompare(right.id));
    const ordinaryLinks = ring.filter((node) => node.instanceKind === 'EXTERNAL_LINK');
    const ordinaryLinkIndex = new Map(ordinaryLinks.map((node, index) => [node.id, index]));
    ring.forEach((node, index) => {
      const rootId = classRootDistances.rootByNodeId.get(node.id)!;
      const hop = classRootDistances.hopByNodeId.get(node.id)!;
      const root = existingPosMap.get(rootId)!;
      if (node.instanceKind === 'EXTERNAL_LINK' && ordinaryLinks.length > 1) {
        const angle =
          ((ordinaryLinkIndex.get(node.id)! + 0.5) * 2 * Math.PI) / ordinaryLinks.length +
          hop * goldenAngle;
        const radius =
          (DEFAULT_LAYOUT_CONFIG.physics.rootFirstRingRadius +
            (hop - 1) * DEFAULT_LAYOUT_CONFIG.physics.rootRingStep) *
          spacingScale;
        existingPosMap.set(node.id, {
          x: root.x + Math.cos(angle) * radius,
          y: root.y + Math.sin(angle) * radius,
        });
        return;
      }
      const knownNeighborId = (neighborMap.get(node.id) || []).find(
        (neighborId) =>
          inputPositionIds.has(neighborId) &&
          classRootDistances.rootByNodeId.get(neighborId) === rootId
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

  const isAnchorNode = (node: KnowledgeGraphNode) =>
    node.role === 'CLASS' || classClusters.rootIds.has(node.id);

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
    const roots = classClusters.rootsByNodeId.get(node.id);
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
      x: node.id !== externalClass?.id && node.x !== 0 ? node.x : pos.x,
      y: node.id !== externalClass?.id && node.y !== 0 ? node.y : pos.y,
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
    classClusterSpring,
    rootRingSpring,
    rootAnchorSpring,
    externalClassAnchorSpring,
    classRootMinDistanceScale,
    classMemberMinDistanceScale,
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
    const n1ClassRoots = classClusters.rootsByNodeId.get(n1.id);
    const n1IsRoot = classClusters.rootIds.has(n1.id);
    for (let j = i + 1; j < nodeCount; j++) {
      const n2 = simNodes[j];
      const hasClass = n1.role === 'CLASS' || n2.role === 'CLASS';
      const isLiteral = n1.role === 'LITERAL' || n2.role === 'LITERAL';
      const baseMinDist = hasClass
        ? minDistance.classNode
        : isLiteral
        ? minDistance.literalNode
        : minDistance.instanceNode;
      const n2ClassRoots = classClusters.rootsByNodeId.get(n2.id);
      const sameClassCluster = sharesClassRoot(n1ClassRoots, n2ClassRoots);
      const hasClassRoot = n1IsRoot || classClusters.rootIds.has(n2.id);
      const localDistanceScale = sameClassCluster
        ? hasClassRoot
          ? classRootMinDistanceScale
          : classMemberMinDistanceScale
        : 1;
      pairMinDist[pairIdx++] = baseMinDist * spacingScale * localDistanceScale;
    }
  }

  const precomputedEdges: PrecomputedEdge[] = [];
  for (const edge of edges) {
    if (
      edge.type === 'INSTANCE_OF' &&
      inputNodeById.get(edge.target)?.classKind === 'EXTERNAL_LINK'
    ) {
      continue;
    }
    // Cross-class citations are drawn but do not pull their class groups together.
    if (
      (edge.type === 'REFERENCES' || edge.type === 'EXTERNAL_REFERENCE') &&
      classRootDistances.rootByNodeId.get(edge.source) !==
        classRootDistances.rootByNodeId.get(edge.target)
    ) {
      continue;
    }
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
    }
    precomputedEdges.push({
      source,
      target,
      targetLen: baseTargetLen * spacingScale,
      springScale:
        edge.type === 'EXTERNAL_REFERENCE' && target.instanceKind === 'EXTERNAL_LINK'
          ? DEFAULT_LAYOUT_CONFIG.physics.ordinaryExternalReferenceSpringScale
          : 1,
    });
  }

  const rawPulls: { node: SimNode; root: SimNode; targetRadius: number }[] = [];
  const memberCountsByRoot = new Map<string, number>();

  for (const [nodeId, rootIds] of classClusters.rootsByNodeId) {
    if (classClusters.rootIds.has(nodeId)) continue;
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

  const precomputedClassPulls: PrecomputedClassPull[] = rawPulls.map((p) => {
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
  const externalClassNode = externalClass && nodeMap.get(externalClass.id);
  const externalClassRootNode = externalClassRootId && nodeMap.get(externalClassRootId);
  const precomputedExternalClassAnchor =
    externalClassNode && externalClassRootNode && externalClassOffset
      ? {
          node: externalClassNode,
          root: externalClassRootNode,
          offsetX: externalClassOffset.x,
          offsetY: externalClassOffset.y,
          maxDrift: DEFAULT_LAYOUT_CONFIG.physics.externalClassMaxDrift * spacingScale,
        }
      : null;

  return {
    simNodes,
    pairMinDist,
    precomputedEdges,
    precomputedClassPulls,
    precomputedRootPulls,
    precomputedRootAnchors,
    precomputedExternalClassAnchor,
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    classClusterSpring,
    rootRingSpring,
    rootAnchorSpring,
    externalClassAnchorSpring,
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
    precomputedClassPulls,
    precomputedRootPulls,
    precomputedRootAnchors,
    precomputedExternalClassAnchor,
    cx,
    cy,
    kRepulse,
    maxRepulseDistSq,
    kSpring,
    kGravity,
    collisionForce,
    classClusterSpring,
    rootRingSpring,
    rootAnchorSpring,
    externalClassAnchorSpring,
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
    const { source, target, targetLen, springScale } = precomputedEdges[eIdx];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const invDist = 1 / dist;

    const displacement = dist - targetLen;
    const force = displacement * kSpring * springScale;
    const fx = dx * invDist * force;
    const fy = dy * invDist * force;

    source.vx += fx;
    source.vy += fy;
    target.vx -= fx;
    target.vy -= fy;
  }

  for (let tIdx = 0; tIdx < precomputedClassPulls.length; tIdx++) {
    const { node, root, targetRadius, rootReactionScale } = precomputedClassPulls[tIdx];
    const dx = root.x - node.x;
    const dy = root.y - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist <= targetRadius) continue;
    const invDist = 1 / dist;
    const force = (dist - targetRadius) * classClusterSpring;
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
  if (precomputedExternalClassAnchor) {
    const { node, root, offsetX, offsetY } = precomputedExternalClassAnchor;
    node.vx += (root.x + offsetX - node.x) * externalClassAnchorSpring;
    node.vy += (root.y + offsetY - node.y) * externalClassAnchorSpring;
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

  // Keep each assigned node inside its class root's nearest-root region.
  // Reference edges and collisions can otherwise move descendants across classes.
  if (precomputedRootAnchors.length > 1) {
    for (const { node, root } of precomputedRootPulls) {
      const offsetX = node.x - root.x;
      const offsetY = node.y - root.y;
      let scale = 1;
      for (const { root: otherRoot } of precomputedRootAnchors) {
        if (otherRoot === root) continue;
        const rootX = otherRoot.x - root.x;
        const rootY = otherRoot.y - root.y;
        const towardOtherRoot = 2 * (offsetX * rootX + offsetY * rootY);
        if (towardOtherRoot <= 0) continue;
        const limit = (rootX * rootX + rootY * rootY) / towardOtherRoot;
        scale = Math.min(scale, limit * 0.96);
      }
      if (scale >= 1) continue;
      const nextX = root.x + offsetX * scale;
      const nextY = root.y + offsetY * scale;
      maxMovement = Math.max(maxMovement, Math.hypot(nextX - node.x, nextY - node.y));
      node.x = nextX;
      node.y = nextY;
      node.vx *= 0.3;
      node.vy *= 0.3;
    }
  }

  if (precomputedExternalClassAnchor) {
    const { node, root, offsetX, offsetY, maxDrift } = precomputedExternalClassAnchor;
    const targetX = root.x + offsetX;
    const targetY = root.y + offsetY;
    const dx = node.x - targetX;
    const dy = node.y - targetY;
    const drift = Math.hypot(dx, dy);
    if (drift > maxDrift) {
      const nextX = targetX + (dx / drift) * maxDrift;
      const nextY = targetY + (dy / drift) * maxDrift;
      maxMovement = Math.max(maxMovement, Math.hypot(nextX - node.x, nextY - node.y));
      node.x = nextX;
      node.y = nextY;
      node.vx *= 0.3;
      node.vy *= 0.3;
    }
  }

  return maxMovement;
};
