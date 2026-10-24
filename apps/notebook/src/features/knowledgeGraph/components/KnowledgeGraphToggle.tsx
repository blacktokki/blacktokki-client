import { Text } from '@blacktokki/core';
import React, { useState } from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { templateGraphStyles as styles } from '../inductiveTemplate/styles';

interface KnowledgeGraphToggleProps {
  active: boolean;
  label: string;
  icon: string;
  activeBackgroundColor?: string;
  activeBorderColor?: string;
  activeTextColor?: string;
  inactiveTextColor: string | undefined;
  inactiveBorderColor?: string;
  accessibilityLabel?: string;
  working?: boolean;
  disabled?: boolean;
  progress?: number;
  onToggle: () => void;
}

/** Shared graph-overlay control with focus and pressed-state feedback. */
export const KnowledgeGraphToggle: React.FC<KnowledgeGraphToggleProps> = ({
  active,
  label,
  icon,
  activeBackgroundColor,
  activeBorderColor,
  activeTextColor,
  inactiveTextColor,
  inactiveBorderColor = 'transparent',
  accessibilityLabel = label,
  working = false,
  disabled = false,
  progress,
  onToggle,
}) => {
  const { commonStyles } = useNotebookTheme();
  const [focused, setFocused] = useState(false);
  const textColor = active ? activeTextColor : inactiveTextColor;
  const ratio = progress === undefined ? undefined : Math.min(1, Math.max(0, progress));
  const percent = ratio === undefined ? undefined : Math.round(ratio * 100);
  return (
    <TouchableOpacity
      style={[
        styles.toggle,
        {
          backgroundColor: active ? activeBackgroundColor : commonStyles.card?.backgroundColor,
          borderColor: active ? activeBorderColor : inactiveBorderColor,
        },
        Platform.OS === 'web' && styles.webButton,
        focused && commonStyles.focusedBorder,
      ]}
      activeOpacity={1}
      disabled={disabled}
      onPress={disabled ? undefined : onToggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...(Platform.OS === 'web'
        ? {
            onClick: (event: any) => {
              event.stopPropagation();
              if (!disabled) onToggle();
            },
            onPointerDown: (event: any) => event.stopPropagation(),
          }
        : {})}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, busy: working, disabled }}
      accessibilityValue={percent === undefined ? undefined : { min: 0, max: 100, now: percent }}
      aria-pressed={active}
    >
      {ratio !== undefined && (
        <View
          pointerEvents="none"
          accessible={false}
          style={[
            styles.progressFill,
            { width: `${ratio * 100}%`, backgroundColor: activeBackgroundColor },
          ]}
        />
      )}
      <Icon name={icon} size={11} color={textColor} style={styles.icon} />
      <Text style={[styles.toggleText, { color: textColor, fontWeight: active ? 'bold' : '600' }]}>
        {label + (percent === undefined ? '' : ` (${percent}%)`)}
      </Text>
    </TouchableOpacity>
  );
};
