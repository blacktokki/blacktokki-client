import { Text, useLangContext } from '@blacktokki/core';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { getKnowledgeGraphPalette } from '../utils/palette';

export interface TopicBoardToggleProps {
  enabled: boolean;
  onToggle?: () => void;
  count?: number;
  visible?: boolean;
}

const isWeb = Platform.OS === 'web';
const stopPointerDown = (event: any) => event.stopPropagation();
const webButtonStyle = isWeb ? ({ pointerEvents: 'auto', cursor: 'pointer' } as any) : {};
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

/**
 * 지식 그래프 상단 툴바(topHudContainer)에서 다른 토글들과 일관된 디자인으로
 * 주제 보드 노드 전환을 제어하는 토글 버튼 컴포넌트.
 */
export const TopicBoardToggle: React.FC<TopicBoardToggleProps> = ({
  enabled,
  onToggle,
  count,
  visible = true,
}) => {
  if (!visible || !onToggle) {
    return null;
  }

  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const palette = getKnowledgeGraphPalette(isDark);

  const activeBackgroundColor = palette.boardClass.fill;
  const activeBorderColor = palette.boardClass.stroke;
  const activeTextColor = isDark ? '#FFFFFF' : commonStyles.text?.color;
  const inactiveTextColor = commonStyles.text?.color;
  const textColor = enabled ? activeTextColor : inactiveTextColor;

  const countSuffix = typeof count === 'number' && count > 0 ? ` (${count})` : '';
  const label = `${lang('Topic Boards')}${countSuffix}`;

  return (
    <TouchableOpacity
      style={[
        styles.toolbarToggle,
        {
          backgroundColor: enabled
            ? activeBackgroundColor
            : isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
          borderColor: enabled ? activeBorderColor : 'transparent',
        },
        webButtonStyle,
      ]}
      onPress={onToggle}
      {...webButtonEvents(onToggle)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: enabled }}
    >
      <Icon name="columns" size={11} color={textColor} style={{ marginRight: 5 }} />
      <Text
        style={[
          styles.toolbarToggleText,
          { color: textColor, fontWeight: enabled ? 'bold' : '600' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  toolbarToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  toolbarToggleText: {
    fontSize: 11,
    lineHeight: 14,
  },
});

export default TopicBoardToggle;
