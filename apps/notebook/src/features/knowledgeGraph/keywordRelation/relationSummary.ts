import type { ValidationUpdate } from './relationCheckpoint';
import type {
  RelationDiscoveryResult,
  InductiveRelationCandidate,
  RelationValidation,
  RelationValidationProgress,
  RelationEntityResult,
  RelationInputPattern,
  RelationKeywordSource,
} from './relationDiscovery';
import { relationKeywordEntityKey } from './relationKeywords';

/** Progress counts processed records, including failures; an empty stage has no remaining work. */
export function relationProgressPercent(processed: number, total: number): string {
  return `${Math.min(100, Math.max(0, total > 0 ? (processed / total) * 100 : 100)).toFixed(1)}%`;
}

/** Record console emission time in Asia/Seoul, independently of stored analysis timestamps. */
export function relationLogTimestamp(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00');
}

export function relationAnalysisProgress(result: RelationDiscoveryResult): string {
  const progress = result.validationProgress;
  if (progress)
    return relationProgressPercent(progress.completed + progress.failed, progress.total);
  let total = 0;
  let processed = 0;
  for (const candidate of result.candidates) {
    for (const validation of candidate.validations) {
      total++;
      if (
        validation.scores ||
        validation.skipReason === 'model-error' ||
        validation.skipReason === 'context-too-long'
      )
        processed++;
    }
  }
  return relationProgressPercent(processed, total);
}

/** Display the complete input inventory once, retaining the exact embedding strings. */
export function summarizeRelationInputPatterns(patterns: RelationInputPattern[]) {
  const origins = { sentence: '일반 문장', field: '필드', table: '표' };
  return {
    상태: '임베딩 입력 예정',
    진행률: relationProgressPercent(0, patterns.length),
    고유패턴수: patterns.length,
    고유입력문장수: new Set(patterns.map((pattern) => pattern.template)).size,
    관찰근거수: patterns.reduce((total, pattern) => total + pattern.observationCount, 0),
    패턴목록: patterns.map((pattern, index) => ({
      번호: index + 1,
      관계표현: pattern.label,
      입력문장: pattern.template,
      발견방식: origins[pattern.origin],
      개체1유형: pattern.sourceType,
      개체2유형: pattern.targetType,
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
  'table-header': '표 헤더',
  'table-cell': '표 레코드',
  bold: '굵게 처리된 글',
  'field-name': '필드 이름',
  'field-value': '필드 값',
};

/** Retain all qualifying keywords, including those that never form a relationship pair. */
export function summarizeRelationEntities(result: RelationEntityResult) {
  return {
    상태: '추출 완료',
    진행률: '100.0%',
    분석노트수: result.noteCount,
    추출키워드수: result.inputCount,
    고유개체수: result.entities.length,
    총출현횟수: result.mentionCount,
    개체목록: result.entities.map((entity) => ({
      개체: entity.text,
      유형: entity.type,
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
  };
}

const verdictLabels: Record<RelationValidation['verdict'], string> = {
  supported: '원문 지지',
  contradicted: '원문 반박',
  neutral: '판단 불가',
  uncertain: '확신 부족',
  unverified: '미검증',
};

const directionLabels = {
  'text-order': '원문 등장 순서 (의미 방향 미확정)',
  'document-value': '노트 제목 → 필드 값',
  'column-order': '표의 열 순서 (의미 방향 미확정)',
};

const skipReasonLabels = {
  pending: '검증 대기',
  'model-error': '모델 실행 실패',
  'context-too-long': '모델 입력 길이 초과',
};

/** Select three checked examples first without allocating and sorting the entire evidence list. */
function representativeExamples(candidate: InductiveRelationCandidate) {
  const checked: {
    observation: InductiveRelationCandidate['observations'][number];
    validation: RelationValidation | undefined;
  }[] = [];
  const pending: typeof checked = [];
  for (let index = 0; index < candidate.observations.length; index++) {
    const example = {
      observation: candidate.observations[index],
      validation: candidate.validations[index],
    };
    if (example.validation?.scores) {
      checked.push(example);
      if (checked.length === 3) break;
    } else if (pending.length < 3) pending.push(example);
  }
  return [...checked, ...pending].slice(0, 3);
}

export function summarizeRelationValidationBatch(
  progress: RelationValidationProgress,
  updates: ValidationUpdate[] = []
) {
  const counts = Object.fromEntries(Object.values(verdictLabels).map((label) => [label, 0]));
  updates.forEach(({ validation }) => counts[verdictLabels[validation.verdict]]++);
  return {
    배치번호: progress.batch,
    처리단계: progress.phase === 'retry' ? '실패 사례 재시도' : '순차 검증',
    상태: { running: '진행 중', completed: '처리 완료', failed: '재시도 필요' }[progress.status],
    진행률: relationProgressPercent(progress.completed + progress.failed, progress.total),
    최종NLI캐시재사용: progress.resumed,
    전체건수: progress.total,
    검증완료건수: progress.completed,
    검증실패건수: progress.failed,
    검증대기건수: progress.pending,
    고유검증입력수: progress.uniqueInputs,
    모델실행수: progress.modelChecks,
    동일입력재사용수: progress.reused,
    이번배치: {
      처리건수: updates.length,
      판정별건수: counts,
      대표사례: updates.slice(0, 3).map(({ validation }) => ({
        노트: validation.noteTitle,
        검증문장: validation.hypothesis,
        판정: verdictLabels[validation.verdict],
        시도횟수: validation.attempts,
        오류내용: validation.error,
      })),
    },
  };
}

/** Format a separate console view without changing discovery results or asserting semantic edges. */
export function summarizeInductiveRelations(result: RelationDiscoveryResult) {
  return {
    진행률: relationAnalysisProgress(result),
    분석규모: {
      노트수: result.noteCount,
      개체수: result.entityCount,
      관계후보수: result.candidates.length,
      관찰근거수: result.observationCount,
    },
    최적화: {
      탐색영역제외수: result.optimization?.excludedNavigationRegions || 0,
      관계미확정표행수: result.contextualEvidence?.length || 0,
      원문재구성검사수: result.candidates.reduce(
        (sum, candidate) =>
          sum +
          candidate.validations.filter((validation) => validation.basis === 'reconstruction')
            .length,
        0
      ),
      대체개체검사수: result.candidates.reduce(
        (sum, candidate) =>
          sum + candidate.validations.filter((validation) => validation.control?.scores).length,
        0
      ),
    },
    부분처리: result.discoveryStats
      ? {
          변경노트수: result.discoveryStats.changedNotes,
          재사용노트수: result.discoveryStats.reusedNotes,
          삭제노트수: result.discoveryStats.removedNotes,
          개체재매칭노트수: result.discoveryStats.rematchedNotes,
          임베딩재사용수: result.discoveryStats.embeddingReuses,
          병합점수재사용수: result.discoveryStats.mergeScoreReuses,
        }
      : undefined,
    검증진행: result.validationProgress
      ? summarizeRelationValidationBatch(result.validationProgress)
      : undefined,
    NLI처리: result.nliStats
      ? {
          병합검사수: result.nliStats.mergeChecks,
          병합점수재사용수: result.nliStats.reusedMergeChecks || 0,
          최종검사수: result.nliStats.validationChecks,
          점수반환수: result.nliStats.successfulChecks,
          동일입력재사용수: result.nliStats.reusedValidationChecks || 0,
          모델실패수: result.nliStats.modelErrors,
          입력길이초과수: result.nliStats.oversizedInputs,
        }
      : '처리 현황 없음',
    관계후보: result.candidates.map((candidate) => {
      const counts = Object.fromEntries(Object.values(verdictLabels).map((label) => [label, 0]));
      candidate.validations.forEach((validation) => counts[verdictLabels[validation.verdict]]++);
      const skipped = Object.fromEntries(
        Object.values(skipReasonLabels).map((label) => [label, 0])
      );
      candidate.validations.forEach((validation) => {
        if (validation.skipReason) skipped[skipReasonLabels[validation.skipReason]]++;
      });
      return {
        관계표현: candidate.label,
        발견유형: candidate.recurring ? '서로 다른 노트와 개체쌍에서 반복 발견' : '개별 후보',
        반복근거: { 노트수: candidate.noteSupport, 개체쌍수: candidate.pairSupport },
        문장패턴: candidate.template.replace(/\{\{E([12])\}\}/g, '〈개체$1〉'),
        검증현황: counts,
        미검증사유별건수: skipped,
        대표사례: representativeExamples(candidate).map(({ observation, validation }) => {
          return {
            개체1: observation.source,
            개체2: observation.target,
            관계방향: directionLabels[observation.direction],
            출처: { 노트: observation.noteTitle, 문단: observation.section || '(본문)' },
            근거문장: observation.evidence,
            판정: verdictLabels[validation?.verdict || 'unverified'],
            미검증사유: validation?.skipReason
              ? skipReasonLabels[validation.skipReason]
              : undefined,
            오류내용: validation?.error,
            검증분류: validation?.basis,
            대체개체검사: validation?.control,
            검증방식: validation
              ? validation.heldOut
                ? '다른 노트에서 발견한 패턴으로 검사'
                : '해당 원문에서 만든 패턴으로 검사'
              : '검사 결과 없음',
            문장판정점수: validation?.scores
              ? {
                  지지: `${(validation.scores.entailment * 100).toFixed(1)}%`,
                  중립: `${(validation.scores.neutral * 100).toFixed(1)}%`,
                  반박: `${(validation.scores.contradiction * 100).toFixed(1)}%`,
                }
              : '미검증',
          };
        }),
        추가사례수: Math.max(0, candidate.observations.length - 3),
      };
    }),
    알림: result.warnings,
  };
}
