import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { extractTopicDocumentsSteps, TopicDocumentCache } from './extractTopicDocuments';
import { curateTopics, emptyTopicPreferences, inferTopicsSteps } from './inferTopics';
import { parseTopicPreferences, topicPreferenceScope } from './preferences';
import { runTopicTask } from './runTopicTask';
import { TopicDocument, TopicInferenceResult, TopicPreferences } from './types';
import { useNotePages } from '../../hooks/useNoteStorage';
import { isHiddenTitle, usePrivate } from '../../hooks/usePrivate';
import { useUsageMode } from '../../hooks/useUsageMode';

const emptyResult = (): TopicInferenceResult => ({
  topics: [],
  unclassified: [],
  documentCount: 0,
  distinctContentCount: 0,
  sectionCount: 0,
  comparedPairCount: 0,
});

async function readPreferences(scope: string): Promise<TopicPreferences> {
  const stored = await AsyncStorage.getItem(`@blacktokki:notebook:topics:${scope}`);
  return parseTopicPreferences(stored);
}

/** Account/notebook isolation, exact source comparisons and immediate cancellation when inactive. */
export function useTopicInference(enabled: boolean) {
  const { auth } = useAuthContext();
  const { usageMode, notebook } = useUsageMode();
  const { data: contents = [], isLoading: notesLoading } = useNotePages();
  const { data: privateConfig } = usePrivate();
  const scope = topicPreferenceScope(!!auth.isLocal, auth.user?.id, usageMode, notebook?.id || 0);
  const analysisScope = JSON.stringify([scope, !!privateConfig?.enabled, 4]);
  const queryClient = useQueryClient();
  const queryKey = ['topicPreferences', scope];
  const preferences = useQuery({ queryKey, queryFn: () => readPreferences(scope), enabled });
  const visibleContents = useMemo(
    () => contents.filter((content) => privateConfig?.enabled || !isHiddenTitle(content.title)),
    [contents, privateConfig?.enabled]
  );
  const [cache] = useState(() => ({
    scope: '',
    documents: new Map() as TopicDocumentCache,
    last: [] as TopicDocument[],
    result: emptyResult(),
  }));
  const [state, setState] = useState(() => ({
    scope: '',
    result: emptyResult(),
    loading: false,
    error: '',
  }));

  useEffect(() => {
    if (!enabled || notesLoading || !usageMode) return;
    if (cache.scope !== analysisScope) {
      cache.documents.clear();
      cache.scope = analysisScope;
      cache.last = [];
      cache.result = emptyResult();
    }
    const abort = new AbortController();
    setState((previous) => ({
      scope: analysisScope,
      result: previous.scope === analysisScope ? previous.result : emptyResult(),
      loading: true,
      error: '',
    }));
    const analyze = async () => {
      const documents = await runTopicTask(
        extractTopicDocumentsSteps(visibleContents, cache.documents),
        { signal: abort.signal }
      );
      const unchanged =
        documents.length === cache.last.length &&
        documents.every((document, index) => document === cache.last[index]);
      const result = unchanged
        ? cache.result
        : await runTopicTask(inferTopicsSteps(documents), { signal: abort.signal });
      if (!abort.signal.aborted) {
        cache.last = documents;
        cache.result = result;
        setState({ scope: analysisScope, result, loading: false, error: '' });
      }
    };
    analyze().catch((error: Error) => {
      if (!abort.signal.aborted)
        setState({
          scope: analysisScope,
          result: emptyResult(),
          loading: false,
          error: error.message,
        });
    });
    return () => abort.abort();
  }, [enabled, notesLoading, usageMode, analysisScope, visibleContents, cache]);

  const updatePreferences = useMutation({
    mutationFn: async (update: (current: TopicPreferences) => TopicPreferences) => {
      const next = update(await readPreferences(scope));
      await AsyncStorage.setItem(`@blacktokki:notebook:topics:${scope}`, JSON.stringify(next));
      return { scope, next };
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['topicPreferences', saved.scope], saved.next);
    },
  });
  const result = useMemo(
    () =>
      curateTopics(
        state.scope === analysisScope ? state.result : emptyResult(),
        preferences.data || emptyTopicPreferences()
      ),
    [state.scope, state.result, analysisScope, preferences.data]
  );
  return {
    ...result,
    scope,
    updatePreferences,
    isLoading:
      notesLoading ||
      preferences.isLoading ||
      state.scope !== analysisScope ||
      (state.loading && state.result.documentCount === 0),
    isRefreshing: state.loading,
    error: state.scope === analysisScope ? state.error : '',
  };
}
