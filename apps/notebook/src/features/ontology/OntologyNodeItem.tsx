import React from 'react';
import { Platform } from 'react-native';
import { Circle, G, Rect, Text as SvgText } from 'react-native-svg';

import { OntologyNode } from './types';

interface OntologyNodeItemProps {
  node: OntologyNode;
  isSelected: boolean;
  isFocused: boolean;
  isViolating: boolean;
  isVirtualEligible?: boolean;
  isDark: boolean;
  labelColor: string;
  labelBg: string;
  labelBorder: string;
  hideLabel?: boolean;
  onNodeClick: (node: OntologyNode, e: any) => void;
  onNodePointerDown?: (e: any) => void;
}

export const OntologyNodeItem: React.FC<OntologyNodeItemProps> = React.memo(
  ({
    node,
    isSelected,
    isFocused,
    isViolating,
    isVirtualEligible,
    isDark,
    labelColor,
    labelBg,
    labelBorder,
    hideLabel,
    onNodeClick,
    onNodePointerDown,
  }) => {
    const opacity = isFocused ? 1 : 0.12;
    const labelText = node.name.length > 15 ? node.name.slice(0, 14) + '…' : node.name;
    const pillWidth = Math.max(38, labelText.length * 7 + 14);

    const isLiteral = node.type === 'LITERAL' || node.role === 'LITERAL';
    const hitTargetR = isLiteral
      ? Math.max(node.width || 50, 24) / 2 + 6
      : Math.max(node.radius + 8, 18);

    return (
      <G
        transform={`translate(${node.x}, ${node.y})`}
        opacity={opacity}
        onPress={(e: any) => onNodeClick(node, e)}
        {...(Platform.OS === 'web'
          ? ({
              cursor: 'pointer',
              onClick: (e: any) => onNodeClick(node, e),
              onPointerDown: onNodePointerDown,
            } as any)
          : {})}
      >
        {/* Invisible hit target */}
        <Circle cx={0} cy={0} r={hitTargetR} fill="transparent" />

        {/* Selected Outer Glowing Ring */}
        {isSelected &&
          (isLiteral ? (
            <Rect
              x={-(node.width || 50) / 2 - 4}
              y={-(node.height || 20) / 2 - 4}
              width={(node.width || 50) + 8}
              height={(node.height || 20) + 8}
              rx={5}
              stroke="#F39C12"
              strokeWidth={2.2}
              fill="none"
              opacity={0.9}
            />
          ) : (
            <Circle
              cx={0}
              cy={0}
              r={node.radius + 4}
              stroke="#F39C12"
              strokeWidth={2.2}
              fill="none"
              opacity={0.9}
            />
          ))}

        {/* Axiom Violation Warning Ring */}
        {isViolating && (
          <Circle
            cx={0}
            cy={0}
            r={node.radius + 3}
            stroke="#E74C3C"
            strokeWidth={1.8}
            strokeDasharray="3,3"
            fill="none"
            opacity={0.95}
          />
        )}

        {/* Virtual Note Eligible Topic Class Outer Ring */}
        {isVirtualEligible && !isSelected && (
          <Circle
            cx={0}
            cy={0}
            r={node.radius + 3.8}
            stroke={isDark ? '#F18BB8' : '#AD3D76'}
            strokeWidth={1.4}
            strokeDasharray="3,3"
            fill="none"
            opacity={0.85}
          />
        )}

        {/* Node Shape by VOWL Specification */}
        {isLiteral ? (
          // VOWL Datatype / Literal: Yellow/Beige Rectangle
          <G>
            <Rect
              x={-(node.width || 50) / 2}
              y={-(node.height || 20) / 2}
              width={node.width || 50}
              height={node.height || 20}
              rx={3}
              ry={3}
              fill={node.color}
              stroke={isSelected ? '#F39C12' : node.strokeColor || (isDark ? '#FFD700' : '#D4AC0D')}
              strokeWidth={isSelected ? 2 : 1.2}
            />
            {(!hideLabel || isSelected) && (
              <SvgText
                x={0}
                y={3.5}
                fill={isDark ? '#FFEAA7' : '#5D4037'}
                fontSize={9}
                fontWeight="bold"
                textAnchor="middle"
              >
                {node.name.length > 12 ? node.name.slice(0, 11) + '…' : node.name}
              </SvgText>
            )}
          </G>
        ) : node.role === 'CLASS' ? (
          // VOWL Class: Prominent Circle with thick border
          <Circle
            cx={0}
            cy={0}
            r={node.radius}
            fill={node.color}
            stroke={isSelected ? '#F39C12' : node.strokeColor || (isDark ? '#AACCFF' : '#5588CC')}
            strokeWidth={isSelected ? 2.6 : 2}
          />
        ) : node.instanceKind === 'NOTE' ? (
          // VOWL Individual (Note): Double Ring Circle
          <G>
            <Circle
              cx={0}
              cy={0}
              r={node.radius + 2.5}
              fill="none"
              stroke={isSelected ? '#F39C12' : node.strokeColor || (isDark ? '#48C78E' : '#27AE60')}
              strokeWidth={1.2}
            />
            <Circle
              cx={0}
              cy={0}
              r={node.radius}
              fill={node.color}
              stroke={isSelected ? '#F39C12' : node.strokeColor || (isDark ? '#48C78E' : '#27AE60')}
              strokeWidth={1.2}
            />
          </G>
        ) : (
          // VOWL Instance (Card): Circle
          <Circle
            cx={0}
            cy={0}
            r={node.radius}
            fill={node.color}
            stroke={isSelected ? '#F39C12' : node.strokeColor || (isDark ? '#70A1FF' : '#3060C0')}
            strokeWidth={isSelected ? 2 : 1.4}
          />
        )}

        {/* Node Label Pill Background (for Non-Literal Entities) */}
        {!isLiteral && (!hideLabel || isSelected || isViolating || isVirtualEligible) && (
          <G transform={`translate(0, ${node.radius + 10})`}>
            <Rect
              x={-pillWidth / 2}
              y={-8}
              width={pillWidth}
              height={16}
              rx={4}
              fill={labelBg}
              stroke={isViolating ? '#E74C3C' : isSelected ? '#F39C12' : labelBorder}
              strokeWidth={isViolating ? 1.4 : isSelected ? 1.2 : 0.8}
            />
            <SvgText
              x={0}
              y={3.5}
              fill={labelColor}
              fontSize={node.role === 'CLASS' ? 11.5 : 10}
              fontWeight={node.role === 'CLASS' ? 'bold' : '600'}
              textAnchor="middle"
            >
              {labelText}
            </SvgText>
          </G>
        )}
      </G>
    );
  },
  (prev, next) =>
    prev.node.id === next.node.id &&
    prev.node.x === next.node.x &&
    prev.node.y === next.node.y &&
    prev.node.color === next.node.color &&
    prev.node.strokeColor === next.node.strokeColor &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused &&
    prev.isViolating === next.isViolating &&
    prev.isVirtualEligible === next.isVirtualEligible &&
    prev.isDark === next.isDark &&
    prev.labelColor === next.labelColor &&
    prev.labelBg === next.labelBg &&
    prev.labelBorder === next.labelBorder &&
    prev.hideLabel === next.hideLabel
);
