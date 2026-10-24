import { relationKeywordKey, checkRelationCancelled, yieldRelationWork } from './keywordUtils';
import type {
  InductiveRelationCandidate,
  RelationDiscoveryResult,
  AssociationContextKind,
  AssociationInferenceProgress,
  AssociationOptions,
  RelationAssociationMetrics,
  RelationAssociationPreparation,
} from '../types';

/** Structural weights are heuristics, not calibrated probabilities. */
const contextStrength: Record<AssociationContextKind, number> = {
  sentence: 0.65,
  'list-item': 0.8,
  field: 1,
  'table-row': 1,
  'table-cell': 0.8,
  'field-value': 0.8,
};

const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
const pause = () => yieldRelationWork();

/** Compare co-occurrence with both endpoint marginals in the same structural context family. */
function scoreRelationAssociation(
  context: AssociationContextKind,
  contextCount: number,
  sourceCount: number,
  targetCount: number,
  pairCount: number
): RelationAssociationMetrics {
  const lift = (pairCount * contextCount) / (sourceCount * targetCount) || 0;
  const joint = pairCount / contextCount;
  const npmi =
    joint > 0 && joint < 1 ? Math.max(-1, Math.min(1, Math.log(lift) / -Math.log(joint))) : 0;
  // Geometric conditional support discounts an ubiquitous endpoint even when its partner is rare.
  const specificity = pairCount / Math.sqrt(sourceCount * targetCount) || 0;
  const repetition = pairCount / (pairCount + 1);
  // Explicit record roles retain structural support for high-degree owners.
  const structural = ['field', 'table-row'].includes(context) ? 0.5 : 0;
  const score =
    repetition *
    (structural +
      ((1 - structural) * specificity * (contextStrength[context] + Math.max(0, npmi))) / 2);
  return {
    context,
    contextCount,
    sourceCount,
    targetCount,
    pairCount,
    lift,
    npmi,
    specificity,
    score,
  };
}

/**
 * 수집된 연관관계 후보의 개체쌍별 점수를 계산하고 후보별 평가 결과를 완성한다.
 *
 * 같은 구조 문맥의 전체 문맥 수·개체별 출현 수·쌍별 공출현 수로 lift, NPMI,
 * 특이도와 점수를 구한다. 점수에는 반복 횟수와 문맥 종류별 가중치를 반영하며,
 * 통계적 확률로 해석하지 않는다. 후보 점수는 중복을 제거한 방향 없는 개체쌍
 * 점수의 평균이고, 일반화 점수는 서로 다른 쌍의 수와 노트 지지도를 반영한다.
 * 원본을 다시 수집하거나 전달받은 후보·집계를 변경하지 않는다.
 *
 * @param prepared `collectKeywordRelations`가 반환한 후보와 문맥별 원시 집계.
 *   각 후보의 문맥·집계 식별자와 관측 개체쌍이 `families`에 존재해야 한다.
 * @param options 취소 신호와 평가 진행 콜백.
 * @param options.signal 처리 사이에 확인할 중단 신호.
 * @param options.onInferenceProgress 관측 건수 기준 `evaluation` 진행 및 `completion` 알림.
 * @returns 각 관측의 측정값, 후보별 점수·고유 근거 수·일반화 점수와 완료 진행 상태를
 *   포함하는 새 결과. 기존 개체 추출·입력 패턴 등 수집 정보는 유지한다.
 * @throws 중단 시 `AbortError`. 진행 콜백의 오류도 그대로 전파한다.
 */
export async function evaluateKeywordAssociations(
  prepared: RelationAssociationPreparation,
  options: Pick<AssociationOptions, 'signal' | 'onInferenceProgress'> = {}
): Promise<RelationDiscoveryResult> {
  const { result, families } = prepared;
  const candidates: InductiveRelationCandidate[] = [];
  const started = Date.now();
  let yielded = started;
  let processed = 0;
  const total = result.candidates.reduce(
    (sum, candidate) => sum + candidate.observations.length,
    0
  );
  const report = (stage: AssociationInferenceProgress['stage'] = 'evaluation') => {
    checkRelationCancelled(options.signal);
    options.onInferenceProgress?.({
      model: 'statistics',
      phase: 'association',
      unit: 'context',
      stage,
      processed,
      total,
      elapsedMs: Date.now() - started,
      status: processed === total ? 'completed' : 'running',
    });
    checkRelationCancelled(options.signal);
  };
  report();
  for (const candidate of result.candidates) {
    const family = families.get(candidate.associationFamily!)!;
    const context = candidate.associationContext!;
    const measurements: InductiveRelationCandidate['measurements'] = [];
    const perPair = new Map<string, number>();
    for (const row of candidate.observations) {
      const a = relationKeywordKey(row.source),
        b = relationKeywordKey(row.target);
      const association = scoreRelationAssociation(
        context,
        family.contextCount,
        family.marginals.get(a)!,
        family.marginals.get(b)!,
        family.pairs.get(pairKey(a, b))!
      );
      perPair.set(pairKey(a, b), association.score);
      measurements.push({
        noteTitle: row.noteTitle,
        evidenceId: row.evidenceId,
        evidence: row.evidence,
        association,
      });
      processed++;
      if (Date.now() - yielded >= 8) {
        report();
        await pause();
        checkRelationCancelled(options.signal);
        yielded = Date.now();
      }
    }
    const score = [...perPair.values()].reduce((sum, value) => sum + value, 0) / perPair.size;
    candidates.push({
      ...candidate,
      association: {
        context,
        score,
        evidenceCount: new Set(candidate.observations.map((row) => row.evidenceId)).size,
        generalizationScore:
          (score * (1 - 1 / perPair.size) * candidate.noteSupport) / (candidate.noteSupport + 1),
      },
      measurements,
    });
    if (Date.now() - yielded >= 8) {
      report();
      await pause();
      checkRelationCancelled(options.signal);
      yielded = Date.now();
    }
  }
  report();
  report('completion');
  return {
    ...result,
    candidates,
    associationProgress: {
      total,
      completed: processed,
      status: 'completed',
    },
  };
}
