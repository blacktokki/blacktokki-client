/** Shared actions, filter choices and pagination for the analysis workspace. */
import { useLangContext } from '@blacktokki/core';
import React from 'react';
import { AccessibilityState, Pressable, Text, View } from 'react-native';
import { Button, IconButton, Chip } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { RelationFilterOperator, toggleRelationFilter } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';

/** Offer visible captions where action icons alone do not explain their purpose. */
export function AnalysisAction({
  label,
  icon,
  onPress,
  disabled,
  loading,
  mode,
  accessibilityState,
  accessibilityHint,
  showLabel = false,
}: {
  label: string;
  icon: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  mode?: 'outlined' | 'contained';
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
  showLabel?: boolean;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const actionProps = {
    icon,
    accessibilityLabel: lang(label),
    accessibilityHint: accessibilityHint && lang(accessibilityHint),
    accessibilityState,
    onPress,
    disabled,
    loading,
    style: styles.detailToggle,
  };
  if (showLabel)
    return (
      <Button
        {...actionProps}
        mode={mode || 'text'}
        contentStyle={styles.buttons}
        buttonColor={mode === 'contained' ? commonStyles.button.backgroundColor : undefined}
        textColor={mode === 'contained' ? commonStyles.buttonText.color : commonStyles.text.color}
      >
        {lang(label)}
      </Button>
    );
  return (
    <IconButton
      {...actionProps}
      mode={mode}
      size={22}
      containerColor={mode === 'contained' ? commonStyles.button.backgroundColor : undefined}
      iconColor={mode === 'contained' ? commonStyles.buttonText.color : commonStyles.text.color}
    />
  );
}

export function AnalysisFilter<T extends string>({
  label,
  labels,
  value,
  counts,
  onChange,
  operator = 'or',
  onOperatorChange,
  translateLabels = true,
  toggle,
}: {
  label?: string;
  labels: Record<T, string>;
  value: T[];
  counts: Record<T | 'all', number>;
  onChange: (value: T[]) => void;
  operator?: RelationFilterOperator;
  onOperatorChange?: (value: RelationFilterOperator) => void;
  translateLabels?: boolean;
  toggle?: {
    label: string;
    value: boolean;
    count: number;
    onChange: (value: boolean) => void;
  };
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
          const label = type === 'all' || translateLabels ? lang(key) : key;
          const selected = type === 'all' ? !value.length && !toggle?.value : value.includes(type);
          return (
            <Chip
              key={type}
              selected={selected}
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              accessibilityHint={String(counts[type])}
              onPress={() => {
                onChange(toggleRelationFilter(value, type));
                if (type === 'all') toggle?.onChange(false);
              }}
            >
              {label}
              {` · ${counts[type]}`}
            </Chip>
          );
        })}
        {toggle && (
          <Chip
            selected={toggle.value}
            accessibilityState={{ selected: toggle.value }}
            accessibilityLabel={lang(toggle.label)}
            accessibilityHint={String(toggle.count)}
            onPress={() => toggle.onChange(!toggle.value)}
          >
            {lang(toggle.label)}
            {` · ${toggle.count}`}
          </Chip>
        )}
      </View>
    </View>
  );
}

export const ANALYSIS_EVIDENCE_PAGE_SIZE = 5;

export const currentAnalysisPage = (page: number, count: number, size: number) =>
  Math.min(page, Math.max(0, Math.ceil(count / size) - 1));

export function AnalysisPagination({
  page,
  count,
  size,
  onChange,
}: {
  page: number;
  count: number;
  size: number;
  onChange: (page: number) => void;
}) {
  const { commonStyles } = useNotebookTheme();
  if (count <= size) return null;
  return (
    <View style={styles.pagination}>
      <AnalysisAction
        label="Previous"
        icon="chevron-left"
        disabled={!page}
        onPress={() => onChange(page - 1)}
      />
      <Text style={commonStyles.smallText}>
        {page + 1} / {Math.ceil(count / size)}
      </Text>
      <AnalysisAction
        label="Next"
        icon="chevron-right"
        disabled={(page + 1) * size >= count}
        onPress={() => onChange(page + 1)}
      />
    </View>
  );
}
