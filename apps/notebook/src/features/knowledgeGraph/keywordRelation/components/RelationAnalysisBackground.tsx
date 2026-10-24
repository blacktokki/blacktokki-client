/** Background ownership of analysis and final graph embeddings. */
import { useLangContext } from '@blacktokki/core';
import React, { useEffect, useRef, useState } from 'react';

import { graphSearchCache } from '../keywordRelationCache';
import {
  createSearchDiagnostic,
  readRelationCacheTiming,
  searchDiagnosticTime,
} from '../search/diagnostics';
import type { SearchDiagnostic } from '../search/diagnostics';
import { acquireGraphSearchPreparation } from '../search/preparation';
import type { GraphSearchPreparation } from '../search/preparation';
import { restoreGraphSearchEmbeddingCache } from '../search/semantic';
import { useSearchGraph } from '../search/useGraphSearch';
import { publishSearchEmbeddingStatus, useRelationAnalysis } from '../useRelationAnalysis';
import {
  useRelationAnalysisNotes,
  clearRelationAnalysisSession,
  publishRelationAnalysisSession,
  useRelationAnalysisSession,
} from '../useRelationAnalysisSession';

/** Mounted once by the background extension slot; observers never start their own jobs. */
export function RelationAnalysisBackground() {
  const { lang } = useLangContext();
  const owner = useRef({}).current;
  const data = useRelationAnalysisNotes();
  const analysis = useRelationAnalysis({
    translate: lang,
    scope: data.scope,
    notes: data.notes.data,
    active: data.available && !data.notes.isError,
    refreshing: data.notes.isFetching,
  });
  const [searchReady, setSearchReady] = useState<{
    runId: number;
    notes: typeof data.notes.data;
    startedAt: number;
  }>();
  const preload =
    data.available &&
    !data.notes.isError &&
    analysis.status !== 'stopping' &&
    analysis.status !== 'cancelled' &&
    analysis.status !== 'failed';
  useEffect(() => {
    if (!preload) return;
    const scope = data.scope;
    const preparation = acquireGraphSearchPreparation(scope);
    // Model files and stored vectors do not depend on loaded notes or relation restoration.
    preparation.initialize().catch(() => undefined);
    preparation
      .cache(graphSearchCache)
      .read(scope, 'vectors')
      .catch(() => undefined);
    return () => {
      preparation.dispose().catch(() => undefined);
    };
  }, [preload, data.scope]);
  useEffect(() => () => clearRelationAnalysisSession(data.scope, owner), [data.scope, owner]);
  useEffect(() => {
    publishRelationAnalysisSession(data.scope, owner, { data, analysis });
  }, [data, analysis, owner]);
  useEffect(() => {
    if (analysis.status !== 'completed') {
      setSearchReady(undefined);
      return;
    }
    if (data.notes.isFetching) return;
    const startedAt = searchDiagnosticTime();
    // Publish completed analysis before mounting synchronous graph and template preparation.
    const timer = setTimeout(
      () => setSearchReady({ runId: analysis.runId, notes: data.notes.data, startedAt }),
      0
    );
    return () => clearTimeout(timer);
  }, [analysis.runId, analysis.status, data.notes.data, data.notes.isFetching]);
  return analysis.status === 'completed' &&
    searchReady?.runId === analysis.runId &&
    searchReady.notes === data.notes.data ? (
    <GraphSearchEmbeddingBackground startedAt={searchReady.startedAt} />
  ) : null;
}

async function prepareGraphSearchEmbeddings(
  input: ReturnType<typeof useSearchGraph>['input'],
  preparation: GraphSearchPreparation,
  signal: AbortSignal,
  onProgress: (processed: number, total: number, ratio: number) => void,
  diagnostic?: SearchDiagnostic
) {
  const measure = async <T,>(name: string, work: () => T | Promise<T>) =>
    diagnostic ? diagnostic.measure(name, work) : work();
  const cache = preparation.cache(graphSearchCache);
  const seed = (input.notes || []).reduce(
    (shortest, note) =>
      note.title.trim() && (!shortest || note.title.length < shortest.length)
        ? note.title
        : shortest,
    ''
  );
  // Model loading can overlap source identification, cache I/O and index construction.
  const warmup = seed
    ? measure('모델초기화(대기포함)', () => preparation.warmup(seed, signal))
    : undefined;
  warmup?.catch(() => undefined);
  const inputRevision = await measure('검색입력식별', () => preparation.revision(input, signal));
  let report: typeof onProgress | undefined;
  let latestIndexProgress: [number, number, ('snapshot' | 'index')?] | undefined;
  const indexProgress = (processed: number, total: number, stage?: 'snapshot' | 'index') => {
    latestIndexProgress = [processed, total, stage];
    report?.(processed, total, ((stage === 'index' ? 2 : 1) + (total ? processed / total : 1)) / 4);
  };
  // The index is required for both cache hits and misses; do not serialize it behind cache I/O.
  const indexReady = measure('인덱스준비(대기포함)', () =>
    preparation.index(input, inputRevision, signal, indexProgress, diagnostic)
  );
  indexReady.catch(() => undefined);
  const cached = await restoreGraphSearchEmbeddingCache({
    scope: input.scope,
    inputRevision,
    cache,
    signal,
    diagnostic,
  });
  diagnostic?.update({ 캐시상태: cached ? '재사용 가능' : '없음 또는 불일치' });
  const prepare = async (progress?: typeof onProgress) => {
    report = progress;
    report?.(0, 0, 0.25);
    if (latestIndexProgress) indexProgress(...latestIndexProgress);
    const index = await indexReady;
    diagnostic?.update({ 검색문서수: index.documents.length });
    report?.(0, index.documents.length, 0.75);
    const vectors = await measure('벡터준비(대기포함)', () =>
      preparation.vectors({
        revision: index.snapshot.revision,
        inputRevision,
        documents: index.documents,
        cache,
        signal,
        onProgress:
          progress &&
          ((processed, total) => progress(processed, total, (3 + processed / (total + 1)) / 4)),
      })
    );
    diagnostic?.update({ 고유벡터수: vectors.total });
    const warmupText = index.documents
      .map((document) => document.name || document.text || '')
      .filter((text) => text.trim())
      .reduce(
        (shortest, text) => (!shortest || text.length < shortest.length ? text : shortest),
        ''
      );
    if (warmup) await warmup;
    else if (warmupText)
      await measure('모델초기화(대기포함)', () => preparation.warmup(warmupText, signal));
    diagnostic?.record(preparation.modelTiming());
    return { revision: index.snapshot.revision, inputRevision, total: vectors.total };
  };
  if (cached) {
    // Cached vectors alone do not make the first search ready; wait for the shared index and model.
    return prepare();
  }
  return prepare(onProgress);
}

/** Restore or embed only the final graph after association analysis has finished. */
export function GraphSearchEmbeddingBackground({ startedAt }: { startedAt?: number } = {}) {
  const renderedAt = useRef(0);
  renderedAt.current = searchDiagnosticTime();
  const displayStarted = useRef(startedAt);
  displayStarted.current = startedAt;
  const measurement = useRef<
    | {
        key: string;
        attempt: number;
        diagnostic: SearchDiagnostic;
        ready: () => void;
      }
    | undefined
  >(undefined);
  const data = useSearchGraph(true);
  const { analysis } = useRelationAnalysisSession();
  const analysisRunId = analysis.runId;
  const analysisCompleted =
    analysis.status === 'completed' &&
    data.input.coverage.keywords &&
    (!data.templatesEnabled || data.input.coverage.templates);
  useEffect(() => () => measurement.current?.diagnostic.finish('중단'), []);
  useEffect(() => {
    const scope = data.analysisScope;
    if (analysis.status !== 'completed') {
      measurement.current?.diagnostic.finish('중단');
      measurement.current = undefined;
      publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 }, 'extension');
      return;
    }
    const key = JSON.stringify([scope, analysisRunId]);
    if (measurement.current?.key !== key || measurement.current.diagnostic.closed) {
      measurement.current?.diagnostic.finish('중단');
      const attempt = measurement.current?.key === key ? measurement.current.attempt + 1 : 1;
      const began = displayStarted.current ?? renderedAt.current;
      const diagnostic = createSearchDiagnostic(
        '검색 준비: 처리 시간',
        {
          ...readRelationCacheTiming(scope),
          분석범위: scope,
          분석실행ID: analysisRunId,
          시도횟수: attempt,
        },
        began
      );
      measurement.current = {
        key,
        attempt,
        diagnostic,
        ready: diagnostic.begin('검색입력준비', began),
      };
    }
    const { diagnostic, ready } = measurement.current;
    diagnostic.update({
      노트수: data.input.notes?.length,
      항목수: data.input.graph?.nodes.length,
      연결수: data.input.graph?.edges.length,
      접근가능: data.available,
      자료조회중: data.loading,
      자료조회오류: data.sourceError,
      관계반영완료: data.input.coverage.keywords,
      템플릿필요: !!data.templatesEnabled,
      템플릿반영완료: data.input.coverage.templates,
    });
    if (!data.available || data.loading || data.sourceError || !analysisCompleted) {
      publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 }, 'extension');
      return;
    }
    ready();
    const controller = new AbortController();
    const preparation = acquireGraphSearchPreparation(data.input.scope);
    const run = analysisRunId === undefined ? {} : { analysisRunId };
    publishSearchEmbeddingStatus(
      scope,
      { ...run, phase: 'checking', processed: 0, total: 0 },
      'extension'
    );
    let completed = 0;
    let total = 0;
    let stageProgress = 0;
    prepareGraphSearchEmbeddings(
      data.input,
      preparation,
      controller.signal,
      (processed, count, ratio) => {
        if (controller.signal.aborted) return;
        completed = processed;
        total = count;
        stageProgress = ratio;
        publishSearchEmbeddingStatus(
          scope,
          { ...run, phase: 'running', processed, total: count, stageProgress },
          'extension'
        );
      },
      diagnostic
    )
      .then(({ revision, inputRevision, total }) => {
        if (!controller.signal.aborted) {
          publishSearchEmbeddingStatus(
            scope,
            { ...run, phase: 'completed', processed: total, total, revision, inputRevision },
            'extension'
          );
          diagnostic.finish('완료');
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        diagnostic.finish('실패');
        publishSearchEmbeddingStatus(
          scope,
          {
            ...run,
            phase: 'failed',
            processed: completed,
            total,
            stageProgress,
            error: error instanceof Error ? error.message : String(error),
          },
          'extension'
        );
        console.warn('Graph search embedding preparation failed', { scope, error });
      });
    return () => {
      diagnostic.finish('중단');
      controller.abort();
      preparation.dispose().catch((error: unknown) => {
        console.warn('Graph search preparation release failed', { scope, error });
      });
      publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 }, 'extension');
    };
  }, [
    data.analysisScope,
    data.available,
    data.loading,
    data.sourceError,
    data.input,
    analysisCompleted,
    analysis.status,
    analysisRunId,
  ]);
  return null;
}
