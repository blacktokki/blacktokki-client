import { useLangContext } from '@blacktokki/core';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { RelationFilterOperator, toggleRelationFilter } from '../relationFilters';
import { relationAnalysisStyles as styles } from '../styles';

export function AnalysisFilter<T extends string>({
  label,
  labels,
  value,
  counts,
  onChange,
  operator = 'or',
  onOperatorChange,
}: {
  label?: string;
  labels: Record<T, string>;
  value: T[];
  counts: Record<T | 'all', number>;
  onChange: (value: T[]) => void;
  operator?: RelationFilterOperator;
  onOperatorChange?: (value: RelationFilterOperator) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  return (
    <View style={styles.section}>
      {label && (
        <View style={styles.wrap}>
          <Text style={commonStyles.smallText}>{lang(label)}</Text>
          {onOperatorChange &&
            (['and', 'or'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: operator === value }}
                accessibilityLabel={`${lang(label)} ${value.toUpperCase()}`}
                onPress={() => onOperatorChange(value)}
                hitSlop={6}
                style={[
                  commonStyles.resultsContainer,
                  operator === value ? commonStyles.activeTab : commonStyles.inactiveTab,
                  styles.filterOperator,
                ]}
              >
                <Text
                  style={[
                    operator === value ? commonStyles.text : commonStyles.smallText,
                    styles.filterOperatorText,
                  ]}
                >
                  {value.toUpperCase()}
                </Text>
              </Pressable>
            ))}
        </View>
      )}
      <View style={styles.filters}>
        {(['all', ...Object.keys(labels)] as (T | 'all')[]).map((type) => {
          const key = type === 'all' ? 'All' : labels[type];
          const label = lang(key);
          const selected = type === 'all' ? !value.length : value.includes(type);
          return (
            <Chip
              key={type}
              selected={selected}
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              accessibilityHint={String(counts[type])}
              onPress={() => onChange(toggleRelationFilter(value, type))}
            >
              {label}
              {` · ${counts[type]}`}
            </Chip>
          );
        })}
      </View>
    </View>
  );
}
