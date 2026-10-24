import { collectKeywordRelations } from './keyword/collectKeywordRelations';
import { collectKeywordTypes } from './keyword/collectKeywordTypes';
import { evaluateKeywordAssociations } from './keyword/evaluateKeywordAssociations';
import { extractKeywords } from './keyword/extractKeywords';
import { checkRelationCancelled, createRelationDiscoveryMemory } from './keyword/keywordUtils';
import { relationCacheHash, relationPatternCacheStore } from './keywordRelationCache';
import { clearRelationCacheTiming, recordRelationCacheTiming } from './search/diagnostics';
import { relationAssociationRevision } from './types';
import type {
  AssociationOptions,
  RelationAssociationPreparation,
  RelationDiscoveryMemory,
  RelationDiscoveryResult,
  RelationAnalysisNote,
} from './types';

export type RelationAnalysisOptions = Omit<AssociationOptions, 'memory'> & {
  scope: string;
  /** 준비 점검 이후 호환 캐시를 재사용하거나 수집·평가 결과를 갱신한다. */
  cachePolicy?: 'reuse' | 'refresh';
  /** 캐시 확인·복원에서 실제로 완료한 작업을 알린다. */
  onCacheProgress?: (progress: {
    phase: 'checking' | 'restoring';
    processed: number;
    total: number;
    ratio: number;
  }) => void;
};

function cacheProgress(
  options: Pick<RelationAnalysisOptions, 'signal' | 'onCacheProgress'>,
  phase: 'checking' | 'restoring',
  total: number
) {
  return (processed: number) => {
    checkRelationCancelled(options.signal);
    options.onCacheProgress?.({ phase, processed, total, ratio: processed / total });
    checkRelationCancelled(options.signal);
  };
}

type Session = {
  scope: string;
  memory: RelationDiscoveryMemory;
  source?: string;
  result?: RelationDiscoveryResult;
  rules?: string;
  prepared?: { source: string; associations: RelationAssociationPreparation };
};
let session: Session | undefined;
let activeAnalysis: Promise<void> = Promise.resolve();

/** Publish all three collected stages on reuse without extracting or collecting again. */
function publishCollection(result: RelationDiscoveryResult, options: AssociationOptions) {
  options.onEntities?.(result.entityExtraction!);
  checkRelationCancelled(options.signal);
  options.onEntityTypes?.(result.entityExtraction!);
  checkRelationCancelled(options.signal);
  options.onPatterns?.(result.inputPatterns || []);
  checkRelationCancelled(options.signal);
}

type SourceSnapshot = { notes: RelationAnalysisNote[]; source: string; hash?: string };
let sources = new WeakMap<RelationAnalysisNote[], SourceSnapshot>();

/** Reuse serialization and a completed digest only while every source field remains equal. */
function sourceSnapshot(notes: RelationAnalysisNote[]): SourceSnapshot {
  const cached = sources.get(notes);
  if (
    cached &&
    cached.notes.length === notes.length &&
    cached.notes.every(
      (note, index) =>
        note.title === notes[index].title && note.description === notes[index].description
    )
  )
    return cached;
  const source = JSON.stringify(
    [...new Map(notes.map((note) => [note.title.normalize('NFC'), note])).values()]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((note) => [note.title, note.description || ''])
  );
  const snapshot = {
    notes: notes.map(({ title, description }) => ({ title, description })),
    source,
  };
  sources.set(notes, snapshot);
  return snapshot;
}

async function sourceHash(snapshot: SourceSnapshot, signal?: AbortSignal) {
  checkRelationCancelled(signal);
  if (!snapshot.hash) snapshot.hash = await relationCacheHash(snapshot.source, signal);
  checkRelationCancelled(signal);
  return snapshot.hash;
}

const preparationResult = (
  notes: RelationAnalysisNote[],
  patternCache: NonNullable<RelationDiscoveryResult['patternCache']>
): RelationDiscoveryResult => ({
  method: 'association',
  noteCount: notes.length,
  entityCount: 0,
  observationCount: 0,
  candidates: [],
  warnings: [],
  patternCache,
});

/** Never wait for collection, evaluation or an earlier analysis to decide cache compatibility. */
export async function inspectRelationAnalysisCache(
  notes: RelationAnalysisNote[],
  options: Pick<RelationAnalysisOptions, 'scope' | 'signal' | 'onCacheProgress'>
): Promise<RelationDiscoveryResult> {
  checkRelationCancelled(options.signal);
  const report = cacheProgress(options, 'checking', 3);
  report(0);
  const started = Date.now();
  const timings = { 실행대기ms: 0, 원문식별ms: 0, 캐시조회ms: 0 };
  let cancel: (() => void) | undefined;
  const check = async () => {
    timings.실행대기ms = Date.now() - started;
    checkRelationCancelled(options.signal);
    const identified = Date.now();
    const snapshot = sourceSnapshot(notes);
    const { source } = snapshot;
    report(1);
    timings.원문식별ms = Date.now() - identified;
    const current = session;
    if (
      current?.scope === options.scope &&
      current.result &&
      current.source === source &&
      current.rules === relationAssociationRevision
    ) {
      report(3);
      const restore = cacheProgress(options, 'restoring', 1);
      restore(0);
      const restored = {
        ...current.result,
        cacheRestored: true,
        patternCache: {
          status: 'reusable' as const,
          hasEvaluations: true,
        },
      };
      restore(1);
      return restored;
    }
    const digest = await sourceHash(snapshot, options.signal);
    report(2);
    timings.원문식별ms = Date.now() - identified;
    checkRelationCancelled(options.signal);
    const queried = Date.now();
    const cache = await relationPatternCacheStore.probe(options.scope, digest, options.signal);
    timings.캐시조회ms = Date.now() - queried;
    checkRelationCancelled(options.signal);
    report(3);
    return preparationResult(notes, cache);
  };
  try {
    const result = await Promise.race([
      check().catch(() => {
        checkRelationCancelled(options.signal);
        report(3);
        return preparationResult(notes, { status: 'unavailable', hasEvaluations: false });
      }),
      new Promise<never>((_, reject) => {
        cancel = () =>
          reject(
            Object.assign(new Error('Relation preparation cancelled.'), { name: 'AbortError' })
          );
        options.signal?.addEventListener('abort', cancel, { once: true });
      }),
    ]);
    checkRelationCancelled(options.signal);
    recordRelationCacheTiming(options.scope, {
      관계캐시상태: result.patternCache?.status,
      관계캐시실행대기ms: timings.실행대기ms,
      관계원문식별ms: timings.원문식별ms,
      관계캐시조회ms: timings.캐시조회ms,
      관계캐시확인ms: Date.now() - started,
    });
    return result;
  } finally {
    if (cancel) options.signal?.removeEventListener('abort', cancel);
  }
}

/** Source texts and statistical results remain scoped to the active in-memory session. */
export function clearRelationAnalysisMemory(scope?: string) {
  clearRelationCacheTiming(scope);
  sources = new WeakMap();
  if (!scope || session?.scope === scope) session = undefined;
}

/**
 * 키워드 추출 → 개체 유형 수집 → 관계 후보 수집 → 연관성 평가를 순서대로 실행한다.
 * 호환되는 완료 결과 또는 수집 캐시는 재사용하며, 실행을 직렬화해 세션 메모리를 공유한다.
 */
export function runInductiveRelationAnalysis(
  notes: RelationAnalysisNote[],
  options: RelationAnalysisOptions
): Promise<RelationDiscoveryResult> {
  const run = activeAnalysis.then(async (): Promise<RelationDiscoveryResult> => {
    checkRelationCancelled(options.signal);
    const restore =
      options.cachePolicy === 'reuse' ? cacheProgress(options, 'restoring', 5) : undefined;
    restore?.(0);
    if (session?.scope !== options.scope)
      session = { scope: options.scope, memory: createRelationDiscoveryMemory() };
    const current = session;
    const snapshot = sourceSnapshot(notes);
    const { source } = snapshot;
    restore?.(1);
    if (
      options.cachePolicy === 'reuse' &&
      current.result &&
      current.source === source &&
      current.rules === relationAssociationRevision
    ) {
      restore?.(5);
      publishCollection(current.result, options);
      return {
        ...current.result,
        cacheRestored: true,
        patternCache: {
          status: 'reusable',
          hasEvaluations: true,
        },
      };
    }
    const digest = await sourceHash(snapshot, options.signal);
    restore?.(2);
    checkRelationCancelled(options.signal);
    let prepared = current.prepared;
    let restoredPatterns = false;
    if (prepared?.source !== source) {
      current.prepared = undefined;
      const restored =
        options.cachePolicy === 'reuse'
          ? await relationPatternCacheStore.restorePreparation(
              options.scope,
              digest,
              options.signal,
              (processed) => restore?.(2 + processed),
              source
            )
          : undefined;
      checkRelationCancelled(options.signal);
      if (!restored && options.cachePolicy === 'reuse')
        throw new Error('Cached relationship candidates are unavailable. Update the cache.');
      let associations = restored;
      if (!associations) {
        current.memory.stats = createRelationDiscoveryMemory().stats;
        const keywords = await extractKeywords(notes, {
          ...options,
          memory: current.memory,
        });
        checkRelationCancelled(options.signal);
        const types = await collectKeywordTypes(keywords, options);
        associations = await collectKeywordRelations(types, options);
      }
      checkRelationCancelled(options.signal);
      prepared = { source, associations };
      current.prepared = prepared;
      if (restored) {
        restoredPatterns = true;
        publishCollection(restored.result, options);
      }
    } else {
      publishCollection(prepared.associations.result, options);
    }
    const reuse = options.cachePolicy === 'reuse';
    if (reuse && !restoredPatterns) {
      const patternCache = await relationPatternCacheStore.inspect(
        options.scope,
        digest,
        prepared.associations.result,
        options.signal
      );
      checkRelationCancelled(options.signal);
      if (patternCache.status !== 'reusable')
        throw new Error('Cached relationship patterns no longer match. Prepare analysis again.');
    }
    if (!restoredPatterns) restore?.(5);
    const result = {
      ...(await evaluateKeywordAssociations(prepared.associations, options)),
      patternCache: {
        status: 'reusable' as const,
        hasEvaluations: true,
      },
      ...(reuse && { cacheRestored: true }),
    };
    checkRelationCancelled(options.signal);
    try {
      if (!reuse)
        await relationPatternCacheStore.save(
          options.scope,
          digest,
          result,
          options.signal,
          prepared.associations,
          source
        );
    } catch {
      checkRelationCancelled(options.signal);
      result.warnings = [
        ...result.warnings,
        'Could not save relationship patterns. Reopening will require analysis again.',
      ];
    }
    checkRelationCancelled(options.signal);
    current.result = result;
    current.source = source;
    current.rules = relationAssociationRevision;
    return result;
  });
  activeAnalysis = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
