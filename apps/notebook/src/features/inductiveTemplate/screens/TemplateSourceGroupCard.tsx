import { Text, useResizeContext } from '@blacktokki/core';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Card } from 'react-native-paper';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { Item } from '../../../screens/main/CardPageSection';
import { templateStyles as styles } from '../styles';

/** A path group counts actual source notes, including its parent only when that note exists. */
export const TemplateSourceGroupCard = ({
  item,
  count,
}: {
  item: Extract<Item, { title: string }>;
  count: number;
}) => {
  const window = useResizeContext();
  const { commonStyles } = useNotebookTheme();
  const { maxWidth, padding } = item.scale[window];
  const fontSize = window === 'landscape' ? 16 : 14;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={item.onPress}
      style={[
        styles.sourceGroup,
        {
          flexBasis: window === 'landscape' ? '33%' : '50%',
          minWidth: maxWidth,
          maxWidth,
          padding,
          paddingRight: 0,
        },
      ]}
    >
      <View style={styles.sourceGroupFrame}>
        {Array.from({ length: Math.min(3, count) }, (_, index) => (
          <View
            key={index}
            style={[
              commonStyles.card,
              styles.sourceGroupLayer,
              { top: -4 * (index + 1), left: 3 * (index + 1), zIndex: -(index + 1) },
            ]}
          />
        ))}
        <Card
          onPress={item.onPress}
          style={[
            commonStyles.card,
            styles.sourceGroupBody,
            {
              padding: 8 + padding * 0.4,
              aspectRatio: item.updated || window === 'landscape' ? 1 / Math.sqrt(2) : Math.sqrt(2),
            },
          ]}
        >
          <Card.Content style={styles.sourceGroupPreview}>{item.descriptionComponent}</Card.Content>
        </Card>
      </View>
      <View style={[styles.row, styles.between]}>
        <Text style={[styles.grow, { fontSize }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.sourceGroupCount, { fontSize: fontSize - 2 }]}>( {count} )</Text>
      </View>
    </TouchableOpacity>
  );
};
