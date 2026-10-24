import { useLangContext } from '@blacktokki/core';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { ProgressBar } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { AnalysisAction } from '../components/AnalysisControls';
import { countRelationKeywords } from '../keyword/keywordUtils';
import { uniqueRelationEvidence } from '../relationPresentation';
import { relationCandidateEvidence } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import { relationAnalysisDisplay, useSearchEmbeddingStatus } from '../useRelationAnalysis';
import type { SearchEmbeddingStatus, useRelationAnalysis } from '../useRelationAnalysis';

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
  const savedEmbedding = useSearchEmbeddingStatus(scope, 'extension');
  const queryEmbedding = useSearchEmbeddingStatus(scope, 'search');
  const finalEmbedding: SearchEmbeddingStatus =
    savedEmbedding.analysisRunId === analysis.runId
      ? savedEmbedding
      : { phase: 'idle' as const, processed: 0, total: 0 };
  const {
    busy,
    phaseLabel,
    ratio,
    stageRatio,
    indeterminate: stageIndeterminate,
  } = relationAnalysisDisplay(analysis, finalEmbedding, !ready || loading);
  const showProgress = analysis.status !== 'idle' || finalEmbedding.phase !== 'idle';
  const progress = analysis.status === 'completed' ? finalEmbedding : analysis;
  const processed = progress.processed.toLocaleString();
  const counts =
    progress.total > 0
      ? `${processed} / ${progress.total.toLocaleString()}`
      : progress.processed
      ? processed
      : '—';
  const preparingEmbeddings =
    analysis.status === 'completed' &&
    (finalEmbedding.phase === 'idle' ||
      finalEmbedding.phase === 'checking' ||
      finalEmbedding.phase === 'running');
  const embeddingError = queryEmbedding.error || finalEmbedding.error;
  const canStart =
    analysis.status !== 'idle' &&
    !(analysis.status === 'ready' && analysis.patternCache?.status === 'reusable') &&
    (analysis.status !== 'completed' ||
      (finalEmbedding.phase === 'completed' && queryEmbedding.phase !== 'running'));
  const startLabel =
    analysis.status === 'cancelled'
      ? 'Resume analysis'
      : analysis.status === 'failed'
      ? 'Retry'
      : analysis.status === 'completed'
      ? 'Run analysis again'
      : analysis.patternCache && analysis.patternCache.status !== 'missing'
      ? 'Update cache'
      : 'Start analysis';
  const inventory = analysis.entities?.entities ?? analysis.result?.entityExtraction?.entities;
  const keywordCount = useMemo(
    () => (inventory ? countRelationKeywords(inventory) : '—'),
    [inventory]
  );
  const candidates = analysis.result?.candidates;
  const candidateCount = analysis.patterns?.length ?? candidates?.length ?? '—';
  const evidenceCount = useMemo(
    () =>
      candidates
        ? uniqueRelationEvidence(candidates.flatMap(relationCandidateEvidence)).length
        : analysis.patterns?.length === 0
        ? 0
        : '—',
    [candidates, analysis.patterns]
  );
  const metrics = [
    ['Source Notes', noteCount],
    ['Keyword', keywordCount],
    ['Collected candidates', candidateCount],
    ['Unique evidence', evidenceCount],
  ];
  return (
    <View
      style={[commonStyles.card, styles.panel, styles.progressPanel]}
      accessibilityState={{
        busy: busy || preparingEmbeddings || queryEmbedding.phase === 'running',
      }}
      testID="relation-analysis-progress"
    >
      <View style={[styles.wrap, styles.between]}>
        <View style={[styles.section, styles.heading]}>
          <Text style={[commonStyles.title, styles.sectionTitle]}>
            {lang('Keywords and Relationships')}
          </Text>
        </View>
        <View style={styles.wrap}>
          <AnalysisAction
            showLabel
            label="Refresh notes"
            icon="refresh"
            onPress={refresh}
            loading={loading}
            disabled={!ready || loading || busy || preparingEmbeddings}
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
          ) : canStart ? (
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
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <View style={[styles.wrap, styles.between]}>
          <Text
            testID="relation-analysis-status"
            style={[commonStyles.text, styles.status]}
            accessibilityLiveRegion="polite"
          >
            {lang(phaseLabel)}
          </Text>
          {showProgress && (
            <Text style={commonStyles.smallText}>
              {lang('Stage progress')}:{' '}
              {stageIndeterminate
                ? '—'
                : `${counts} · ${(Math.floor(stageRatio * 1000) / 10).toFixed(1)}%`}
            </Text>
          )}
        </View>
        {showProgress && (
          <>
            <Text style={commonStyles.smallText}>
              {lang('Overall progress')}: {(Math.floor(ratio * 1000) / 10).toFixed(1)}%
            </Text>
            <View style={[styles.progressTrack]}>
              <ProgressBar
                key={analysis.runId}
                progress={ratio}
                indeterminate={false}
                color={commonStyles.button.backgroundColor}
                style={[commonStyles.resultsContainer, styles.progress]}
                accessibilityLabel={lang('Overall progress')}
                accessibilityValue={{ min: 0, max: 100, now: Math.floor(ratio * 100) }}
              />
            </View>
            <View
              testID="relation-analysis-statistics"
              style={[commonStyles.resultsContainer, styles.statsGrid]}
            >
              {[
                ['Processed contexts and groups', analysis.processed.toLocaleString()],
                ['Elapsed seconds', (analysis.elapsedMs / 1000).toFixed(1)],
              ].map(([label, value]) => (
                <View key={label} style={styles.statCell}>
                  <Text style={commonStyles.smallText}>{lang(label)}</Text>
                  <Text style={commonStyles.text}>{value}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
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
              {lang(warning)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
