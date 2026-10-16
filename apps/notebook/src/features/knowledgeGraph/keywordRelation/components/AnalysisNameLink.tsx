import React from 'react';
import { Pressable, Text } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { relationAnalysisStyles as styles } from '../styles';

/** Names navigate within the analysis workspace without leaving its model session. */
export function AnalysisNameLink({
  name,
  onPress,
  variant = 'text',
}: {
  name: string;
  onPress: () => void;
  variant?: 'text' | 'chip' | 'field';
}) {
  const { commonStyles } = useNotebookTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={onPress}
      style={[
        styles.nameLink,
        variant === 'chip' && [commonStyles.resultsContainer, styles.entityChip],
        variant === 'field' && styles.fieldLink,
      ]}
    >
      <Text style={[commonStyles.text, variant !== 'chip' && styles.linkText]}>{name}</Text>
    </Pressable>
  );
}
