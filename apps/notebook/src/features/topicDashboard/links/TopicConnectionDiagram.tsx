import { Text } from '@blacktokki/core';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
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
type DiagramEdge = {
  id: string;
  source: DiagramChild;
  target: DiagramChild;
  rules: Map<string, { label: string; detail: Connections['details'][number] }>;
};
type Corridor = { column: number; y: number; minY: number; maxY: number };
type DiagramRoute = {
  sourceX: number;
  targetX: number;
  trackY: number;
  corridors: (Corridor & { left: number; right: number })[];
};

const nodeWidth = 220;
const headerHeight = 80;
const childHeight = 32;
const childGap = 6;
const nodePadding = 16;
const columnGap = 64;
const rowGap = 24;
const margin = 32;
const routeGap = 12;
const routeClearance = 12;
const viewportBottomGap = 16;
const minZoom = 0.01;
const maxZoom = 2;
const zoomStep = 0.25;
const originLabels = { BOARD: '보드', CANDIDATE: '주제 보드', NOTE: '노트' } as const;
const originOrder: Origin[] = ['BOARD', 'CANDIDATE', 'NOTE'];
const kindOrder: Kind[] = ['ROW', 'COLUMN', 'CARD', 'SUBNOTE', 'PARAGRAPH'];

/** 같은 높이의 연결도 전체 구간이 휘어지며 끝점의 수평 접선을 유지한다. */
function curveCommands(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  crest = sy - routeClearance
) {
  const midpoint = (sx + tx) / 2;
  if (sy !== ty) {
    return `C ${midpoint} ${sy}, ${midpoint} ${ty}, ${tx} ${ty}`;
  }
  const handle = (tx - sx) / 4;
  return `C ${sx + handle} ${sy}, ${midpoint - handle} ${crest}, ${midpoint} ${crest} C ${
    midpoint + handle
  } ${crest}, ${tx - handle} ${ty}, ${tx} ${ty}`;
}

function buildDirectCurve(sx: number, sy: number, tx: number, ty: number) {
  return `M ${sx} ${sy} ${curveCommands(sx, sy, tx, ty)}`;
}

/** 각 열의 빈 통로를 연결해 전체 이동량이 작은 경로를 찾는다. */
function findCorridors(
  columns: DiagramNode[][],
  positions: Map<DiagramNode, number>,
  sourceColumn: number,
  targetColumn: number,
  sy: number,
  ty: number,
  height: number
): Corridor[] {
  const direction = Math.sign(targetColumn - sourceColumn);
  if (!direction) return [];
  type Candidate = Corridor & { cost: number; previous?: Candidate };
  let previous: Candidate[] = [];
  for (let column = sourceColumn + direction; column !== targetColumn; column += direction) {
    const nodes = columns[column];
    const desired = sy + ((ty - sy) * (column - sourceColumn)) / (targetColumn - sourceColumn);
    const candidates = Array.from({ length: nodes.length + 1 }, (_, index) => {
      const minY = index
        ? positions.get(nodes[index - 1])! + nodes[index - 1].height + routeClearance / 2
        : -routeClearance;
      const maxY =
        index < nodes.length
          ? positions.get(nodes[index])! - routeClearance / 2
          : height + routeClearance;
      const bend = Math.min(routeClearance / 2, (maxY - minY) / 2);
      const y = Math.max(minY + bend, Math.min(maxY - bend, desired));
      return { column, y, minY, maxY, cost: Math.abs(y - desired) / 10 } as Candidate;
    });
    if (!previous.length) {
      candidates.forEach((candidate) => (candidate.cost += Math.abs(candidate.y - sy)));
    } else {
      // 정렬된 통로의 앞/뒤 최솟값으로 전이를 계산해 모든 통로 쌍을 비교하지 않는다.
      const prefix: Candidate[] = [];
      const suffix: Candidate[] = [];
      previous.forEach((candidate, index) => {
        const best = prefix[index - 1];
        prefix.push(!best || candidate.cost - candidate.y < best.cost - best.y ? candidate : best);
      });
      for (let index = previous.length - 1; index >= 0; index--) {
        const candidate = previous[index];
        const best = suffix[index + 1];
        suffix[index] =
          !best || candidate.cost + candidate.y < best.cost + best.y ? candidate : best;
      }
      let split = 0;
      for (const candidate of candidates) {
        while (split < previous.length && previous[split].y <= candidate.y) split++;
        const choices = [prefix[split - 1], suffix[split]].filter(
          (item): item is Candidate => !!item
        );
        const best = choices.reduce((a, b) =>
          a.cost + Math.abs(a.y - candidate.y) <= b.cost + Math.abs(b.y - candidate.y) ? a : b
        );
        candidate.cost += best.cost + Math.abs(best.y - candidate.y);
        candidate.previous = best;
      }
    }
    previous = candidates;
  }
  if (!previous.length) return [];
  let selected: Candidate | undefined = previous.reduce((a, b) =>
    a.cost + Math.abs(a.y - ty) <= b.cost + Math.abs(b.y - ty) ? a : b
  );
  const result: Corridor[] = [];
  while (selected) {
    result.push({
      column: selected.column,
      y: selected.y,
      minY: selected.minY,
      maxY: selected.maxY,
    });
    selected = selected.previous;
  }
  return result.reverse();
}

/** 카드 너비에 해당하는 곡선 구간의 극값을 구해 카드와의 겹침을 확인한다. */
function isCurveClear(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstacles: DiagramNode[],
  height: number
) {
  const cubic = (start: number, first: number, second: number, end: number, t: number) => {
    const u = 1 - t;
    return (
      start +
      3 * u * u * t * (first - start) +
      3 * u * t * t * (second - start) +
      t * t * t * (end - start)
    );
  };
  const yAt = (t: number) => cubic(sy, sourceY, targetY, ty, t);
  const a = -sy + 3 * sourceY - 3 * targetY + ty;
  const b = 2 * (sy - 2 * sourceY + targetY);
  const c = sourceY - sy;
  const discriminant = b * b - 4 * a * c;
  const extrema = (
    a === 0
      ? b === 0
        ? []
        : [-c / b]
      : discriminant < 0
      ? []
      : [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]
  ).filter((t) => t > 0 && t < 1);
  const ys = [0, 1, ...extrema].map(yAt);
  if (Math.min(...ys) < 0 || Math.max(...ys) > height) return false;
  const parameterAtX = (x: number) => {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 20; step++) {
      const t = (low + high) / 2;
      const currentX = cubic(sx, sourceX, targetX, tx, t);
      if (sx < tx ? currentX < x : currentX > x) low = t;
      else high = t;
    }
    return (low + high) / 2;
  };
  const clearance = routeClearance / 2;
  for (const node of obstacles) {
    const left = Math.max(Math.min(sx, tx), node.x - clearance);
    const right = Math.min(Math.max(sx, tx), node.x + node.width + clearance);
    if (left >= right) continue;
    const parameters = [parameterAtX(left), parameterAtX(right)].sort((a, b) => a - b);
    const values = [
      ...parameters,
      ...extrema.filter((t) => t > parameters[0] && t < parameters[1]),
    ].map(yAt);
    if (
      Math.max(...values) > node.y - clearance &&
      Math.min(...values) < node.y + node.height + clearance
    ) {
      return false;
    }
  }
  return true;
}

/** 열린 공간은 큰 곡선으로, 카드가 쌓인 공간은 각 열의 통로를 따라 부드럽게 연결한다. */
function buildCurvedRoute(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  route: DiagramRoute,
  obstacles: DiagramNode[],
  height: number
) {
  const { sourceX, targetX, trackY, corridors } = route;
  const midpoint = (sy + ty) / 2;
  const middleX = (sx + tx) / 2;
  const handle = (tx - sx) / 4;
  const directClear =
    sy === ty
      ? isCurveClear(
          sx,
          sy,
          middleX,
          sy - routeClearance,
          sx + handle,
          sy,
          middleX - handle,
          sy - routeClearance,
          obstacles,
          height
        ) &&
        isCurveClear(
          middleX,
          sy - routeClearance,
          tx,
          ty,
          middleX + handle,
          sy - routeClearance,
          tx - handle,
          ty,
          obstacles,
          height
        )
      : isCurveClear(sx, sy, tx, ty, middleX, sy, middleX, ty, obstacles, height);
  if (directClear) return { path: buildDirectCurve(sx, sy, tx, ty), controlY: ty };
  const sharedTrack = corridors.every(
    (corridor) => trackY >= corridor.minY && trackY <= corridor.maxY
  );
  const direction = Math.sign(tx - sx);
  const span = Math.abs(tx - sx);
  const sourceHandle = sx + direction * Math.min(Math.abs(sourceX - sx), span / 6);
  const targetHandle = tx - direction * Math.min(Math.abs(tx - targetX), span / 6);
  const middleHandle = (tx - sx) / 3;
  for (const factor of sharedTrack ? [1, 1.25, 1.5] : []) {
    const crest = midpoint + (trackY - midpoint) * factor;
    if (
      isCurveClear(
        sx,
        sy,
        middleX,
        crest,
        sourceHandle,
        sy,
        middleX - middleHandle,
        crest,
        obstacles,
        height
      ) &&
      isCurveClear(
        middleX,
        crest,
        tx,
        ty,
        middleX + middleHandle,
        crest,
        targetHandle,
        ty,
        obstacles,
        height
      )
    ) {
      return {
        path: `M ${sx} ${sy} C ${sourceHandle} ${sy}, ${
          middleX - middleHandle
        } ${crest}, ${middleX} ${crest} C ${
          middleX + middleHandle
        } ${crest}, ${targetHandle} ${ty}, ${tx} ${ty}`,
        controlY: ty,
      };
    }
  }
  for (const factor of sharedTrack ? [1.5, 1.75, 2] : []) {
    const controlY = midpoint + (trackY - midpoint) * factor;
    if (isCurveClear(sx, sy, tx, ty, sourceX, controlY, targetX, controlY, obstacles, height)) {
      return {
        path: `M ${sx} ${sy} C ${sourceX} ${controlY}, ${targetX} ${controlY}, ${tx} ${ty}`,
        controlY,
      };
    }
  }
  let path = `M ${sx} ${sy}`;
  let x = sx;
  let y = sy;
  const merged: DiagramRoute['corridors'] = [];
  for (const corridor of corridors) {
    const previous = merged.at(-1);
    if (previous && previous.y === corridor.y) {
      previous.left = Math.min(previous.left, corridor.left);
      previous.right = Math.max(previous.right, corridor.right);
      previous.minY = Math.max(previous.minY, corridor.minY);
      previous.maxY = Math.min(previous.maxY, corridor.maxY);
    } else {
      merged.push({ ...corridor });
    }
  }
  const first = merged[0];
  const last = merged.at(-1);
  if (first?.y === sy) {
    if (sx < tx) first.left = sx;
    else first.right = sx;
  }
  if (last?.y === ty) {
    if (sx < tx) last.right = tx;
    else last.left = tx;
  }
  for (const corridor of merged) {
    const leftToRight = sx < tx;
    const entryX = leftToRight ? corridor.left : corridor.right;
    const exitX = leftToRight ? corridor.right : corridor.left;
    const above = corridor.y - corridor.minY;
    const below = corridor.maxY - corridor.y;
    const crest =
      corridor.y +
      (below > above ? Math.min(routeClearance, below) : -Math.min(routeClearance, above));
    if (x !== entryX) path += ` ${curveCommands(x, y, entryX, corridor.y)}`;
    path += ` ${curveCommands(entryX, corridor.y, exitX, corridor.y, crest)}`;
    x = exitX;
    y = corridor.y;
  }
  if (x !== tx) path += ` ${curveCommands(x, y, tx, ty)}`;
  return { path, controlY: ty };
}

/**
 * 보드·노트는 이름별로 하나의 카드에 묶고 요소 유형은 카드 내부의 하위 노드로 구분한다.
 * 화살표는 출발 이름·유형과 대상 이름·유형이 같은 감지된 규칙끼리 묶는다.
 * 묶인 규칙의 표시 건수를 합산해 카드 부제목과 같은 연결 비율을 계산한다.
 * 개별 카드의 동일성이나 규칙의 연쇄로 새 연결을 증명하지 않으며, 순환 화살표도 보존한다.
 * 연결된 카드끼리 배치하고, 서로 독립된 관계는 세로로 분리한다.
 * 인접한 카드는 방향에 맞는 면으로 바로 연결하고, 나머지는 충돌하지 않는 가까운 경로를 사용한다.
 */
export function buildTopicConnectionDiagram(details: Connections['details'], viewportWidth = 0) {
  const nodes = new Map<string, DiagramNode>();
  const edges = new Map<string, DiagramEdge>();
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
  const neighbors = new Map(orderedNodes.map((node) => [node, new Set<DiagramNode>()]));
  const outgoing = new Map(orderedNodes.map((node) => [node, new Set<DiagramNode>()]));
  for (const edge of orderedEdges) {
    const source = nodes.get(edge.source.title)!;
    const target = nodes.get(edge.target.title)!;
    neighbors.get(source)!.add(target);
    neighbors.get(target)!.add(source);
    outgoing.get(source)!.add(target);
  }

  const components: DiagramNode[][] = [];
  const visited = new Set<DiagramNode>();
  for (const root of orderedNodes) {
    if (visited.has(root)) continue;
    const component = [root];
    visited.add(root);
    for (let index = 0; index < component.length; index++) {
      for (const neighbor of neighbors.get(component[index])!) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          component.push(neighbor);
        }
      }
    }
    components.push(component.sort((a, b) => a.id.localeCompare(b.id)));
  }

  const layouts = components.map((component) => {
    const pending = new Set(component);
    const incoming = new Map(component.map((node) => [node, 0]));
    for (const node of component) {
      for (const target of outgoing.get(node)!) incoming.set(target, incoming.get(target)! + 1);
    }
    const columns: DiagramNode[][] = [];
    while (pending.size) {
      const roots = [...pending].filter((node) => incoming.get(node) === 0);
      const column = roots.length ? roots : [[...pending][0]];
      for (const node of column) {
        node.column = columns.length;
        pending.delete(node);
        for (const target of outgoing.get(node)!) {
          incoming.set(target, incoming.get(target)! - 1);
        }
      }
      columns.push(column);
    }

    const positions = new Map<DiagramNode, number>();
    columns.forEach((column) => column.forEach((node, index) => positions.set(node, index)));
    const sortColumn = (column: DiagramNode[], forward: boolean) => {
      const scores = new Map(
        column.map((node) => {
          const adjacent = [...neighbors.get(node)!].filter((neighbor) =>
            forward ? neighbor.column < node.column : neighbor.column > node.column
          );
          const score = adjacent.length
            ? adjacent.reduce((sum, neighbor) => sum + positions.get(neighbor)!, 0) /
              adjacent.length
            : positions.get(node)!;
          return [node, score];
        })
      );
      column.sort((a, b) => scores.get(a)! - scores.get(b)! || a.id.localeCompare(b.id));
      column.forEach((node, index) => positions.set(node, index));
    };
    for (let pass = 0; pass < 2; pass++) {
      columns.forEach((column) => sortColumn(column, true));
      [...columns].reverse().forEach((column) => sortColumn(column, false));
    }

    const componentEdges = orderedEdges.filter((edge) =>
      incoming.has(nodes.get(edge.source.title)!)
    );
    const detours = componentEdges.filter(
      (edge) =>
        Math.abs(nodes.get(edge.target.title)!.column - nodes.get(edge.source.title)!.column) !== 1
    );
    const leftCounts = columns.map(() => 0);
    const rightCounts = columns.map(() => 0);
    const routes = detours.map((edge) => {
      const sourceColumn = nodes.get(edge.source.title)!.column;
      const targetColumn = nodes.get(edge.target.title)!.column;
      const sourceRight = targetColumn >= sourceColumn;
      const targetRight = targetColumn <= sourceColumn;
      const sourceLane = (sourceRight ? rightCounts : leftCounts)[sourceColumn]++;
      const targetLane =
        sourceColumn === targetColumn
          ? sourceLane
          : (targetRight ? rightCounts : leftCounts)[targetColumn]++;
      return { edge, sourceLane, targetLane, sourceRight, targetRight };
    });
    // 우회선이 지나는 열에는 완만한 곡선이 들어갈 세로 공간도 확보한다.
    const columnRowGaps = columns.map(
      (_, index) =>
        rowGap +
        (detours.some((edge) => {
          const source = nodes.get(edge.source.title)!.column;
          const target = nodes.get(edge.target.title)!.column;
          return index > Math.min(source, target) && index < Math.max(source, target);
        })
          ? routeClearance * 3
          : 0)
    );
    const columnHeights = columns.map(
      (column, index) =>
        column.reduce((sum, node) => sum + node.height, 0) +
        (column.length - 1) * columnRowGaps[index]
    );
    const maxColumnHeight = Math.max(...columnHeights);
    const verticalPositions = new Map<DiagramNode, number>();
    columns.forEach((column, index) => {
      let y = (maxColumnHeight - columnHeights[index]) / 2;
      for (const node of column) {
        verticalPositions.set(node, y);
        y += node.height + columnRowGaps[index];
      }
    });
    const childY = (child: DiagramChild) => {
      const node = nodes.get(child.title)!;
      return (
        verticalPositions.get(node)! +
        headerHeight +
        node.children.indexOf(child) * (childHeight + childGap) +
        childHeight / 2
      );
    };
    const corridors = new Map(
      detours.map((edge) => [
        edge,
        findCorridors(
          columns,
          verticalPositions,
          nodes.get(edge.source.title)!.column,
          nodes.get(edge.target.title)!.column,
          childY(edge.source),
          childY(edge.target),
          maxColumnHeight
        ),
      ])
    );
    const gaps = columns
      .slice(1)
      .map((_, index) =>
        Math.max(columnGap, (rightCounts[index] + leftCounts[index + 1] + 1) * routeGap)
      );
    for (const edge of componentEdges) {
      const points = [
        { column: nodes.get(edge.source.title)!.column, y: childY(edge.source) },
        ...(corridors.get(edge) || []),
        { column: nodes.get(edge.target.title)!.column, y: childY(edge.target) },
      ];
      for (let index = 1; index < points.length; index++) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous.column === current.column) continue;
        const gap = Math.min(previous.column, current.column);
        const distance = Math.abs(current.y - previous.y);
        // 큰 높이 차이도 좁은 열 사이에서 수직에 가깝게 꺾이지 않도록 곡선 폭을 확보한다.
        gaps[gap] = Math.max(
          gaps[gap],
          Math.ceil(Math.min(distance * 0.65, Math.sqrt(distance * columnGap * 4)))
        );
      }
    }
    const offsets: number[] = [];
    let x = Math.max(margin, (leftCounts[0] + 1) * routeGap);
    columns.forEach((column, index) => {
      offsets.push(x);
      x += nodeWidth;
      if (index < columns.length - 1) {
        x += gaps[index];
      }
    });
    return {
      columns,
      component,
      routes,
      corridors,
      offsets,
      columnHeights,
      columnRowGaps,
      maxColumnHeight,
      width: x + Math.max(margin, (rightCounts.at(-1)! + 1) * routeGap),
      height: maxColumnHeight,
    };
  });
  const rowWidthLimit = viewportWidth || Math.max(0, ...layouts.map((layout) => layout.width));
  const rows: { layouts: typeof layouts; width: number; height: number }[] = [];
  for (const layout of layouts) {
    let row = rows.at(-1);
    if (!row || row.width + layout.width > rowWidthLimit) {
      row = { layouts: [], width: 0, height: 0 };
      rows.push(row);
    }
    row.layouts.push(layout);
    row.width += layout.width;
    row.height = Math.max(row.height, layout.height);
  }
  const width = Math.max(0, ...rows.map((row) => row.width));
  const height =
    margin * 2 +
    rows.reduce((sum, row) => sum + row.height, 0) +
    Math.max(0, rows.length - 1) * rowGap;
  const routes = new Map<DiagramEdge, DiagramRoute>();
  const placements: { layout: (typeof layouts)[number]; left: number; top: number }[] = [];
  let rowTop = margin;
  for (const row of rows) {
    let left = 0;
    for (const layout of row.layouts) {
      placements.push({ layout, left, top: rowTop + (row.height - layout.height) / 2 });
      left += layout.width;
    }
    rowTop += row.height + rowGap;
  }
  for (const { layout, left, top } of placements) {
    layout.columns.forEach((column, columnIndex) => {
      let y = top + (layout.maxColumnHeight - layout.columnHeights[columnIndex]) / 2;
      for (const node of column) {
        node.x = left + layout.offsets[columnIndex];
        node.y = y;
        node.children.forEach((child, index) => {
          child.x = node.x + nodePadding;
          child.y = node.y + headerHeight + index * (childHeight + childGap);
        });
        y += node.height + layout.columnRowGaps[columnIndex];
      }
    });
    const tracks: { y: number; left: number; right: number }[] = [];
    layout.routes.forEach(({ edge, sourceLane, targetLane, sourceRight, targetRight }) => {
      const source = nodes.get(edge.source.title)!;
      const target = nodes.get(edge.target.title)!;
      const sourceX = sourceRight
        ? source.x + nodeWidth + (sourceLane + 1) * routeGap
        : source.x - (sourceLane + 1) * routeGap;
      const targetX = targetRight
        ? target.x + nodeWidth + (targetLane + 1) * routeGap
        : target.x - (targetLane + 1) * routeGap;
      const sy = edge.source.y + edge.source.height / 2;
      const ty = edge.target.y + edge.target.height / 2;
      if (source.column === target.column) {
        routes.set(edge, { sourceX, targetX, trackY: sy, corridors: [] });
        return;
      }
      const left = Math.min(sourceX, targetX);
      const right = Math.max(sourceX, targetX);
      const midpoint = (sy + ty) / 2;
      const candidates = new Set([
        sy,
        ty,
        midpoint,
        ...layout.component.flatMap((node) => [
          node.y - routeClearance,
          node.y - routeGap,
          node.y + node.height + routeClearance,
          node.y + node.height + routeGap,
        ]),
        ...tracks.flatMap((track) => [track.y - routeClearance, track.y + routeClearance]),
      ]);
      const score = (y: number) =>
        Math.abs(sy - y) +
        Math.abs(ty - y) +
        (tracks.some(
          (track) => Math.abs(track.y - y) < 4 && track.left < right && track.right > left
        )
          ? routeGap
          : 0);
      const trackY = [...candidates]
        .filter(
          (y) =>
            y >= top - routeClearance &&
            y <= top + layout.height + routeClearance &&
            layout.component.every(
              (node) =>
                node.x >= right ||
                node.x + node.width <= left ||
                y <= node.y - routeClearance ||
                y >= node.y + node.height + routeClearance
            )
        )
        .sort(
          (a, b) => score(a) - score(b) || Math.abs(a - midpoint) - Math.abs(b - midpoint) || a - b
        )[0];
      routes.set(edge, {
        sourceX,
        targetX,
        trackY,
        corridors: layout.corridors.get(edge)!.map((corridor) => ({
          ...corridor,
          y: top + corridor.y,
          minY: top + corridor.minY,
          maxY: top + corridor.maxY,
          left: layout.columns[corridor.column][0].x - routeClearance / 2,
          right: layout.columns[corridor.column][0].x + nodeWidth + routeClearance / 2,
        })),
      });
      tracks.push({ y: trackY, left, right });
    });
  }
  return {
    nodes: orderedNodes,
    edges: orderedEdges.map((edge) => {
      const source = nodes.get(edge.source.title)!;
      const target = nodes.get(edge.target.title)!;
      const sourceRight = target.column >= source.column;
      const targetRight = target.column <= source.column;
      const sx = sourceRight ? edge.source.x + edge.source.width + 4 : edge.source.x - 4;
      const sy = edge.source.y + edge.source.height / 2;
      const tx = targetRight ? edge.target.x + edge.target.width + 4 : edge.target.x - 4;
      const ty = edge.target.y + edge.target.height / 2;
      const route = routes.get(edge);
      const selfLoop = edge.source === edge.target;
      const sameColumn = source.column === target.column;
      const arrowBase = tx + (targetRight ? 8 : -8);
      const curvedRoute =
        route && !sameColumn
          ? buildCurvedRoute(
              sx,
              sy,
              tx,
              ty,
              route,
              orderedNodes.filter((node) => node !== source && node !== target),
              height
            )
          : undefined;
      const angle =
        curvedRoute && route ? Math.atan2(ty - curvedRoute.controlY, tx - route.targetX) : 0;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        path: route
          ? selfLoop
            ? `M ${sx} ${sy} C ${route.sourceX} ${sy}, ${route.sourceX + routeGap} ${sy - 16}, ${
                route.sourceX + routeGap
              } ${sy} C ${route.sourceX + routeGap} ${sy + 16}, ${route.sourceX} ${ty}, ${tx} ${ty}`
            : sameColumn
            ? `M ${sx} ${sy} C ${route.sourceX} ${sy}, ${route.sourceX} ${ty}, ${tx} ${ty}`
            : curvedRoute!.path
          : buildDirectCurve(sx, sy, tx, ty),
        arrow: curvedRoute
          ? `${tx},${ty} ${tx - dx * 8 + dy * 4},${ty - dy * 8 - dx * 4} ${tx - dx * 8 - dy * 4},${
              ty - dy * 8 + dx * 4
            }`
          : `${tx},${ty} ${arrowBase},${ty - 4} ${arrowBase},${ty + 4}`,
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

function DiagramViewport({
  width,
  height,
  availableWidth,
  availableHeight,
  children,
}: {
  width: number;
  height: number;
  availableWidth: number;
  availableHeight: number;
  children: React.ReactNode;
}) {
  const viewportWidth = Math.min(availableWidth, width + (height > availableHeight ? 20 : 0));
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        showsHorizontalScrollIndicator
        showsVerticalScrollIndicator
        style={[
          styles.viewport,
          styles.webViewport,
          { width: viewportWidth, maxHeight: availableHeight },
        ]}
        contentContainerStyle={{ width, height }}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={height > availableHeight}
      style={[styles.viewport, { width: viewportWidth, height: Math.min(height, availableHeight) }]}
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={[styles.viewport, { width: viewportWidth, height }]}
      >
        {children}
      </ScrollView>
    </ScrollView>
  );
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const diagramRef = useRef<View>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportTop, setViewportTop] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [zoom, setZoom] = useState(1);
  const measureViewport = () => {
    diagramRef.current?.measureInWindow((_x, y) => setViewportTop(Math.max(0, Math.ceil(y))));
  };
  useLayoutEffect(measureViewport, [windowWidth, windowHeight, expanded]);
  const graph = useMemo(
    () => buildTopicConnectionDiagram(connections.details, viewportWidth),
    [connections.details, viewportWidth]
  );
  const availableWidth = viewportWidth || windowWidth;
  const availableHeight = Math.max(0, windowHeight - viewportTop - viewportBottomGap);
  const scaledWidth = Math.ceil(graph.width * zoom);
  const scaledHeight = Math.ceil(graph.height * zoom);
  const changeZoom = (value: number) =>
    setZoom(Math.round(Math.min(maxZoom, Math.max(minZoom, value)) * 100) / 100);
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
          <View style={styles.zoomControls}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="연결 규칙 관계 축소"
              accessibilityState={{ disabled: zoom <= minZoom }}
              disabled={zoom <= minZoom}
              onPress={() => changeZoom(zoom - zoomStep)}
              style={[
                commonStyles.navButton,
                styles.zoomButton,
                { opacity: zoom <= minZoom ? 0.4 : 1 },
              ]}
            >
              <Icon name="minus" size={12} color={commonStyles.text.color} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="연결 규칙 관계 100%로 복원"
              onPress={() => changeZoom(1)}
              style={[commonStyles.navButton, styles.zoomButton]}
            >
              <Text style={commonStyles.text}>{Math.round(zoom * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="연결 규칙 관계 확대"
              accessibilityState={{ disabled: zoom >= maxZoom }}
              disabled={zoom >= maxZoom}
              onPress={() => changeZoom(zoom + zoomStep)}
              style={[
                commonStyles.navButton,
                styles.zoomButton,
                { opacity: zoom >= maxZoom ? 0.4 : 1 },
              ]}
            >
              <Icon name="plus" size={12} color={commonStyles.text.color} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="연결 규칙 관계 화면에 맞춤"
              onPress={() =>
                changeZoom(
                  Math.floor(
                    Math.min(1, availableWidth / graph.width, availableHeight / graph.height) * 100
                  ) / 100
                )
              }
              style={[commonStyles.navButton, styles.zoomButton]}
            >
              <Text style={commonStyles.text}>맞춤</Text>
            </TouchableOpacity>
          </View>
          <View
            ref={diagramRef}
            style={[styles.diagram, { maxWidth: windowWidth }]}
            onLayout={({ nativeEvent }) => {
              setViewportWidth(Math.round(nativeEvent.layout.width));
              measureViewport();
            }}
          >
            <DiagramViewport
              width={scaledWidth}
              height={scaledHeight}
              availableWidth={availableWidth}
              availableHeight={availableHeight}
            >
              <View style={{ width: scaledWidth, height: scaledHeight, overflow: 'hidden' }}>
                <View
                  style={[
                    styles.graph,
                    { width: graph.width, height: graph.height, transform: [{ scale: zoom }] },
                  ]}
                >
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
              </View>
            </DiagramViewport>
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
  diagram: { minWidth: 0, alignSelf: 'stretch' },
  viewport: { flexGrow: 0, flexShrink: 0 },
  webViewport: { overflowX: 'auto', overflowY: 'auto' } as ViewStyle,
  graph: { position: 'absolute', left: 0, top: 0, transformOrigin: 'top left' },
  zoomControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoomButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
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
