import { Text, useLangContext } from '@blacktokki/core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { OntologyCanvasView } from './OntologyCanvasView';
import { OntologyRelationSummary, summarizeOntologyRelations } from './relations';
import { AxiomEvaluationResult, OntologyEdge, OntologyNode } from './types';
import { getTopicVirtualNoteEligibleSet } from './virtualNotes';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

interface OntologyGraphViewProps {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  datatypeNodes?: OntologyNode[];
  datatypeEdges?: OntologyEdge[];
  axioms?: AxiomEvaluationResult;
  selectedNode: OntologyNode | null;
  focusedNodeIds: Set<string> | null;
  onSelectNode: (node: OntologyNode | null) => void;
}

const relationLegendColor = (summary: OntologyRelationSummary, isDark: boolean): string => {
  if (summary.label === 'connectedPartOf') return isDark ? '#F0B27A' : '#CA6F1E';
  if (summary.label === 'paragraphPartOf') return isDark ? '#7D6608' : '#B7950B';
  if (summary.isInferred) return '#9B59B6';
  if (summary.isDatatype) return isDark ? '#48C78E' : '#16A085';
  switch (summary.baseType) {
    case 'REFERENCES':
      return isDark ? '#5DADE2' : '#2874A6';
    case 'PART_OF':
      return isDark ? '#5D6D7E' : '#7F8C8D';
    case 'SUBCLASS_OF':
      return isDark ? '#AACCFF' : '#5588CC';
    default:
      return isDark ? '#7F8C8D' : '#64748B';
  }
};

export const calculateGraphFit = (
  nodes: OntologyNode[],
  width: number,
  height: number
): { scale: number; panX: number; panY: number } => {
  if (nodes.length === 0 || width <= 0 || height <= 0) {
    return { scale: 1, panX: 0, panY: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    const halfW = n.shape === 'rect' ? (n.width || 50) / 2 : n.radius;
    const halfH = n.shape === 'rect' ? (n.height || 20) / 2 : n.radius;
    minX = Math.min(minX, n.x - halfW);
    maxX = Math.max(maxX, n.x + halfW);
    minY = Math.min(minY, n.y - halfH);
    maxY = Math.max(maxY, n.y + halfH);
  }

  const padding = 70;
  const graphWidth = Math.max(100, maxX - minX + padding * 2);
  const graphHeight = Math.max(100, maxY - minY + padding * 2);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const targetScale = Math.min(
    1.3,
    Math.max(0.01, Math.min(width / graphWidth, height / graphHeight))
  );
  const targetPanX = width / 2 - centerX * targetScale;
  const targetPanY = height / 2 - centerY * targetScale;

  return { scale: targetScale, panX: targetPanX, panY: targetPanY };
};

export const OntologyGraphView: React.FC<OntologyGraphViewProps> = ({
  nodes,
  edges,
  datatypeNodes = [],
  datatypeEdges = [],
  axioms,
  selectedNode,
  focusedNodeIds,
  onSelectNode,
}) => {
  const { commonStyles, colorScheme } = useNotebookTheme();
  const { lang } = useLangContext();
  const isDark = colorScheme === 'dark';

  const containerRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;
  const [topToolbarHeight, setTopToolbarHeight] = useState(32);
  const [scale, setScale] = useState(1);
  const [zoomAction, setZoomAction] = useState<{
    type: 'in' | 'out' | 'fit';
    trigger: number;
  } | null>(null);

  // Derived relation visibility
  const [showInferred, setShowInferred] = useState<boolean>(false);
  const [relationHint, setRelationHint] = useState<string | null>(null);

  // VOWL Datatypes (Literals) Toggle State (Default: false to prevent clutter)
  const [showDatatypes, setShowDatatypes] = useState<boolean>(false);
  const [showParagraphs, setShowParagraphs] = useState<boolean>(false);

  // Axiom Violations Modal State
  const [showAxiomModal, setShowAxiomModal] = useState<boolean>(false);

  // Active nodes for layout and rendering (combines Core entities + VOWL Literals if enabled)
  const activeNodes = useMemo(() => {
    const visibleNodes = showParagraphs
      ? nodes
      : nodes.filter((node) => node.instanceKind !== 'PARAGRAPH');
    if (!showDatatypes || !datatypeNodes || datatypeNodes.length === 0) {
      return visibleNodes;
    }
    return [...visibleNodes, ...datatypeNodes];
  }, [nodes, datatypeNodes, showDatatypes, showParagraphs]);

  const activeNodeIds = useMemo(() => new Set(activeNodes.map((node) => node.id)), [activeNodes]);
  const nodeMap = useMemo(() => new Map(activeNodes.map((node) => [node.id, node])), [activeNodes]);

  // Combined edges (including inferred edges and datatype properties if enabled)
  const allEdges = useMemo(() => {
    let result = edges;
    if (showInferred && axioms?.inferredEdges && axioms.inferredEdges.length > 0) {
      result = [...result, ...axioms.inferredEdges];
    }
    if (showDatatypes && datatypeEdges && datatypeEdges.length > 0) {
      result = [...result, ...datatypeEdges];
    }
    return result.filter(
      (edge) => activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target)
    );
  }, [edges, axioms?.inferredEdges, showInferred, datatypeEdges, showDatatypes, activeNodeIds]);

  useEffect(() => {
    if (!selectedNode) return;
    if (!showParagraphs && selectedNode.instanceKind === 'PARAGRAPH') {
      onSelectNode(null);
    }
  }, [showParagraphs, selectedNode, onSelectNode]);

  // Violating nodes set
  const violatingNodeIdSet = useMemo(() => {
    const set = new Set<string>();
    if (axioms?.violations) {
      for (const v of axioms.violations) {
        for (const nid of v.affectedNodeIds) {
          set.add(nid);
        }
      }
    }
    return set;
  }, [axioms]);

  // Measure container (guarded against redundant state updates)
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setDimensions((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    }
  }, []);

  const onTopToolbarLayout = useCallback((e: LayoutChangeEvent) => {
    const height = Math.ceil(e.nativeEvent.layout.height);
    if (height > 0) {
      setTopToolbarHeight((prev) => (prev === height ? prev : height));
    }
  }, []);

  // Dynamic Node Spacing Scale (Default: 1.0)
  const [spacingScale, setSpacingScale] = useState<number>(1.0);

  const handleIncreaseSpacing = useCallback(() => {
    setSpacingScale((prev) => Math.min(2.5, +(prev + 0.1).toFixed(1)));
  }, []);

  const handleDecreaseSpacing = useCallback(() => {
    setSpacingScale((prev) => Math.max(0.4, +(prev - 0.1).toFixed(1)));
  }, []);

  const handleResetSpacing = useCallback(() => {
    setSpacingScale(1.0);
  }, []);

  const handleZoomCenter = useCallback((factor: number) => {
    setZoomAction({ type: factor > 1 ? 'in' : 'out', trigger: Date.now() });
  }, []);

  const fitToScreen = useCallback(() => {
    setZoomAction({ type: 'fit', trigger: Date.now() });
  }, []);

  const handleViewportChange = useCallback((viewport: { zoom: number }) => {
    setScale(viewport.zoom);
  }, []);

  const handleToggleInferred = () => {
    if (!axioms || axioms.inferredEdges.length === 0) {
      setRelationHint(lang('No inferred relations found'));
      setTimeout(() => setRelationHint(null), 3000);
      return;
    }
    setShowInferred((prev) => !prev);
  };

  // Count by node types for legend
  const builtInClassCount = useMemo(
    () => nodes.filter((node) => node.role === 'CLASS' && node.classCategory === 'BUILT_IN').length,
    [nodes]
  );
  const boardClassCount = useMemo(
    () => nodes.filter((node) => node.role === 'CLASS' && node.classCategory === 'BOARD').length,
    [nodes]
  );
  const topicClassCount = useMemo(
    () => nodes.filter((node) => node.role === 'CLASS' && node.classCategory === 'TOPIC').length,
    [nodes]
  );
  const instanceCount = useMemo(
    () => nodes.filter((n) => n.role === 'INSTANCE' && n.instanceKind === 'CARD').length,
    [nodes]
  );
  const noteCount = useMemo(
    () => nodes.filter((n) => n.role === 'INSTANCE' && n.instanceKind === 'NOTE').length,
    [nodes]
  );
  const paraCount = useMemo(
    () => nodes.filter((n) => n.role === 'INSTANCE' && n.instanceKind === 'PARAGRAPH').length,
    [nodes]
  );
  const connectedParaCount = useMemo(
    () =>
      nodes.filter((n) => n.role === 'INSTANCE' && n.instanceKind === 'CONNECTED_PARAGRAPH').length,
    [nodes]
  );
  const relationSummaries = useMemo(() => summarizeOntologyRelations(allEdges), [allEdges]);
  const validationColor = axioms?.hasErrors
    ? '#E74C3C'
    : axioms?.hasWarnings
    ? '#F39C12'
    : '#27AE60';
  const validationIcon = axioms?.hasErrors
    ? 'times-circle'
    : axioms?.hasWarnings
    ? 'exclamation-triangle'
    : 'check-circle';
  const validationLabel = axioms?.hasErrors
    ? `${lang('Validation Error')} (${axioms.violations.length})`
    : axioms?.hasWarnings
    ? `${lang('Validation Warning')} (${axioms.violations.length})`
    : lang('Validation Passed');
  const placeViewportControlsBesideToolbar = dimensions.width >= 1100;
  const viewportControlsTop = placeViewportControlsBesideToolbar
    ? 12
    : Math.max(60, 20 + topToolbarHeight);

  const dotGridStyle = useMemo(
    () =>
      Platform.OS === 'web'
        ? {
            backgroundImage: isDark
              ? 'radial-gradient(circle, rgba(255, 255, 255, 0.12) 1px, transparent 1px)'
              : 'radial-gradient(circle, rgba(0, 0, 0, 0.10) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }
        : {},
    [isDark]
  );

  const focusedNodeIdList = useMemo(
    () => (focusedNodeIds ? Array.from(focusedNodeIds) : null),
    [focusedNodeIds]
  );
  const violatingNodeIdList = useMemo(() => Array.from(violatingNodeIdSet), [violatingNodeIdSet]);
  const virtualNoteEligibleNodeIdList = useMemo(
    () => Array.from(getTopicVirtualNoteEligibleSet(activeNodes, allEdges)),
    [activeNodes, allEdges]
  );

  return (
    <View
      ref={containerRef}
      style={[
        styles.container,
        Platform.OS === 'web' ? ({ userSelect: 'none', ...dotGridStyle } as any) : {},
      ]}
      onLayout={onLayout}
    >
      {/* High-Performance Universal HTML5 2D Canvas Layer (Web & Mobile Native) */}
      <View style={StyleSheet.absoluteFill}>
        <OntologyCanvasView
          nodes={activeNodes}
          edges={allEdges}
          selectedNodeId={selectedNode?.id || null}
          focusedNodeIds={focusedNodeIdList}
          violatingNodeIds={violatingNodeIdList}
          virtualNoteEligibles={virtualNoteEligibleNodeIdList}
          isDark={isDark}
          spacingScale={spacingScale}
          zoomAction={zoomAction}
          onViewportChange={handleViewportChange}
          onNodeSelect={onSelectNode}
          style={{ width: '100%', height: '100%' }}
        />
      </View>

      {/* Top Header HUD: validation status and inference controls */}
      <View
        style={[
          styles.topHudContainer,
          placeViewportControlsBesideToolbar ? { right: 210 } : {},
          Platform.OS === 'web' ? ({ pointerEvents: 'box-none' } as any) : {},
        ]}
        onLayout={onTopToolbarLayout}
        pointerEvents="box-none"
      >
        {/* 1. Validation Status HUD Badge */}
        {axioms && (
          <TouchableOpacity
            style={[
              styles.axiomBadge,
              {
                backgroundColor: axioms.hasErrors
                  ? isDark
                    ? 'rgba(231, 76, 60, 0.28)'
                    : 'rgba(231, 76, 60, 0.24)'
                  : axioms.hasWarnings
                  ? isDark
                    ? 'rgba(243, 156, 18, 0.25)'
                    : 'rgba(243, 156, 18, 0.18)'
                  : isDark
                  ? 'rgba(39, 174, 96, 0.28)'
                  : 'rgba(46, 204, 113, 0.24)',
                borderColor: validationColor,
              },
              Platform.OS === 'web'
                ? ({
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                  } as any)
                : {},
            ]}
            onPress={() => setShowAxiomModal(true)}
            {...(Platform.OS === 'web'
              ? ({
                  onClick: (e: any) => {
                    e.stopPropagation();
                    setShowAxiomModal(true);
                  },
                  onPointerDown: (e: any) => e.stopPropagation(),
                } as any)
              : {})}
            activeOpacity={0.8}
          >
            <Icon
              name={validationIcon}
              size={12}
              color={validationColor}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.axiomBadgeText, { color: validationColor }]}>
              {validationLabel}
            </Text>
          </TouchableOpacity>
        )}

        {/* 2. Logical Inference Toggle */}
        {axioms && (
          <TouchableOpacity
            style={[
              styles.inferredToggle,
              {
                backgroundColor: showInferred
                  ? '#9B59B6'
                  : isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
                borderColor: showInferred ? '#8E44AD' : 'transparent',
              },
              Platform.OS === 'web'
                ? ({
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                  } as any)
                : {},
            ]}
            onPress={handleToggleInferred}
            {...(Platform.OS === 'web'
              ? ({
                  onClick: (e: any) => {
                    e.stopPropagation();
                    handleToggleInferred();
                  },
                  onPointerDown: (e: any) => e.stopPropagation(),
                } as any)
              : {})}
          >
            <Icon
              name="magic"
              size={11}
              color={showInferred ? '#FFFFFF' : commonStyles.text?.color}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.inferredToggleText,
                {
                  color: showInferred ? '#FFFFFF' : commonStyles.text?.color,
                  fontWeight: showInferred ? 'bold' : '600',
                },
              ]}
            >
              {lang('Inferred')} ({axioms.inferredEdges.length})
            </Text>
          </TouchableOpacity>
        )}

        {/* 5. Ordinary Paragraph Visibility Toggle */}
        {paraCount > 0 && (
          <TouchableOpacity
            style={[
              styles.inferredToggle,
              {
                backgroundColor: showParagraphs
                  ? isDark
                    ? '#5B2C6F'
                    : '#BB8FCE'
                  : isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
                borderColor: showParagraphs ? (isDark ? '#BB8FCE' : '#8E44AD') : 'transparent',
              },
              Platform.OS === 'web'
                ? ({
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                  } as any)
                : {},
            ]}
            onPress={() => setShowParagraphs((previous) => !previous)}
            {...(Platform.OS === 'web'
              ? ({
                  onClick: (event: any) => {
                    event.stopPropagation();
                    setShowParagraphs((previous) => !previous);
                  },
                  onPointerDown: (event: any) => event.stopPropagation(),
                } as any)
              : {})}
          >
            <Icon
              name={showParagraphs ? 'eye' : 'eye-slash'}
              size={11}
              color={showParagraphs ? '#FFFFFF' : commonStyles.text?.color}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.inferredToggleText,
                {
                  color: showParagraphs ? '#FFFFFF' : commonStyles.text?.color,
                  fontWeight: showParagraphs ? 'bold' : '600',
                },
              ]}
            >
              {lang('Paragraphs')} ({paraCount})
            </Text>
          </TouchableOpacity>
        )}

        {/* 6. VOWL Datatypes (Literals) Toggle */}
        {datatypeNodes && datatypeNodes.length > 0 && (
          <TouchableOpacity
            style={[
              styles.inferredToggle,
              {
                backgroundColor: showDatatypes
                  ? isDark
                    ? '#B7950B'
                    : '#F1C40F'
                  : isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
                borderColor: showDatatypes ? '#D4AC0D' : 'transparent',
              },
              Platform.OS === 'web'
                ? ({
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                  } as any)
                : {},
            ]}
            onPress={() => setShowDatatypes((previous) => !previous)}
            {...(Platform.OS === 'web'
              ? ({
                  onClick: (event: any) => {
                    event.stopPropagation();
                    setShowDatatypes((previous) => !previous);
                  },
                  onPointerDown: (event: any) => event.stopPropagation(),
                } as any)
              : {})}
          >
            <Icon
              name="square-o"
              size={11}
              color={showDatatypes ? (isDark ? '#FFFFFF' : '#4E3800') : commonStyles.text?.color}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.inferredToggleText,
                {
                  color: showDatatypes
                    ? isDark
                      ? '#FFFFFF'
                      : '#4E3800'
                    : commonStyles.text?.color,
                  fontWeight: showDatatypes ? 'bold' : '600',
                },
              ]}
            >
              {lang('Datatypes')} ({datatypeNodes.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Floating Inferred Dependency Feedback Hint Banner */}
      {relationHint && (
        <View style={styles.hintBannerWrapper} pointerEvents="none">
          <View
            style={[
              styles.hintBanner,
              {
                backgroundColor: isDark ? 'rgba(40, 44, 52, 0.95)' : 'rgba(255, 255, 255, 0.96)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
              },
            ]}
          >
            <Icon name="info-circle" size={12} color="#9B59B6" style={{ marginRight: 6 }} />
            <Text style={[styles.hintBannerText, { color: commonStyles.text?.color }]}>
              {relationHint}
            </Text>
          </View>
        </View>
      )}

      {/* Floating Upper-right HUD Controls: Node Spacing */}
      <View
        style={[
          styles.hudBar,
          {
            top: viewportControlsTop,
            backgroundColor: isDark ? 'rgba(28, 32, 38, 0.94)' : 'rgba(255, 255, 255, 0.96)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.10)',
          },
          Platform.OS === 'web'
            ? ({
                pointerEvents: 'auto',
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {},
        ]}
      >
        <View style={styles.hudLabelRow}>
          <Icon
            name="arrows-h"
            size={11}
            color={commonStyles.smallText?.color}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.hudLabelText, { color: commonStyles.smallText?.color }]}>
            {lang('Spacing')}
          </Text>
        </View>

        <View style={styles.hudDivider} />

        <TouchableOpacity
          style={[styles.hudButton, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}]}
          onPress={handleDecreaseSpacing}
          {...(Platform.OS === 'web'
            ? ({
                onClick: (e: any) => {
                  e.stopPropagation();
                  handleDecreaseSpacing();
                },
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {})}
          accessibilityLabel="Decrease node spacing"
        >
          <Icon name="minus" size={11} color={commonStyles.text?.color} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.hudValueButton,
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {},
          ]}
          onPress={handleResetSpacing}
          {...(Platform.OS === 'web'
            ? ({
                onClick: (e: any) => {
                  e.stopPropagation();
                  handleResetSpacing();
                },
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {})}
          accessibilityLabel="Reset node spacing"
        >
          <Text style={[styles.hudZoomText, { color: commonStyles.text?.color }]}>
            {spacingScale.toFixed(1)}x
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.hudButton, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}]}
          onPress={handleIncreaseSpacing}
          {...(Platform.OS === 'web'
            ? ({
                onClick: (e: any) => {
                  e.stopPropagation();
                  handleIncreaseSpacing();
                },
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {})}
          accessibilityLabel="Increase node spacing"
        >
          <Icon name="plus" size={11} color={commonStyles.text?.color} />
        </TouchableOpacity>
      </View>

      {/* Floating Upper-right HUD Controls (Zoom / Fit) */}
      <View
        style={[
          styles.hudBar,
          {
            top: viewportControlsTop + 48,
            backgroundColor: isDark ? 'rgba(28, 32, 38, 0.94)' : 'rgba(255, 255, 255, 0.96)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.10)',
          },
          Platform.OS === 'web'
            ? ({
                pointerEvents: 'auto',
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {},
        ]}
      >
        <TouchableOpacity
          style={[styles.hudButton, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}]}
          onPress={() => handleZoomCenter(1.2)}
          {...(Platform.OS === 'web'
            ? ({
                onClick: (e: any) => {
                  e.stopPropagation();
                  handleZoomCenter(1.2);
                },
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {})}
          accessibilityLabel="Zoom in"
        >
          <Icon name="plus" size={12} color={commonStyles.text?.color} />
        </TouchableOpacity>

        <View style={styles.hudDivider} />

        <Text style={[styles.hudZoomText, { color: commonStyles.smallText?.color }]}>
          {Math.round(scale * 100)}%
        </Text>

        <View style={styles.hudDivider} />

        <TouchableOpacity
          style={[styles.hudButton, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}]}
          onPress={() => handleZoomCenter(0.83)}
          {...(Platform.OS === 'web'
            ? ({
                onClick: (e: any) => {
                  e.stopPropagation();
                  handleZoomCenter(0.83);
                },
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {})}
          accessibilityLabel="Zoom out"
        >
          <Icon name="minus" size={12} color={commonStyles.text?.color} />
        </TouchableOpacity>

        <View style={styles.hudDivider} />

        <TouchableOpacity
          style={[styles.hudButton, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}]}
          onPress={fitToScreen}
          {...(Platform.OS === 'web'
            ? ({
                onClick: (e: any) => {
                  e.stopPropagation();
                  fitToScreen();
                },
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {})}
          accessibilityLabel="Fit to screen"
        >
          <Icon name="arrows-alt" size={12} color={commonStyles.text?.color} />
        </TouchableOpacity>
      </View>

      {/* Floating Legend Pill */}
      <View
        style={[
          styles.legendPill,
          {
            backgroundColor: isDark ? 'rgba(28, 32, 38, 0.94)' : 'rgba(255, 255, 255, 0.96)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.10)',
          },
          Platform.OS === 'web'
            ? ({
                pointerEvents: 'auto',
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {},
        ]}
      >
        <View style={styles.legendRow}>
          {/* Built-in Classes */}
          {builtInClassCount > 0 && (
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  {
                    backgroundColor: isDark ? '#2B5278' : '#AACCFF',
                    borderColor: isDark ? '#AACCFF' : '#5588CC',
                    borderWidth: 1.5,
                    borderRadius: 7,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                {lang('Built-in Class')} ({builtInClassCount})
              </Text>
            </View>
          )}

          {/* Board Classes */}
          {boardClassCount > 0 && (
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  {
                    backgroundColor: isDark ? '#196F3D' : '#ABEBC6',
                    borderColor: isDark ? '#82E0AA' : '#229954',
                    borderWidth: 1.5,
                    borderRadius: 7,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                {lang('Board Class')} ({boardClassCount})
              </Text>
            </View>
          )}

          {/* Topic Classes */}
          {topicClassCount > 0 && (
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  {
                    backgroundColor: isDark ? '#4A2E3D' : '#EED9E3',
                    borderColor: isDark ? '#F18BB8' : '#AD3D76',
                    borderWidth: 1.5,
                    borderRadius: 7,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                {lang('Topic Class')} ({topicClassCount})
              </Text>
            </View>
          )}

          {/* VOWL Instances (Note Double Ring Circle) */}
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendColor,
                {
                  backgroundColor: isDark ? '#3A6B9B' : '#70A1FF',
                  borderColor: isDark ? '#70A1FF' : '#3060C0',
                  borderWidth: 1.5,
                  borderRadius: 7,
                },
              ]}
            />
            <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
              {lang('Instance (Note)')} ({noteCount})
            </Text>
          </View>

          {/* VOWL Instances (Card Circle) */}
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendColor,
                {
                  backgroundColor: isDark ? '#1E6B47' : '#48C78E',
                  borderColor: isDark ? '#48C78E' : '#27AE60',
                  borderWidth: 1.2,
                  borderRadius: 7,
                },
              ]}
            />
            <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
              {lang('Instance (Card)')} ({instanceCount})
            </Text>
          </View>

          {/* VOWL Instances (Paragraph Circle) */}
          {showParagraphs && paraCount > 0 && (
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  {
                    backgroundColor: isDark ? '#5B2C6F' : '#BB8FCE',
                    borderColor: isDark ? '#BB8FCE' : '#8E44AD',
                    borderWidth: 1.5,
                    borderRadius: 7,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                {lang('Instance (Paragraph)')} ({paraCount})
              </Text>
            </View>
          )}

          {/* Connected Paragraph Instances */}
          {connectedParaCount > 0 && (
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  {
                    backgroundColor: isDark ? '#784212' : '#F0B27A',
                    borderColor: isDark ? '#F0B27A' : '#CA6F1E',
                    borderWidth: 1.5,
                    borderRadius: 7,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                {lang('Instance (Connected Paragraph)')} ({connectedParaCount})
              </Text>
            </View>
          )}

          {/* VOWL Datatypes / Literals (Rectangle) */}
          {showDatatypes && datatypeNodes.length > 0 && (
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  {
                    backgroundColor: isDark ? '#5C4E14' : '#FFEA80',
                    borderColor: isDark ? '#FFD700' : '#D4AC0D',
                    borderWidth: 1.2,
                    borderRadius: 2,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                {lang('Literal')} ({datatypeNodes.length})
              </Text>
            </View>
          )}
        </View>

        <View style={styles.legendDivider} />

        <View style={styles.legendRow}>
          {relationSummaries.map((summary) => {
            const color = relationLegendColor(summary, isDark);
            return (
              <View key={summary.key} style={styles.legendItem}>
                <View style={styles.arrowIconContainer}>
                  <View
                    style={[
                      styles.arrowLine,
                      summary.dashed
                        ? {
                            backgroundColor: 'transparent',
                            borderTopColor: color,
                            borderTopWidth: 1.5,
                            borderStyle: 'dashed',
                          }
                        : { backgroundColor: color },
                    ]}
                  />
                  <View style={[styles.arrowHead, { borderLeftColor: color }]} />
                </View>
                <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                  {lang(summary.label)} ({summary.count})
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Axiom Violation Detail Dialog Modal */}
      {showAxiomModal && axioms && (
        <View
          style={styles.modalOverlay}
          {...(Platform.OS === 'web'
            ? ({
                onPointerDown: (e: any) => e.stopPropagation(),
              } as any)
            : {})}
        >
          {/* Backdrop Touch Dismiss */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAxiomModal(false)}
            {...(Platform.OS === 'web'
              ? ({
                  onClick: (e: any) => {
                    e.stopPropagation();
                    setShowAxiomModal(false);
                  },
                } as any)
              : {})}
          />

          <View
            style={[
              styles.axiomModal,
              {
                backgroundColor: isDark ? 'rgba(28, 32, 38, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              },
              Platform.OS === 'web'
                ? ({
                    pointerEvents: 'auto',
                    onPointerDown: (e: any) => e.stopPropagation(),
                  } as any)
                : {},
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Icon
                  name={validationIcon}
                  size={15}
                  color={validationColor}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.modalTitle, { color: commonStyles.title?.color }]}>
                  {lang('Ontology Validation')}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {},
                ]}
                onPress={() => setShowAxiomModal(false)}
                {...(Platform.OS === 'web'
                  ? ({
                      onClick: (e: any) => {
                        e.stopPropagation();
                        setShowAxiomModal(false);
                      },
                    } as any)
                  : {})}
              >
                <Icon name="times" size={14} color={commonStyles.text?.color} />
              </TouchableOpacity>
            </View>

            {axioms.violations.length === 0 ? (
              <View style={styles.emptyViolationContainer}>
                <Icon name="check-circle" size={32} color="#27AE60" style={{ marginBottom: 10 }} />
                <Text style={[styles.emptyViolationText, { color: commonStyles.text?.color }]}>
                  {lang('Current application validation rules are satisfied.')}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.violationList}
                {...(Platform.OS === 'web'
                  ? ({
                      onPointerDown: (e: any) => e.stopPropagation(),
                    } as any)
                  : {})}
              >
                {axioms.violations.map((v) => (
                  <View
                    key={v.id}
                    style={[
                      styles.violationItem,
                      {
                        backgroundColor:
                          v.severity === 'error'
                            ? isDark
                              ? 'rgba(231, 76, 60, 0.12)'
                              : 'rgba(231, 76, 60, 0.08)'
                            : isDark
                            ? 'rgba(243, 156, 18, 0.12)'
                            : 'rgba(243, 156, 18, 0.08)',
                        borderColor:
                          v.severity === 'error'
                            ? isDark
                              ? 'rgba(231, 76, 60, 0.3)'
                              : 'rgba(231, 76, 60, 0.2)'
                            : isDark
                            ? 'rgba(243, 156, 18, 0.3)'
                            : 'rgba(243, 156, 18, 0.2)',
                      },
                    ]}
                  >
                    <View style={styles.violationHeader}>
                      <Text style={styles.violationType}>
                        {v.type === 'ISOLATED_ENTITY'
                          ? lang('Isolated Entity')
                          : lang('Referential Integrity')}
                      </Text>
                    </View>
                    <Text style={[styles.violationMessage, { color: commonStyles.text?.color }]}>
                      {v.message}
                    </Text>
                    <View style={styles.affectedNodesRow}>
                      {v.affectedNodeIds.map((nid) => {
                        const targetNode = nodeMap.get(nid);
                        return (
                          <TouchableOpacity
                            key={nid}
                            style={[
                              styles.affectedNodeChip,
                              { backgroundColor: isDark ? '#34495E' : '#EBF5FB' },
                              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {},
                            ]}
                            onPress={() => {
                              if (targetNode) {
                                onSelectNode(targetNode);
                                setShowAxiomModal(false);
                              }
                            }}
                            {...(Platform.OS === 'web'
                              ? ({
                                  onClick: (e: any) => {
                                    e.stopPropagation();
                                    if (targetNode) {
                                      onSelectNode(targetNode);
                                      setShowAxiomModal(false);
                                    }
                                  },
                                } as any)
                              : {})}
                          >
                            <Text style={styles.affectedNodeChipText}>
                              {targetNode?.name || nid}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  topHudContainer: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  axiomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  axiomBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  inferredToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9.5,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  inferredToggleText: {
    fontSize: 11,
  },
  hintBannerWrapper: {
    position: 'absolute',
    top: 52,
    left: 14,
    zIndex: 11,
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  hintBannerText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  hudBar: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    zIndex: 8,
  },
  hudButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  hudDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(150, 150, 150, 0.25)',
    marginHorizontal: 3,
  },
  hudZoomText: {
    fontSize: 11,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'center',
  },
  hudLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  hudLabelText: {
    fontSize: 11,
    fontWeight: '600',
  },
  hudValueButton: {
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendPill: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'column',
    alignItems: 'stretch',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    zIndex: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  legendColor: {
    width: 9,
    height: 9,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
  },
  legendDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.3)',
  },
  arrowIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 16,
    height: 10,
  },
  arrowLine: {
    width: 10,
    height: 1.5,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    borderLeftWidth: 5,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  axiomModal: {
    width: '90%',
    maxWidth: 520,
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalCloseButton: {
    padding: 6,
  },
  emptyViolationContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyViolationText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  violationList: {
    maxHeight: 380,
  },
  violationItem: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  violationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  violationType: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E74C3C',
  },
  violationMessage: {
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 6,
  },
  affectedNodesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  affectedNodeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  affectedNodeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2980B9',
  },
});
