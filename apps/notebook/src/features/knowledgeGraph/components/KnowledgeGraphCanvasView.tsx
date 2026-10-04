'use dom';

import React, { useEffect, useRef, useState, useCallback } from 'react';

import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';
import {
  SelectionCameraAnimation,
  advanceSelectionCamera,
  CanvasRenderOptions,
  centeredViewportForNode,
  drawGraphTraversal,
  findNodeAtScreenCoord,
  renderKnowledgeGraphCanvas,
} from '../utils/canvasRenderer';
import {
  ForceSimulationContext,
  initForceSimulation,
  setSimulationFocus,
  stepForceSimulation,
} from '../utils/forceLayout';
import {
  advanceGraphTraversal,
  buildGraphTraversalPlan,
  createGraphTraversalAnimation,
  GraphTraversalAnimation,
} from '../utils/graphTraversal';

const TRAVERSAL_FRAME_INTERVAL_MS = 40;

export interface KnowledgeGraphCanvasViewProps {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  selectedNodeId: string | null;
  selectionTrigger: number;
  reservedBottomHeight: number;
  focusedNodeIds?: Set<string> | string[] | null;
  focusDepth?: number;
  violatingNodeIds?: Set<string> | string[];
  isDark: boolean;
  animateEdges?: boolean;
  spacingScale?: number;
  zoomAction?: { type: 'in' | 'out' | 'fit'; trigger: number } | null;
  onViewportChange?: (viewport: { zoom: number; panX: number; panY: number }) => void;
  onNodeSelect?: (node: KnowledgeGraphNode | null) => void;
  style?: React.CSSProperties | any;
}

export const KnowledgeGraphCanvasView: React.FC<KnowledgeGraphCanvasViewProps> = ({
  nodes,
  edges,
  selectedNodeId,
  selectionTrigger,
  reservedBottomHeight,
  focusedNodeIds,
  focusDepth,
  violatingNodeIds,
  isDark,
  animateEdges = true,
  spacingScale = 1.0,
  zoomAction,
  onViewportChange,
  onNodeSelect,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const traversalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const cameraSizeRef = useRef({ width: 0, height: 0, reservedBottomHeight });
  cameraSizeRef.current = { ...dimensions, reservedBottomHeight };
  const viewportRef = useRef({ panX: 400, panY: 300, zoom: 0.8 });
  const hoveredNodeIdRef = useRef<string | null>(null);

  const simContextRef = useRef<ForceSimulationContext | null>(null);
  const simAlphaRef = useRef<number>(1.0);
  const isSimulatingRef = useRef<boolean>(true);
  const animFrameIdRef = useRef<number | null>(null);
  const traversalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traversalRef = useRef<{ animation: GraphTraversalAnimation; startedAt: number } | null>(
    null
  );
  const lastTraversalDrawRef = useRef(0);
  const traversalVisibleRef = useRef(false);
  const animateEdgesRef = useRef(animateEdges);
  animateEdgesRef.current = animateEdges;
  const reducedMotionRef = useRef(false);

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
  const layoutFocusId = focusDepth === 1 || focusDepth === 2 ? selectedNodeId : null;
  const layoutFocusDepth = layoutFocusId ? focusDepth : undefined;
  const layoutFocusedNodeIds = layoutFocusId ? focusedSet.current : null;
  const layoutFocusRef = useRef({
    id: layoutFocusId,
    depth: layoutFocusDepth,
    nodeIds: layoutFocusedNodeIds,
  });
  layoutFocusRef.current = {
    id: layoutFocusId,
    depth: layoutFocusDepth,
    nodeIds: layoutFocusedNodeIds,
  };

  const violatingSet = useRef<Set<string>>(new Set());
  violatingSet.current = violatingNodeIds
    ? violatingNodeIds instanceof Set
      ? violatingNodeIds
      : new Set(violatingNodeIds)
    : new Set();

  const nodeMapRef = useRef<Map<string, KnowledgeGraphNode>>(new Map());
  const centerSelectedNodeRef = useRef<(schedule?: boolean) => boolean>(() => false);
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const userMovedViewportRef = useRef(false);
  const cameraAnimationRef = useRef<SelectionCameraAnimation | null>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const notifyViewport = useCallback(() => {
    onViewportChange?.({ ...viewportRef.current });
  }, [onViewportChange]);

  const drawFrameRef = useRef<() => void>(() => {});
  const drawTraversalRef = useRef<(timestamp: number) => void>(() => {});

  const drawTraversal = useCallback(
    (timestamp: number) => {
      const traversal = traversalRef.current;
      const animation = traversal?.animation;
      const enabled =
        Boolean(animation?.plan.levels.length) &&
        animateEdgesRef.current &&
        !reducedMotionRef.current &&
        dimensions.width > 0 &&
        dimensions.height > 0;
      const { panX, panY, zoom } = viewportRef.current;
      if (enabled && traversal) {
        advanceGraphTraversal(
          traversal.animation,
          timestamp - traversal.startedAt,
          nodeMapRef.current
        );
      }
      const active = enabled && animation?.pauseUntilMs === null;
      if (!active && !traversalVisibleRef.current) return;
      const canvas = traversalCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      if (traversalVisibleRef.current) ctx.clearRect(0, 0, canvas.width, canvas.height);
      traversalVisibleRef.current = false;
      if (active && animation) {
        ctx.save();
        const dpr = canvas.width / dimensions.width;
        ctx.scale(dpr, dpr);
        ctx.translate(panX, panY);
        ctx.scale(zoom, zoom);
        traversalVisibleRef.current = drawGraphTraversal(ctx, animation, {
          ...dimensions,
          panX,
          panY,
          zoom,
          isDark,
        });
        ctx.restore();
      }
      lastTraversalDrawRef.current = timestamp;
    },
    [dimensions, isDark]
  );
  drawTraversalRef.current = drawTraversal;

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
      isDark,
    };

    renderKnowledgeGraphCanvas(ctx, currentNodes, edges, nodeMapRef.current, options);
    const timestamp = performance.now();
    if (timestamp - lastTraversalDrawRef.current >= TRAVERSAL_FRAME_INTERVAL_MS) {
      drawTraversalRef.current(timestamp);
    }
  }, [dimensions, edges, isDark, nodes, selectedNodeId]);

  drawFrameRef.current = drawFrame;

  const runAnimationLoop = useCallback(() => {
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
    }
    if (traversalTimerRef.current !== null) {
      clearTimeout(traversalTimerRef.current);
      traversalTimerRef.current = null;
    }

    const step = (timestamp: number) => {
      let needsNextFrame = false;
      let advancedSimulation = false;

      if (isSimulatingRef.current && simContextRef.current) {
        advancedSimulation = true;
        const maxMove = stepForceSimulation(simContextRef.current, simAlphaRef.current);
        simAlphaRef.current *= 0.982;

        if (simAlphaRef.current < 0.005 || maxMove < 0.08) {
          isSimulatingRef.current = false;
        } else {
          needsNextFrame = true;
        }
      }

      const selectedNodeId = selectedNodeIdRef.current;
      const wasAnimatingCamera = Boolean(cameraAnimationRef.current);
      const nextCamera = advanceSelectionCamera(
        viewportRef.current,
        cameraAnimationRef.current,
        (selectedNodeId && nodeMapRef.current.get(selectedNodeId)) || null,
        cameraSizeRef.current,
        timestamp,
        advancedSimulation && !userMovedViewportRef.current
      );
      cameraAnimationRef.current = nextCamera.animation;
      const cameraChanged =
        nextCamera.panX !== viewportRef.current.panX ||
        nextCamera.panY !== viewportRef.current.panY;
      if (cameraChanged) {
        viewportRef.current.panX = nextCamera.panX;
        viewportRef.current.panY = nextCamera.panY;
        onViewportChangeRef.current?.({ ...viewportRef.current });
      }
      if (nextCamera.animation) needsNextFrame = true;
      if (advancedSimulation || cameraChanged || wasAnimatingCamera) {
        drawFrameRef.current();
      }
      const traversal = traversalRef.current;
      const animation = traversal?.animation;
      const hasTraversal =
        Boolean(animation?.plan.levels.length) &&
        animateEdgesRef.current &&
        !reducedMotionRef.current;
      const active =
        hasTraversal &&
        traversal &&
        (traversal.animation.pauseUntilMs === null ||
          timestamp - traversal.startedAt >= traversal.animation.pauseUntilMs);
      if (
        (active && timestamp - lastTraversalDrawRef.current >= TRAVERSAL_FRAME_INTERVAL_MS) ||
        (!active && traversalVisibleRef.current)
      ) {
        drawTraversalRef.current(timestamp);
      }

      if (needsNextFrame) {
        animFrameIdRef.current = requestAnimationFrame(step);
      } else if (hasTraversal && traversal) {
        animFrameIdRef.current = null;
        const pauseUntilMs = traversal.animation.pauseUntilMs;
        const pauseRemainingMs =
          pauseUntilMs === null ? 0 : traversal.startedAt + pauseUntilMs - timestamp;
        const delay =
          pauseRemainingMs > 0
            ? pauseRemainingMs
            : Math.max(1, TRAVERSAL_FRAME_INTERVAL_MS - (timestamp - lastTraversalDrawRef.current));
        traversalTimerRef.current = setTimeout(() => {
          traversalTimerRef.current = null;
          animFrameIdRef.current = requestAnimationFrame(step);
        }, delay);
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
  const centerSelectedNode = useCallback(
    (schedule = true): boolean => {
      const node = selectedNodeIdRef.current && nodeMapRef.current.get(selectedNodeIdRef.current);
      if (!node || dimensions.width === 0 || dimensions.height === 0) return false;
      const { panX, panY } = centeredViewportForNode(
        node,
        dimensions.width,
        dimensions.height,
        viewportRef.current.zoom,
        reservedBottomHeight
      );
      const current = viewportRef.current;
      if (Math.hypot(panX - current.panX, panY - current.panY) < 0.5) return false;
      cameraAnimationRef.current = {
        startX: current.panX,
        startY: current.panY,
        endX: panX,
        endY: panY,
        startTime: performance.now(),
      };
      if (schedule) runAnimationLoop();
      return true;
    },
    [dimensions.height, dimensions.width, reservedBottomHeight, runAnimationLoop]
  );
  centerSelectedNodeRef.current = centerSelectedNode;

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
        const traversalCanvas = traversalCanvasRef.current;
        if (traversalCanvas) {
          const traversalDpr = Math.min(dpr, 1.5);
          if (traversalCanvas.width !== Math.round(w * traversalDpr))
            traversalCanvas.width = Math.round(w * traversalDpr);
          if (traversalCanvas.height !== Math.round(h * traversalDpr))
            traversalCanvas.height = Math.round(h * traversalDpr);
          if (traversalCanvas.style.width !== `${w}px`) traversalCanvas.style.width = `${w}px`;
          if (traversalCanvas.style.height !== `${h}px`) traversalCanvas.style.height = `${h}px`;
        }
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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      reducedMotionRef.current = preference.matches;
      drawTraversalRef.current(performance.now());
      if (!preference.matches && traversalRef.current?.animation.plan.levels.length)
        runAnimationLoop();
    };
    updatePreference();
    preference.addEventListener?.('change', updatePreference);
    return () => preference.removeEventListener?.('change', updatePreference);
  }, [runAnimationLoop]);

  useEffect(() => {
    traversalRef.current = animateEdges
      ? {
          animation: createGraphTraversalAnimation(buildGraphTraversalPlan(nodes, edges)),
          startedAt: performance.now(),
        }
      : null;
    drawTraversalRef.current(performance.now());
    if (
      isSimulatingRef.current ||
      cameraAnimationRef.current ||
      (traversalRef.current?.animation.plan.levels.length && !reducedMotionRef.current)
    ) {
      runAnimationLoop();
    }
    return () => {
      if (animFrameIdRef.current !== null) cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
      if (traversalTimerRef.current !== null) clearTimeout(traversalTimerRef.current);
      traversalTimerRef.current = null;
    };
  }, [nodes, edges, animateEdges, runAnimationLoop]);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;
    if (nodes.length === 0) {
      simContextRef.current = null;
      nodeMapRef.current.clear();
      isSimulatingRef.current = false;
      cameraAnimationRef.current = null;
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

    const previousContext = simContextRef.current;
    const rootAnchorPositions = previousContext
      ? new Map(
          [
            ...previousContext.precomputedRootAnchors,
            ...(previousContext.precomputedNoteClassAnchor
              ? [previousContext.precomputedNoteClassAnchor]
              : []),
          ].map(({ root, x, y }) => [root.id, { x, y }] as const)
        )
      : undefined;

    const context = initForceSimulation(seededNodes, edges, {
      width: dimensions.width,
      height: dimensions.height,
      spacingScale,
      centerOrigin: false,
      selectedNodeId: layoutFocusRef.current.id,
      focusDepth: layoutFocusRef.current.depth,
      focusedNodeIds: layoutFocusRef.current.nodeIds,
      rootAnchorPositions,
    });
    simContextRef.current = context;

    const map = new Map<string, KnowledgeGraphNode>();
    context.simNodes.forEach((n) => map.set(n.id, n));
    nodeMapRef.current = map;

    if (previousPositions.size === 0) {
      applyFitToScreen();
    }

    simAlphaRef.current = previousPositions.size > 0 ? 0.4 : 1.0;
    isSimulatingRef.current = true;
    runAnimationLoop();

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (traversalTimerRef.current !== null) clearTimeout(traversalTimerRef.current);
      traversalTimerRef.current = null;
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

  useEffect(() => {
    const context = simContextRef.current;
    if (!context || (!layoutFocusId && context.precomputedFocusPulls.length === 0)) return;
    setSimulationFocus(context, edges, layoutFocusId, layoutFocusDepth, layoutFocusedNodeIds);
    simAlphaRef.current = Math.max(simAlphaRef.current, 0.55);
    isSimulatingRef.current = true;
    runAnimationLoop();
  }, [edges, layoutFocusDepth, layoutFocusId, layoutFocusedNodeIds, runAnimationLoop]);

  useEffect(() => {
    cameraAnimationRef.current = null;
    userMovedViewportRef.current = false;
    if (selectedNodeId) centerSelectedNodeRef.current();
  }, [selectedNodeId, selectionTrigger]);

  useEffect(() => {
    if (selectedNodeIdRef.current && !userMovedViewportRef.current) {
      centerSelectedNodeRef.current();
    }
  }, [dimensions.height, dimensions.width, reservedBottomHeight]);

  const zoomAt = useCallback(
    (factor: number, x: number, y: number, drawDuringSimulation = false) => {
      cameraAnimationRef.current = null;
      userMovedViewportRef.current = true;
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
    cameraAnimationRef.current = null;
    userMovedViewportRef.current = true;

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
  }, [drawFrame, isDark, selectedNodeId, focusedNodeIds, violatingNodeIds]);

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

    cameraAnimationRef.current = null;
    userMovedViewportRef.current = true;
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
      cameraAnimationRef.current = null;
      userMovedViewportRef.current = true;
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
      <canvas
        ref={traversalCanvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  );
};
