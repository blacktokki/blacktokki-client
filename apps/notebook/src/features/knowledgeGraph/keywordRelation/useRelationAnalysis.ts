/** Analysis execution, UI state, progress subscriptions and diagnostic summaries. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  relationEnumerationContext,
  analyzeRelationKeywordComposition,
  relationKeywordEntityKey,
} from './keyword/keywordUtils';
import {
  clearRelationAnalysisMemory,
  inspectRelationAnalysisCache,
  runInductiveRelationAnalysis,
} from './relationAnalysis';
import type { RelationAnalysisOptions } from './relationAnalysis';
import { initialRelationAnalysisState as initialState } from './types';
import type {
  RelationAnalysisNote,
  RelationAnalysisState,
  RelationDiscoveryResult,
  RelationEntityResult,
  RelationInputPattern,
  RelationKeywordSource,
  RelationEntityType,
  RelationKeywordEnumeration,
} from './types';
import ko from '../../../lang/ko.json';

/** Own execution and UI state; late callbacks from cancelled scopes never reach the screen. */
export function useRelationAnalysis({
  scope,
  notes,
  active,
  refreshing = false,
  translate,
}: {
  scope: string;
  notes?: RelationAnalysisNote[];
  active: boolean;
  refreshing?: boolean;
  translate?: (value: string) => string;
}) {
  // Localized type names are part of cached patterns; never restore another language's names.
  const analysisScope = translate
    ? JSON.stringify([
        scope,
        translate('Document path'),
        translate('Heading'),
        translate('List'),
        translate('Table columns'),
        translate('Table rows'),
      ])
    : scope;
  const [state, setState] = useState(initialState);
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const mounted = useRef(false);
  const preparedNotes = useRef<RelationAnalysisNote[] | undefined>(undefined);
  const lastNotes = useRef<RelationAnalysisNote[] | undefined>(undefined);
  const session = useRef<{ scope: string; active: boolean } | undefined>(undefined);
  useEffect(() => {
    session.current = { scope: analysisScope, active };
    mounted.current = true;
    lastNotes.current = undefined;
    preparedNotes.current = undefined;
    setState(initialState());
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
      clearRelationAnalysisMemory(analysisScope);
    };
  }, [analysisScope, active]);

  const stop = useCallback(() => {
    if (controller.current && !controller.current.signal.aborted) {
      controller.current.abort();
      setState((previous) => ({ ...previous, status: 'stopping' }));
    }
  }, []);
  const execute = useCallback(
    (prepareOnly: boolean, cachePolicy: 'reuse' | 'refresh' = 'refresh') => {
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
      const onCacheProgress: RelationAnalysisOptions['onCacheProgress'] = (progress) =>
        publish({
          phase: progress.phase,
          processed: progress.processed,
          total: progress.total,
          stageProgress: progress.ratio,
        });
      let latestProgress = '0.0%';
      const log = (message: string, data: Record<string, unknown> & { 진행률: string }) => {
        if (!current() || abort.signal.aborted) return;
        latestProgress = data.진행률;
        console.log(message, { ...data, 로그시간: relationLogTimestamp() });
      };
      if (prepareOnly) preparedNotes.current = undefined;
      setState((previous) => ({
        ...initialState(),
        runId: id,
        patternCache: prepareOnly ? undefined : previous.patternCache,
        status: 'running',
        prepareOnly,
        phase: prepareOnly ? 'checking' : cachePolicy === 'reuse' ? 'restoring' : 'keywords',
        total: prepareOnly || cachePolicy === 'reuse' ? 0 : notes.length,
        stageProgress: 0,
      }));
      const run = prepareOnly
        ? inspectRelationAnalysisCache(notes, {
            scope: analysisScope,
            signal: abort.signal,
            onCacheProgress,
          })
        : runInductiveRelationAnalysis(notes, {
            scope: analysisScope,
            translate,
            cachePolicy,
            signal: abort.signal,
            onCacheProgress,
            onEntityProgress: (progress) => {
              latestProgress = relationProgressPercent(progress.completedNotes, progress.noteCount);
              publish({
                phase: 'keywords',
                processed: progress.completedNotes,
                total: progress.noteCount,
                stageProgress:
                  progress.ratio ??
                  fraction({ processed: progress.completedNotes, total: progress.noteCount }),
                elapsedMs: progress.elapsedMs,
              });
            },
            onEntities: (entities) => {
              publish(
                cachePolicy === 'reuse'
                  ? { entities }
                  : { entities, phase: 'keywords', stageProgress: 1 }
              );
              log('1. 키워드 개체 추출 요약', {
                분석범위: scope,
                ...summarizeRelationEntities(entities),
              });
            },
            onEntityTypes: (entities) => {
              publish(
                cachePolicy === 'reuse'
                  ? { entities }
                  : { entities, phase: 'types', stageProgress: 1 }
              );
              log('2. 키워드 개수 일치 열거 수집', {
                분석범위: scope,
                ...summarizeRelationEnumerations(entities.enumerations),
              });
              log('3. 수집된 개체 유형', {
                분석범위: scope,
                ...summarizeRelationEntityTypes(entities.entityTypes),
              });
            },
            onPatterns: (patterns) => {
              publish(
                cachePolicy === 'reuse'
                  ? { patterns }
                  : { patterns, phase: 'grouping', stageProgress: 1 }
              );
              log('4. 연관관계 후보 묶음', {
                분석범위: scope,
                ...summarizeRelationInputPatterns(patterns),
              });
            },
            onInferenceProgress: (progress) => {
              latestProgress = relationProgressPercent(progress.processed, progress.total);
              publish({
                phase:
                  progress.stage === 'collection'
                    ? 'candidates'
                    : progress.stage === 'types' ||
                      progress.stage === 'contexts' ||
                      progress.stage === 'grouping'
                    ? progress.stage
                    : progress.phase,
                processed: progress.processed,
                total: progress.total,
                stageProgress:
                  progress.ratio ?? (progress.status === 'completed' ? 1 : fraction(progress)),
                elapsedMs: progress.elapsedMs,
              });
            },
          });
      run
        .then((result) => {
          if (!current()) return;
          if (abort.signal.aborted) {
            setState((previous) => ({ ...previous, status: 'cancelled' }));
            return;
          }
          if (prepareOnly) preparedNotes.current = notes;
          if (prepareOnly && !result.cacheRestored) {
            publish({
              status: 'ready',
              phase: 'checking',
              entities: result.entityExtraction,
              patterns: result.inputPatterns,
              patternCache: result.patternCache,
              stageProgress: 1,
              elapsedMs: 0,
              error: undefined,
            });
            return;
          }
          publish({
            result,
            entities: result.entityExtraction,
            patterns: result.inputPatterns,
            patternCache: result.patternCache,
            prepareOnly: false,
            phase: 'association',
            processed: result.associationProgress?.completed || 0,
            total: result.associationProgress?.total || 0,
            stageProgress: 1,
            ...(result.cacheRestored && { elapsedMs: 0 }),
            status: result.associationProgress?.status === 'failed' ? 'failed' : 'completed',
          });
          log('5. 연관관계 분석 결과', {
            분석범위: scope,
            ...localizeRelationLog(result),
            진행률: relationAnalysisProgress(result),
          });
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
            console.warn('6. 귀납적 관계 탐색 실패', {
              분석범위: scope,
              진행률: latestProgress,
              로그시간: relationLogTimestamp(),
              오류: error,
            });
        })
        .finally(() => {
          if (generation.current === id) controller.current = undefined;
        });
    },
    [scope, analysisScope, notes, active, refreshing, translate]
  );

  useEffect(() => {
    if (notes !== lastNotes.current) execute(true);
  }, [notes, execute]);
  useEffect(() => {
    if (
      active &&
      preparedNotes.current === notes &&
      state.status === 'ready' &&
      state.patternCache?.status === 'reusable'
    )
      execute(false, 'reuse');
  }, [state.status, state.patternCache, notes, active, execute]);
  const start = useCallback(() => execute(preparedNotes.current !== notes), [execute, notes]);
  const snapshot =
    session.current?.scope === analysisScope && session.current.active === active
      ? state
      : initialState();
  return { ...snapshot, start, stop };
}

const logLabel = (value: string) => ko[value as keyof typeof ko] || value;

const relationLogKeyLabels: Record<string, string> = {
  method: '분석방식',
  associationStats: '연관성통계',
  noteCount: '노트수',
  entityCount: '개체수',
  observationCount: '관찰근거수',
  candidates: '관계후보',
  warnings: '알림',
  patternCache: '패턴캐시',
  cacheRestored: '캐시복원여부',
  entityExtraction: '키워드개체추출',
  inputPatterns: '입력패턴',
  discoveryStats: '탐색통계',
  associationProgress: '연관성평가진행',
  associationContext: '연관문맥',
  association: '연관성',
  associationFamily: '문맥구조',
  associationRoles: '문맥역할',
  id: '식별자',
  label: '관계표현',
  template: '문장틀',
  slotTemplate: '위치문장틀',
  patternTemplate: '문장패턴',
  variants: '변형패턴',
  noteSupport: '근거노트수',
  pairSupport: '개체쌍수',
  recurring: '반복여부',
  observations: '관찰근거',
  measurements: '평가결과',
  evidenceId: '근거식별자',
  noteTitle: '노트제목',
  section: '문단',
  sectionPath: '문단경로',
  listItem: '목록항목',
  item: '항목번호',
  parent: '상위항목번호',
  field: '필드이름',
  fieldValue: '필드값',
  sourceText: '출처원문',
  source: '개체1',
  target: '개체2',
  sourceType: '개체1패턴',
  targetType: '개체2패턴',
  sourceEntityTypes: '개체1유형',
  targetEntityTypes: '개체2유형',
  origin: '발견방식',
  evidence: '원문',
  direction: '방향',
  context: '문맥',
  contextCount: '문맥수',
  sourceCount: '개체1출현수',
  targetCount: '개체2출현수',
  pairCount: '공출현수',
  lift: '향상도',
  npmi: '정규화점별상호정보량',
  specificity: '특이도',
  score: '점수',
  evidenceCount: '근거수',
  generalizationScore: '일반화점수',
  status: '상태',
  reason: '사유',
  hasEvaluations: '평가결과유무',
  inputCount: '추출키워드수',
  mentionCount: '출현횟수',
  entities: '개체목록',
  details: '개체별상세',
  enumerations: '열거목록',
  entityTypes: '개체유형목록',
  text: '내용',
  type: '패턴',
  key: '키',
  sources: '출처목록',
  sentences: '문장목록',
  href: '링크주소',
  kind: '종류',
  keyword: '키워드',
  entityKeys: '개체키목록',
  parentPath: '상위경로',
  level: '계층깊이',
  list: '목록번호',
  parentItem: '상위항목번호',
  table: '표번호',
  row: '행번호',
  column: '열번호',
  columnIndex: '열위치',
  keywordCount: '항목별키워드수',
  items: '항목목록',
  sourceIndex: '원본열거번호',
  decomposed: '포함키워드해체',
  index: '항목번호',
  keywords: '키워드목록',
  occurrences: '발견열거목록',
  enumerationIndex: '열거번호',
  name: '이름',
  parentIndices: '상위유형번호',
  childIndices: '하위유형번호',
  changedNotes: '변경노트수',
  reusedNotes: '재사용노트수',
  removedNotes: '삭제노트수',
  total: '전체건수',
  completed: '처리완료건수',
};

/** Localize diagnostic fields without changing keyword identities, source text or cached results. */
function localizeRelationLog(data: object): Record<string, unknown> {
  const localize = (value: unknown, dictionary = false): unknown => {
    if (Array.isArray(value)) return value.map((item) => localize(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        dictionary ? key : relationLogKeyLabels[key] || key,
        localize(entry, !dictionary && key === 'details'),
      ])
    );
  };
  return localize(data) as Record<string, unknown>;
}

/** Progress counts processed records, including failures; an empty stage has no remaining work. */
function relationProgressPercent(processed: number, total: number): string {
  return `${Math.min(100, Math.max(0, total > 0 ? (processed / total) * 100 : 100)).toFixed(1)}%`;
}

/** Record console emission time in Asia/Seoul, independently of stored analysis timestamps. */
function relationLogTimestamp(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00');
}

function relationAnalysisProgress(result: RelationDiscoveryResult): string {
  const progress = result.associationProgress;
  if (progress) return relationProgressPercent(progress.completed, progress.total);
  return relationProgressPercent(
    result.candidates.reduce((sum, candidate) => sum + candidate.measurements.length, 0),
    result.candidates.reduce((sum, candidate) => sum + candidate.observations.length, 0)
  );
}

/** 수집된 후보 묶음 전체와 실제 역할 패턴을 한 번에 출력한다. */
export function summarizeRelationInputPatterns(patterns: RelationInputPattern[]) {
  const origins = { sentence: '일반 문장', field: '필드', table: '표' };
  return {
    상태: '연관성 평가 대상',
    진행률: relationProgressPercent(0, patterns.length),
    수집후보수: patterns.length,
    고유입력문장수: new Set(patterns.map((pattern) => pattern.template)).size,
    관찰근거수: patterns.reduce((total, pattern) => total + pattern.observationCount, 0),
    패턴목록: patterns.map((pattern, index) => ({
      번호: index + 1,
      관계표현: pattern.label,
      입력문장: pattern.template,
      발견방식: origins[pattern.origin],
      연관문맥: pattern.associationContext,
      문맥구조: pattern.associationFamily,
      개체1패턴: pattern.sourceType,
      개체2패턴: pattern.targetType,
      개체1유형: pattern.sourceEntityTypes || [],
      개체2유형: pattern.targetEntityTypes || [],
      관찰근거수: pattern.observationCount,
      노트수: pattern.noteSupport,
      개체쌍수: pattern.pairSupport,
    })),
  };
}

const sourceKindLabels: Record<RelationKeywordSource['kind'], string> = {
  title: '노트 제목',
  heading: '문단 제목',
  link: '링크 이름',
  bold: '굵게 처리된 글',
  'field-name': '필드 이름',
  'field-value': '필드 값',
};

/** Retain all qualifying keywords, including those that never form a relationship pair. */
export function summarizeRelationEntities(result: RelationEntityResult) {
  const { compounds, constituents } = analyzeRelationKeywordComposition(result.entities);
  return {
    상태: '추출 완료',
    진행률: '100.0%',
    분석노트수: result.noteCount,
    추출키워드수: result.inputCount,
    고유개체수: result.entities.length,
    총출현횟수: result.mentionCount,
    개체목록: result.entities.map((entity) => ({
      개체: entity.text,
      패턴: entity.type,
      출처유형: [
        ...new Set(
          (result.details?.[relationKeywordEntityKey(entity)]?.sources || []).map(
            (source) => sourceKindLabels[source.kind]
          )
        ),
      ],
      출현횟수: entity.mentionCount,
      노트수: entity.noteCount,
    })),
    복합키워드수: compounds.length,
    복합키워드목록: compounds.map((compound) => ({
      키워드: compound.key,
      포함키워드: compound.keywords,
    })),
    구성키워드수: constituents.length,
    구성키워드목록: constituents.map((keyword) => ({
      키워드: keyword.key,
      발견횟수: keyword.sourceKeys.length,
      합성키워드목록: keyword.sourceKeys,
    })),
  };
}

/** Keep shared locations on the parent and add item locations only when they differ. */
function summarizeRelationEnumeration(enumeration: RelationKeywordEnumeration) {
  const context = relationEnumerationContext(enumeration, logLabel);
  return {
    상위이름: context.name,
    상위종류: context.kind,
    항목수: enumeration.items.length,
    항목별키워드수: enumeration.keywordCount,
    ...(enumeration.decomposed ? { 포함키워드해체: true } : {}),
    항목목록: enumeration.items.map((item, index) => {
      const parent = context.itemParents[index];
      return {
        위치: item.index + 1,
        ...(parent ? { 상위이름: parent.name, 상위종류: parent.kind } : {}),
        원문: item.text,
        키워드: item.keywords.map((keyword) => keyword.key),
      };
    }),
  };
}

/** Diagnostic groups retain their original items and locations without asserting relationships. */
export function summarizeRelationEnumerations(enumerations: RelationKeywordEnumeration[] = []) {
  const counts = Object.fromEntries(
    ['Document path', 'Heading', 'List', 'Table columns', 'Table rows'].map((kind) => [
      logLabel(kind),
      0,
    ])
  );
  const entries = enumerations.map((enumeration, index) => ({
    번호: index + 1,
    ...summarizeRelationEnumeration(enumeration),
  }));
  const groups: Record<number, typeof entries> = {};
  for (const entry of entries) {
    counts[entry.상위종류]++;
    (groups[entry.항목별키워드수] ??= []).push(entry);
  }
  return {
    상태: '수집 완료',
    진행률: '100.0%',
    열거수: enumerations.length,
    상위종류별건수: counts,
    열거목록: groups,
  };
}

/** Show collected entity types with source provenance and parent/child type numbers. */
export function summarizeRelationEntityTypes(types: RelationEntityType[] = []) {
  const entries = types.map((type, index) => ({
    번호: index + 1,
    이름: type.name,
    항목별키워드수: type.keywordCount,
    항목수: type.items.length,
    부분열거: type.items.map((item) => item.keywords.map((keyword) => keyword.key)),
    반복횟수: type.occurrences.length,
    상위유형: type.parentIndices.map((parent) => parent + 1),
    하위유형: type.childIndices.map((child) => child + 1),
    발견열거목록: type.occurrences.map((occurrence) => ({
      원본열거번호: occurrence.enumerationIndex + 1,
      ...summarizeRelationEnumeration(occurrence),
    })),
  }));
  const groups: Record<number, typeof entries> = {};
  for (const entry of entries) (groups[entry.항목별키워드수] ??= []).push(entry);
  return {
    상태: '수집 완료',
    진행률: '100.0%',
    개체유형수: types.length,
    상하위관계수: types.reduce((sum, type) => sum + type.childIndices.length, 0),
    개체유형목록: groups,
  };
}

const phases = {
  checking: 'Checking relationship cache',
  keywords: 'Extracting entity keywords',
  types: 'Collecting entity types',
  contexts: 'Collecting source contexts',
  candidates: 'Collecting relationship candidates',
  grouping: 'Grouping relationship candidates',
  restoring: 'Restoring cached relationships',
  association: 'Evaluating associations',
};

const statuses = {
  idle: 'Ready to analyze',
  running: 'Analysis in progress',
  ready: 'Ready to analyze',
  stopping: 'Saving completed results',
  cancelled: 'Analysis stopped',
  completed: 'Analysis complete',
  failed: 'Analysis needs attention',
};

const fraction = ({ processed, total }: { processed: number; total: number }) =>
  total > 0 ? Math.min(1, Math.max(0, processed / total)) : 0;

/** Show cache compatibility independently of pattern counts that require collection. */
function relationCacheDisplay(
  analysis: Pick<RelationAnalysisState, 'status' | 'prepareOnly' | 'patternCache'>,
  waitingForSources = false
) {
  if (
    waitingForSources ||
    analysis.status === 'idle' ||
    (analysis.status === 'running' && analysis.prepareOnly)
  )
    return {
      label: 'Checking relationship cache',
    };
  const cache = analysis.patternCache;
  if (!cache)
    return {
      label: 'Cache not checked',
    };
  switch (cache.status) {
    case 'reusable':
      return {
        label: 'Cache reusable',
      };
    case 'outdated':
      return {
        label: 'Cache update required',
      };
    case 'unavailable':
      return {
        label: 'Cache check unavailable',
      };
    case 'missing':
      return {
        label: 'Cache creation required',
      };
  }
}

const analysisStages = [
  'checking',
  'restoring',
  'keywords',
  'types',
  'contexts',
  'candidates',
  'grouping',
  'association',
  'embeddings',
] as const;

/** 각 단계를 같은 비중으로 누적하고, 단계 안에서는 실제 처리한 세부 작업의 비율을 반영한다. */
export function relationAnalysisDisplay(
  analysis: Pick<
    RelationAnalysisState,
    | 'runId'
    | 'status'
    | 'phase'
    | 'prepareOnly'
    | 'processed'
    | 'total'
    | 'stageProgress'
    | 'patternCache'
  >,
  searchEmbedding?: SearchEmbeddingStatus,
  waitingForSources = false
) {
  const completed = analysis.status === 'completed';
  const phase =
    analysis.prepareOnly && analysis.phase !== 'restoring' ? 'checking' : analysis.phase;
  const unknown = phase === 'checking' || phase === 'restoring';
  const stageRatio = Math.min(1, Math.max(0, analysis.stageProgress ?? fraction(analysis)));
  const stage = Math.max(
    0,
    analysisStages.findIndex((value) => value === phase)
  );
  const statusLabel =
    analysis.status === 'stopping' && analysis.prepareOnly
      ? 'Stopping preparation'
      : analysis.status === 'idle' || (analysis.status === 'running' && analysis.prepareOnly)
      ? 'Preparing analysis automatically'
      : statuses[analysis.status];
  const stopped =
    analysis.status === 'stopping' ||
    analysis.status === 'cancelled' ||
    analysis.status === 'failed';
  const display = {
    busy: analysis.status === 'running' || analysis.status === 'stopping',
    ratio: completed
      ? (analysisStages.length - 1) / analysisStages.length
      : analysis.status === 'idle'
      ? 0
      : (stage + stageRatio) / analysisStages.length,
    stageRatio,
    indeterminate:
      waitingForSources ||
      (unknown &&
        analysis.stageProgress === undefined &&
        analysis.total === 0 &&
        (analysis.status === 'running' || analysis.status === 'stopping')),
    statusLabel,
    phaseLabel: stopped
      ? statusLabel
      : waitingForSources ||
        analysis.status === 'idle' ||
        (phase === 'checking' && analysis.status === 'running')
      ? 'Checking relationship cache'
      : analysis.status === 'ready'
      ? relationCacheDisplay(analysis).label
      : completed
      ? statusLabel
      : phases[phase],
  };
  if (!searchEmbedding || !completed || waitingForSources) return display;
  const embedding: SearchEmbeddingStatus =
    searchEmbedding.analysisRunId === analysis.runId
      ? searchEmbedding
      : { phase: 'idle', processed: 0, total: 0 };
  const embeddingRatio =
    embedding.phase === 'completed'
      ? 1
      : Math.min(
          1,
          Math.max(
            0,
            embedding.stageProgress ?? fraction({ ...embedding, total: embedding.total + 1 })
          )
        );
  const checking = embedding.phase === 'checking' || embedding.phase === 'idle';
  return {
    ...display,
    ratio: (analysisStages.length - 1 + embeddingRatio) / analysisStages.length,
    stageRatio: embeddingRatio,
    indeterminate: checking,
    phaseLabel: checking
      ? 'Checking search cache'
      : embedding.phase === 'completed'
      ? display.phaseLabel
      : embedding.phase === 'failed'
      ? 'Search embeddings failed'
      : 'Preparing search embeddings',
    statusLabel:
      embedding.phase === 'completed'
        ? display.statusLabel
        : embedding.phase === 'failed'
        ? 'Analysis needs attention'
        : 'Analysis in progress',
  };
}

export type SearchEmbeddingStatus = {
  /** 최종 그래프를 만든 분석 실행. 검색창 작업은 전체 분석 진행률에 합산하지 않는다. */
  analysisRunId?: number;
  phase: 'idle' | 'checking' | 'running' | 'completed' | 'failed';
  processed: number;
  total: number;
  stageProgress?: number;
  revision?: string;
  inputRevision?: string;
  error?: string;
};

const idle: SearchEmbeddingStatus = { phase: 'idle', processed: 0, total: 0 };

type EmbeddingSource = 'extension' | 'search';

const bySource = new Map<string, Partial<Record<EmbeddingSource, SearchEmbeddingStatus>>>();

const listeners = new Set<() => void>();

export function publishSearchEmbeddingStatus(
  scope: string,
  status: SearchEmbeddingStatus,
  source: EmbeddingSource = 'extension'
) {
  const sources = bySource.get(scope) || {};
  const previousSource = sources[source] || idle;
  if (
    previousSource.phase === status.phase &&
    previousSource.processed === status.processed &&
    previousSource.total === status.total &&
    previousSource.stageProgress === status.stageProgress &&
    previousSource.analysisRunId === status.analysisRunId &&
    previousSource.revision === status.revision &&
    previousSource.inputRevision === status.inputRevision &&
    previousSource.error === status.error
  )
    return;
  if (status.phase === 'idle') delete sources[source];
  else sources[source] = status;
  if (sources.extension || sources.search) bySource.set(scope, sources);
  else bySource.delete(scope);
  listeners.forEach((listener) => listener());
}

export function useSearchEmbeddingStatus(scope: string, source?: EmbeddingSource) {
  const snapshot = useCallback(() => {
    const sources = bySource.get(scope);
    if (source) return sources?.[source] || idle;
    const values = [sources?.extension, sources?.search];
    return (
      values.find((value) => value?.phase === 'running') ||
      values.find((value) => value?.phase === 'checking') ||
      values.find((value) => value?.phase === 'failed') ||
      sources?.extension ||
      sources?.search ||
      idle
    );
  }, [scope, source]);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => idle
  );
}
