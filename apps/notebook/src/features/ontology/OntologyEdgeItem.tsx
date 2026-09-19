import React from 'react';
import { G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { isInferredRelationType } from './relations';
import { OntologyEdge, OntologyNode } from './types';

interface OntologyEdgeItemProps {
  edge: OntologyEdge;
  source: OntologyNode;
  target: OntologyNode;
  curveOffset: number;
  isConnectedToFocus: boolean;
  isDark: boolean;
  scale?: number;
}

export const OntologyEdgeItem: React.FC<OntologyEdgeItemProps> = React.memo(
  ({ edge, source, target, curveOffset, isConnectedToFocus, isDark, scale }) => {
    const opacity = isConnectedToFocus ? 0.8 : 0.05;
    const isDatatype = edge.type === 'DATATYPE_PROPERTY';
    const isInferred = isInferredRelationType(edge.type);
    const strokeWidth = edge.isAxiomViolation
      ? 2.5
      : edge.type === 'REFERENCES'
      ? 1.8
      : isDatatype
      ? 1.3
      : 1.2;

    // Fast straight line or quadratic bezier curve
    let pathData: string;
    let midX = (source.x + target.x) / 2;
    let midY = (source.y + target.y) / 2;

    if (Math.abs(curveOffset) >= 1) {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy) || 1;
      const normX = -dy / dist;
      const normY = dx / dist;
      const cx = midX + normX * curveOffset;
      const cy = midY + normY * curveOffset;
      pathData = `M ${source.x} ${source.y} Q ${cx} ${cy} ${target.x} ${target.y}`;
      midX = midX * 0.5 + cx * 0.5;
      midY = midY * 0.5 + cy * 0.5;
    } else {
      pathData = `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
    }

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

    // Performance optimization: skip markers and labels for dimmed/unfocused or far zoomed-out edges
    const isZoomedOut = scale !== undefined && scale < 0.42;
    const markerEnd = !isConnectedToFocus
      ? undefined
      : isZoomedOut && !edge.isAxiomViolation
      ? undefined
      : edge.isAxiomViolation
      ? 'url(#arrow-violation)'
      : edge.type === 'REFERENCES'
      ? 'url(#arrow-ref)'
      : isInferred
      ? 'url(#arrow-inferred)'
      : isDatatype
      ? 'url(#arrow-data)'
      : edge.type === 'PART_OF' || edge.type === 'PARENT_CHILD'
      ? 'url(#arrow-sub)'
      : 'url(#arrow-inst)';

    const propLabel = edge.propertyLabel || edge.label;
    const shouldRenderLabel =
      isConnectedToFocus && Boolean(propLabel) && (!isZoomedOut || edge.isAxiomViolation);

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

    const propBoxWidth = propLabel ? Math.max(34, propLabel.length * 5.6 + 10) : 0;

    return (
      <G opacity={opacity}>
        <Path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={edge.isAxiomViolation ? '6,3' : edge.dashed ? '4,4' : undefined}
          markerEnd={markerEnd}
        />
        {shouldRenderLabel && (
          <G transform={`translate(${midX}, ${midY})`}>
            <Rect
              x={-propBoxWidth / 2}
              y={-6.5}
              width={propBoxWidth}
              height={13}
              rx={3}
              ry={3}
              fill={boxFill}
              stroke={boxBorder}
              strokeWidth={0.8}
            />
            <SvgText
              x={0}
              y={3}
              fill={propTextColor}
              fontSize={8}
              fontWeight="600"
              textAnchor="middle"
            >
              {propLabel}
            </SvgText>
          </G>
        )}
      </G>
    );
  },
  (prev, next) =>
    prev.edge.id === next.edge.id &&
    prev.source.x === next.source.x &&
    prev.source.y === next.source.y &&
    prev.target.x === next.target.x &&
    prev.target.y === next.target.y &&
    prev.curveOffset === next.curveOffset &&
    prev.isConnectedToFocus === next.isConnectedToFocus &&
    prev.isDark === next.isDark &&
    (prev.scale === undefined ||
      next.scale === undefined ||
      prev.scale < 0.42 === next.scale < 0.42)
);
