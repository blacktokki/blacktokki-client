import {
  getOntologyNodeDisplayLabel,
  isInferredRelationType,
  OntologyRelationLabelMode,
} from './relations';
import { OntologyEdge, OntologyNode } from '../types';

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
  virtualNoteEligibleSet?: Set<string>;
  isDark: boolean;
  labelMode: OntologyRelationLabelMode;
}

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

/**
 * 마우스/터치 위치의 노드를 초고속 O(N)으로 탐색 (히트 테스팅)
 */
export const findNodeAtScreenCoord = (
  nodes: OntologyNode[],
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): OntologyNode | null => {
  const { x: worldX, y: worldY } = screenToWorld(screenX, screenY, panX, panY, zoom);

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const isLiteral = node.role === 'LITERAL';
    if (isLiteral) {
      const halfW = (node.width || 50) / 2 + 6;
      const halfH = (node.height || 20) / 2 + 6;
      if (
        worldX >= node.x - halfW &&
        worldX <= node.x + halfW &&
        worldY >= node.y - halfH &&
        worldY <= node.y + halfH
      ) {
        return node;
      }
    } else {
      const hitRadius = Math.max(node.radius + 8, 18);
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
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

const drawNodeRing = (
  ctx: CanvasRenderingContext2D,
  node: OntologyNode,
  isLiteral: boolean,
  padding: number,
  cornerRadius: number
) => {
  if (isLiteral) {
    const width = (node.width || 50) + padding * 2;
    const height = (node.height || 20) + padding * 2;
    drawRoundedRect(ctx, node.x - width / 2, node.y - height / 2, width, height, cornerRadius);
  } else {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + padding + 0.5, 0, Math.PI * 2);
  }
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
export const drawEdges = (
  ctx: CanvasRenderingContext2D,
  edges: OntologyEdge[],
  nodeMap: Map<string, OntologyNode>,
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

  ctx.save();

  let currentStrokeColor = '';
  let currentLineWidth = -1;
  let currentAlpha = -1;
  let currentDashed = false;
  let inPath = false;

  interface EdgeDecoration {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    targetRadius: number;
    strokeColor: string;
    propLabel?: string;
    isInferred: boolean;
    isDatatype: boolean;
    accentColor?: string;
    opacity: number;
  }
  const decorations: EdgeDecoration[] = [];

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
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

    const isDatatype = edge.type === 'DATATYPE_PROPERTY';
    const isInferred = isInferredRelationType(edge.type);
    const accentColor = isInferred
      ? '#9B59B6'
      : isDatatype
      ? isDark
        ? '#48C78E'
        : '#16A085'
      : undefined;

    const strokeColor =
      edge.type === 'REFERENCES'
        ? isDark
          ? '#5DADE2'
          : '#2874A6'
        : accentColor || edge.color || (isDark ? '#7F8C8D' : '#BDC3C7');

    const dashed = Boolean(edge.dashed);

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
    }
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);

    const shouldRenderArrow = isConnectedToActive || (sourceIn && targetIn && !isZoomedOut);
    const propLabel = edge.propertyLabel || edge.label;
    const shouldRenderLabel = Boolean(propLabel) && isConnectedToActive;

    if (shouldRenderArrow || shouldRenderLabel) {
      const targetRadius =
        target.role === 'LITERAL' ? Math.max(target.width || 50, 24) / 2 : target.radius;
      decorations.push({
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
        targetRadius,
        strokeColor,
        propLabel: shouldRenderLabel ? propLabel : undefined,
        isInferred,
        isDatatype,
        accentColor,
        opacity,
      });
    }
  }

  if (inPath) {
    ctx.stroke();
  }

  if (decorations.length > 0) {
    if (currentDashed) {
      ctx.setLineDash([]);
    }
    for (let dIdx = 0; dIdx < decorations.length; dIdx++) {
      const d = decorations[dIdx];
      ctx.globalAlpha = d.opacity;
      drawArrowHead(ctx, d.sourceX, d.sourceY, d.targetX, d.targetY, d.targetRadius, d.strokeColor);

      if (d.propLabel) {
        const midX = (d.sourceX + d.targetX) / 2;
        const midY = (d.sourceY + d.targetY) / 2;
        const labelText = d.propLabel;
        ctx.font = '600 8px sans-serif';
        const textWidth = Math.max(
          30,
          (typeof ctx.measureText === 'function'
            ? ctx.measureText(labelText).width
            : labelText.length * 7) + 10
        );
        const boxHeight = 13;

        const boxFill = d.isInferred
          ? isDark
            ? '#2E1A47'
            : '#F5EEF8'
          : d.isDatatype
          ? isDark
            ? '#14382A'
            : '#E8F8F5'
          : isDark
          ? '#1F2937'
          : '#FFFFFF';

        const boxBorder = d.accentColor || (isDark ? '#4B5563' : '#CBD5E1');
        const propTextColor = d.accentColor || (isDark ? '#D1D5DB' : '#475569');

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

/**
 * 노드 일괄 렌더링
 */
export const drawNodes = (
  ctx: CanvasRenderingContext2D,
  nodes: OntologyNode[],
  options: CanvasRenderOptions
) => {
  const {
    zoom,
    selectedNodeId,
    hoveredNodeId,
    focusedNodeIds,
    violatingNodeIds,
    virtualNoteEligibleSet,
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

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY) {
      continue;
    }

    const isSelected = selectedNodeId === node.id;
    const isHovered = hoveredNodeId === node.id;
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const isViolating = violatingNodeIds.has(node.id);
    const isVirtualEligible = Boolean(virtualNoteEligibleSet?.has(node.id));

    const opacity = isFocused ? 1 : 0.12;
    const isLiteral = node.role === 'LITERAL';

    if (opacity !== currentAlpha) {
      ctx.globalAlpha = opacity;
      currentAlpha = opacity;
    }

    let hasCustomDash = false;

    if (isSelected) {
      ctx.strokeStyle = '#F39C12';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([]);
      drawNodeRing(ctx, node, isLiteral, 4, 5);
    }

    if (isHovered && !isSelected) {
      ctx.strokeStyle = isDark ? '#90CDF4' : '#3182CE';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([]);
      drawNodeRing(ctx, node, isLiteral, 3, 4);
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

    if (isVirtualEligible && !isSelected && !isViolating) {
      ctx.strokeStyle = isDark ? '#F18BB8' : '#AD3D76';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      hasCustomDash = true;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 3.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (hasCustomDash) {
      ctx.setLineDash([]);
    }

    if (isLiteral) {
      const w = node.width || 50;
      const h = node.height || 20;
      ctx.fillStyle = node.color;
      ctx.strokeStyle = isSelected
        ? '#F39C12'
        : node.strokeColor || (isDark ? '#FFD700' : '#D4AC0D');
      ctx.lineWidth = isSelected ? 2.0 : 1.2;

      drawRoundedRect(ctx, node.x - w / 2, node.y - h / 2, w, h, 3);
      ctx.fill();
      ctx.stroke();

      if (!hideLabelsByZoom || isSelected || isHovered) {
        const displayName = getOntologyNodeDisplayLabel(node, options.labelMode);
        const text = displayName.length > 18 ? displayName.slice(0, 17) + '…' : displayName;
        ctx.fillStyle = isDark ? '#FFEAA7' : '#5D4037';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, node.x, node.y + 0.5);
      }
    } else if (node.role === 'CLASS') {
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

    const shouldShowLabel =
      !isLiteral &&
      (!hideLabelsByZoom || isSelected || isHovered || isViolating || isVirtualEligible);

    if (shouldShowLabel) {
      const displayName = getOntologyNodeDisplayLabel(node, options.labelMode);
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
export const renderOntologyCanvas = (
  ctx: CanvasRenderingContext2D,
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  nodeMap: Map<string, OntologyNode>,
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
