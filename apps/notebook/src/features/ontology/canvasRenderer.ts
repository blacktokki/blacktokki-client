import { isInferredRelationType } from './relations';
import { OntologyEdge, OntologyNode } from './types';

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
 * 가상 월드 좌표(World Coord)를 화면 좌표(Screen Coord)로 변환
 */
export const worldToScreen = (
  worldX: number,
  worldY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } => {
  return {
    x: worldX * zoom + panX,
    y: worldY * zoom + panY,
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

  // 상위에 그려진 노드부터 감지하기 위해 역순 탐색
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const isLiteral = node.type === 'LITERAL' || node.role === 'LITERAL';
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

  // 타깃 노드의 테두리 지점
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

  // 뷰포트 컬링 경계 (화면 영역 + 패딩)
  const pad = 60;
  const minX = -panX / zoom - pad;
  const maxX = (width - panX) / zoom + pad;
  const minY = -panY / zoom - pad;
  const maxY = (height - panY) / zoom + pad;

  const isZoomedOut = zoom < 0.42;
  const activeFocusId = selectedNodeId || hoveredNodeId;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    // 뷰포트 컬링: 양 끝 노드가 모두 화면 밖이면 중심부를 가로지르는 불필요한 선이므로 스킵
    const sourceIn = source.x >= minX && source.x <= maxX && source.y >= minY && source.y <= maxY;
    const targetIn = target.x >= minX && target.x <= maxX && target.y >= minY && target.y <= maxY;
    if (!sourceIn && !targetIn) continue;

    const isConnectedToActive = activeFocusId
      ? edge.source === activeFocusId || edge.target === activeFocusId
      : false;

    // 포커스/선택 상태 여부 및 외부 연결 여부에 따른 투명도 및 두께 조정
    let opacity: number;
    let strokeWidth: number;

    const isWithinFocus = focusedNodeIds
      ? focusedNodeIds.has(edge.source) && focusedNodeIds.has(edge.target)
      : false;

    if (activeFocusId) {
      if (isConnectedToActive || edge.isAxiomViolation) {
        opacity = 0.95;
        strokeWidth = edge.isAxiomViolation ? 2.5 : 2.2;
      } else if (isWithinFocus) {
        opacity = isDark ? 0.85 : 0.8;
        strokeWidth = 1.8;
      } else {
        opacity = 0.04;
        strokeWidth = 0.7;
      }
    } else if (focusedNodeIds) {
      if (isWithinFocus || edge.isAxiomViolation) {
        opacity = isDark ? 0.85 : 0.8;
        strokeWidth = edge.isAxiomViolation ? 2.5 : 1.8;
      } else {
        opacity = 0.04;
        strokeWidth = 0.7;
      }
    } else {
      // 기본 전체 뷰 상태:
      // 화면 내부 엣지는 적절한 가독성으로 표시하고, 외부로 나가는 엣지는 아주 연하게 처리
      if (sourceIn && targetIn) {
        opacity = isDark ? 0.38 : 0.3;
        strokeWidth = edge.type === 'REFERENCES' ? 1.4 : 1.1;
      } else {
        opacity = isDark ? 0.12 : 0.09;
        strokeWidth = 0.8;
      }
      if (edge.isAxiomViolation) {
        opacity = 0.95;
        strokeWidth = 2.2;
      }
    }

    const isDatatype = edge.type === 'DATATYPE_PROPERTY';
    const isInferred = isInferredRelationType(edge.type);

    const strokeColor = edge.isAxiomViolation
      ? '#E74C3C'
      : edge.type === 'REFERENCES'
      ? isDark
        ? '#5DADE2'
        : '#2874A6'
      : isInferred
      ? '#9B59B6'
      : isDatatype
      ? isDark
        ? '#48C78E'
        : '#16A085'
      : edge.color || (isDark ? '#7F8C8D' : '#BDC3C7');

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    if (edge.isAxiomViolation) {
      ctx.setLineDash([6, 3]);
    } else if (edge.dashed) {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }

    const curveOffset = edge.curveOffset || 0;
    let midX = (source.x + target.x) / 2;
    let midY = (source.y + target.y) / 2;
    let endX = target.x;
    let endY = target.y;

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);

    if (Math.abs(curveOffset) >= 1) {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy) || 1;
      const normX = -dy / dist;
      const normY = dx / dist;
      const cx = midX + normX * curveOffset;
      const cy = midY + normY * curveOffset;
      ctx.quadraticCurveTo(cx, cy, target.x, target.y);
      midX = midX * 0.5 + cx * 0.5;
      midY = midY * 0.5 + cy * 0.5;
      endX = cx;
      endY = cy;
    } else {
      ctx.lineTo(target.x, target.y);
    }
    ctx.stroke();

    // 화살표 렌더링: 선택/호버된 노드의 연결선, 위반선, 또는 화면 내부 엣지일 때만 표시
    const shouldRenderArrow =
      isConnectedToActive || edge.isAxiomViolation || (sourceIn && targetIn && !isZoomedOut);

    if (shouldRenderArrow) {
      const targetRadius =
        target.type === 'LITERAL' || target.role === 'LITERAL'
          ? Math.max(target.width || 50, 24) / 2
          : target.radius;
      drawArrowHead(ctx, endX, endY, target.x, target.y, targetRadius, strokeColor);
    }

    // 엣지 프로퍼티 라벨 렌더링:
    // 1. 공리 위반 엣지이거나,
    // 2. 현재 선택/호버된 노드와 직접 연결된 엣지일 때만 라벨 렌더링!
    // (기본 상태에서 수백 개 엣지 라벨이 화면을 덮는 현상 원천 차단)
    const propLabel = edge.propertyLabel || edge.label;
    const shouldRenderLabel = Boolean(propLabel) && (edge.isAxiomViolation || isConnectedToActive);

    if (shouldRenderLabel && propLabel) {
      ctx.setLineDash([]);
      const labelText = propLabel.length > 18 ? propLabel.slice(0, 17) + '…' : propLabel;
      const textWidth = Math.max(30, labelText.length * 5.6 + 10);
      const boxHeight = 13;

      const boxFill = edge.isAxiomViolation
        ? isDark
          ? '#4A151B'
          : '#FADBD8'
        : isInferred
        ? isDark
          ? '#2E1A47'
          : '#F5EEF8'
        : isDatatype
        ? isDark
          ? '#14382A'
          : '#E8F8F5'
        : isDark
        ? '#1F2937'
        : '#FFFFFF';

      const boxBorder = edge.isAxiomViolation
        ? '#E74C3C'
        : isInferred
        ? '#9B59B6'
        : isDatatype
        ? isDark
          ? '#48C78E'
          : '#16A085'
        : isDark
        ? '#4B5563'
        : '#CBD5E1';

      const propTextColor = edge.isAxiomViolation
        ? '#E74C3C'
        : isInferred
        ? '#9B59B6'
        : isDatatype
        ? isDark
          ? '#48C78E'
          : '#16A085'
        : isDark
        ? '#D1D5DB'
        : '#475569';

      ctx.fillStyle = boxFill;
      ctx.strokeStyle = boxBorder;
      ctx.lineWidth = 0.8;
      drawRoundedRect(ctx, midX - textWidth / 2, midY - boxHeight / 2, textWidth, boxHeight, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = propTextColor;
      ctx.font = '600 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, midX, midY + 0.5);
    }

    ctx.restore();
  }
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

  // 뷰포트 컬링 경계
  const pad = 100;
  const minX = -panX / zoom - pad;
  const maxX = (width - panX) / zoom + pad;
  const minY = -panY / zoom - pad;
  const maxY = (height - panY) / zoom + pad;

  const hideLabelsByZoom = zoom < 0.22;

  const labelBg = isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)';
  const labelBorder = isDark ? '#4B5563' : '#CBD5E1';
  const labelColor = isDark ? '#F3F4F6' : '#1F2937';

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    // 뷰포트 컬링
    if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY) {
      continue;
    }

    const isSelected = selectedNodeId === node.id;
    const isHovered = hoveredNodeId === node.id;
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const isViolating = violatingNodeIds.has(node.id);
    const isVirtualEligible = Boolean(virtualNoteEligibleSet?.has(node.id));

    const opacity = isFocused ? 1 : 0.12;
    const isLiteral = node.type === 'LITERAL' || node.role === 'LITERAL';

    ctx.save();
    ctx.globalAlpha = opacity;

    // 1. 선택 링 (Selected Ring + Glow)
    if (isSelected) {
      ctx.strokeStyle = '#F39C12';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([]);
      if (isLiteral) {
        const w = (node.width || 50) + 8;
        const h = (node.height || 20) + 8;
        drawRoundedRect(ctx, node.x - w / 2, node.y - h / 2, w, h, 5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 2. 호버 링 (Hover Ring)
    if (isHovered && !isSelected) {
      ctx.strokeStyle = isDark ? '#90CDF4' : '#3182CE';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([]);
      if (isLiteral) {
        const w = (node.width || 50) + 6;
        const h = (node.height || 20) + 6;
        drawRoundedRect(ctx, node.x - w / 2, node.y - h / 2, w, h, 4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 3. 공리 위반 링 (Axiom Violation Ring)
    if (isViolating && !isSelected) {
      ctx.strokeStyle = '#E74C3C';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. 가상 노트 대상 링 (Virtual Note Ring)
    if (isVirtualEligible && !isSelected && !isViolating) {
      ctx.strokeStyle = isDark ? '#F18BB8' : '#AD3D76';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 3.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. 노드 메인 도형 렌더링 (VOWL 규격)
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

      // 리터럴 내부 텍스트
      if (!hideLabelsByZoom || isSelected || isHovered) {
        const text = node.name.length > 12 ? node.name.slice(0, 11) + '…' : node.name;
        ctx.fillStyle = isDark ? '#FFEAA7' : '#5D4037';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, node.x, node.y + 0.5);
      }
    } else if (node.role === 'CLASS') {
      // VOWL Class: 굵은 테두리 원형
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
      // VOWL Individual (Note): 이중 링 원형
      ctx.strokeStyle = isSelected
        ? '#F39C12'
        : node.strokeColor || (isDark ? '#48C78E' : '#27AE60');
      ctx.lineWidth = 1.2;

      // 외곽 링
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 2.5, 0, Math.PI * 2);
      ctx.stroke();

      // 내부 채움 원
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // VOWL Instance (Card/Paragraph): 단일 원형
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

    // 6. 노드 라벨 알약(Pill) 렌더링 (리터럴 외 엔티티)
    const shouldShowLabel =
      !isLiteral &&
      (!hideLabelsByZoom || isSelected || isHovered || isViolating || isVirtualEligible);

    if (shouldShowLabel) {
      const labelText = node.name.length > 16 ? node.name.slice(0, 15) + '…' : node.name;
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

    ctx.restore();
  }
};

/**
 * 온톨로지 지식그래프 Canvas 전체 프레임 드로잉
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
  // 전체 클리어
  ctx.clearRect(0, 0, width * dpr, height * dpr);

  // Retina 고해상도 DPI 스케일링
  ctx.scale(dpr, dpr);

  // 뷰포트 Pan 및 Zoom 변환
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // 엣지 드로잉
  drawEdges(ctx, edges, nodeMap, options);

  // 노드 드로잉
  drawNodes(ctx, nodes, options);

  ctx.restore();
};
