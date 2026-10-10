import { useLangContext } from '@blacktokki/core';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Icon } from 'react-native-paper';

import { useNotebookTheme } from '../../hooks/useNotebookTheme';

/** Visible action captions work with touch, mouse and keyboard without hover tooltips. */
export const TemplateAction = ({
  icon,
  label,
  caption,
  onPress,
  disabled,
  primary,
  active,
}: {
  icon: string;
  label: string;
  caption?: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [focused, setFocused] = useState(false);
  const color = primary ? commonStyles.buttonText.color : commonStyles.text.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lang(label)}
      accessibilityState={{ selected: active, disabled }}
      aria-pressed={active}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary
            ? commonStyles.button.backgroundColor
            : active
            ? commonStyles.activeTab.backgroundColor
            : commonStyles.input.backgroundColor,
          borderColor: commonStyles.card.borderColor,
        },
        focused && commonStyles.focusedBorder,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon source={icon} size={20} color={color} />
      <Text style={[styles.caption, { color }]}>{lang(caption || label)}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  action: {
    margin: 0,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  caption: { fontSize: 13, lineHeight: 20 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
