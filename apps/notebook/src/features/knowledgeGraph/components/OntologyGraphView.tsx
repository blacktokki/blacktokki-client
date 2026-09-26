import { Text, useLangContext } from '@blacktokki/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { AxiomEvaluationResult, OntologyEdge, OntologyNode } from '../types';
import { getOntologyPalette } from '../utils/palette';
import {
  getOntologyRelationDisplayLabel,
  getOntologyNodeKind,
  getOntologyNodeKindLabel,
  OntologyNodeKindLabel,
  OntologyRelationLabelMode,
  OntologyRelationSummary,
  summarizeOntologyRelations,
} from '../utils/relations';
import { getTopicVirtualNoteEligibleSet } from '../utils/virtualNotes';

interface OntologyGraphViewProps {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  datatypeNodes?: OntologyNode[];
  datatypeEdges?: OntologyEdge[];
  axioms: AxiomEvaluationResult;
  selectedNode: OntologyNode | null;
  focusedNodeIds: Set<string> | null;
  labelMode: OntologyRelationLabelMode;
  onChangeLabelMode: (mode: OntologyRelationLabelMode) => void;
  onSelectNode: (node: OntologyNode | null) => void;
}

const relationLegendColor = (summary: OntologyRelationSummary, isDark: boolean): string => {
  if (summary.label === 'connectedPartOf') return isDark ? '#F2A2A8' : '#B84B56';
  if (summary.label === 'paragraphPartOf' || summary.label === 'cardPartOf')
    return isDark ? '#7D6608' : '#B7950B';
  if (summary.isInferred) return '#9B59B6';
  if (summary.isDatatype) return isDark ? '#48C78E' : '#16A085';
  switch (summary.baseType) {
    case 'REFERENCES':
    case 'EXTERNAL_REFERENCE':
      return isDark ? '#5DADE2' : '#2874A6';
    case 'PART_OF':
      return isDark ? '#5D6D7E' : '#7F8C8D';
    case 'SUBCLASS_OF':
      return isDark ? '#AACCFF' : '#5588CC';
    case 'REPRESENTED_BY_NOTE':
      return isDark ? '#85929E' : '#5D6D7E';
    default:
      return isDark ? '#7F8C8D' : '#64748B';
  }
};

const violationColor = (severity: 'error' | 'warning', alpha: number): string =>
  `rgba(${severity === 'error' ? '231, 76, 60' : '243, 156, 18'}, ${alpha})`;

const nodeLegendKinds = Object.keys(getOntologyPalette(false)) as OntologyNodeKindLabel[];
const isWeb = Platform.OS === 'web';
const stopPointerDown = (event: any) => event.stopPropagation();
const webCursor = isWeb ? ({ cursor: 'pointer' } as any) : {};
const webButtonStyle = isWeb ? ({ pointerEvents: 'auto', cursor: 'pointer' } as any) : {};
const webSurfaceProps = isWeb ? ({ onPointerDown: stopPointerDown } as any) : {};
const webModalStyle = isWeb
  ? ({ pointerEvents: 'auto', onPointerDown: stopPointerDown } as any)
  : {};

const webButtonEvents = (activate: () => void) =>
  isWeb
    ? ({
        onClick: (event: any) => {
          event.stopPropagation();
          activate();
        },
        onPointerDown: stopPointerDown,
      } as any)
    : {};

interface GraphToolbarToggleProps {
  active: boolean;
  label: string;
  icon: string;
  isDark: boolean;
  activeBackgroundColor?: string;
  activeBorderColor?: string;
  activeTextColor?: string;
  inactiveTextColor: string | undefined;
  inactiveBorderColor?: string;
  onToggle: () => void;
}

const GraphToolbarToggle: React.FC<GraphToolbarToggleProps> = ({
  active,
  label,
  icon,
  isDark,
  activeBackgroundColor,
  activeBorderColor,
  activeTextColor,
  inactiveTextColor,
  inactiveBorderColor = 'transparent',
  onToggle,
}) => {
  const textColor = active ? activeTextColor : inactiveTextColor;
  return (
    <TouchableOpacity
      style={[
        styles.inferredToggle,
        {
          backgroundColor: active
            ? activeBackgroundColor
            : isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
          borderColor: active ? activeBorderColor : inactiveBorderColor,
        },
        webButtonStyle,
      ]}
      onPress={onToggle}
      {...webButtonEvents(onToggle)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={11} color={textColor} style={{ marginRight: 5 }} />
      <Text
        style={[
          styles.inferredToggleText,
          { color: textColor, fontWeight: active ? 'bold' : '600' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const HudButton: React.FC<{
  label: string;
  onPress: () => void;
  color: string | undefined;
  icon?: string;
  iconSize?: number;
  value?: string;
}> = ({ label, onPress, color, icon, iconSize = 11, value }) => (
  <TouchableOpacity
    style={[value === undefined ? styles.hudButton : styles.hudValueButton, webCursor]}
    onPress={onPress}
    {...webButtonEvents(onPress)}
    accessibilityLabel={label}
  >
    {icon ? (
      <Icon name={icon} size={iconSize} color={color} />
    ) : (
      <Text style={[styles.hudZoomText, { color }]}>{value}</Text>
    )}
  </TouchableOpacity>
);

export const OntologyGraphView: React.FC<OntologyGraphViewProps> = ({
  nodes,
  edges,
  datatypeNodes = [],
  datatypeEdges = [],
  axioms,
  selectedNode,
  focusedNodeIds,
  labelMode,
  onChangeLabelMode,
  onSelectNode,
}) => {
  const { commonStyles, colorScheme } = useNotebookTheme();
  const { lang } = useLangContext();
  const isDark = colorScheme === 'dark';
  const palette = getOntologyPalette(isDark);

  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });
  const [topToolbarHeight, setTopToolbarHeight] = useState(32);
  const [scale, setScale] = useState(1);
  const [zoomAction, setZoomAction] = useState<{
    type: 'in' | 'out' | 'fit';
    trigger: number;
  } | null>(null);

  const [showInferred, setShowInferred] = useState<boolean>(false);
  const [relationHint, setRelationHint] = useState<string | null>(null);

  const [showDatatypes, setShowDatatypes] = useState<boolean>(false);
  const [showParagraphs, setShowParagraphs] = useState<boolean>(false);
  const [showOrdinaryExternalLinks, setShowOrdinaryExternalLinks] = useState<boolean>(false);
  const relationLabelMode = labelMode;
  const toggleLabelMode = () => onChangeLabelMode(labelMode === 'rdf' ? 'intuitive' : 'rdf');
  const [isLegendExpanded, setIsLegendExpanded] = useState<boolean>(true);

  const [showAxiomModal, setShowAxiomModal] = useState<boolean>(false);

  const activeNodes = useMemo(() => {
    const visibleNodes = nodes.filter(
      (node) =>
        (showParagraphs || node.instanceKind !== 'PARAGRAPH') &&
        (showOrdinaryExternalLinks || node.instanceKind !== 'EXTERNAL_LINK')
    );
    if (!showDatatypes || !datatypeNodes || datatypeNodes.length === 0) {
      return visibleNodes;
    }
    return [...visibleNodes, ...datatypeNodes];
  }, [nodes, datatypeNodes, showDatatypes, showParagraphs, showOrdinaryExternalLinks]);

  const activeNodeIds = useMemo(() => new Set(activeNodes.map((node) => node.id)), [activeNodes]);
  const nodeMap = useMemo(() => new Map(activeNodes.map((node) => [node.id, node])), [activeNodes]);

  const allEdges = useMemo(() => {
    let result = edges;
    if (showInferred && axioms.inferredEdges.length > 0) {
      result = [...result, ...axioms.inferredEdges];
    }
    if (showDatatypes && datatypeEdges && datatypeEdges.length > 0) {
      result = [...result, ...datatypeEdges];
    }
    return result.filter(
      (edge) => activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target)
    );
  }, [edges, axioms.inferredEdges, showInferred, datatypeEdges, showDatatypes, activeNodeIds]);

  useEffect(() => {
    if (!selectedNode) return;
    if (
      (!showParagraphs && selectedNode.instanceKind === 'PARAGRAPH') ||
      (!showOrdinaryExternalLinks && selectedNode.instanceKind === 'EXTERNAL_LINK')
    ) {
      onSelectNode(null);
    }
  }, [showParagraphs, showOrdinaryExternalLinks, selectedNode, onSelectNode]);

  const violatingNodeIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const v of axioms.violations) {
      for (const nid of v.affectedNodeIds) {
        set.add(nid);
      }
    }
    return set;
  }, [axioms]);

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
    if (axioms.inferredEdges.length === 0) {
      setRelationHint(lang('No inferred relations found'));
      setTimeout(() => setRelationHint(null), 3000);
      return;
    }
    setShowInferred((prev) => !prev);
  };

  const nodeLegendCounts = useMemo(() => {
    const counts = Object.fromEntries(nodeLegendKinds.map((kind) => [kind, 0])) as Record<
      OntologyNodeKindLabel,
      number
    >;
    for (const node of nodes) {
      counts[getOntologyNodeKind(node)]++;
    }
    counts.literal = datatypeNodes.length;
    return counts;
  }, [nodes, datatypeNodes.length]);
  const displayEdges = useMemo(
    () =>
      allEdges.map((edge) => ({
        ...edge,
        propertyLabel: getOntologyRelationDisplayLabel(edge, relationLabelMode, lang),
      })),
    [allEdges, relationLabelMode, lang]
  );
  const relationSummaries = useMemo(() => summarizeOntologyRelations(allEdges), [allEdges]);
  const validationColor = axioms.hasErrors ? '#E74C3C' : axioms.hasWarnings ? '#F39C12' : '#27AE60';
  const validationIcon = axioms.hasErrors
    ? 'times-circle'
    : axioms.hasWarnings
    ? 'exclamation-triangle'
    : 'check-circle';
  const validationLabel = axioms.hasErrors
    ? `${lang('Validation Error')} (${axioms.violations.length})`
    : axioms.hasWarnings
    ? `${lang('Validation Warning')} (${axioms.violations.length})`
    : lang('Validation Passed');
  const validationBackground = axioms.hasErrors
    ? violationColor('error', isDark ? 0.28 : 0.24)
    : axioms.hasWarnings
    ? violationColor('warning', isDark ? 0.25 : 0.18)
    : isDark
    ? 'rgba(39, 174, 96, 0.28)'
    : 'rgba(46, 204, 113, 0.24)';
  const placeViewportControlsBesideToolbar = dimensions.width >= 1100;
  const viewportControlsTop = placeViewportControlsBesideToolbar
    ? 12
    : Math.max(60, 20 + topToolbarHeight);
  const hudSurfaceStyle = {
    backgroundColor: isDark ? 'rgba(28, 32, 38, 0.94)' : 'rgba(255, 255, 255, 0.96)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.10)',
  };
  const dotGridStyle = useMemo(
    () =>
      isWeb
        ? {
            backgroundImage: isDark
              ? 'radial-gradient(circle, rgba(255, 255, 255, 0.12) 1px, transparent 1px)'
              : 'radial-gradient(circle, rgba(0, 0, 0, 0.10) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }
        : {},
    [isDark]
  );

  const virtualNoteEligibleSet = useMemo(
    () => getTopicVirtualNoteEligibleSet(activeNodes),
    [activeNodes]
  );
  const toolbarToggles: (
    | Omit<GraphToolbarToggleProps, 'isDark' | 'inactiveTextColor'>
    | false
    | undefined
  )[] = [
    {
      active: showInferred,
      label: `${lang('Inferred')} (${axioms.inferredEdges.length})`,
      icon: 'magic',
      activeBackgroundColor: '#9B59B6',
      activeBorderColor: '#8E44AD',
      activeTextColor: '#FFFFFF',
      onToggle: handleToggleInferred,
    },
    nodeLegendCounts.paragraph > 0 && {
      active: showParagraphs,
      label: `${lang('Paragraphs')} (${nodeLegendCounts.paragraph})`,
      icon: showParagraphs ? 'eye' : 'eye-slash',
      activeBackgroundColor: isDark ? '#5B2C6F' : '#BB8FCE',
      activeBorderColor: isDark ? '#BB8FCE' : '#8E44AD',
      activeTextColor: '#FFFFFF',
      onToggle: () => setShowParagraphs((previous) => !previous),
    },
    nodeLegendCounts.externalLink > 0 && {
      active: showOrdinaryExternalLinks,
      label: `${lang('Ordinary External Links')} (${nodeLegendCounts.externalLink})`,
      icon: showOrdinaryExternalLinks ? 'eye' : 'eye-slash',
      activeBackgroundColor: palette.externalLink.fill,
      activeBorderColor: palette.externalLink.stroke,
      activeTextColor: isDark ? '#FFFFFF' : commonStyles.text?.color,
      onToggle: () => setShowOrdinaryExternalLinks((previous) => !previous),
    },
    datatypeNodes.length > 0 && {
      active: showDatatypes,
      label: `${lang('Datatypes')} (${datatypeNodes.length})`,
      icon: 'square-o',
      activeBackgroundColor: isDark ? '#B7950B' : '#F1C40F',
      activeBorderColor: '#D4AC0D',
      activeTextColor: isDark ? '#FFFFFF' : '#4E3800',
      onToggle: () => setShowDatatypes((previous) => !previous),
    },
  ];

  return (
    <View
      style={[styles.container, isWeb ? ({ userSelect: 'none', ...dotGridStyle } as any) : {}]}
      onLayout={onLayout}
    >
      <View style={StyleSheet.absoluteFill}>
        <OntologyCanvasView
          nodes={activeNodes}
          edges={displayEdges}
          selectedNodeId={selectedNode?.id || null}
          focusedNodeIds={focusedNodeIds}
          violatingNodeIds={violatingNodeIdSet}
          virtualNoteEligibles={virtualNoteEligibleSet}
          isDark={isDark}
          labelMode={relationLabelMode}
          spacingScale={spacingScale}
          zoomAction={zoomAction}
          onViewportChange={handleViewportChange}
          onNodeSelect={onSelectNode}
          style={{ width: '100%', height: '100%' }}
        />
      </View>

      <View
        style={[
          styles.topHudContainer,
          placeViewportControlsBesideToolbar ? { right: 210 } : {},
          isWeb ? ({ pointerEvents: 'box-none' } as any) : {},
        ]}
        onLayout={onTopToolbarLayout}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={[
            styles.axiomBadge,
            {
              backgroundColor: validationBackground,
              borderColor: validationColor,
            },
            webButtonStyle,
          ]}
          onPress={() => setShowAxiomModal(true)}
          {...webButtonEvents(() => setShowAxiomModal(true))}
          activeOpacity={0.8}
        >
          <Icon
            name={validationIcon}
            size={12}
            color={validationColor}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.axiomBadgeText, { color: validationColor }]}>{validationLabel}</Text>
        </TouchableOpacity>

        {toolbarToggles.map(
          (toggle, index) =>
            toggle && (
              <GraphToolbarToggle
                key={index}
                {...toggle}
                isDark={isDark}
                inactiveTextColor={commonStyles.text?.color}
              />
            )
        )}

        <GraphToolbarToggle
          active={false}
          label={`${lang('Label')}: ${lang(
            relationLabelMode === 'rdf' ? 'RDF/OWL terms' : 'Intuitive terms'
          )}`}
          icon="tag"
          isDark={isDark}
          inactiveTextColor={commonStyles.text?.color}
          inactiveBorderColor={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)'}
          onToggle={toggleLabelMode}
        />
      </View>

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

      <View
        style={[styles.hudBar, { top: viewportControlsTop }, hudSurfaceStyle]}
        {...webSurfaceProps}
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

        <HudButton
          label="Decrease node spacing"
          onPress={handleDecreaseSpacing}
          icon="minus"
          color={commonStyles.text?.color}
        />
        <HudButton
          label="Reset node spacing"
          onPress={handleResetSpacing}
          value={`${spacingScale.toFixed(1)}x`}
          color={commonStyles.text?.color}
        />
        <HudButton
          label="Increase node spacing"
          onPress={handleIncreaseSpacing}
          icon="plus"
          color={commonStyles.text?.color}
        />
      </View>

      <View
        style={[styles.hudBar, { top: viewportControlsTop + 48 }, hudSurfaceStyle]}
        {...webSurfaceProps}
      >
        <HudButton
          label="Zoom in"
          onPress={() => handleZoomCenter(1.2)}
          icon="plus"
          iconSize={12}
          color={commonStyles.text?.color}
        />

        <View style={styles.hudDivider} />

        <Text style={[styles.hudZoomText, { color: commonStyles.smallText?.color }]}>
          {Math.round(scale * 100)}%
        </Text>

        <View style={styles.hudDivider} />

        <HudButton
          label="Zoom out"
          onPress={() => handleZoomCenter(0.83)}
          icon="minus"
          iconSize={12}
          color={commonStyles.text?.color}
        />

        <View style={styles.hudDivider} />

        <HudButton
          label="Fit to screen"
          onPress={fitToScreen}
          icon="arrows-alt"
          iconSize={12}
          color={commonStyles.text?.color}
        />
      </View>

      <View
        style={[
          styles.legendPill,
          isLegendExpanded ? styles.legendPillExpanded : styles.legendPillCollapsed,
          hudSurfaceStyle,
        ]}
        {...webSurfaceProps}
      >
        <TouchableOpacity
          style={[styles.legendHeader, webCursor]}
          onPress={() => setIsLegendExpanded((previous) => !previous)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isLegendExpanded }}
          accessibilityLabel={lang(isLegendExpanded ? 'Collapse Legend' : 'Expand Legend')}
          {...webSurfaceProps}
        >
          <View style={styles.legendTitleRow}>
            <Icon name="list-ul" size={11} color={commonStyles.text?.color} />
            <Text style={[styles.legendTitle, { color: commonStyles.text?.color }]}>
              {lang('Legend')}
            </Text>
          </View>
          <Icon
            name={isLegendExpanded ? 'chevron-down' : 'chevron-up'}
            size={10}
            color={commonStyles.smallText?.color}
          />
        </TouchableOpacity>

        {isLegendExpanded && (
          <>
            <View style={styles.legendDivider} />
            <View style={styles.legendRow}>
              {nodeLegendKinds
                .filter(
                  (kind) =>
                    nodeLegendCounts[kind] > 0 &&
                    (kind !== 'paragraph' || showParagraphs) &&
                    (kind !== 'externalLink' || showOrdinaryExternalLinks) &&
                    (kind !== 'literal' || showDatatypes)
                )
                .map((kind) => (
                  <View key={kind} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendColor,
                        {
                          backgroundColor: palette[kind].fill,
                          borderColor: palette[kind].stroke,
                          borderWidth: kind === 'card' || kind === 'literal' ? 1.2 : 1.5,
                          borderRadius: kind === 'literal' ? 2 : 7,
                        },
                      ]}
                    />
                    <Text style={[styles.legendText, { color: commonStyles.text?.color }]}>
                      {getOntologyNodeKindLabel(kind, labelMode, lang)} ({nodeLegendCounts[kind]})
                    </Text>
                  </View>
                ))}
            </View>

            <View style={styles.legendDivider} />

            <View style={styles.legendRow}>
              {relationSummaries.map((summary) => {
                const color = relationLegendColor(summary, isDark);
                const relation = { type: summary.type, propertyLabel: summary.label };
                const label = getOntologyRelationDisplayLabel(relation, relationLabelMode, lang);
                const detail =
                  relationLabelMode === 'rdf' && summary.baseType === 'PART_OF'
                    ? ` · ${getOntologyRelationDisplayLabel(relation, 'intuitive', lang)}`
                    : '';
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
                      {label}
                      {detail} ({summary.count})
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>

      {showAxiomModal && (
        <View style={styles.modalOverlay} {...webSurfaceProps}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAxiomModal(false)}
            {...webButtonEvents(() => setShowAxiomModal(false))}
          />

          <View
            style={[
              styles.axiomModal,
              {
                backgroundColor: isDark ? 'rgba(28, 32, 38, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              },
              webModalStyle,
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
                  {lang('Knowledge Graph Validation') || '지식 그래프 검증'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseButton, webCursor]}
                onPress={() => setShowAxiomModal(false)}
                {...webButtonEvents(() => setShowAxiomModal(false))}
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
              <ScrollView style={styles.violationList} {...webSurfaceProps}>
                {axioms.violations.map((v) => (
                  <View
                    key={v.id}
                    style={[
                      styles.violationItem,
                      {
                        backgroundColor: violationColor(v.severity, isDark ? 0.12 : 0.08),
                        borderColor: violationColor(v.severity, isDark ? 0.3 : 0.2),
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
                        const selectAffectedNode = () => {
                          if (!targetNode) return;
                          onSelectNode(targetNode);
                          setShowAxiomModal(false);
                        };
                        return (
                          <TouchableOpacity
                            key={nid}
                            style={[
                              styles.affectedNodeChip,
                              { backgroundColor: isDark ? '#34495E' : '#EBF5FB' },
                              webCursor,
                            ]}
                            onPress={selectAffectedNode}
                            {...webButtonEvents(selectAffectedNode)}
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
  legendPillExpanded: {
    right: 16,
  },
  legendPillCollapsed: {
    width: 112,
    paddingVertical: 5,
    gap: 0,
  },
  legendHeader: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: '700',
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
