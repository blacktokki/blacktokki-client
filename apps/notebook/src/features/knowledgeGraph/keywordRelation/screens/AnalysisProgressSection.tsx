import { useLangContext } from '@blacktokki/core';
import React from 'react';
import { Text, View } from 'react-native';
import { ProgressBar } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { AnalysisAction } from '../components/AnalysisAction';
import { relationAnalysisDisplay } from '../relationStatus';
import { useSearchEmbeddingStatus } from '../search/embeddingStatus';
import { relationAnalysisStyles as styles } from '../styles';
import { useRelationAnalysis } from '../useRelationAnalysis';

type Analysis = ReturnType<typeof useRelationAnalysis>;
export function AnalysisProgressSection({
  analysis,
  scope,
  noteCount,
  loading,
  ready,
  refresh,
  onStopSearch,
}: {
  analysis: Analysis;
  scope: string;
  noteCount: number;
  loading: boolean;
  ready: boolean;
  refresh: () => void;
  onStopSearch?: () => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const finalEmbedding = useSearchEmbeddingStatus(scope, 'extension');
  const queryEmbedding = useSearchEmbeddingStatus(scope, 'search');
  const progressEmbedding = finalEmbedding.phase === 'idle' ? queryEmbedding : finalEmbedding;
  const { busy, phaseLabel, statusLabel, ratio } = relationAnalysisDisplay(
    analysis,
    progressEmbedding
  );
  const progress = analysis.status === 'completed' ? progressEmbedding : analysis;
  const embeddingError = queryEmbedding.error || finalEmbedding.error;
  const startLabel =
    analysis.status === 'cancelled'
      ? 'Resume analysis'
      : analysis.status === 'failed'
      ? 'Retry'
      : analysis.status === 'completed'
      ? 'Run analysis again'
      : 'Start analysis';
  const metrics = [
    ['Source Notes', noteCount],
    ['Keyword', analysis.entities?.entities.length ?? '—'],
    ['Relationship patterns', analysis.patterns?.length ?? '—'],
    ['Saved batches', analysis.savedBatch],
  ];
  return (
    <View
      style={[commonStyles.card, styles.panel, styles.progressPanel]}
      accessibilityState={{
        busy: busy || finalEmbedding.phase === 'running' || queryEmbedding.phase === 'running',
      }}
      testID="relation-analysis-progress"
    >
      <View style={[styles.wrap, styles.between]}>
        <View style={[styles.section, styles.heading]}>
          <Text style={[commonStyles.title, styles.sectionTitle]} accessibilityLiveRegion="polite">
            {lang(statusLabel)}
          </Text>
        </View>
        <View style={styles.wrap}>
          <AnalysisAction
            showLabel
            label="Refresh notes"
            icon="refresh"
            onPress={refresh}
            loading={loading}
            disabled={!ready || loading}
          />
          {busy ? (
            <AnalysisAction
              showLabel
              label="cancel"
              icon="stop"
              mode="outlined"
              onPress={analysis.stop}
              disabled={analysis.status === 'stopping'}
            />
          ) : queryEmbedding.phase === 'running' && onStopSearch ? (
            <AnalysisAction showLabel label="cancel" icon="close" onPress={onStopSearch} />
          ) : analysis.status !== 'idle' ? (
            <AnalysisAction
              showLabel
              label={startLabel}
              icon={
                analysis.status === 'completed'
                  ? 'replay'
                  : analysis.status === 'failed'
                  ? 'restart'
                  : 'play'
              }
              mode="contained"
              onPress={analysis.start}
              disabled={!ready || loading || !noteCount}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.metrics}>
        {metrics.map(([label, value]) => (
          <View key={label} style={styles.metric}>
            <Text style={commonStyles.smallText}>{lang(String(label))}</Text>
            <Text style={[commonStyles.text, styles.metricValue]}>{value}</Text>
            {label === 'Relationship patterns' && (
              <Text style={commonStyles.smallText}>
                {analysis.patternChanges
                  ? `(+${analysis.patternChanges.added} / −${analysis.patternChanges.removed})`
                  : '(—)'}
              </Text>
            )}
          </View>
        ))}
      </View>
      {(analysis.status !== 'idle' || progressEmbedding.phase !== 'idle') && (
        <View style={styles.section}>
          <View style={[styles.wrap, styles.between]}>
            <Text style={commonStyles.text}>{lang(phaseLabel)}</Text>
            <Text style={commonStyles.smallText}>
              {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} ·{' '}
              {(ratio * 100).toFixed(1)}%
            </Text>
          </View>
          <View style={[styles.progressTrack]}>
            <ProgressBar
              progress={ratio}
              color={commonStyles.button.backgroundColor}
              style={[commonStyles.resultsContainer, styles.progress]}
              accessibilityLabel={lang(phaseLabel)}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
            />
          </View>
          <View
            testID="relation-analysis-statistics"
            style={[commonStyles.resultsContainer, styles.statsGrid]}
          >
            {[
              ['Model calls', analysis.modelChecks.toLocaleString()],
              ['Reused inputs', analysis.reused.toLocaleString()],
              ['Failed validations', analysis.failed.toLocaleString()],
              ['Elapsed seconds', (analysis.elapsedMs / 1000).toFixed(1)],
            ].map(([label, value]) => (
              <View key={label} style={styles.statCell}>
                <Text style={commonStyles.smallText}>{lang(label)}</Text>
                <Text style={commonStyles.text}>{value}</Text>
              </View>
            ))}
          </View>
          {analysis.status === 'running' && analysis.model && analysis.model.status !== 'ready' && (
            <Text style={commonStyles.smallText}>
              {lang('Preparing model')}
              {typeof analysis.model.progress === 'number'
                ? ` · ${Math.round(analysis.model.progress)}%`
                : ''}
            </Text>
          )}
        </View>
      )}
      {!!embeddingError && (
        <Text accessibilityRole="alert" style={commonStyles.smallText}>
          {embeddingError}
        </Text>
      )}
      {analysis.status === 'failed' && (
        <Text style={commonStyles.text} accessibilityRole="alert">
          {analysis.error || lang('Analysis needs attention')}
        </Text>
      )}
      {!!analysis.result?.warnings.length && (
        <View style={[commonStyles.card, styles.panel]}>
          <Text style={[commonStyles.title, styles.sectionTitle]}>{lang('Analysis notices')}</Text>
          {analysis.result.warnings.map((warning) => (
            <Text key={warning} style={commonStyles.smallText}>
              {warning}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
