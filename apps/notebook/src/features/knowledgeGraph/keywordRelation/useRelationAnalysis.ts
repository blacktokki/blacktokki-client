import { useCallback, useEffect, useRef, useState } from 'react';

import { clearRelationAnalysisMemory, runInductiveRelationAnalysis } from './relationAnalysis';
import {
  relationAnalysisProgress,
  relationLogTimestamp,
  relationProgressPercent,
  summarizeInductiveRelations,
  summarizeRelationEntities,
  summarizeRelationInputPatterns,
  summarizeRelationValidationBatch,
} from './relationSummary';
import type { RelationAnalysisNote, RelationAnalysisState } from './types';
import { initialRelationAnalysisState as initialState } from './types';

/** Own execution and UI state; late callbacks from cancelled scopes never reach the screen. */
export function useRelationAnalysis({
  scope,
  notes,
  active,
  refreshing = false,
}: {
  scope: string;
  notes?: RelationAnalysisNote[];
  active: boolean;
  refreshing?: boolean;
}) {
  const [state, setState] = useState(initialState);
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const mounted = useRef(false);
  const preparedNotes = useRef<RelationAnalysisNote[] | undefined>(undefined);
  const lastNotes = useRef<RelationAnalysisNote[] | undefined>(undefined);
  const session = useRef<{ scope: string; active: boolean } | undefined>(undefined);
  useEffect(() => {
    session.current = { scope, active };
    mounted.current = true;
    lastNotes.current = undefined;
    preparedNotes.current = undefined;
    setState(initialState());
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
      clearRelationAnalysisMemory(scope);
    };
  }, [scope, active]);

  const stop = useCallback(() => {
    if (controller.current && !controller.current.signal.aborted) {
      controller.current.abort();
      setState((previous) => ({ ...previous, status: 'stopping' }));
    }
  }, []);
  const execute = useCallback(
    (prepareOnly: boolean) => {
      if (!active || !notes || refreshing) return;
      lastNotes.current = notes;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const id = ++generation.current;
      const current = () => mounted.current && generation.current === id;
      const publish = (update: Partial<RelationAnalysisState>) => {
        if (current() && !abort.signal.aborted)
          setState((previous) => ({ ...previous, ...update }));
      };
      let latestProgress = '0.0%';
      const log = (message: string, data: Record<string, unknown> & { 진행률: string }) => {
        if (!current() || abort.signal.aborted) return;
        latestProgress = data.진행률;
        console.log(message, { ...data, 로그시간: relationLogTimestamp() });
      };
      if (prepareOnly) preparedNotes.current = undefined;
      setState((previous) => ({
        ...initialState(),
        patternChanges: prepareOnly ? undefined : previous.patternChanges,
        status: 'running',
        prepareOnly,
        total: notes.length,
      }));
      runInductiveRelationAnalysis(notes, {
        scope,
        prepareOnly,
        restoreUnchanged: prepareOnly,
        signal: abort.signal,
        onModelProgress: (model) => publish({ model }),
        onEntityProgress: (progress) => {
          latestProgress = relationProgressPercent(progress.completedNotes, progress.noteCount);
          publish({
            phase: 'keywords',
            processed: progress.completedNotes,
            total: progress.noteCount,
            elapsedMs: progress.elapsedMs,
          });
        },
        onEntities: (entities) => {
          publish({ entities });
          log('키워드 개체 추출 요약', { 분석범위: scope, ...summarizeRelationEntities(entities) });
        },
        onPatterns: (patterns) => {
          publish({ patterns });
          log('귀납적 관계 고유 패턴', {
            분석범위: scope,
            ...summarizeRelationInputPatterns(patterns),
          });
        },
        onInferenceProgress: (progress) => {
          latestProgress = relationProgressPercent(progress.processed, progress.total);
          publish({
            phase: progress.phase,
            processed: progress.processed,
            total: progress.total,
            elapsedMs: progress.elapsedMs,
            modelChecks: progress.modelChecks,
            reused: progress.reusedChecks || 0,
            failed: progress.failedRecords ?? progress.modelFailures,
            savedBatch: progress.savedBatch || 0,
          });
          if (progress.model === 'embedding') return;
          log('NLI 추론 진행', {
            분석범위: scope,
            진행률: relationProgressPercent(progress.processed, progress.total),
            처리단계: {
              embedding: '패턴 임베딩',
              merge: '패턴 병합 검사',
              validation: '관계 검증',
              retry: '실패 사례 재시도',
            }[progress.phase],
            상태: { running: '진행 중', completed: '처리 완료', failed: '재시도 필요' }[
              progress.status
            ],
            처리단위: progress.unit === 'pattern' ? '패턴' : '검증 근거',
            전체건수: progress.total,
            처리완료건수: progress.processed,
            대기건수: progress.total - progress.processed,
            모델검사수: progress.modelChecks,
            모델실패수: progress.modelFailures,
            검증실패근거수: progress.failedRecords,
            검사한도: progress.checkLimit,
            추론중입력문자수: progress.inFlightInputChars,
            동일입력재사용수: progress.reusedChecks,
            저장완료배치: progress.savedBatch,
            경과초: Number((progress.elapsedMs / 1000).toFixed(1)),
          });
        },
        onBatch: (validation, updates) => {
          publish({ savedBatch: validation.batch });
          log('Inductive relation validation batch', {
            scope,
            ...validation,
            진행률: relationProgressPercent(
              validation.completed + validation.failed,
              validation.total
            ),
            results: updates,
          });
          log('귀납적 관계 검증 진행', {
            분석범위: scope,
            ...summarizeRelationValidationBatch(validation, updates),
          });
        },
      })
        .then((result) => {
          if (!current()) return;
          if (abort.signal.aborted) {
            setState((previous) => ({ ...previous, status: 'cancelled' }));
            return;
          }
          if (prepareOnly && !result.discoveryIncomplete) preparedNotes.current = notes;
          if (prepareOnly && !result.cacheRestored) {
            publish({
              status: result.discoveryIncomplete ? 'failed' : 'ready',
              phase: result.discoveryIncomplete ? 'keywords' : 'embedding',
              entities: result.entityExtraction,
              patterns: result.inputPatterns,
              patternChanges: result.patternChanges,
              processed: result.discoveryIncomplete ? result.inputPatterns?.length || 0 : 0,
              total: result.inputPatterns?.length || 0,
              ...(!result.discoveryIncomplete && {
                elapsedMs: 0,
                modelChecks: 0,
                reused: 0,
                failed: 0,
                model: undefined,
              }),
              error: result.discoveryIncomplete ? result.warnings.join('\n') : undefined,
            });
            log('관계 분석 준비', {
              분석범위: scope,
              진행률: '100.0%',
              상태: result.discoveryIncomplete ? '재시도 필요' : '분석 시작 대기',
            });
            return;
          }
          publish({
            result,
            entities: result.entityExtraction,
            patterns: result.inputPatterns,
            patternChanges: result.patternChanges,
            prepareOnly: false,
            ...(result.cacheRestored && {
              phase: 'validation',
              processed: result.validationProgress?.completed || 0,
              total: result.validationProgress?.total || 0,
              modelChecks: 0,
              reused: result.validationProgress?.reused || 0,
              failed: 0,
              elapsedMs: 0,
              model: undefined,
            }),
            status:
              result.discoveryIncomplete || result.validationProgress?.status === 'failed'
                ? 'failed'
                : 'completed',
          });
          log('Inductive relation discovery', {
            scope,
            ...result,
            진행률: relationAnalysisProgress(result),
          });
          log('귀납적 관계 분석 요약', { 분석범위: scope, ...summarizeInductiveRelations(result) });
        })
        .catch((error: unknown) => {
          if (!current()) return;
          const cancelled =
            abort.signal.aborted || (error instanceof Error && error.name === 'AbortError');
          setState((previous) => ({
            ...previous,
            status: cancelled ? 'cancelled' : 'failed',
            error: cancelled ? undefined : error instanceof Error ? error.message : String(error),
          }));
          if (!cancelled)
            console.warn('Inductive relation discovery failed', {
              scope,
              진행률: latestProgress,
              로그시간: relationLogTimestamp(),
              error,
            });
        })
        .finally(() => {
          if (generation.current === id) controller.current = undefined;
        });
    },
    [scope, notes, active, refreshing]
  );

  useEffect(() => {
    if (notes !== lastNotes.current) execute(true);
  }, [notes, execute]);
  const start = useCallback(() => execute(preparedNotes.current !== notes), [execute, notes]);
  const snapshot =
    session.current?.scope === scope && session.current.active === active ? state : initialState();
  return { ...snapshot, start, stop };
}
