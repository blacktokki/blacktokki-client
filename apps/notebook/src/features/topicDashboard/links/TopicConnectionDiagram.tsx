import { Text } from '@blacktokki/core';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Path, Polygon } from 'react-native-svg';
import Icon from 'react-native-vector-icons/FontAwesome';

import {
  elementLabels,
  getTopicConnectionRatio,
  isTopicConnectionSelected,
  TopicConnectionSelection,
  TopicLinkElement,
} from './topicLinkDetails';
import type { useTopicConnections } from './useTopicConnections';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';

type Connections = ReturnType<typeof useTopicConnections>;
type Origin = Connections['details'][number]['pattern']['sourceBoard']['origin'];
type Kind = TopicLinkElement['kind'];
type DiagramChild = {
  id: string;
  title: string;
  kind: Kind;
  ruleCount: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type DiagramNode = {
  id: string;
  title: string;
  origins: Origin[];
  children: DiagramChild[];
  ruleCount: number;
  column: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

const nodeWidth = 220;
const headerHeight = 80;
const childHeight = 32;
const childGap = 6;
const nodePadding = 16;
const columnGap = 64;
const rowGap = 24;
const margin = 32;
const originLabels = { BOARD: '보드', CANDIDATE: '주제 보드', NOTE: '노트' } as const;
const originOrder: Origin[] = ['BOARD', 'CANDIDATE', 'NOTE'];
const kindOrder: Kind[] = ['ROW', 'COLUMN', 'CARD', 'SUBNOTE', 'PARAGRAPH'];

/**
 * 보드·노트는 이름별로 하나의 카드에 묶고 요소 유형은 카드 내부의 하위 노드로 구분한다.
 * 화살표는 출발 이름·유형과 대상 이름·유형이 같은 감지된 규칙끼리 묶는다.
 * 묶인 규칙의 표시 건수를 합산해 카드 부제목과 같은 연결 비율을 계산한다.
 * 개별 카드의 동일성이나 규칙의 연쇄로 새 연결을 증명하지 않으며, 순환 화살표도 보존한다.
 * 화면보다 작은 그래프는 여백을 양쪽에 나누어 전체 관계를 중앙에 배치한다.
 */
export function buildTopicConnectionDiagram(details: Connections['details'], viewportWidth = 0) {
  const nodes = new Map<string, DiagramNode>();
  const edges = new Map<
    string,
    {
      id: string;
      source: DiagramChild;
      target: DiagramChild;
      rules: Map<string, { label: string; detail: Connections['details'][number] }>;
    }
  >();
  for (const detail of details) {
    const { pattern } = detail;
    const match = pattern.matches.find((item) => item.referenceType === 'LINK');
    if (!match) continue;
    const [source, target] = [
      { ...pattern.sourceBoard, kind: match.source.kind },
      { ...pattern.targetBoard, kind: match.target.kind },
    ].map(({ title, origin, kind }) => {
      let node = nodes.get(title);
      if (!node) {
        node = {
          id: title,
          title,
          origins: [],
          children: [],
          ruleCount: 0,
          column: 0,
          width: nodeWidth,
          height: 0,
          x: 0,
          y: 0,
        };
        nodes.set(title, node);
      }
      if (!node.origins.includes(origin)) node.origins.push(origin);
      let child = node.children.find((item) => item.kind === kind);
      if (!child) {
        child = {
          id: JSON.stringify([title, kind]),
          title,
          kind,
          ruleCount: 0,
          x: 0,
          y: 0,
          width: nodeWidth - nodePadding * 2,
          height: childHeight,
        };
        node.children.push(child);
      }
      return child;
    });
    const id = JSON.stringify([source.id, target.id]);
    let edge = edges.get(id);
    if (!edge) {
      edge = { id, source, target, rules: new Map() };
      edges.set(id, edge);
    }
    const ruleId = JSON.stringify([
      pattern.sourceBoard.origin,
      match.source.kind,
      pattern.targetBoard.origin,
      match.target.kind,
    ]);
    if (!edge.rules.has(ruleId)) {
      edge.rules.set(ruleId, {
        detail,
        label: `${originLabels[pattern.sourceBoard.origin]} '${source.title}'의 ${
          elementLabels[match.source.kind]
        } → ${originLabels[pattern.targetBoard.origin]} '${target.title}'의 ${
          elementLabels[match.target.kind]
        }`,
      });
      for (const child of new Set([source, target])) child.ruleCount++;
      for (const title of new Set([source.title, target.title])) nodes.get(title)!.ruleCount++;
    }
  }
  const orderedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const node of orderedNodes) {
    node.origins.sort((a, b) => originOrder.indexOf(a) - originOrder.indexOf(b));
    node.children.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
    node.height =
      headerHeight + node.children.length * (childHeight + childGap) - childGap + nodePadding;
  }
  const orderedEdges = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
  const pending = new Set(orderedNodes);
  const incoming = new Map(orderedNodes.map((node) => [node, 0]));
  const outgoing = new Map<DiagramNode, DiagramNode[]>(orderedNodes.map((node) => [node, []]));
  for (const edge of orderedEdges) {
    const source = nodes.get(edge.source.title)!;
    const target = nodes.get(edge.target.title)!;
    incoming.set(target, incoming.get(target)! + 1);
    outgoing.get(source)!.push(target);
  }
  const columns: DiagramNode[][] = [];
  while (pending.size) {
    const roots = [...pending].filter((node) => incoming.get(node) === 0);
    const column = roots.length ? roots : [[...pending][0]];
    for (const node of column) {
      node.column = columns.length;
      pending.delete(node);
      for (const target of outgoing.get(node)!) incoming.set(target, incoming.get(target)! - 1);
    }
    columns.push(column);
  }
  const detours = orderedEdges.filter(
    (edge) => nodes.get(edge.target.title)!.column !== nodes.get(edge.source.title)!.column + 1
  );
  const top = margin + detours.length * 16;
  const columnHeights = columns.map(
    (column) =>
      column.reduce((sum, node) => sum + node.height, 0) + Math.max(0, column.length - 1) * rowGap
  );
  const maxColumnHeight = Math.max(0, ...columnHeights);
  const contentWidth = columns.length * (nodeWidth + columnGap) - columnGap + margin * 2;
  const contentHeight = top + maxColumnHeight + margin;
  const width = Math.max(contentWidth, viewportWidth);
  const height = Math.max(contentHeight, 220);
  columns.forEach((column, columnIndex) => {
    let y = top + (maxColumnHeight - columnHeights[columnIndex]) / 2 + (height - contentHeight) / 2;
    for (const node of column) {
      node.x = margin + columnIndex * (nodeWidth + columnGap) + (width - contentWidth) / 2;
      node.y = y;
      node.children.forEach((child, index) => {
        child.x = node.x + nodePadding;
        child.y = node.y + headerHeight + index * (childHeight + childGap);
      });
      y += node.height + rowGap;
    }
  });
  return {
    nodes: orderedNodes,
    edges: orderedEdges.map((edge) => {
      const sx = edge.source.x + edge.source.width + 4;
      const sy = edge.source.y + edge.source.height / 2;
      const tx = edge.target.x - 4;
      const ty = edge.target.y + edge.target.height / 2;
      const sourceRight = nodes.get(edge.source.title)!.x + nodeWidth;
      const targetLeft = nodes.get(edge.target.title)!.x;
      const lane = detours.indexOf(edge);
      const trackY = margin / 2 + lane * 16 + (height - contentHeight) / 2;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        path:
          lane < 0
            ? `M ${sx} ${sy} C ${sourceRight + columnGap / 2} ${sy}, ${
                targetLeft - columnGap / 2
              } ${ty}, ${tx} ${ty}`
            : `M ${sx} ${sy} C ${sourceRight + 20} ${sy}, ${sourceRight + 20} ${sy}, ${
                sourceRight + 20
              } ${trackY + 16} C ${sourceRight + 20} ${trackY}, ${targetLeft - 20} ${trackY}, ${
                targetLeft - 20
              } ${trackY + 16} C ${targetLeft - 20} ${ty}, ${targetLeft - 20} ${ty}, ${tx} ${ty}`,
        arrow: `${tx},${ty} ${tx - 8},${ty - 4} ${tx - 8},${ty + 4}`,
        ratio: getTopicConnectionRatio([...edge.rules.values()].map((rule) => rule.detail)),
        label: [...edge.rules]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, rule]) => rule.label)
          .join('. '),
      };
    }),
    width,
    height,
  };
}

export function TopicConnectionDiagram({
  connections,
  selections,
  onToggle,
}: {
  connections: Connections;
  selections: TopicConnectionSelection[];
  onToggle: (selection: TopicConnectionSelection) => void;
}) {
  const { commonStyles } = useNotebookTheme();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const graph = useMemo(
    () => buildTopicConnectionDiagram(connections.details, viewportWidth),
    [connections.details, viewportWidth]
  );
  const color = commonStyles.activeTab.color;
  if (connections.isLoading || connections.isError || !graph.edges.length) return null;
  return (
    <View style={[commonStyles.card, styles.section]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="연결 규칙 관계 접기/펼치기"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((previous) => !previous)}
        style={styles.sectionHeader}
      >
        <Text style={[commonStyles.text, styles.heading]}>연결 규칙 관계</Text>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={color} />
      </TouchableOpacity>
      {expanded && (
        <>
          <Text style={[commonStyles.smallText, styles.hint]}>
            보드·노트는 전체 규칙을, 하위 요소는 해당 유형의 규칙을 선택합니다. 다시 누르면
            해제됩니다.
          </Text>
          <View
            onLayout={({ nativeEvent }) => setViewportWidth(Math.round(nativeEvent.layout.width))}
          >
            <ScrollView horizontal nestedScrollEnabled style={styles.viewport}>
              <ScrollView nestedScrollEnabled style={[styles.viewport, { width: graph.width }]}>
                <View style={{ width: graph.width, height: graph.height }}>
                  {graph.nodes.map((node) => {
                    const selected = isTopicConnectionSelected(selections, { title: node.title });
                    const hasSelection = selections.some(
                      (selection) => selection.title === node.title
                    );
                    return (
                      <View
                        key={node.id}
                        style={[
                          commonStyles.card,
                          styles.node,
                          {
                            left: node.x,
                            top: node.y,
                            width: node.width,
                            height: node.height,
                            borderColor: hasSelection ? color : commonStyles.card.borderColor,
                            backgroundColor: selected
                              ? commonStyles.navButton.backgroundColor
                              : commonStyles.card.backgroundColor,
                          },
                        ]}
                      >
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`연결 규칙 필터: ${node.title}`}
                          accessibilityState={{ selected }}
                          onPress={() => onToggle({ title: node.title })}
                          style={[
                            styles.nodeHeader,
                            {
                              backgroundColor: selected
                                ? commonStyles.navButton.backgroundColor
                                : commonStyles.card.backgroundColor,
                            },
                          ]}
                        >
                          <View style={styles.badges}>
                            <Text style={[commonStyles.smallText, styles.caption]}>
                              {node.origins.map((origin) => originLabels[origin]).join(' · ')} (
                              {node.ruleCount})
                            </Text>
                            {selected && <Icon name="check" size={12} color={color} />}
                          </View>
                          <Text numberOfLines={2} style={[commonStyles.text, styles.nodeTitle]}>
                            {node.title}
                          </Text>
                        </TouchableOpacity>
                        {node.children.map((child) => {
                          const childSelected = selections.some(
                            (selection) =>
                              selection.title === child.title && selection.kind === child.kind
                          );
                          return (
                            <TouchableOpacity
                              key={child.id}
                              accessibilityRole="button"
                              accessibilityLabel={`연결 규칙 유형 필터: ${child.title}의 ${
                                elementLabels[child.kind]
                              }`}
                              accessibilityState={{ selected: childSelected }}
                              onPress={() => onToggle({ title: child.title, kind: child.kind })}
                              style={[
                                styles.child,
                                {
                                  left: child.x - node.x,
                                  top: child.y - node.y,
                                  width: child.width,
                                  height: child.height,
                                  borderColor: childSelected
                                    ? color
                                    : commonStyles.card.borderColor,
                                  backgroundColor:
                                    selected || childSelected
                                      ? commonStyles.navButton.backgroundColor
                                      : commonStyles.container.backgroundColor,
                                },
                              ]}
                            >
                              <Text style={[commonStyles.text, styles.childText]}>
                                {elementLabels[child.kind]} ({child.ruleCount})
                              </Text>
                              {childSelected && <Icon name="check" size={10} color={color} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                  <Svg
                    width={graph.width}
                    height={graph.height}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={graph.edges.map((edge) => edge.label).join('. ')}
                  >
                    {graph.edges.map((edge) => {
                      const active =
                        !selections.length ||
                        isTopicConnectionSelected(selections, edge.source) ||
                        isTopicConnectionSelected(selections, edge.target);
                      return (
                        <G key={edge.id} opacity={active ? 1 : 0.25}>
                          <Path
                            d={edge.path}
                            stroke={commonStyles.smallText.color}
                            strokeWidth={active ? 1.5 : 1}
                            fill="none"
                          />
                          <Path
                            d={edge.path}
                            stroke="#27AE60"
                            strokeWidth={active ? 1.5 : 1}
                            fill="none"
                            opacity={edge.ratio}
                          />
                          <Polygon points={edge.arrow} fill={commonStyles.smallText.color} />
                          <Polygon points={edge.arrow} fill="#27AE60" opacity={edge.ratio} />
                        </G>
                      );
                    })}
                    {graph.nodes
                      .flatMap((node) => node.children)
                      .map((child) => {
                        const backgroundColor = isTopicConnectionSelected(selections, child)
                          ? commonStyles.navButton.backgroundColor
                          : commonStyles.container.backgroundColor;
                        return (
                          <React.Fragment key={child.id}>
                            <Circle
                              cx={child.x}
                              cy={child.y + child.height / 2}
                              r={3}
                              fill={backgroundColor}
                              stroke={commonStyles.smallText.color}
                            />
                            <Circle
                              cx={child.x + child.width}
                              cy={child.y + child.height / 2}
                              r={3}
                              fill={backgroundColor}
                              stroke={commonStyles.smallText.color}
                            />
                          </React.Fragment>
                        );
                      })}
                  </Svg>
                </View>
              </ScrollView>
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12, gap: 8, padding: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1, fontSize: 15, fontWeight: 'bold', textAlign: 'left' },
  hint: { fontSize: 12, textAlign: 'left' },
  viewport: { maxHeight: 360 },
  node: { position: 'absolute', padding: 0, marginBottom: 0, overflow: 'hidden' },
  nodeHeader: {
    height: headerHeight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  badges: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  caption: { fontSize: 11, lineHeight: 16 },
  nodeTitle: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  child: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  childText: { fontSize: 12, lineHeight: 16 },
});
