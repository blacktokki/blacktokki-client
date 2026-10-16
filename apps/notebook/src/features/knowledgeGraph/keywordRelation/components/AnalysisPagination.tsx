import React from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { relationAnalysisStyles as styles } from '../styles';
import { AnalysisAction } from './AnalysisAction';

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
