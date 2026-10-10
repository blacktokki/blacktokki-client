import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';
import type { GraphTraversalAnimation } from './graphTraversal';

export interface CanvasRenderOptions {
  width: number;
  height: number;
  dpr: number;
  panX: number;
  panY: number;
  zoom: number;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  focusedNodeIds: Set<string> | null;
  violatingNodeIds: Set<string>;
  isDark: boolean;
  /** Reuse node sprites and bounded edge paths while a large layout is moving. */
  moving?: boolean;
}

/** Keep displayed coordinates moving between completed physics steps; model coordinates stay exact. */
export const advanceGraphPresentation = (
  displayed: KnowledgeGraphNode[],
  targets: KnowledgeGraphNode[],
  elapsedMs: number,
  settled: boolean
): boolean => {
  const fraction = settled ? 1 : -Math.expm1(-Math.max(0, Math.min(elapsedMs, 80)) / 40);
  let changed = false;
  for (let i = 0; i < displayed.length; i++) {
    const node = displayed[i];
    const target = targets[i];
    const x = settled ? target.x : node.x + (target.x - node.x) * fraction;
    const y = settled ? target.y : node.y + (target.y - node.y) * fraction;
    if (x !== node.x || y !== node.y) changed = true;
    node.x = x;
    node.y = y;
  }
  return changed;
};

/**
 * 화면 좌표(Screen Coord)를 가상 월드 좌표(World Coord)로 변환
 */
export const screenToWorld = (
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } => {
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
};

/** Center a node in the canvas area left visible above the preview sheet. */
export const centeredViewportForNode = (
  node: Pick<KnowledgeGraphNode, 'x' | 'y'>,
  width: number,
  height: number,
  zoom: number,
  reservedBottomHeight: number
): { panX: number; panY: number } => {
  const topInset = Math.min(56, height * 0.15);
  const bottomInset = Math.min(
    Math.max(0, reservedBottomHeight),
    Math.max(0, height - topInset - 80)
  );
  return {
    panX: width / 2 - node.x * zoom,
    panY: (topInset + height - bottomInset) / 2 - node.y * zoom,
  };
};

export interface SelectionCameraAnimation {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTime: number;
}

/** Keep an animated or settled camera aimed at a node whose layout position is changing. */
export const advanceSelectionCamera = (
  viewport: { panX: number; panY: number; zoom: number },
  animation: SelectionCameraAnimation | null,
  node: Pick<KnowledgeGraphNode, 'x' | 'y'> | null,
  size: { width: number; height: number; reservedBottomHeight: number },
  timestamp: number,
  followNode: boolean
): { panX: number; panY: number; animation: SelectionCameraAnimation | null } => {
  const target =
    followNode && node && size.width > 0 && size.height > 0
      ? centeredViewportForNode(
          node,
          size.width,
          size.height,
          viewport.zoom,
          size.reservedBottomHeight
        )
      : null;
  if (!animation) {
    return {
      panX: target?.panX ?? viewport.panX,
      panY: target?.panY ?? viewport.panY,
      animation: null,
    };
  }

  const endX = target?.panX ?? animation.endX;
  const endY = target?.panY ?? animation.endY;
  const progress = Math.min(1, Math.max(0, (timestamp - animation.startTime) / 240));
  const eased = 1 - (1 - progress) ** 3;
  return {
    panX: animation.startX + (endX - animation.startX) * eased,
    panY: animation.startY + (endY - animation.startY) * eased,
    animation: progress < 1 ? { ...animation, endX, endY } : null,
  };
};

/**
 * 마우스/터치 위치의 노드를 초고속 O(N)으로 탐색 (히트 테스팅)
 */
export const findNodeAtScreenCoord = (
  nodes: KnowledgeGraphNode[],
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): KnowledgeGraphNode | null => {
  const { x: worldX, y: worldY } = screenToWorld(screenX, screenY, panX, panY, zoom);

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const hitRadius = Math.max(node.radius + 8, 18);
    const dx = worldX - node.x;
    const dy = worldY - node.y;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return node;
    }
  }

  return null;
};

/**
 * 둥근 모서리 사각형 경로 헬퍼
 */
const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawNodeRing = (ctx: CanvasRenderingContext2D, node: KnowledgeGraphNode, padding: number) => {
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.radius + padding + 0.5, 0, Math.PI * 2);
  ctx.stroke();
};

/**
 * 타깃 노드 경계면에 정확히 부착되는 삼각형 화살표 드로잉
 */
const drawArrowHead = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  targetRadius: number,
  color: string
) => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;

  const ux = dx / dist;
  const uy = dy / dist;

  const tipX = toX - ux * targetRadius;
  const tipY = toY - uy * targetRadius;

  const arrowLen = 8;
  const arrowWidth = 5;

  const baseX = tipX - ux * arrowLen;
  const baseY = tipY - uy * arrowLen;

  const leftX = baseX - uy * arrowWidth;
  const leftY = baseY + ux * arrowWidth;
  const rightX = baseX + uy * arrowWidth;
  const rightY = baseY - ux * arrowWidth;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
};

/**
 * 엣지(관계선) 일괄 렌더링
 */
const overviewEdgeOrders = new WeakMap<KnowledgeGraphEdge[], Map<boolean, KnowledgeGraphEdge[]>>();
const getOverviewEdgeOrder = (edges: KnowledgeGraphEdge[], isDark: boolean) => {
  const cached = overviewEdgeOrders.get(edges)?.get(isDark);
  if (cached?.length === edges.length) return cached;
  const groups = new Map<string, KnowledgeGraphEdge[]>();
  for (const edge of edges) {
    const color =
      edge.type === 'REFERENCES'
        ? isDark
          ? '#5DADE2'
          : '#2874A6'
        : edge.color || (isDark ? '#7F8C8D' : '#BDC3C7');
    const key = `${color}:${Boolean(edge.dashed)}:${edge.type === 'REFERENCES'}`;
    const group = groups.get(key) || [];
    group.push(edge);
    groups.set(key, group);
  }
  const order = [...groups.values()].flat();
  const themes = overviewEdgeOrders.get(edges) || new Map();
  themes.set(isDark, order);
  overviewEdgeOrders.set(edges, themes);
  return order;
};

export const drawEdges = (
  ctx: CanvasRenderingContext2D,
  edges: KnowledgeGraphEdge[],
  nodeMap: Map<string, KnowledgeGraphNode>,
  options: CanvasRenderOptions
) => {
  const { zoom, selectedNodeId, hoveredNodeId, focusedNodeIds, isDark, width, height, panX, panY } =
    options;

  const pad = 60;
  const minX = -panX / zoom - pad;
  const maxX = (width - panX) / zoom + pad;
  const minY = -panY / zoom - pad;
  const maxY = (height - panY) / zoom + pad;

  const isZoomedOut = zoom < 0.42;
  const activeFocusId = selectedNodeId || hoveredNodeId;
  const drawOrder =
    (zoom < 0.22 || options.moving) && edges.length >= 1000
      ? getOverviewEdgeOrder(edges, isDark)
      : edges;

  ctx.save();

  let currentStrokeColor = '';
  let currentLineWidth = -1;
  let currentAlpha = -1;
  let currentDashed = false;
  let inPath = false;
  let pathSegments = 0;

  interface EdgeDecoration {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    targetRadius: number;
    strokeColor: string;
    propLabel?: string;
    labelGroup?: string;
    labelId?: string;
    labelOffsetY?: number;
    opacity: number;
  }
  const decorations: EdgeDecoration[] = [];

  for (let i = 0; i < drawOrder.length; i++) {
    const edge = drawOrder[i];
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const sourceIn = source.x >= minX && source.x <= maxX && source.y >= minY && source.y <= maxY;
    const targetIn = target.x >= minX && target.x <= maxX && target.y >= minY && target.y <= maxY;
    if (!sourceIn && !targetIn) continue;

    const isConnectedToActive = activeFocusId
      ? edge.source === activeFocusId || edge.target === activeFocusId
      : false;

    let opacity: number;
    let strokeWidth: number;

    const isWithinFocus = focusedNodeIds
      ? focusedNodeIds.has(edge.source) && focusedNodeIds.has(edge.target)
      : false;

    if (activeFocusId) {
      if (isConnectedToActive) {
        opacity = 0.95;
        strokeWidth = 2.2;
      } else if (isWithinFocus) {
        opacity = isDark ? 0.85 : 0.8;
        strokeWidth = 1.8;
      } else {
        opacity = 0.04;
        strokeWidth = 0.7;
      }
    } else if (focusedNodeIds) {
      if (isWithinFocus) {
        opacity = isDark ? 0.85 : 0.8;
        strokeWidth = 1.8;
      } else {
        opacity = 0.04;
        strokeWidth = 0.7;
      }
    } else {
      if (sourceIn && targetIn) {
        opacity = isDark ? 0.38 : 0.3;
        strokeWidth = edge.type === 'REFERENCES' ? 1.4 : 1.1;
      } else {
        opacity = isDark ? 0.12 : 0.09;
        strokeWidth = 0.8;
      }
    }

    const strokeColor =
      edge.type === 'REFERENCES'
        ? isDark
          ? '#5DADE2'
          : '#2874A6'
        : edge.color || (isDark ? '#7F8C8D' : '#BDC3C7');

    const dashed = Boolean(edge.dashed) && !options.moving;

    if (
      strokeColor !== currentStrokeColor ||
      strokeWidth !== currentLineWidth ||
      opacity !== currentAlpha ||
      dashed !== currentDashed
    ) {
      if (inPath) {
        ctx.stroke();
        inPath = false;
      }
      if (opacity !== currentAlpha) {
        ctx.globalAlpha = opacity;
        currentAlpha = opacity;
      }
      if (strokeColor !== currentStrokeColor) {
        ctx.strokeStyle = strokeColor;
        currentStrokeColor = strokeColor;
      }
      if (strokeWidth !== currentLineWidth) {
        ctx.lineWidth = strokeWidth;
        currentLineWidth = strokeWidth;
      }
      if (dashed !== currentDashed) {
        ctx.setLineDash(dashed ? [4, 4] : []);
        currentDashed = dashed;
      }
    }

    if (!inPath) {
      ctx.beginPath();
      inPath = true;
      pathSegments = 0;
    }
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    pathSegments++;
    if (options.moving && pathSegments >= 256) {
      ctx.stroke();
      inPath = false;
      pathSegments = 0;
    }

    const shouldRenderArrow =
      !options.moving && (isConnectedToActive || (sourceIn && targetIn && !isZoomedOut));
    const propLabel = edge.propertyLabel || edge.label;
    const shouldRenderLabel = !options.moving && Boolean(propLabel) && isConnectedToActive;

    if (shouldRenderArrow || shouldRenderLabel) {
      const targetRadius = target.radius;
      decorations.push({
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
        targetRadius,
        strokeColor,
        propLabel: shouldRenderLabel ? propLabel : undefined,
        labelGroup: shouldRenderLabel
          ? JSON.stringify(
              edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source]
            )
          : undefined,
        labelId: shouldRenderLabel ? edge.id : undefined,
        opacity,
      });
    }
  }

  if (inPath) {
    ctx.stroke();
  }

  if (decorations.length > 0) {
    const labelGroups = new Map<string, EdgeDecoration[]>();
    for (const decoration of decorations) {
      if (!decoration.labelGroup) continue;
      const group = labelGroups.get(decoration.labelGroup) || [];
      group.push(decoration);
      labelGroups.set(decoration.labelGroup, group);
    }
    for (const group of labelGroups.values()) {
      group.sort((a, b) => (a.labelId || '').localeCompare(b.labelId || ''));
      group.forEach((decoration, index) => {
        decoration.labelOffsetY = (index - (group.length - 1) / 2) * 18;
      });
    }

    if (currentDashed) {
      ctx.setLineDash([]);
    }
    for (let dIdx = 0; dIdx < decorations.length; dIdx++) {
      const d = decorations[dIdx];
      ctx.globalAlpha = d.opacity;
      drawArrowHead(ctx, d.sourceX, d.sourceY, d.targetX, d.targetY, d.targetRadius, d.strokeColor);

      if (d.propLabel) {
        const midX = (d.sourceX + d.targetX) / 2;
        const midY = (d.sourceY + d.targetY) / 2 + (d.labelOffsetY || 0);
        const labelText = d.propLabel;
        ctx.font = '600 8px sans-serif';
        const textWidth = Math.max(
          30,
          (typeof ctx.measureText === 'function'
            ? ctx.measureText(labelText).width
            : labelText.length * 7) + 10
        );
        const boxHeight = 13;

        const boxFill = isDark ? '#1F2937' : '#FFFFFF';
        const boxBorder = isDark ? '#4B5563' : '#CBD5E1';
        const propTextColor = isDark ? '#D1D5DB' : '#475569';

        ctx.fillStyle = boxFill;
        ctx.strokeStyle = boxBorder;
        ctx.lineWidth = 0.8;
        drawRoundedRect(ctx, midX - textWidth / 2, midY - boxHeight / 2, textWidth, boxHeight, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = propTextColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, midX, midY + 0.5);
      }
    }
  }

  ctx.restore();
};

const traversalSpriteCache = new WeakMap<
  CanvasRenderingContext2D,
  Map<boolean, HTMLCanvasElement>
>();
const MIN_TRAVERSAL_LENGTH_PX = 8;
const MIN_TRAVERSAL_HEIGHT_PX = 1;

/** Cache a glint with a sharp head that fades gradually towards the tail. */
const getTraversalSprite = (ctx: CanvasRenderingContext2D, isDark: boolean) => {
  const cached = traversalSpriteCache.get(ctx)?.get(isDark);
  if (cached) return cached;
  const canvas = ctx.canvas?.ownerDocument?.createElement('canvas');
  if (!canvas) return null;
  canvas.width = 32;
  canvas.height = 16;
  const spriteCtx = canvas.getContext('2d');
  if (!spriteCtx) return null;
  const violetRgb = isDark ? '196, 181, 253' : '151, 128, 188';
  const coreRgb = isDark ? '238, 242, 255' : '118, 133, 177';
  const blueRgb = isDark ? '165, 180, 252' : '116, 143, 191';
  const along = spriteCtx.createLinearGradient(0, 0, canvas.width, 0);
  along.addColorStop(0, `rgba(${violetRgb}, 0)`);
  along.addColorStop(0.35, `rgba(${violetRgb}, 0.2)`);
  along.addColorStop(0.7, `rgba(${blueRgb}, 0.6)`);
  along.addColorStop(0.9, `rgba(${coreRgb}, 1)`);
  along.addColorStop(1, `rgba(${coreRgb}, 1)`);
  spriteCtx.fillStyle = along;
  spriteCtx.fillRect(0, 0, canvas.width, canvas.height);
  const across = spriteCtx.createLinearGradient(0, 0, 0, canvas.height);
  across.addColorStop(0, 'rgba(255, 255, 255, 0)');
  across.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
  across.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  across.addColorStop(0.7, 'rgba(255, 255, 255, 0.6)');
  across.addColorStop(1, 'rgba(255, 255, 255, 0)');
  spriteCtx.globalCompositeOperation = 'destination-in';
  spriteCtx.fillStyle = across;
  spriteCtx.fillRect(0, 0, canvas.width, canvas.height);
  const sprites = traversalSpriteCache.get(ctx) || new Map<boolean, HTMLCanvasElement>();
  sprites.set(isDark, canvas);
  traversalSpriteCache.set(ctx, sprites);
  return canvas;
};

/** Draw short BFS glints using the same cached gradient image on every edge. */
export const drawGraphTraversal = (
  ctx: CanvasRenderingContext2D,
  animation: GraphTraversalAnimation,
  options: Pick<CanvasRenderOptions, 'zoom' | 'panX' | 'panY' | 'width' | 'height' | 'isDark'>
) => {
  if (animation.pauseUntilMs !== null || !animation.steps.length) return false;
  const { zoom, panX, panY, width, height, isDark } = options;
  const pad = 60;
  const minX = -panX / zoom - pad;
  const maxX = (width - panX) / zoom + pad;
  const minY = -panY / zoom - pad;
  const maxY = (height - panY) / zoom + pad;
  const sprite = getTraversalSprite(ctx, isDark);
  if (!sprite) return false;

  ctx.save();
  ctx.shadowBlur = 0;
  const visibilityBoost = 1 + Math.max(0, 1 - zoom) * 0.5;
  ctx.globalAlpha = (isDark ? 0.42 : 0.32) * visibilityBoost;
  let drewSegments = false;
  for (const { from, to, ux, uy, glintLength, along } of animation.steps) {
    if (!from || !to) continue;
    const fromIn = from.x >= minX && from.x <= maxX && from.y >= minY && from.y <= maxY;
    const toIn = to.x >= minX && to.x <= maxX && to.y >= minY && to.y <= maxY;
    if (!fromIn && !toIn) continue;

    // Expand the tail to the minimum screen size while keeping the head at its actual position.
    const length = Math.max(glintLength, MIN_TRAVERSAL_LENGTH_PX / zoom);
    const height = Math.max(Math.min(4, glintLength / 2), MIN_TRAVERSAL_HEIGHT_PX / zoom);
    ctx.save();
    ctx.transform(ux, uy, -uy, ux, from.x + ux * along, from.y + uy * along);
    ctx.drawImage(sprite, glintLength / 2 - length, -height / 2, length, height);
    ctx.restore();
    drewSegments = true;
  }
  ctx.restore();
  return drewSegments;
};

/**
 * 노드 일괄 렌더링
 */
interface OverviewNodeGroup {
  nodes: KnowledgeGraphNode[];
  fill: string;
  stroke: string;
  lineWidth: number;
  outerRing: boolean;
}
const overviewNodeGroups = new WeakMap<KnowledgeGraphNode[], Map<boolean, OverviewNodeGroup[]>>();
const getOverviewNodeGroups = (nodes: KnowledgeGraphNode[], isDark: boolean) => {
  const cached = overviewNodeGroups.get(nodes)?.get(isDark);
  if (cached && cached.reduce((count, group) => count + group.nodes.length, 0) === nodes.length)
    return cached;
  const groups = new Map<string, OverviewNodeGroup>();
  for (const node of nodes) {
    const outerRing = node.role !== 'CLASS' && node.instanceKind === 'NOTE';
    const lineWidth = node.role === 'CLASS' ? 2.2 : outerRing ? 1.2 : 1.4;
    const stroke =
      node.strokeColor ||
      (node.role === 'CLASS'
        ? isDark
          ? '#AACCFF'
          : '#5588CC'
        : outerRing
        ? isDark
          ? '#48C78E'
          : '#27AE60'
        : isDark
        ? '#70A1FF'
        : '#3060C0');
    const key = `${node.color}:${stroke}:${lineWidth}:${outerRing}`;
    let group = groups.get(key);
    if (!group) {
      group = { nodes: [], fill: node.color, stroke, lineWidth, outerRing };
      groups.set(key, group);
    }
    group.nodes.push(node);
  }
  const result = [...groups.values()];
  const themes = overviewNodeGroups.get(nodes) || new Map();
  themes.set(isDark, result);
  overviewNodeGroups.set(nodes, themes);
  return result;
};

const movingNodeSprites = new WeakMap<
  CanvasRenderingContext2D,
  {
    scale: number;
    nodes: KnowledgeGraphNode[];
    groups: Map<OverviewNodeGroup, Map<number, HTMLCanvasElement>>;
  }
>();

/** Rasterize each circle style once at the current pixel scale instead of rebuilding large paths. */
const drawMovingNodes = (
  ctx: CanvasRenderingContext2D,
  nodes: KnowledgeGraphNode[],
  options: CanvasRenderOptions,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): boolean => {
  const ownerDocument = ctx.canvas?.ownerDocument;
  if (!ownerDocument || typeof ctx.drawImage !== 'function') return false;
  const {
    zoom,
    dpr,
    panX,
    panY,
    isDark,
    selectedNodeId,
    hoveredNodeId,
    focusedNodeIds,
    violatingNodeIds,
  } = options;
  const scale = zoom * dpr;
  let cache = movingNodeSprites.get(ctx);
  if (!cache || cache.scale !== scale || cache.nodes !== nodes) {
    cache = { scale, nodes, groups: new Map() };
    movingNodeSprites.set(ctx, cache);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const group of getOverviewNodeGroups(nodes, isDark)) {
    ctx.fillStyle = group.fill;
    let sprites = cache.groups.get(group);
    if (!sprites) {
      sprites = new Map();
      cache.groups.set(group, sprites);
    }
    for (const node of group.nodes) {
      if (
        node.id === selectedNodeId ||
        node.id === hoveredNodeId ||
        violatingNodeIds.has(node.id) ||
        node.x < bounds.minX ||
        node.x > bounds.maxX ||
        node.y < bounds.minY ||
        node.y > bounds.maxY
      )
        continue;
      const opacity = !focusedNodeIds || focusedNodeIds.has(node.id) ? 1 : 0.12;
      const pixelX = (node.x * zoom + panX) * dpr;
      const pixelY = (node.y * zoom + panY) * dpr;
      if (node.role !== 'CLASS' && node.radius * scale < 0.75) {
        const extent = (node.radius + group.lineWidth / 2 + (group.outerRing ? 2.5 : 0)) * scale;
        ctx.globalAlpha = opacity * Math.min(1, Math.PI * extent * extent);
        ctx.fillRect(Math.floor(pixelX), Math.floor(pixelY), 1, 1);
        continue;
      }
      let sprite = sprites.get(node.radius);
      if (!sprite) {
        sprite = ownerDocument.createElement('canvas');
        const extent = node.radius + (group.outerRing ? 2.5 : 0) + group.lineWidth / 2;
        sprite.width = Math.ceil(extent * scale) * 2 + 4;
        sprite.height = sprite.width;
        const spriteCtx = sprite.getContext('2d');
        if (!spriteCtx) {
          ctx.restore();
          return false;
        }
        spriteCtx.translate(sprite.width / 2, sprite.height / 2);
        spriteCtx.scale(scale, scale);
        spriteCtx.fillStyle = group.fill;
        spriteCtx.strokeStyle = group.stroke;
        spriteCtx.lineWidth = group.lineWidth;
        if (group.outerRing) {
          spriteCtx.beginPath();
          spriteCtx.arc(0, 0, node.radius + 2.5, 0, Math.PI * 2);
          spriteCtx.stroke();
        }
        spriteCtx.beginPath();
        spriteCtx.arc(0, 0, node.radius, 0, Math.PI * 2);
        spriteCtx.fill();
        spriteCtx.stroke();
        sprites.set(node.radius, sprite);
      }
      ctx.globalAlpha = opacity;
      ctx.drawImage(
        sprite,
        Math.round(pixelX) - sprite.width / 2,
        Math.round(pixelY) - sprite.height / 2
      );
    }
  }
  ctx.restore();
  return true;
};

/** Batch overview circles by style; selected, hovered and warning nodes retain detailed drawing. */
const drawOverviewNodes = (
  ctx: CanvasRenderingContext2D,
  nodes: KnowledgeGraphNode[],
  options: CanvasRenderOptions,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
) => {
  const { selectedNodeId, hoveredNodeId, focusedNodeIds, violatingNodeIds, isDark } = options;
  ctx.save();
  ctx.setLineDash([]);
  for (const group of getOverviewNodeGroups(nodes, isDark)) {
    ctx.fillStyle = group.fill;
    ctx.strokeStyle = group.stroke;
    ctx.lineWidth = group.lineWidth;
    for (const focused of focusedNodeIds ? [true, false] : [true]) {
      ctx.globalAlpha = focused ? 1 : 0.12;
      const appendCircles = (padding: number) => {
        let count = 0;
        ctx.beginPath();
        for (const node of group.nodes) {
          if (
            node.id === selectedNodeId ||
            node.id === hoveredNodeId ||
            violatingNodeIds.has(node.id) ||
            node.x < bounds.minX ||
            node.x > bounds.maxX ||
            node.y < bounds.minY ||
            node.y > bounds.maxY ||
            (focusedNodeIds && focusedNodeIds.has(node.id) !== focused)
          )
            continue;
          const radius = node.radius + padding;
          ctx.moveTo(node.x + radius, node.y);
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          count++;
        }
        return count;
      };
      if (group.outerRing && appendCircles(2.5)) ctx.stroke();
      if (appendCircles(0)) {
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
};

export const drawNodes = (
  ctx: CanvasRenderingContext2D,
  nodes: KnowledgeGraphNode[],
  options: CanvasRenderOptions
) => {
  const {
    zoom,
    selectedNodeId,
    hoveredNodeId,
    focusedNodeIds,
    violatingNodeIds,
    isDark,
    width,
    height,
    panX,
    panY,
  } = options;

  const pad = 100;
  const minX = -panX / zoom - pad;
  const maxX = (width - panX) / zoom + pad;
  const minY = -panY / zoom - pad;
  const maxY = (height - panY) / zoom + pad;

  const hideLabelsByZoom = zoom < 0.22;

  const labelBg = isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)';
  const labelBorder = isDark ? '#4B5563' : '#CBD5E1';
  const labelColor = isDark ? '#F3F4F6' : '#1F2937';

  ctx.save();
  let currentAlpha = -1;

  const batchOverview = (hideLabelsByZoom || options.moving) && nodes.length >= 1000;
  if (batchOverview) {
    const bounds = { minX, maxX, minY, maxY };
    if (!options.moving || !drawMovingNodes(ctx, nodes, options, bounds))
      drawOverviewNodes(ctx, nodes, options, bounds);
  }
  const individualNodes = batchOverview
    ? nodes.filter(
        (node) =>
          node.id === selectedNodeId || node.id === hoveredNodeId || violatingNodeIds.has(node.id)
      )
    : nodes;

  for (let i = 0; i < individualNodes.length; i++) {
    const node = individualNodes[i];

    if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY) {
      continue;
    }

    const isSelected = selectedNodeId === node.id;
    const isHovered = hoveredNodeId === node.id;
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const isViolating = violatingNodeIds.has(node.id);

    const opacity = isFocused ? 1 : 0.12;

    if (opacity !== currentAlpha) {
      ctx.globalAlpha = opacity;
      currentAlpha = opacity;
    }

    let hasCustomDash = false;

    if (isSelected) {
      ctx.strokeStyle = '#F39C12';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([]);
      drawNodeRing(ctx, node, 4);
    }

    if (isHovered && !isSelected) {
      ctx.strokeStyle = isDark ? '#90CDF4' : '#3182CE';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([]);
      drawNodeRing(ctx, node, 3);
    }

    if (isViolating && !isSelected) {
      ctx.strokeStyle = '#E74C3C';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      hasCustomDash = true;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (hasCustomDash) {
      ctx.setLineDash([]);
    }

    if (node.role === 'CLASS') {
      ctx.fillStyle = node.color;
      ctx.strokeStyle = isSelected
        ? '#F39C12'
        : node.strokeColor || (isDark ? '#AACCFF' : '#5588CC');
      ctx.lineWidth = isSelected ? 2.8 : 2.2;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (node.instanceKind === 'NOTE') {
      ctx.strokeStyle = isSelected
        ? '#F39C12'
        : node.strokeColor || (isDark ? '#48C78E' : '#27AE60');
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 2.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = node.color;
      ctx.strokeStyle = isSelected
        ? '#F39C12'
        : node.strokeColor || (isDark ? '#70A1FF' : '#3060C0');
      ctx.lineWidth = isSelected ? 2.0 : 1.4;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const shouldShowLabel = !hideLabelsByZoom || isSelected || isHovered || isViolating;

    if (shouldShowLabel) {
      const displayName = node.name;
      const labelText =
        node.classKind !== 'NOTE' && displayName.length > 26
          ? displayName.slice(0, 25) + '…'
          : displayName;
      const fontSize = node.role === 'CLASS' ? 11.5 : 10;
      const pillWidth = Math.max(38, labelText.length * 6.8 + 14);
      const pillHeight = 16;
      const pillY = node.y + node.radius + 10;

      ctx.fillStyle = labelBg;
      ctx.strokeStyle = isViolating ? '#E74C3C' : isSelected ? '#F39C12' : labelBorder;
      ctx.lineWidth = isViolating ? 1.4 : isSelected ? 1.2 : 0.8;

      drawRoundedRect(
        ctx,
        node.x - pillWidth / 2,
        pillY - pillHeight / 2,
        pillWidth,
        pillHeight,
        4
      );
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = labelColor;
      ctx.font = `${node.role === 'CLASS' ? 'bold' : '600'} ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, node.x, pillY + 0.5);
    }
  }

  ctx.restore();
};

/**
 * 지식 그래프 Canvas 전체 프레임 드로잉
 */
export const renderKnowledgeGraphCanvas = (
  ctx: CanvasRenderingContext2D,
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  nodeMap: Map<string, KnowledgeGraphNode>,
  options: CanvasRenderOptions
) => {
  const { width, height, dpr, panX, panY, zoom } = options;

  ctx.save();
  ctx.clearRect(0, 0, width * dpr, height * dpr);

  ctx.scale(dpr, dpr);

  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  drawEdges(ctx, edges, nodeMap, options);

  drawNodes(ctx, nodes, options);

  ctx.restore();
};
