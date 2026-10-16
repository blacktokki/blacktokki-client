import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { useEffect, useMemo, useRef, useState } from 'react';

import { graphSearchCache } from './cache';
import { publishSearchEmbeddingStatus, useSearchEmbeddingStatus } from './embeddingStatus';
import { createGraphSearchIndex, searchKnowledgeGraph } from './engine';
import type { GraphSearchIndex } from './engine';
import { ensureGraphSearchVectors, graphSemanticScores } from './semantic';
import { createGraphSearchSnapshot } from './snapshot';
import type { GraphSearchProgress, GraphSearchResult } from './types';
import { urlToNoteLink } from '../../../../components/SearchBar';
import { useBoardPages } from '../../../../hooks/useBoardStorage';
import { useExtension } from '../../../../hooks/useExtension';
import { useNotePages } from '../../../../hooks/useNoteStorage';
import { isHiddenTitle } from '../../../../hooks/usePrivate';
import { useUsageMode } from '../../../../hooks/useUsageMode';
import { discoverTemplates } from '../../../inductiveTemplate/discovery';
import { groupSimilarTemplates } from '../../../inductiveTemplate/templateSimilarity';
import { useInductiveTemplatesData } from '../../../inductiveTemplate/useInductiveTemplates';
import { addTemplateGraph } from '../../inductiveTemplate/graph';
import { getKnowledgeGraphPalette } from '../../inductiveTemplate/palette';
import { useKnowledgeGraphData } from '../../useKnowledgeGraphData';
import { getKeywordRelationColors } from '../../utils/palette';
import { addKeywordRelationGraph } from '../graph';
import { useRelationAnalysisScope } from '../useRelationAnalysisNotes';
import { useRelationAnalysisSession } from '../useRelationAnalysisSession';

/** Compose every available layer without coupling retrieval to graph visibility switches. */
export function useSearchGraph(requested: boolean, isFocused = false) {
  const base = useKnowledgeGraphData();
  const notes = useNotePages();
  const boards = useBoardPages();
  const access = useRelationAnalysisScope(requested);
  const { usageMode } = useUsageMode();
  const { lang } = useLangContext();
  const { data: extension } = useExtension();
  const templatesEnabled =
    requested && extension.info.some((item) => item.key === 'inductiveTemplate' && item.active);
  const templates = useInductiveTemplatesData(templatesEnabled, isFocused);
  const session = useRelationAnalysisSession();
  const [groups, setGroups] = useState<{
    input: typeof templates.examples.data;
    scope: string;
    roots: string[];
    date: string;
    value: ReturnType<typeof groupSimilarTemplates>;
    error?: boolean;
  }>();
  const date = lang('Date');
  useEffect(() => {
    if (
      !templatesEnabled ||
      !templates.enabled ||
      !templates.examples.data ||
      templates.examples.isError
    )
      return;
    const input = templates.examples.data;
    const timer = setTimeout(() => {
      try {
        const value = groupSimilarTemplates(
          discoverTemplates(input, date, templates.notebookRoots),
          toHtml
        );
        setGroups({ input, scope: templates.scope, roots: templates.notebookRoots, date, value });
      } catch {
        setGroups({
          input,
          scope: templates.scope,
          roots: templates.notebookRoots,
          date,
          value: [],
          error: true,
        });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    templatesEnabled,
    templates.enabled,
    templates.examples.data,
    templates.examples.isError,
    templates.scope,
    templates.notebookRoots,
    date,
  ]);
  const currentNotes = useMemo(
    () =>
      new Map(
        (notes.data || [])
          .filter(
            (note) => note.description?.trim() && (access.privateMode || !isHiddenTitle(note.title))
          )
          .map((note) => [note.title, note.description])
      ),
    [notes.data, access.privateMode]
  );
  const sameSources = (items?: { title: string; description?: string }[]) =>
    !!items &&
    items.length === currentNotes.size &&
    items.every((note) => currentNotes.get(note.title) === note.description);
  const templatesMatch = sameSources(templates.examples.data);
  const keywordsMatch = sameSources(session.data.notes.data);
  const readyTemplates =
    templatesEnabled &&
    templatesMatch &&
    !!groups &&
    !groups.error &&
    groups.input === templates.examples.data &&
    groups.scope === templates.scope &&
    groups.roots === templates.notebookRoots &&
    groups.date === date;
  const readyKeywords =
    session.data.available &&
    keywordsMatch &&
    session.analysis.status === 'completed' &&
    !!session.analysis.result;
  const analyzedResult = readyKeywords ? session.analysis.result : undefined;
  const analyzedEntities = readyKeywords ? session.analysis.entities : undefined;
  const refetchKeywords = session.data.notes.refetch;
  const refetchTemplates = templates.examples.refetch;
  useEffect(() => {
    if (!access.available || !notes.data) return;
    if (!keywordsMatch) refetchKeywords();
    if (templatesEnabled && templates.enabled && !templatesMatch) refetchTemplates();
  }, [
    notes.data,
    access.available,
    keywordsMatch,
    templatesMatch,
    templatesEnabled,
    templates.enabled,
    refetchKeywords,
    refetchTemplates,
  ]);
  const scope = JSON.stringify([access.scope, usageMode]);
  const input = useMemo(() => {
    const allowed = (title: string) => access.privateMode || !isHiddenTitle(title);
    const visibleNotes = (notes.data || []).filter((note) => allowed(note.title));
    const visibleBoards = (boards.data || []).filter((board) => allowed(board.title));
    const templateGroups = readyTemplates
      ? groups!.value
          .map((group) => ({
            ...group,
            templates: group.templates.filter((template) => template.sourceTitles.every(allowed)),
          }))
          .filter((group) => group.templates.length)
      : [];
    const candidates = analyzedResult?.candidates || [];
    const palette = getKnowledgeGraphPalette(false);
    const graph = addKeywordRelationGraph(
      addTemplateGraph(base, templateGroups, palette, lang('Template group')),
      analyzedEntities || analyzedResult?.entityExtraction,
      candidates,
      palette,
      getKeywordRelationColors(false),
      urlToNoteLink
    );
    return {
      graph,
      scope,
      notes: visibleNotes,
      boards: visibleBoards,
      candidates,
      coverage: { keywords: readyKeywords, templates: !!readyTemplates },
      translate: lang,
      usageMode,
    };
  }, [
    base.nodes,
    base.edges,
    scope,
    notes.data,
    boards.data,
    access.privateMode,
    readyTemplates,
    groups,
    readyKeywords,
    analyzedResult,
    analyzedEntities,
    lang,
    usageMode,
  ]);
  return {
    input,
    analysisScope: access.scope,
    available: access.available,
    loading: base.isLoading || notes.isLoading || boards.isLoading,
    sourceError: notes.isError || boards.isError,
    templatesEnabled,
    retrySources: () => {
      notes.refetch();
      boards.refetch();
    },
  };
}

/** Each asynchronous publication must still belong to the current source revision, scope and query. */
export function useGraphSearch(
  query: string,
  maxHops: number,
  requested = true,
  isFocused = false
) {
  const data = useSearchGraph(requested, isFocused);
  const backgroundEmbeddings = useSearchEmbeddingStatus(data.analysisScope, 'extension');
  const queryEmbeddings = useSearchEmbeddingStatus(data.analysisScope, 'search');
  const [prepared, setPrepared] = useState<{
    input: typeof data.input;
    index: GraphSearchIndex;
    attempt: number;
  }>();
  const [vectorReady, setVectorReady] = useState<{ scope: string; revision: string }>();
  const key = useMemo(() => ({ input: data.input, query, maxHops }), [data.input, query, maxHops]);
  const [answer, setAnswer] = useState<{ key: typeof key; result: GraphSearchResult }>();
  const [progress, setProgress] = useState<{
    input: typeof data.input;
    query?: string;
    value: GraphSearchProgress;
  }>();
  const [error, setError] = useState<{ input: typeof data.input; message: string }>();
  const [cancelled, setCancelled] = useState<typeof key>();
  const [attempt, setAttempt] = useState(0);
  const prepareJob = useRef<AbortController | undefined>(undefined);
  const searchJob = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!data.available || data.loading || data.sourceError) return;
    const controller = new AbortController();
    prepareJob.current = controller;
    setPrepared(undefined);
    setError(undefined);
    setCancelled(undefined);
    setProgress({
      input: data.input,
      value: { phase: 'index', processed: 0, total: data.input.graph.nodes.length },
    });
    createGraphSearchSnapshot({ ...data.input, signal: controller.signal })
      .then(async (snapshot) => {
        const index = await createGraphSearchIndex(snapshot, controller.signal);
        if (!controller.signal.aborted) {
          setPrepared({ input: data.input, index, attempt });
          setProgress(undefined);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('Graph search failed', { stage: 'index', scope: data.input.scope, error });
          setError({
            input: data.input,
            message: error instanceof Error ? error.message : String(error),
          });
          setProgress(undefined);
        }
      });
    return () => controller.abort();
  }, [data.input, data.available, data.loading, data.sourceError, attempt]);
  const index =
    data.available &&
    !data.sourceError &&
    prepared?.input === data.input &&
    prepared.attempt === attempt
      ? prepared.index
      : undefined;
  useEffect(() => {
    setAnswer(undefined);
    setError(undefined);
    if (
      !index ||
      !query.trim() ||
      !index.snapshot.coverage.keywords ||
      (data.templatesEnabled && !index.snapshot.coverage.templates)
    )
      return;
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
      publishSearchEmbeddingStatus(
        data.analysisScope,
        { phase: 'idle', processed: 0, total: 0 },
        'search'
      );
      if (searchJob.current === cancel) searchJob.current = undefined;
    };
    searchJob.current = cancel;
    setCancelled(undefined);
    let embedded = { processed: 0, total: 0 };
    let embeddingComplete = false;
    publishSearchEmbeddingStatus(data.analysisScope, { phase: 'running', ...embedded }, 'search');
    (async () => {
      const vectors = await ensureGraphSearchVectors({
        scope: index.snapshot.scope,
        revision: index.snapshot.revision,
        documents: index.documents,
        cache: graphSearchCache,
        signal: controller.signal,
        onProgress: (processed, total) => {
          if (controller.signal.aborted) return;
          embedded = { processed, total };
          publishSearchEmbeddingStatus(
            data.analysisScope,
            { phase: 'running', ...embedded },
            'search'
          );
          setProgress({
            input: data.input,
            query,
            value: { phase: 'embedding', processed, total },
          });
        },
      });
      if (controller.signal.aborted) return;
      setVectorReady({ scope: index.snapshot.scope, revision: index.snapshot.revision });
      const scores = await graphSemanticScores(
        query,
        vectors.byDocument,
        controller.signal,
        undefined,
        index.snapshot.scope
      );
      if (!controller.signal.aborted)
        publishSearchEmbeddingStatus(
          data.analysisScope,
          { phase: 'completed', ...embedded, revision: index.snapshot.revision },
          'search'
        );
      embeddingComplete = true;
      if (!controller.signal.aborted)
        setProgress({
          input: data.input,
          query,
          value: { phase: 'search', processed: 0, total: index.documents.length },
        });
      const result = await searchKnowledgeGraph(index, query, {
        maxHops,
        semanticScores: scores,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setAnswer({ key, result });
        setProgress(undefined);
      }
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        if (!embeddingComplete)
          publishSearchEmbeddingStatus(
            data.analysisScope,
            { phase: 'failed', ...embedded, error: message },
            'search'
          );
        console.error('Graph search failed', { stage: 'search', scope: data.input.scope, error });
        setError({ input: data.input, message });
        setProgress(undefined);
      }
    });
    return cancel;
  }, [index, key, attempt, data.templatesEnabled]);
  const result = data.available && answer?.key === key ? answer.result : undefined;
  const currentError = error?.input === data.input ? error.message : undefined;
  const stopped = cancelled === key;
  return {
    result,
    snapshot: index?.snapshot,
    ready:
      !!index &&
      !data.loading &&
      index.snapshot.coverage.keywords &&
      (!data.templatesEnabled || index.snapshot.coverage.templates) &&
      ((vectorReady?.scope === index.snapshot.scope &&
        vectorReady.revision === index.snapshot.revision) ||
        [backgroundEmbeddings, queryEmbeddings].some(
          (status) => status.phase === 'completed' && status.revision === index.snapshot.revision
        )),
    progress:
      progress?.input === data.input && (!progress.query || progress.query === query)
        ? progress.value
        : undefined,
    loading:
      data.available &&
      !data.sourceError &&
      (data.loading || (!!query.trim() && !result && !stopped && !currentError)),
    available: data.available,
    sourceError: data.sourceError,
    templatesEnabled: data.templatesEnabled,
    error: currentError,
    cancelled: stopped,
    stop: () => {
      prepareJob.current?.abort();
      searchJob.current?.();
      setProgress(undefined);
      setCancelled(key);
    },
    retry: () => {
      if (data.sourceError) data.retrySources();
      setError(undefined);
      setCancelled(undefined);
      setAttempt((value) => value + 1);
    },
  };
}
