import React, { useState } from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { templateStyles as styles } from '../styles';

/** Theme-aware selection, hover and keyboard focus for cards, titles and source notes. */
export const TemplateChoice = ({
  children,
  label,
  selected,
  radio,
  disabled,
  expanded,
  highlightBorder = true,
  onPress,
  style,
}: {
  children: React.ReactNode;
  label: string;
  selected?: boolean;
  radio?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  highlightBorder?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) => {
  const { commonStyles } = useNotebookTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityLabel={label}
      accessibilityState={
        radio ? { checked: selected, disabled } : { selected, disabled, expanded }
      }
      aria-checked={radio ? selected : undefined}
      aria-pressed={!radio && expanded === undefined ? selected : undefined}
      aria-expanded={expanded}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        commonStyles.resultsContainer,
        styles.choice,
        style,
        (hovered || selected) && {
          backgroundColor: commonStyles.activeTab.backgroundColor,
        },
        highlightBorder && selected && { borderColor: commonStyles.button.backgroundColor },
        highlightBorder && focused && commonStyles.focusedBorder,
        highlightBorder && focused && { borderWidth: 2 },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
};
