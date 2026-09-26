'use dom';

import React, { useEffect, useRef, useState, useCallback } from 'react';

import { OntologyEdge, OntologyNode } from '../types';
import {
  CanvasRenderOptions,
  findNodeAtScreenCoord,
  renderOntologyCanvas,
} from '../utils/canvasRenderer';
import {
  ForceSimulationContext,
  initForceSimulation,
  stepForceSimulation,
} from '../utils/forceLayout';
import { OntologyRelationLabelMode } from '../utils/relations';

export interface OntologyCanvasViewProps {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  selectedNodeId: string | null;
  focusedNodeIds?: Set<string> | string[] | null;
  violatingNodeIds?: Set<string> | string[];
  virtualNoteEligibles?: Set<string> | string[];
  isDark: boolean;
  labelMode: OntologyRelationLabelMode;
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
  labelMode,
  spacingScale = 1.0,
  zoomAction,
  onViewportChange,
  onNodeSelect,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const viewportRef = useRef({ panX: 400, panY: 300, zoom: 0.8 });
  const hoveredNodeIdRef = useRef<string | null>(null);

  const simContextRef = useRef<ForceSimulationContext | null>(null);
  const simAlphaRef = useRef<number>(1.0);
  const isSimulatingRef = useRef<boolean>(true);
  const animFrameIdRef = useRef<number | null>(null);

  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const hasMovedRef = useRef<boolean>(false);
  const lastTouchDistRef = useRef<number | null>(null);

  const focusedSet = useRef<Set<string> | null>(null);
  focusedSet.current = focusedNodeIds
    ? focusedNodeIds instanceof Set
      ? focusedNodeIds
      : new Set(focusedNodeIds)
    : null;

  const violatingSet = useRef<Set<string>>(new Set());
  violatingSet.current = violatingNodeIds
    ? violatingNodeIds instanceof Set
      ? violatingNodeIds
      : new Set(violatingNodeIds)
    : new Set();

  const virtualEligibleSet = useRef<Set<string>>(new Set());
  virtualEligibleSet.current = virtualNoteEligibles
    ? virtualNoteEligibles instanceof Set
      ? virtualNoteEligibles
      : new Set(virtualNoteEligibles)
    : new Set();

  const nodeMapRef = useRef<Map<string, OntologyNode>>(new Map());

  const notifyViewport = useCallback(() => {
    onViewportChange?.({ ...viewportRef.current });
  }, [onViewportChange]);

  const drawFrameRef = useRef<() => void>(() => {});

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return;
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
      labelMode,
    };

    renderOntologyCanvas(ctx, currentNodes, edges, nodeMapRef.current, options);
  }, [dimensions, edges, isDark, labelMode, nodes, selectedNodeId]);

  drawFrameRef.current = drawFrame;

  const runAnimationLoop = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
    }

    const step = () => {
      let needsNextFrame = false;

      if (isSimulatingRef.current && simContextRef.current) {
        const maxMove = stepForceSimulation(simContextRef.current, simAlphaRef.current);
        simAlphaRef.current *= 0.982;

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

  const applyFitToScreen = useCallback(() => {
    const currentNodes = simContextRef.current ? simContextRef.current.simNodes : nodes;
    if (currentNodes.length === 0 || dimensions.width === 0 || dimensions.height === 0) return;

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, Math.round(rect.width || window.innerWidth || 800));
      const h = Math.max(300, Math.round(rect.height || window.innerHeight || 600));
      setDimensions((current) =>
        current.width === w && current.height === h ? current : { width: w, height: h }
      );

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
        if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
        if (canvas.style.width !== `${w}px`) canvas.style.width = `${w}px`;
        if (canvas.style.height !== `${h}px`) canvas.style.height = `${h}px`;
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

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;
    if (nodes.length === 0) {
      simContextRef.current = null;
      nodeMapRef.current.clear();
      isSimulatingRef.current = false;
      drawFrameRef.current();
      return;
    }

    const previousPositions = new Map<string, { x: number; y: number }>();
    if (simContextRef.current) {
      for (const n of simContextRef.current.simNodes) {
        if (n.x !== 0 || n.y !== 0) {
          previousPositions.set(n.id, { x: n.x, y: n.y });
        }
      }
    }

    const seededNodes =
      previousPositions.size > 0
        ? nodes.map((node) => {
            const prev = previousPositions.get(node.id);
            return prev && node.x === 0 && node.y === 0 ? { ...node, x: prev.x, y: prev.y } : node;
          })
        : nodes;

    const context = initForceSimulation(seededNodes, edges, {
      width: dimensions.width,
      height: dimensions.height,
      spacingScale,
      centerOrigin: false,
    });
    simContextRef.current = context;

    const map = new Map<string, OntologyNode>();
    context.simNodes.forEach((n) => map.set(n.id, n));
    nodeMapRef.current = map;

    if (previousPositions.size === 0) {
      applyFitToScreen();
    }

    simAlphaRef.current = previousPositions.size > 0 ? 0.4 : 1.0;
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

  const zoomAt = useCallback(
    (factor: number, x: number, y: number, drawDuringSimulation = false) => {
      const { zoom, panX, panY } = viewportRef.current;
      const nextZoom = Math.min(3.5, Math.max(0.01, zoom * factor));
      const ratio = nextZoom / zoom;
      viewportRef.current = {
        zoom: nextZoom,
        panX: x - (x - panX) * ratio,
        panY: y - (y - panY) * ratio,
      };
      notifyViewport();
      if (drawDuringSimulation || !isSimulatingRef.current) drawFrame();
    },
    [drawFrame, notifyViewport]
  );

  const prevTriggerRef = useRef<number>(0);
  useEffect(() => {
    if (!zoomAction || zoomAction.trigger === prevTriggerRef.current) return;
    prevTriggerRef.current = zoomAction.trigger;

    if (zoomAction.type === 'fit') {
      applyFitToScreen();
    } else {
      zoomAt(
        zoomAction.type === 'in' ? 1.2 : 0.83,
        dimensions.width / 2,
        dimensions.height / 2,
        true
      );
    }
  }, [applyFitToScreen, dimensions.height, dimensions.width, zoomAction, zoomAt]);

  useEffect(() => {
    if (!isSimulatingRef.current) {
      drawFrame();
    }
  }, [drawFrame, isDark, selectedNodeId, focusedNodeIds, violatingNodeIds, virtualNoteEligibles]);

  const findNodeAtClient = (clientX: number, clientY: number, rect: DOMRect) =>
    findNodeAtScreenCoord(
      simContextRef.current?.simNodes || nodes,
      clientX - rect.left,
      clientY - rect.top,
      viewportRef.current.panX,
      viewportRef.current.panY,
      viewportRef.current.zoom
    );

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
      const hoveredNode = findNodeAtClient(clientX, clientY, rect);

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

  const handlePointerUp = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (!hasMovedRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clickedNode = findNodeAtClient(clientX, clientY, rect);

      if (clickedNode) {
        onNodeSelect?.(clickedNode);
      } else {
        onNodeSelect?.(null);
      }
    }
  };

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseScreenX = event.clientX - rect.left;
      const mouseScreenY = event.clientY - rect.top;

      zoomAt(event.deltaY < 0 ? 1.12 : 0.89, mouseScreenX, mouseScreenY);
    },
    [zoomAt]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      handlePointerDown(t.clientX, t.clientY);
      lastTouchDistRef.current = null;
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      lastTouchDistRef.current = dist;
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
      zoomAt(zoomFactor, pinchCenterX, pinchCenterY);

      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) {
      if (e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        handlePointerUp(t.clientX, t.clientY);
      }
      lastTouchDistRef.current = null;
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
