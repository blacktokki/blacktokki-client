import { useLangContext } from '@blacktokki/core';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import type { GraphSource } from './types';
import { useGraphSearch } from './useGraphSearch';
import { toNoteParams } from '../../../../components/SearchBar';
import type { SearchSectionProps } from '../../../../hooks/useExtension';
import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import type { NavigationParamList } from '../../../../types';
import { getKeywordRelationColors } from '../../utils/palette';
import { AnalysisAction } from '../components/AnalysisAction';
import { AnalysisProgressSection } from '../screens/AnalysisProgressSection';
import { useRelationAnalysisSession } from '../useRelationAnalysisSession';

/** Search the full accessible graph and expose a cited context, without generating an answer. */
export function GraphSearchSection({ query }: SearchSectionProps) {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const isFocused = useIsFocused();
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const colors = getKeywordRelationColors(colorScheme === 'dark');
  const [depth, setDepth] = useState(2);
  const [tab, setTab] = useState<'ui' | 'raw'>('ui');
  const { data: analysisData, analysis } = useRelationAnalysisSession();
  const search = useGraphSearch(query, depth, true, isFocused);
  const { result, snapshot } = search;
  const nodes = useMemo(() => new Map(result?.nodes.map(({ node }) => [node.id, node])), [result]);
  const edges = useMemo(() => new Map(result?.edges.map(({ edge }) => [edge.id, edge])), [result]);
  const citations = useMemo(
    () =>
      new Map(
        result?.context.citations.map((source, index) => [source.id, { source, number: index + 1 }])
      ),
    [result]
  );
  const openSource = (source: GraphSource) =>
    navigation.push('NotePage', toNoteParams(source.title, source.paragraph, source.section));
  const sourceLinks = (ids: string[]) => {
    const linked = [...new Set(ids)]
      .map((id) => citations.get(id))
      .filter((citation): citation is { source: GraphSource; number: number } => !!citation);
    if (!linked.length) return null;
    return (
      <View style={[styles.sources, { borderTopColor: commonStyles.card.borderColor }]}>
        <Text style={[commonStyles.smallText, styles.sourceHeading]}>
          {lang('Sources')} · {linked.length}
        </Text>
        {linked.map(({ source, number }) => (
          <Pressable
            key={source.id}
            accessibilityRole="link"
            accessibilityLabel={`${lang('Open note')}: ${source.title}`}
            onPress={() => openSource(source)}
            style={[styles.source, { backgroundColor: commonStyles.input.backgroundColor }]}
          >
            <Text style={[styles.sourceNumber, { color: commonStyles.button.backgroundColor }]}>
              S{number}
            </Text>
            <View style={styles.sourceBody}>
              <Text numberOfLines={1} style={[commonStyles.text, styles.sourceTitle]}>
                {[source.title, source.paragraph].filter(Boolean).join(' / ')}
              </Text>
              {!!source.text && (
                <Text numberOfLines={2} style={[commonStyles.smallText, styles.sourceExcerpt]}>
                  {source.text}
                </Text>
              )}
            </View>
            <Icon name="chevron-right" size={18} color={commonStyles.smallText.color} />
          </Pressable>
        ))}
      </View>
    );
  };
  const tabs = [
    ['ui', 'UI'],
    ['raw', 'RAW'],
  ] as const;
  const entries = result?.context.entries || [];
  const counts = {
    nodes: entries.filter((entry) => entry.kind === 'node').length,
    edges: entries.filter((entry) => entry.kind === 'edge').length,
    paths: entries.filter((entry) => entry.kind === 'path').length,
  };
  return (
    <ScrollView
      style={[commonStyles.flex, commonStyles.backgroundView]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.workspace}>
        {!search.ready && (
          <AnalysisProgressSection
            analysis={analysis}
            scope={analysisData.scope}
            noteCount={analysisData.notes.data?.length || 0}
            loading={analysisData.notes.isFetching}
            ready={analysisData.available && !analysisData.notes.isError}
            refresh={analysisData.notes.refetch}
            onStopSearch={search.stop}
          />
        )}
        <View style={[commonStyles.card, styles.settingsCard]}>
          <View style={styles.settingsBody}>
            <View style={styles.rangeControl}>
              <Text style={[commonStyles.smallText, styles.settingLabel]}>
                {lang('N-hop Range')}
              </Text>
              <View
                style={[
                  styles.segmented,
                  {
                    backgroundColor: commonStyles.input.backgroundColor,
                    borderColor: commonStyles.card.borderColor,
                  },
                ]}
              >
                {[1, 2, 3].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${value} ${lang('Hops')}`}
                    accessibilityState={{ selected: depth === value }}
                    onPress={() => setDepth(value)}
                    style={[
                      styles.segment,
                      depth === value && {
                        backgroundColor: commonStyles.card.backgroundColor,
                        borderColor: commonStyles.card.borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        commonStyles.smallText,
                        styles.segmentText,
                        depth === value && { color: commonStyles.title.color },
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>

        {search.loading &&
          search.progress?.phase !== 'index' &&
          (search.ready || search.progress?.phase === 'search') && (
            <View style={[commonStyles.card, styles.statusCard]}>
              <ActivityIndicator color={commonStyles.button.backgroundColor} />
              <View style={styles.statusText}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[commonStyles.text, styles.statusTitle]}
                >
                  {lang('Searching')}
                </Text>
                <Text style={commonStyles.smallText}>{lang('Preparing graph results…')}</Text>
              </View>
              <AnalysisAction label="cancel" icon="close" onPress={search.stop} />
            </View>
          )}
        {(search.error || search.sourceError || search.cancelled) && (
          <View
            style={[commonStyles.card, styles.noticeCard, { borderLeftColor: colors.contradicted }]}
          >
            <Icon name="alert-circle-outline" size={20} color={colors.contradicted} />
            <Text accessibilityRole="alert" style={[commonStyles.text, styles.noticeText]}>
              {search.error ||
                (search.sourceError ? lang('Could not load notes.') : lang('Search stopped.'))}
            </Text>
            <AnalysisAction label="Retry" icon="refresh" showLabel onPress={search.retry} />
          </View>
        )}
        {result && (
          <View style={styles.results}>
            <View style={styles.resultHeader}>
              <View style={styles.resultHeading}>
                <Text style={[commonStyles.title, styles.resultTitle]}>
                  {lang('Search context')}
                </Text>
                <Text style={commonStyles.smallText}>{lang('Retrieved evidence only.')}</Text>
              </View>
              <View
                style={[
                  styles.segmented,
                  {
                    backgroundColor: commonStyles.input.backgroundColor,
                    borderColor: commonStyles.card.borderColor,
                  },
                ]}
              >
                {tabs.map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: tab === value }}
                    onPress={() => setTab(value)}
                    style={[
                      styles.tab,
                      tab === value && {
                        backgroundColor: commonStyles.card.backgroundColor,
                        borderColor: commonStyles.card.borderColor,
                      },
                    ]}
                  >
                    <Icon
                      name={value === 'ui' ? 'view-dashboard-outline' : 'code-tags'}
                      size={17}
                      color={
                        tab === value ? commonStyles.title.color : commonStyles.smallText.color
                      }
                    />
                    <Text
                      style={[
                        commonStyles.smallText,
                        styles.tabText,
                        tab === value && { color: commonStyles.title.color },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.metrics}>
              {(
                [
                  ['nodes', 'Nodes'],
                  ['edges', 'Relationships'],
                  ['paths', 'Search paths'],
                ] as const
              ).map(([kind, label]) => (
                <View
                  key={kind}
                  style={[
                    styles.metric,
                    {
                      backgroundColor: commonStyles.input.backgroundColor,
                      borderColor: commonStyles.card.borderColor,
                    },
                  ]}
                >
                  <Text style={[commonStyles.text, styles.metricNumber]}>{counts[kind]}</Text>
                  <Text style={[commonStyles.smallText, styles.metricLabel]}>{lang(label)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.hints}>
              {snapshot &&
                (!snapshot.coverage.keywords ||
                  (search.templatesEnabled && !snapshot.coverage.templates)) && (
                  <Text style={commonStyles.smallText}>
                    {lang('Search includes completed analysis only.')}
                  </Text>
                )}
              {result.limited && (
                <Text style={commonStyles.smallText}>
                  {lang('Search results are limited. Narrow the query or hop range.')}
                </Text>
              )}
              {result.context.truncated && (
                <Text style={commonStyles.smallText}>
                  {lang('Context shortened to fit the size limit.')}
                </Text>
              )}
            </View>
            {tab === 'raw' ? (
              <View style={[commonStyles.card, styles.rawCard]}>
                <Text selectable style={[commonStyles.text, styles.rawText]}>
                  {result.context.text || lang('No search results.')}
                </Text>
              </View>
            ) : entries.length ? (
              <View style={styles.cards}>
                {entries.map((entry, index) => {
                  if (entry.kind === 'path') {
                    const path = result.paths[entry.index];
                    if (!path) return null;
                    return (
                      <View key={`path:${index}`} style={[commonStyles.card, styles.resultCard]}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardKind}>
                            <Icon
                              name="source-branch"
                              size={17}
                              color={commonStyles.button.backgroundColor}
                            />
                            <Text style={[commonStyles.smallText, styles.cardKindText]}>
                              {lang('Search paths')}
                            </Text>
                          </View>
                          {path.disputed && (
                            <Text style={[styles.verdict, { color: colors.contradicted }]}>
                              {lang('Contradicted')}
                            </Text>
                          )}
                        </View>
                        <Text style={[commonStyles.text, styles.cardTitle]}>
                          {path.nodes.map((id) => nodes.get(id)?.name || id).join(' → ')}
                        </Text>
                        <Text style={commonStyles.smallText}>
                          {path.edges.map((id) => edges.get(id)?.label || id).join(' · ')}
                        </Text>
                        {sourceLinks(entry.citationIds)}
                      </View>
                    );
                  }
                  if (entry.kind === 'edge') {
                    const edge = edges.get(entry.id);
                    if (!edge) return null;
                    const color = edge.verdict
                      ? colors[edge.verdict]
                      : commonStyles.button.backgroundColor;
                    return (
                      <View key={`edge:${entry.id}`} style={[commonStyles.card, styles.resultCard]}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardKind}>
                            <Icon name="link-variant" size={17} color={color} />
                            <Text style={[commonStyles.smallText, styles.cardKindText]}>
                              {lang('Relationships')}
                            </Text>
                          </View>
                          {edge.verdict && (
                            <Text style={[styles.verdict, { color }]}>
                              {lang(edge.verdict === 'supported' ? 'Supported' : 'Contradicted')}
                            </Text>
                          )}
                        </View>
                        <Text style={[commonStyles.text, styles.cardTitle]}>
                          {nodes.get(edge.source)?.name || edge.source} {edge.directed ? '→' : '—'}{' '}
                          {nodes.get(edge.target)?.name || edge.target}
                        </Text>
                        <Text style={commonStyles.smallText}>
                          {edge.label} · {edge.type}
                        </Text>
                        {sourceLinks(entry.citationIds)}
                      </View>
                    );
                  }
                  const node = nodes.get(entry.id);
                  if (!node) return null;
                  return (
                    <View key={`node:${entry.id}`} style={[commonStyles.card, styles.resultCard]}>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardKind}>
                          <Icon
                            name="circle-medium"
                            size={17}
                            color={commonStyles.button.backgroundColor}
                          />
                          <Text style={[commonStyles.smallText, styles.cardKindText]}>
                            {lang('Nodes')}
                          </Text>
                        </View>
                        <Text style={commonStyles.smallText}>{node.typeLabel}</Text>
                      </View>
                      <View style={styles.nodeRow}>
                        <Text style={[commonStyles.text, styles.cardTitle, styles.nodeTitle]}>
                          {node.name}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${lang('View in graph')}: ${node.name}`}
                          onPress={() => navigation.push('KnowledgeGraph', { nodeId: node.id })}
                          style={styles.graphLink}
                        >
                          <Text
                            style={[
                              styles.linkText,
                              { color: commonStyles.button.backgroundColor },
                            ]}
                          >
                            {lang('View in graph')}
                          </Text>
                          <Icon
                            name="arrow-top-right"
                            size={17}
                            color={commonStyles.button.backgroundColor}
                          />
                        </Pressable>
                      </View>
                      {sourceLinks(entry.citationIds)}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[commonStyles.card, styles.emptyCard]}>
                <Icon name="magnify-close" size={30} color={commonStyles.smallText.color} />
                <Text style={[commonStyles.text, styles.emptyTitle]}>
                  {lang('No search results.')}
                </Text>
                <Text style={[commonStyles.smallText, styles.emptyHelp]}>
                  {lang('Try a different query or hop range.')}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 40 },
  workspace: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 14 },
  settingsCard: {
    marginBottom: 0,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  settingsBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 32,
    rowGap: 14,
  },
  rangeControl: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  settingLabel: { fontWeight: '600' },
  segmented: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, gap: 3 },
  segment: {
    minWidth: 44,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 9,
  },
  segmentText: { fontWeight: '600' },
  statusCard: {
    marginBottom: 0,
    borderRadius: 14,
    shadowOpacity: 0,
    elevation: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statusText: { flex: 1, minWidth: 0, gap: 4 },
  statusTitle: { fontWeight: '600' },
  noticeCard: {
    marginBottom: 0,
    borderRadius: 12,
    shadowOpacity: 0,
    elevation: 0,
    borderLeftWidth: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  noticeText: { flex: 1, minWidth: 180 },
  results: { gap: 14 },
  resultHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  resultHeading: { gap: 2 },
  resultTitle: { fontSize: 21, lineHeight: 28, marginBottom: 0 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 74,
    minHeight: 38,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 9,
  },
  tabText: { fontWeight: '700', fontSize: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  metricNumber: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  metricLabel: { fontSize: 12 },
  hints: { gap: 4 },
  cards: { gap: 10 },
  resultCard: {
    marginBottom: 0,
    borderRadius: 14,
    padding: 18,
    gap: 9,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardKind: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardKindText: { fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 17, lineHeight: 25, fontWeight: '700' },
  verdict: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  nodeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nodeTitle: { flex: 1, minWidth: 160 },
  graphLink: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44 },
  linkText: { fontSize: 13, fontWeight: '700' },
  sources: { borderTopWidth: 1, paddingTop: 12, marginTop: 4, gap: 8 },
  sourceHeading: { fontSize: 11, fontWeight: '700' },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sourceNumber: { fontSize: 12, fontWeight: '700', minWidth: 24 },
  sourceBody: { flex: 1, minWidth: 0, gap: 2 },
  sourceTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  sourceExcerpt: { fontSize: 12, lineHeight: 17 },
  rawCard: { marginBottom: 0, borderRadius: 14, padding: 18, shadowOpacity: 0, elevation: 0 },
  rawText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 19 },
  emptyCard: {
    marginBottom: 0,
    borderRadius: 14,
    shadowOpacity: 0,
    elevation: 0,
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyTitle: { fontWeight: '700' },
  emptyHelp: { textAlign: 'center' },
});
