import { Text } from '@blacktokki/core';
import React, { useState } from 'react';
import { Platform, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { templateGraphStyles as styles } from './styles';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';

interface TemplateGraphBadgeProps {
  active: boolean;
  label: string;
  icon: string;
  isDark: boolean;
  activeBackgroundColor?: string;
  activeBorderColor?: string;
  activeTextColor?: string;
  inactiveTextColor: string | undefined;
  inactiveBorderColor?: string;
  accessibilityLabel?: string;
  working?: boolean;
  onToggle: () => void;
}

/** Match existing graph badges while keeping template-specific UI in this feature. */
export const TemplateGraphBadge: React.FC<TemplateGraphBadgeProps> = ({
  active,
  label,
  icon,
  isDark,
  activeBackgroundColor,
  activeBorderColor,
  activeTextColor,
  inactiveTextColor,
  inactiveBorderColor = 'transparent',
  accessibilityLabel = label,
  working = false,
  onToggle,
}) => {
  const { commonStyles } = useNotebookTheme();
  const [focused, setFocused] = useState(false);
  const textColor = active ? activeTextColor : inactiveTextColor;
  return (
    <TouchableOpacity
      style={[
        styles.toggle,
        {
          backgroundColor: active
            ? activeBackgroundColor
            : isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
          borderColor: active ? activeBorderColor : inactiveBorderColor,
        },
        Platform.OS === 'web' && styles.webButton,
        focused && commonStyles.focusedBorder,
      ]}
      onPress={onToggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...(Platform.OS === 'web'
        ? {
            onClick: (event: any) => {
              event.stopPropagation();
              onToggle();
            },
            onPointerDown: (event: any) => event.stopPropagation(),
          }
        : {})}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, busy: working }}
      aria-pressed={active}
    >
      <Icon name={icon} size={11} color={textColor} style={styles.icon} />
      <Text style={[styles.toggleText, { color: textColor, fontWeight: active ? 'bold' : '600' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};
