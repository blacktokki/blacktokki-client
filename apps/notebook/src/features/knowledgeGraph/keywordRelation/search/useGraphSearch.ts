import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { useEffect, useMemo, useRef, useState } from 'react';

import { graphSearchCache } from '../keywordRelationCache';
import { buildGraphSearchContextAsync } from './context';
import { searchKnowledgeGraph } from './engine';
import type { GraphSearchIndex } from './engine';
import { acquireGraphSearchPreparation } from './preparation';
import type { GraphSearchPreparation } from './preparation';
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
import {
  getKnowledgeGraphNodeKind,
  getKnowledgeGraphNodeKindLabel,
  getKnowledgeGraphRelationDisplayLabel,
} from '../../utils/relations';
import { addKeywordRelationGraph } from '../graph';
import type { GraphSearchProgress, GraphSearchResult } from '../types';
import { publishSearchEmbeddingStatus, useSearchEmbeddingStatus } from '../useRelationAnalysis';
import {
  useRelationAnalysisScope,
  useRelationAnalysisSession,
} from '../useRelationAnalysisSession';

const searchInputs = new WeakMap<
  object,
  {
    dependencies: unknown[];
    translations: Map<string, string>;
    input: Parameters<GraphSearchPreparation['index']>[0] & {
      coverage: { keywords: boolean; templates: boolean };
    };
  }
>();
const templateGroupsByNotes = new WeakMap<
  object,
  Map<string, { value: ReturnType<typeof groupSimilarTemplates>; error?: boolean }>
>();

/** Compose every available layer without coupling retrieval to graph visibility switches. */
export function useSearchGraph(requested: boolean, isFocused = false) {
  const base = useKnowledgeGraphData({ validation: false });
  const notes = useNotePages();
  const boards = useBoardPages();
  const access = useRelationAnalysisScope(requested);
  const { usageMode } = useUsageMode();
  const { lang, locale } = useLangContext();
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
  const templateKey = JSON.stringify([templates.scope, templates.notebookRoots, date]);
  const cachedGroups =
    templatesMatch && notes.data
      ? templateGroupsByNotes.get(notes.data)?.get(templateKey)
      : undefined;
  useEffect(() => {
    if (
      !templatesEnabled ||
      !templates.enabled ||
      !templates.examples.data ||
      templates.examples.isError ||
      !templatesMatch ||
      !notes.data ||
      cachedGroups
    )
      return;
    const input = templates.examples.data;
    const notesInput = notes.data;
    const timer = setTimeout(() => {
      let cache = templateGroupsByNotes.get(notesInput);
      if (!cache) templateGroupsByNotes.set(notesInput, (cache = new Map()));
      let computed = cache.get(templateKey);
      if (!computed) {
        try {
          computed = {
            value: groupSimilarTemplates(
              discoverTemplates(input, date, templates.notebookRoots),
              toHtml
            ),
          };
        } catch {
          computed = { value: [], error: true };
        }
        cache.set(templateKey, computed);
      }
      setGroups({
        input,
        scope: templates.scope,
        roots: templates.notebookRoots,
        date,
        ...computed,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [
    templatesEnabled,
    templates.enabled,
    templates.examples.data,
    templates.examples.isError,
    templates.scope,
    templates.notebookRoots,
    templatesMatch,
    notes.data,
    templateKey,
    cachedGroups,
    date,
  ]);
  const readyGroups =
    cachedGroups ||
    (groups &&
    groups.input === templates.examples.data &&
    groups.scope === templates.scope &&
    groups.roots === templates.notebookRoots &&
    groups.date === date
      ? groups
      : undefined);
  const readyTemplates = templatesEnabled && templatesMatch && !!readyGroups && !readyGroups.error;
  const readyKeywords =
    session.data.available &&
    keywordsMatch &&
    session.analysis.status === 'completed' &&
    !!session.analysis.result;
  const analyzedResult = readyKeywords ? session.analysis.result : undefined;
  const analyzedEntities = readyKeywords ? session.analysis.entities : undefined;
  const scope = access.scope;
  const input = useMemo(() => {
    const dependencies = [
      base.edges,
      scope,
      notes.data,
      boards.data,
      access.privateMode,
      readyTemplates ? readyGroups!.value : undefined,
      readyKeywords,
      analyzedResult,
      analyzedEntities,
      locale,
      usageMode,
    ];
    const cached = searchInputs.get(base.nodes);
    if (
      cached &&
      cached.dependencies.every((value, index) => value === dependencies[index]) &&
      [...cached.translations].every(([key, value]) => lang(key) === value)
    )
      return cached.input;
    const allowed = (title: string) => access.privateMode || !isHiddenTitle(title);
    const visibleNotes = (notes.data || []).filter((note) => allowed(note.title));
    const visibleBoards = (boards.data || []).filter((board) => allowed(board.title));
    const templateGroups = readyTemplates
      ? readyGroups!.value
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
    // useLangContext creates a callback per observer; compare the actual labels it consumes.
    const translations = new Map<string, string>();
    const translate = (key: string) => {
      const value = lang(key);
      translations.set(key, value);
      return value;
    };
    translate('Template group');
    for (const kind of new Set(graph.nodes.map(getKnowledgeGraphNodeKind)))
      getKnowledgeGraphNodeKindLabel(kind, translate, usageMode);
    const labels = new Set<string>();
    for (const edge of graph.edges) {
      const key = JSON.stringify([edge.type, edge.propertyLabel, edge.label]);
      if (labels.has(key)) continue;
      labels.add(key);
      getKnowledgeGraphRelationDisplayLabel(edge, translate);
    }
    const input = {
      graph,
      scope,
      notes: visibleNotes,
      boards: visibleBoards,
      candidates,
      coverage: { keywords: readyKeywords, templates: !!readyTemplates },
      translate: lang,
      usageMode,
    };
    searchInputs.set(base.nodes, { dependencies, translations, input });
    return input;
  }, [
    base.nodes,
    base.edges,
    scope,
    notes.data,
    boards.data,
    access.privateMode,
    readyTemplates,
    readyGroups,
    readyKeywords,
    analyzedResult,
    analyzedEntities,
    lang,
    locale,
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
  isFocused = false,
  contextChars = 16000
) {
  const data = useSearchGraph(requested, isFocused);
  const backgroundEmbeddings = useSearchEmbeddingStatus(data.analysisScope, 'extension');
  const queryEmbeddings = useSearchEmbeddingStatus(data.analysisScope, 'search');
  const [prepared, setPrepared] = useState<{
    input: typeof data.input;
    index?: GraphSearchIndex;
    inputRevision: string;
    attempt: number;
  }>();
  const [preparedVectors, setPreparedVectors] = useState<{
    index: GraphSearchIndex;
    vectors: Awaited<ReturnType<GraphSearchPreparation['vectors']>>;
  }>();
  const key = useMemo(() => ({ input: data.input, query, maxHops }), [data.input, query, maxHops]);
  const [answer, setAnswer] = useState<{ key: typeof key; result: GraphSearchResult }>();
  const [progress, setProgress] = useState<{
    input: typeof data.input;
    query?: string;
    value: GraphSearchProgress;
  }>();
  const [error, setError] = useState<{
    input: typeof data.input;
    key?: typeof key;
    message: string;
  }>();
  const [cancelled, setCancelled] = useState<typeof key>();
  const stopped = cancelled === key;
  const hasQuery = !!query.trim();
  const [attempt, setAttempt] = useState(0);
  const currentPrepared =
    prepared?.input === data.input && prepared.attempt === attempt ? prepared : undefined;
  const inputRevision = currentPrepared?.inputRevision;
  const index = data.available && !data.sourceError ? currentPrepared?.index : undefined;
  const prepareJob = useRef<AbortController | undefined>(undefined);
  const embeddingJob = useRef<(() => void) | undefined>(undefined);
  const searchJob = useRef<AbortController | undefined>(undefined);
  const contextJob = useRef<AbortController | undefined>(undefined);
  const [packed, setPacked] = useState<{
    input: GraphSearchResult;
    translate: typeof data.input.translate;
    context: GraphSearchResult['context'];
  }>();
  const preparation = useRef<{ scope: string; session: GraphSearchPreparation } | undefined>(
    undefined
  );
  useEffect(() => {
    if (!data.available || data.sourceError) return;
    const session = acquireGraphSearchPreparation(data.input.scope);
    preparation.current = { scope: data.input.scope, session };
    return () => {
      preparation.current = undefined;
      session.dispose().catch((error: unknown) => {
        console.error('Graph search model release failed', error);
      });
    };
  }, [data.input.scope, data.available, data.sourceError]);
  useEffect(() => {
    if (!data.available || data.loading || data.sourceError || stopped) return;
    if (!data.input.coverage.keywords || (data.templatesEnabled && !data.input.coverage.templates))
      return;
    if (currentPrepared?.index) return;
    const current = preparation.current;
    if (current?.scope !== data.input.scope) return;
    const controller = new AbortController();
    prepareJob.current = controller;
    setPrepared(undefined);
    setError(undefined);
    setCancelled(undefined);
    setProgress({
      input: data.input,
      value: { phase: 'index', processed: 0, total: data.input.graph.nodes.length },
    });
    (async () => {
      const inputRevision = await current.session.revision(data.input, controller.signal);
      if (controller.signal.aborted) return;
      // Match the source identity before attaching to preparation already owned by analysis.
      setPrepared({ input: data.input, inputRevision, attempt });
      const index = await current.session.index(data.input, inputRevision, controller.signal);
      if (!controller.signal.aborted) {
        setPrepared({ input: data.input, index, inputRevision, attempt });
        setProgress(undefined);
      }
    })().catch((error: unknown) => {
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
  }, [
    data.input,
    data.available,
    data.loading,
    data.sourceError,
    data.templatesEnabled,
    attempt,
    stopped,
  ]);
  useEffect(() => {
    if (
      !index ||
      !hasQuery ||
      stopped ||
      !index.snapshot.coverage.keywords ||
      (data.templatesEnabled && !index.snapshot.coverage.templates)
    )
      return;
    if (preparedVectors?.index === index) return;
    const current = preparation.current;
    if (current?.scope !== index.snapshot.scope) return;
    const controller = new AbortController();
    let finished = false;
    let embedded = { processed: 0, total: 0 };
    const cancel = () => {
      controller.abort();
      if (!finished)
        publishSearchEmbeddingStatus(
          data.analysisScope,
          { phase: 'idle', processed: 0, total: 0 },
          'search'
        );
      if (embeddingJob.current === cancel) embeddingJob.current = undefined;
    };
    embeddingJob.current = cancel;
    setError(undefined);
    // Document preparation belongs to the graph revision, never to a query or hop range.
    current.session
      .vectors({
        revision: index.snapshot.revision,
        inputRevision,
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
          setProgress({ input: data.input, value: { phase: 'embedding', processed, total } });
        },
      })
      .then((vectors) => {
        if (controller.signal.aborted) return;
        finished = true;
        setPreparedVectors({ index, vectors });
        publishSearchEmbeddingStatus(
          data.analysisScope,
          {
            phase: 'completed',
            processed: vectors.total,
            total: vectors.total,
            revision: index.snapshot.revision,
            inputRevision,
          },
          'search'
        );
        setProgress(undefined);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        finished = true;
        const message = error instanceof Error ? error.message : String(error);
        publishSearchEmbeddingStatus(
          data.analysisScope,
          { phase: 'failed', ...embedded, error: message },
          'search'
        );
        console.error('Graph search failed', {
          stage: 'embedding',
          scope: data.input.scope,
          error,
        });
        setError({ input: data.input, message });
        setProgress(undefined);
      });
    return cancel;
  }, [index, hasQuery, stopped, data.templatesEnabled, inputRevision]);
  const vectors = preparedVectors?.index === index ? preparedVectors?.vectors : undefined;
  useEffect(() => {
    if (!stopped) setAnswer(undefined);
    setError((previous) => (previous?.key ? undefined : previous));
    const currentSession = preparation.current;
    if (
      !index ||
      !vectors ||
      !hasQuery ||
      stopped ||
      currentSession?.scope !== index.snapshot.scope
    )
      return;
    const controller = new AbortController();
    searchJob.current = controller;
    setCancelled(undefined);
    setProgress({
      input: data.input,
      query,
      value: { phase: 'search', processed: 0, total: index.documents.length },
    });
    (async () => {
      const scores = await currentSession.session.scores(
        query,
        vectors.byDocument,
        controller.signal
      );
      if (controller.signal.aborted) return;
      const result = await searchKnowledgeGraph(index, query, {
        maxHops,
        semanticScores: scores,
        signal: controller.signal,
        translate: data.input.translate,
        contextChars,
      });
      if (!controller.signal.aborted) {
        setAnswer({ key, result });
        setProgress(undefined);
      }
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Graph search failed', { stage: 'search', scope: data.input.scope, error });
        setError({ input: data.input, key, message });
        setProgress(undefined);
      }
    });
    return () => controller.abort();
  }, [index, vectors, key, hasQuery, stopped]);
  const retrieved = data.available && answer?.key === key ? answer.result : undefined;
  useEffect(() => setPacked(undefined), [retrieved]);
  useEffect(() => {
    if (!retrieved || stopped) return;
    if (retrieved.context.usage.limit === contextChars) {
      setProgress(undefined);
      return;
    }
    const controller = new AbortController();
    contextJob.current = controller;
    setError(undefined);
    setProgress({
      input: data.input,
      query,
      value: { phase: 'search', processed: 0, total: 0 },
    });
    buildGraphSearchContextAsync(retrieved, contextChars, data.input.translate, controller.signal)
      .then((context) => {
        if (controller.signal.aborted) return;
        setPacked({ input: retrieved, translate: data.input.translate, context });
        setProgress(undefined);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Graph search failed', { stage: 'context', scope: data.input.scope, error });
        setError({
          input: data.input,
          key,
          message: error instanceof Error ? error.message : String(error),
        });
        setProgress(undefined);
      });
    return () => controller.abort();
  }, [retrieved, contextChars, data.input.translate, stopped]);
  const currentContext =
    retrieved?.context.usage.limit === contextChars
      ? retrieved.context
      : packed?.input === retrieved &&
        packed?.translate === data.input.translate &&
        packed.context.usage.limit === contextChars
      ? packed.context
      : undefined;
  const result = useMemo(
    () =>
      !retrieved || !currentContext
        ? undefined
        : currentContext === retrieved.context
        ? retrieved
        : { ...retrieved, context: currentContext },
    [retrieved, currentContext]
  );
  const currentError =
    error?.input === data.input && (!error.key || error.key === key) ? error.message : undefined;
  return {
    result,
    ready:
      data.available &&
      !data.loading &&
      !data.sourceError &&
      data.input.coverage.keywords &&
      (!data.templatesEnabled || data.input.coverage.templates) &&
      (!!vectors ||
        [backgroundEmbeddings, queryEmbeddings].some(
          (status) =>
            status.phase === 'completed' &&
            ((!!index && status.revision === index.snapshot.revision) ||
              (!!inputRevision && status.inputRevision === inputRevision))
        )),
    progress:
      progress?.input === data.input && (!progress.query || progress.query === query)
        ? progress.value
        : undefined,
    loading:
      data.available &&
      !data.sourceError &&
      (data.loading || (hasQuery && !result && !stopped && !currentError)),
    sourceError: data.sourceError,
    error: currentError,
    cancelled: stopped,
    stop: () => {
      prepareJob.current?.abort();
      embeddingJob.current?.();
      searchJob.current?.abort();
      contextJob.current?.abort();
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
