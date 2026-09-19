'use dom';

import React, { useEffect, useRef, useState, useCallback } from 'react';

import { CanvasRenderOptions, findNodeAtScreenCoord, renderOntologyCanvas } from './canvasRenderer';
import { ForceSimulationContext, initForceSimulation, stepForceSimulation } from './forceLayout';
import { OntologyEdge, OntologyNode } from './types';

export interface OntologyCanvasViewProps {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  selectedNodeId: string | null;
  focusedNodeIds?: string[] | null;
  violatingNodeIds?: string[];
  virtualNoteEligibles?: string[];
  isDark: boolean;
  spacingScale?: number;
  zoomAction?: { type: 'in' | 'out' | 'fit'; trigger: number } | null;
  onViewportChange?: (viewport: { zoom: number; panX: number; panY: number }) => void;
  onNodeSelect?: (node: OntologyNode | null) => void;
  style?: React.CSSProperties | any;
}

export const OntologyCanvasView: React.FC<OntologyCanvasViewProps> = ({
  nodes,
  edges,
  selectedNodeId,
  focusedNodeIds,
  violatingNodeIds,
  virtualNoteEligibles,
  isDark,
  spacingScale = 1.0,
  zoomAction,
  onViewportChange,
  onNodeSelect,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 뷰포트 상태
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const viewportRef = useRef({ panX: 400, panY: 300, zoom: 0.8 });
  const hoveredNodeIdRef = useRef<string | null>(null);

  // 시뮬레이션 상태
  const simContextRef = useRef<ForceSimulationContext | null>(null);
  const simAlphaRef = useRef<number>(1.0);
  const isSimulatingRef = useRef<boolean>(true);
  const animFrameIdRef = useRef<number | null>(null);

  // 인터랙션 추적
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const hasMovedRef = useRef<boolean>(false);
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null);

  // 직렬화 가능한 배열 props를 Set으로 캐싱
  const focusedSet = useRef<Set<string> | null>(null);
  focusedSet.current = focusedNodeIds ? new Set(focusedNodeIds) : null;

  const violatingSet = useRef<Set<string>>(new Set());
  violatingSet.current = new Set(violatingNodeIds || []);

  const virtualEligibleSet = useRef<Set<string>>(new Set());
  virtualEligibleSet.current = new Set(virtualNoteEligibles || []);

  // 노드 빠른 탐색용 Map
  const nodeMapRef = useRef<Map<string, OntologyNode>>(new Map());

  // 뷰포트 변경 알림 (외부 HUD 동기화)
  const notifyViewport = useCallback(() => {
    onViewportChange?.({ ...viewportRef.current });
  }, [onViewportChange]);

  // 캔버스 다시 그리기 (1프레임 렌더링)
  const drawFrameRef = useRef<() => void>(() => {});

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const { width, height } = dimensions;
    const { panX, panY, zoom } = viewportRef.current;

    const currentNodes = simContextRef.current ? simContextRef.current.simNodes : nodes;

    const options: CanvasRenderOptions = {
      width,
      height,
      dpr,
      panX,
      panY,
      zoom,
      selectedNodeId,
      hoveredNodeId: hoveredNodeIdRef.current,
      focusedNodeIds: focusedSet.current,
      violatingNodeIds: violatingSet.current,
      virtualNoteEligibleSet: virtualEligibleSet.current,
      isDark,
    };

    renderOntologyCanvas(ctx, currentNodes, edges, nodeMapRef.current, options);
  }, [dimensions, edges, isDark, nodes, selectedNodeId]);

  drawFrameRef.current = drawFrame;

  // 애니메이션 루프: 점진적 물리 시뮬레이션 및 렌더링
  const runAnimationLoop = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
    }

    const step = () => {
      let needsNextFrame = false;

      if (isSimulatingRef.current && simContextRef.current) {
        const maxMove = stepForceSimulation(simContextRef.current, simAlphaRef.current);
        simAlphaRef.current *= 0.982;

        // 노드 맵 갱신
        simContextRef.current.simNodes.forEach((n) => {
          nodeMapRef.current.set(n.id, n);
        });

        // 쿨링 종료 판정
        if (simAlphaRef.current < 0.005 || maxMove < 0.08) {
          isSimulatingRef.current = false;
        } else {
          needsNextFrame = true;
        }
      }

      drawFrameRef.current();

      if (needsNextFrame) {
        animFrameIdRef.current = requestAnimationFrame(step);
      } else {
        animFrameIdRef.current = null;
      }
    };

    animFrameIdRef.current = requestAnimationFrame(step);
  }, []);

  // 화면 크기에 맞게 피팅(Fit to screen)하는 헬퍼 함수
  const applyFitToScreen = useCallback(() => {
    const currentNodes = simContextRef.current ? simContextRef.current.simNodes : nodes;
    if (currentNodes.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of currentNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;
    const graphSpanX = Math.max(100, maxX - minX);
    const graphSpanY = Math.max(100, maxY - minY);

    const fitZoom = Math.min(
      1.3,
      Math.max(
        0.02,
        Math.min(dimensions.width / (graphSpanX + 160), dimensions.height / (graphSpanY + 160))
      )
    );

    viewportRef.current = {
      zoom: fitZoom,
      panX: dimensions.width / 2 - graphCenterX * fitZoom,
      panY: dimensions.height / 2 - graphCenterY * fitZoom,
    };
    notifyViewport();
    drawFrameRef.current();
  }, [dimensions.height, dimensions.width, nodes, notifyViewport]);

  // 컨테이너 크기 감지 및 초기화
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, rect.width || window.innerWidth || 800);
      const h = Math.max(300, rect.height || window.innerHeight || 600);
      setDimensions({ width: w, height: h });

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
    };

    updateSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', updateSize);
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // 물리 시뮬레이션 구조 변경 감지용 서명
  const prevSimSignatureRef = useRef<string>('');

  // 노드나 엣지 데이터가 변경되었을 때 물리 시뮬레이션 재초기화 (선택/스타일 변경 제외)
  useEffect(() => {
    if (nodes.length === 0) return;

    const nodeKey =
      nodes.length < 50
        ? nodes.map((n) => n.id).join(',')
        : `${nodes.length}:${nodes[0]?.id}:${nodes[nodes.length - 1]?.id}`;
    const simSignature = `${nodeKey}:${edges.length}:${spacingScale}:${dimensions.width}x${dimensions.height}`;

    if (prevSimSignatureRef.current === simSignature) {
      return;
    }
    prevSimSignatureRef.current = simSignature;

    const context = initForceSimulation(nodes, edges, {
      width: dimensions.width,
      height: dimensions.height,
      spacingScale,
      centerOrigin: false,
    });
    simContextRef.current = context;

    const map = new Map<string, OntologyNode>();
    context.simNodes.forEach((n) => map.set(n.id, n));
    nodeMapRef.current = map;

    applyFitToScreen();

    simAlphaRef.current = 1.0;
    isSimulatingRef.current = true;
    runAnimationLoop();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [
    applyFitToScreen,
    dimensions.height,
    dimensions.width,
    edges.length,
    nodes,
    runAnimationLoop,
    spacingScale,
  ]);

  // 노드 선택, 포커스, 하이라이트 등 시각적 옵션 변경 시 1회 정적 리드로우 (애니메이션/물리 재시작 없음)
  useEffect(() => {
    if (!isSimulatingRef.current) {
      drawFrame();
    }
  }, [drawFrame, selectedNodeId, isDark, focusedNodeIds, violatingNodeIds, virtualNoteEligibles]);

  // 외부 줌 액션 수신 처리 (상단 HUD 버튼 클릭 시)
  const prevTriggerRef = useRef<number>(0);
  useEffect(() => {
    if (!zoomAction || zoomAction.trigger === prevTriggerRef.current) return;
    prevTriggerRef.current = zoomAction.trigger;

    if (zoomAction.type === 'fit') {
      applyFitToScreen();
    } else {
      const factor = zoomAction.type === 'in' ? 1.2 : 0.83;
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      const currentZoom = viewportRef.current.zoom;
      const newZoom = Math.min(3.5, Math.max(0.01, currentZoom * factor));
      const ratio = newZoom / currentZoom;

      viewportRef.current = {
        zoom: newZoom,
        panX: cx - (cx - viewportRef.current.panX) * ratio,
        panY: cy - (cy - viewportRef.current.panY) * ratio,
      };
      notifyViewport();
      drawFrame();
    }
  }, [
    applyFitToScreen,
    dimensions.height,
    dimensions.width,
    drawFrame,
    notifyViewport,
    zoomAction,
  ]);

  // 테마, 선택 노드 등이 변경되면 정지 상태에서도 즉시 1프레임 렌더링
  useEffect(() => {
    if (!isSimulatingRef.current) {
      drawFrame();
    }
  }, [drawFrame, isDark, selectedNodeId, focusedNodeIds, violatingNodeIds, virtualNoteEligibles]);

  // ================= 마우스 및 터치 제스처 핸들러 =================

  // 포인터 다운 (마우스 좌클릭 또는 터치 시작)
  const handlePointerDown = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      panX: viewportRef.current.panX,
      panY: viewportRef.current.panY,
    };
  };

  // 포인터 이동 (Pan 및 Hover)
  const handlePointerMove = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (isDraggingRef.current) {
      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        hasMovedRef.current = true;
      }

      viewportRef.current.panX = dragStartRef.current.panX + dx;
      viewportRef.current.panY = dragStartRef.current.panY + dy;
      notifyViewport();

      if (!isSimulatingRef.current) {
        drawFrame();
      }
    } else {
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      const currentNodes = simContextRef.current ? simContextRef.current.simNodes : nodes;

      const hoveredNode = findNodeAtScreenCoord(
        currentNodes,
        screenX,
        screenY,
        viewportRef.current.panX,
        viewportRef.current.panY,
        viewportRef.current.zoom
      );

      const newHoveredId = hoveredNode ? hoveredNode.id : null;
      if (hoveredNodeIdRef.current !== newHoveredId) {
        hoveredNodeIdRef.current = newHoveredId;
        if (canvasRef.current) {
          canvasRef.current.style.cursor = hoveredNode ? 'pointer' : 'default';
        }
        if (!isSimulatingRef.current) {
          drawFrame();
        }
      }
    }
  };

  // 포인터 업 (클릭 또는 드래그 종료)
  const handlePointerUp = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (!hasMovedRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;

      const currentNodes = simContextRef.current ? simContextRef.current.simNodes : nodes;

      const clickedNode = findNodeAtScreenCoord(
        currentNodes,
        screenX,
        screenY,
        viewportRef.current.panX,
        viewportRef.current.panY,
        viewportRef.current.zoom
      );

      if (clickedNode) {
        onNodeSelect?.(clickedNode);
      } else {
        onNodeSelect?.(null);
      }
    }
  };

  // 마우스 휠 줌 (커서 위치 중심)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const currentZoom = viewportRef.current.zoom;
    const newZoom = Math.min(3.5, Math.max(0.01, currentZoom * zoomFactor));

    const panX = viewportRef.current.panX;
    const panY = viewportRef.current.panY;

    const newPanX = mouseScreenX - (mouseScreenX - panX) * (newZoom / currentZoom);
    const newPanY = mouseScreenY - (mouseScreenY - panY) * (newZoom / currentZoom);

    viewportRef.current = {
      zoom: newZoom,
      panX: newPanX,
      panY: newPanY,
    };
    notifyViewport();

    if (!isSimulatingRef.current) {
      drawFrame();
    }
  };

  // 터치 이벤트 핸들러 (모바일 네이티브 핀치 줌 & 팬 대응)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      handlePointerDown(t.clientX, t.clientY);
      lastTouchDistRef.current = null;
      lastTouchCenterRef.current = null;
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      lastTouchDistRef.current = dist;
      lastTouchCenterRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && !lastTouchDistRef.current) {
      const t = e.touches[0];
      handlePointerMove(t.clientX, t.clientY);
    } else if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pinchCenterX = center.x - rect.left;
      const pinchCenterY = center.y - rect.top;

      const zoomFactor = dist / lastTouchDistRef.current;
      const currentZoom = viewportRef.current.zoom;
      const newZoom = Math.min(3.5, Math.max(0.01, currentZoom * zoomFactor));

      const panX = viewportRef.current.panX;
      const panY = viewportRef.current.panY;

      const newPanX = pinchCenterX - (pinchCenterX - panX) * (newZoom / currentZoom);
      const newPanY = pinchCenterY - (pinchCenterY - panY) * (newZoom / currentZoom);

      viewportRef.current = {
        zoom: newZoom,
        panX: newPanX,
        panY: newPanY,
      };
      notifyViewport();

      lastTouchDistRef.current = dist;
      lastTouchCenterRef.current = center;

      if (!isSimulatingRef.current) {
        drawFrame();
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) {
      if (e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        handlePointerUp(t.clientX, t.clientY);
      }
      lastTouchDistRef.current = null;
      lastTouchCenterRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
        onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
        onMouseUp={(e) => handlePointerUp(e.clientX, e.clientY)}
        onMouseLeave={(e) => {
          hoveredNodeIdRef.current = null;
          handlePointerUp(e.clientX, e.clientY);
        }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
        }}
      />
    </div>
  );
};
