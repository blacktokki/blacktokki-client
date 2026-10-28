import { useLangContext } from '@blacktokki/core';
import { EditorViewer, toHtml } from '@blacktokki/editor';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { AnalysisAction } from './AnalysisControls';
import { onLink } from '../../../../components/SearchBar';
import type { SearchSectionProps } from '../../../../hooks/useExtension';
import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import type { NavigationParamList } from '../../../../types';
import { AnalysisProgressSection } from '../screens/AnalysisProgressSection';
import { useGraphSearch } from '../search/useGraphSearch';
import { useRelationAnalysisSession } from '../useRelationAnalysisSession';

const formatContextSize = (characters: number) =>
  `${(characters / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })}k`;

/** Search the full accessible graph and expose a cited context, without generating an answer. */
export function GraphSearchSection({ query }: SearchSectionProps) {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const isFocused = useIsFocused();
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const [depth, setDepth] = useState(2);
  const [contextChars, setContextChars] = useState(16000);
  const { data: analysisData, analysis } = useRelationAnalysisSession();
  const search = useGraphSearch(query, depth, true, isFocused, contextChars);
  const { result } = search;
  const contextHtml = useMemo(() => toHtml(result?.context.text || ''), [result?.context.text]);
  const entries = result?.context.entries || [];
  const [viewerCreated, setViewerCreated] = useState(() => isFocused && !!query.trim());
  useEffect(() => {
    if (!viewerCreated && (entries.length || (isFocused && query.trim()))) setViewerCreated(true);
  }, [viewerCreated, entries.length, isFocused, query]);
  return (
    <View style={styles.content}>
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
                    accessibilityLabel={`${value} ${lang('connection steps')}`}
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
            <View style={styles.rangeControl}>
              <Text style={[commonStyles.smallText, styles.settingLabel]}>
                {lang('Context size')}
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
                {[16000, 32000, 64000, 128000, 256000].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${lang('Context size')}: ${formatContextSize(value)}`}
                    accessibilityState={{ selected: contextChars === value }}
                    onPress={() => setContextChars(value)}
                    style={[
                      styles.segment,
                      contextChars === value && {
                        backgroundColor: commonStyles.card.backgroundColor,
                        borderColor: commonStyles.card.borderColor,
                      },
                    ]}
                  >
                    <Text style={[commonStyles.smallText, styles.segmentText]}>
                      {formatContextSize(value)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>

        {search.loading && (search.ready || search.progress?.phase === 'search') && (
          <View style={[commonStyles.card, styles.statusCard]}>
            <ActivityIndicator color={commonStyles.button.backgroundColor} />
            <View style={styles.statusText}>
              <Text
                accessibilityLiveRegion="polite"
                style={[commonStyles.text, styles.statusTitle]}
              >
                {lang('Searching')}
              </Text>
            </View>
            <AnalysisAction label="cancel" icon="close" onPress={search.stop} />
          </View>
        )}
        {(search.error || search.sourceError || search.cancelled) && (
          <View
            style={[
              commonStyles.card,
              styles.noticeCard,
              { borderLeftColor: commonStyles.text.color },
            ]}
          >
            <Icon name="alert-circle-outline" size={20} color={commonStyles.text.color} />
            <Text accessibilityRole="alert" style={[commonStyles.text, styles.noticeText]}>
              {search.error ||
                (search.sourceError ? lang('Could not load notes.') : lang('Search stopped.'))}
            </Text>
            <AnalysisAction label="Retry" icon="refresh" showLabel onPress={search.retry} />
          </View>
        )}
        <View style={styles.results}>
          {result && (
            <View style={styles.resultHeader}>
              <View style={styles.resultHeading}>
                <Text style={[commonStyles.title, styles.resultTitle]}>
                  {lang('Search Results')}
                </Text>
              </View>
              <View style={styles.hints}>
                <Text style={commonStyles.smallText}>
                  {lang('Context usage')}: {formatContextSize(result.context.usage.characters)} /{' '}
                  {formatContextSize(result.context.usage.limit)}
                </Text>
              </View>
            </View>
          )}
          {(viewerCreated || entries.length > 0) && (
            <View
              style={[
                commonStyles.card,
                styles.contextCard,
                !entries.length && styles.hiddenContext,
              ]}
            >
              <EditorViewer
                key="context-viewer"
                active={isFocused}
                value={contextHtml}
                theme={colorScheme}
                onLink={(url) => onLink(url, navigation)}
                autoResize
              />
            </View>
          )}
          {result && !entries.length && (
            <View style={[commonStyles.card, styles.emptyCard]}>
              <Icon name="magnify-close" size={30} color={commonStyles.smallText.color} />
              <Text style={[commonStyles.text, styles.emptyTitle]}>
                {lang('No search results.')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
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
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
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
  hints: { gap: 4 },
  contextCard: {
    marginBottom: 0,
    borderRadius: 14,
    padding: 18,
    shadowOpacity: 0,
    elevation: 0,
  },
  hiddenContext: { display: 'none' },
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
});
