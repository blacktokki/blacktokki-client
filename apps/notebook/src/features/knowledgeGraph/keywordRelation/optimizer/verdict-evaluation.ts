import type { RelationValidation } from '../relationDiscovery';
import { precisionLowerBound } from './role-evidence';
import {
  decideNli,
  NLI_LABELS,
  NliDecisionPolicy,
  SemanticDecision,
  SemanticLabel,
  validNliScores,
} from './semantic';
import { DEFAULT_RELATION_POLICY, OptimizedValidation } from './validation';

export type VerdictReviewCase = {
  id: string;
  family: string;
  split: 'calibration' | 'holdout';
  kind: 'natural' | 'contrast';
  premise: string;
  hypothesis: string;
  expectedLabel: SemanticLabel | null;
  secondExpectedLabel?: SemanticLabel | null;
  sourceClarity?: 'clear' | 'ambiguous' | 'non-assertion';
  relationJudgment?: 'valid' | 'cooccurrence' | 'parse-error' | 'insufficient' | null;
  relationshipVerdict?: RelationValidation['verdict'];
  source?: { noteTitle: string; section: string };
  validation?: OptimizedValidation;
};
const normalized = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const identity = (row: VerdictReviewCase) =>
  JSON.stringify([normalized(row.premise), normalized(row.hypothesis)]);
const ratio = (n: number, d: number) => (d ? n / d : null);
const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

/** Wilson 95% interval; a point estimate from a small sample is never a population guarantee. */
export function proportion(correct: number, total: number) {
  if (!total) return { correct, total, value: null, interval95: null };
  const z = 1.959963984540054;
  const p = correct / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const radius =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return {
    correct,
    total,
    value: p,
    interval95: [Math.max(0, center - radius), Math.min(1, center + radius)],
  };
}

/** Recover an exact count-derived ratio despite floating point round-off, e.g. (51/84)*84. */
const coverageBudget = (count: number, coverage: number) =>
  Math.floor(count * coverage + Number.EPSILON * count);

/** Refuse label conflicts, duplicate votes and leakage before producing any performance number. */
export function checkedVerdictReviews(rows: VerdictReviewCase[]): VerdictReviewCase[] {
  const families = new Map<string, string>();
  const premises = new Map<string, string>();
  const ids = new Set<string>();
  const inputs = new Map<string, VerdictReviewCase>();
  for (const row of rows) {
    if (
      !row.id ||
      !row.family ||
      !row.premise ||
      !row.hypothesis ||
      !['calibration', 'holdout'].includes(row.split) ||
      !['natural', 'contrast'].includes(row.kind) ||
      (row.expectedLabel !== null && !NLI_LABELS.includes(row.expectedLabel)) ||
      (row.secondExpectedLabel != null && !NLI_LABELS.includes(row.secondExpectedLabel))
    )
      throw new Error('Invalid semantic review case. Abstention is not a gold label.');
    if (ids.has(row.id)) throw new Error('Duplicate semantic review id: ' + row.id);
    ids.add(row.id);
    if (row.secondExpectedLabel != null && row.expectedLabel !== row.secondExpectedLabel)
      throw new Error('Unadjudicated semantic label disagreement: ' + row.id);
    if (row.sourceClarity === 'non-assertion' && row.expectedLabel !== null)
      throw new Error('A non-assertion needs a relation review, not an invented NLI gold label.');
    if (
      row.validation?.scores &&
      ((row.validation.evidence !== undefined && row.validation.evidence !== row.premise) ||
        (row.validation.hypothesis !== undefined && row.validation.hypothesis !== row.hypothesis))
    )
      throw new Error(
        'Scores do not match the reviewed premise/hypothesis. Clear stale scores after editing.'
      );
    const familySplit = families.get(row.family);
    const premiseSplit = premises.get(normalized(row.premise));
    if ((familySplit && familySplit !== row.split) || (premiseSplit && premiseSplit !== row.split))
      throw new Error('A source/copy family crosses calibration and holdout splits.');
    families.set(row.family, row.split);
    premises.set(normalized(row.premise), row.split);
    const previous = inputs.get(identity(row));
    if (previous) {
      if (previous.expectedLabel !== row.expectedLabel || previous.kind !== row.kind)
        throw new Error('Conflicting labels or populations for the same NLI input.');
      if (JSON.stringify(previous.validation?.scores) !== JSON.stringify(row.validation?.scores))
        throw new Error('Conflicting model scores for the same NLI input.');
    } else inputs.set(identity(row), row);
  }
  return [...inputs.values()];
}

type Assessed = { row: VerdictReviewCase; decision: SemanticDecision };
function assess(
  rows: VerdictReviewCase[],
  policy: NliDecisionPolicy,
  fallback: number
): Assessed[] {
  return rows
    .filter((row) => row.expectedLabel !== null)
    .map((row) => ({
      row,
      decision: decideNli(row.validation?.scores, fallback, policy),
    }));
}
function metrics(rows: VerdictReviewCase[], policy: NliDecisionPolicy, fallback: number) {
  const assessed = assess(rows, policy, fallback);
  const scored = assessed.filter(({ decision }) => !!decision.scores);
  const decided = scored.filter(({ decision }) =>
    NLI_LABELS.includes(decision.verdict as SemanticLabel)
  );
  const correct = decided.filter(({ row, decision }) => row.expectedLabel === decision.verdict);
  const confusion = Object.fromEntries(
    NLI_LABELS.map((gold) => [
      gold,
      Object.fromEntries(
        [...NLI_LABELS, 'uncertain'].map((prediction) => [
          prediction,
          scored.filter(
            ({ row, decision }) => row.expectedLabel === gold && decision.verdict === prediction
          ).length,
        ])
      ),
    ])
  );
  const byLabel = Object.fromEntries(
    NLI_LABELS.map((label) => {
      const predicted = decided.filter(({ decision }) => decision.verdict === label);
      const positives = scored.filter(({ row }) => row.expectedLabel === label);
      const truePositive = correct.filter(({ row }) => row.expectedLabel === label).length;
      return [
        label,
        {
          precision: proportion(truePositive, predicted.length),
          recall: proportion(truePositive, positives.length),
          endToEndRecall: proportion(
            truePositive,
            assessed.filter(({ row }) => row.expectedLabel === label).length
          ),
        },
      ];
    })
  );
  const nonSupport = scored.filter(({ row }) => row.expectedLabel !== 'supported');
  const wrongSupport = nonSupport.filter(({ decision }) => decision.verdict === 'supported');
  const neutralContradiction = scored.filter(
    ({ row, decision }) =>
      (row.expectedLabel === 'neutral' && decision.verdict === 'contradicted') ||
      (row.expectedLabel === 'contradicted' && decision.verdict === 'neutral')
  );
  const clear = scored.filter(({ row }) => row.sourceClarity === 'clear');
  const acceptedRelations = rows.filter(
    (row) => row.relationshipVerdict === 'supported' && row.relationJudgment != null
  );
  return {
    cases: rows.length,
    reviewed: assessed.length,
    pendingReview: rows.length - assessed.length,
    inputsWithScores: rows.filter(
      (row) => row.validation?.scores && validNliScores(row.validation.scores)
    ).length,
    scored: scored.length,
    unverified: assessed.length - scored.length,
    modelErrors: rows.filter((row) => row.validation?.skipReason === 'model-error').length,
    oversized: rows.filter((row) => row.validation?.skipReason === 'context-too-long').length,
    invalidScores: assessed.filter(({ decision }) => decision.reason === 'invalid-scores').length,
    confusion,
    byLabel,
    coverage: ratio(decided.length, scored.length),
    endToEndCoverage: ratio(decided.length, assessed.length),
    decisionError: proportion(decided.length - correct.length, decided.length),
    wrongSupport: proportion(wrongSupport.length, nonSupport.length),
    neutralContradictionConfusion: proportion(neutralContradiction.length, nonSupport.length),
    clearSourceAbstention: proportion(
      clear.filter(({ decision }) => decision.verdict === 'uncertain').length,
      clear.length
    ),
    abstentionReasons: Object.fromEntries(
      ['tie', 'low-score', 'low-margin'].map((reason) => [
        reason,
        scored.filter(({ decision }) => decision.reason === reason).length,
      ])
    ),
    relationHolds: Object.fromEntries(
      [
        ...new Set(
          rows
            .map(
              (row) =>
                (row.validation as RelationValidation & { decisionReason?: string })?.decisionReason
            )
            .filter(Boolean)
        ),
      ].map((reason) => [
        reason,
        rows.filter(
          (row) =>
            (row.validation as RelationValidation & { decisionReason?: string })?.decisionReason ===
            reason
        ).length,
      ])
    ),
    acceptedRelationPrecision: proportion(
      acceptedRelations.filter((row) => row.relationJudgment === 'valid').length,
      acceptedRelations.length
    ),
  };
}

/** Natural traffic and authored diagnostic contrasts never share an aggregate accuracy. */
export function evaluateVerdicts(
  rows: VerdictReviewCase[],
  policy: NliDecisionPolicy = {},
  fallback = DEFAULT_RELATION_POLICY.entailmentThreshold,
  coverages: number[] = []
) {
  const unique = checkedVerdictReviews(rows);
  return {
    inputs: unique.length,
    duplicateInputs: rows.length - unique.length,
    populations: Object.fromEntries(
      ['natural', 'contrast'].map((kind) => {
        const population = unique.filter((row) => row.kind === kind);
        return [
          kind,
          {
            all: metrics(population, policy, fallback),
            holdout: metrics(
              population.filter((row) => row.split === 'holdout'),
              policy,
              fallback
            ),
            holdoutRiskCoverage: coverages.map((coverage) =>
              riskAtCoverage(
                population.filter((row) => row.split === 'holdout'),
                coverage,
                policy
              )
            ),
          },
        ];
      })
    ),
  };
}

/** Select complete confidence ties. Never improve a reported risk by choosing favorable tied rows. */
export function riskAtCoverage(
  rows: VerdictReviewCase[],
  coverage: number,
  policy: NliDecisionPolicy = {}
) {
  if (!unit(coverage)) throw new Error('Coverage must be a probability.');
  const scored = assess(
    checkedVerdictReviews(rows),
    policy,
    DEFAULT_RELATION_POLICY.entailmentThreshold
  ).filter(({ decision }) => !!decision.scores);
  const values = scored.filter(({ decision }) =>
    NLI_LABELS.includes(decision.verdict as SemanticLabel)
  );
  values.sort((a, b) => b.decision.confidence! - a.decision.confidence!);
  const budget = coverageBudget(scored.length, coverage);
  let count = 0;
  for (let start = 0; start < values.length; ) {
    let end = start + 1;
    while (
      end < values.length &&
      values[end].decision.confidence === values[start].decision.confidence
    )
      end++;
    if (end > budget) break;
    count = end;
    start = end;
  }
  const selected = values.slice(0, count);
  return {
    requestedCoverage: coverage,
    actualCoverage: ratio(count, scored.length),
    scored: scored.length,
    decided: count,
    error: proportion(
      selected.filter(
        ({ row, decision }) => decision.label !== row.expectedLabel || decision.margin === 0
      ).length,
      count
    ),
  };
}

export type CalibrationOptions = {
  targetPrecision: Record<SemanticLabel, number>;
  minCoverage: number;
  minPerClass: number;
  temperatures?: number[];
  margins?: number[];
};

/** Fit only on calibration families. Confidence bounds constrain every accepted class. */
export function calibrateVerdicts(rows: VerdictReviewCase[], options: CalibrationOptions) {
  const unique = checkedVerdictReviews(rows);
  const calibration = unique.filter(
    (row) => row.split === 'calibration' && row.expectedLabel !== null
  );
  if (
    !unit(options.minCoverage) ||
    !Number.isSafeInteger(options.minPerClass) ||
    options.minPerClass < 1 ||
    NLI_LABELS.some((label) => !unit(options.targetPrecision[label]))
  )
    throw new Error('Invalid semantic calibration requirements.');
  const temperatures = options.temperatures || [1];
  const margins = options.margins || [0];
  if (!temperatures.length || !margins.length) throw new Error('Calibration search is empty.');
  let best: {
    nli: NliDecisionPolicy;
    coverage: number;
    loss: number;
    reviewed: number;
    errorUpper95: number;
  } | null = null;
  for (const temperature of temperatures)
    for (const minMargin of margins) {
      const policy = { temperature, minMargin };
      const assessed = assess(calibration, policy, 0).filter(({ decision }) => !!decision.scores);
      type Choice = {
        count: number;
        errors: number;
        thresholds: Partial<Record<SemanticLabel, number>>;
      };
      let states: Choice[] = [{ count: 0, errors: 0, thresholds: {} }];
      for (const label of NLI_LABELS) {
        const possible = assessed.filter(
          ({ decision }) =>
            decision.label === label && decision.margin! > 0 && decision.margin! >= minMargin
        );
        const cuts = [...new Set(possible.map(({ decision }) => decision.confidence!))].sort(
          (a, b) => b - a
        );
        const choices: Choice[] = [];
        for (const cut of cuts) {
          const accepted = possible.filter(({ decision }) => decision.confidence! >= cut);
          const correct = accepted.filter(({ row }) => row.expectedLabel === label).length;
          if (
            accepted.length >= options.minPerClass &&
            precisionLowerBound(correct, accepted.length) >= options.targetPrecision[label]
          )
            choices.push({
              count: accepted.length,
              errors: accepted.length - correct,
              thresholds: { [label]: cut },
            });
        }
        const next = new Map<number, Choice>();
        for (const state of states)
          for (const choice of choices) {
            const combined = {
              count: state.count + choice.count,
              errors: state.errors + choice.errors,
              thresholds: { ...state.thresholds, ...choice.thresholds },
            };
            const previous = next.get(combined.count);
            if (!previous || combined.errors < previous.errors) next.set(combined.count, combined);
          }
        states = [...next.values()];
      }
      const scoreKey = {
        supported: 'entailment',
        neutral: 'neutral',
        contradicted: 'contradiction',
      } as const;
      const loss =
        assessed.reduce(
          (sum, { row, decision }) =>
            sum -
            Math.log(Math.max(Number.MIN_VALUE, decision.scores![scoreKey[row.expectedLabel!]])),
          0
        ) / assessed.length;
      for (const state of states) {
        const coverage = state.count / calibration.length;
        if (!state.count || coverage < options.minCoverage) continue;
        const errorUpper95 = 1 - precisionLowerBound(state.count - state.errors, state.count);
        // Additional decisions are useful only after uncertainty about error and score loss.
        if (
          !best ||
          errorUpper95 < best.errorUpper95 ||
          (errorUpper95 === best.errorUpper95 &&
            (loss < best.loss || (loss === best.loss && coverage > best.coverage)))
        )
          best = {
            nli: { ...policy, thresholds: state.thresholds },
            coverage,
            loss,
            reviewed: calibration.length,
            errorUpper95,
          };
      }
    }
  return best;
}

/** Learn an optional specificity gap from assistant truth, never from control argmax alone. */
export function calibrateControlMargin(
  rows: VerdictReviewCase[],
  options: { minPrecision: number; minDecisions: number; minCoverage: number },
  policy: NliDecisionPolicy = {}
) {
  if (
    !unit(options.minPrecision) ||
    !unit(options.minCoverage) ||
    !Number.isSafeInteger(options.minDecisions) ||
    options.minDecisions < 1
  )
    throw new Error('Invalid control calibration requirements.');
  const values = checkedVerdictReviews(rows)
    .filter(
      (row) =>
        row.split === 'calibration' &&
        row.expectedLabel !== null &&
        row.relationJudgment &&
        row.relationJudgment !== 'insufficient'
    )
    .map((row) => {
      const main = decideNli(
        row.validation?.scores,
        DEFAULT_RELATION_POLICY.entailmentThreshold,
        policy
      );
      const control = decideNli(
        row.validation?.control?.scores,
        DEFAULT_RELATION_POLICY.entailmentThreshold,
        policy
      );
      return {
        row,
        main,
        gap:
          main.scores &&
          row.validation?.controlMatch?.status === 'observed-role' &&
          control.scores &&
          control.verdict !== 'uncertain'
            ? main.scores!.entailment - control.scores.entailment
            : null,
      };
    })
    .filter(({ main }) => main.verdict === 'supported');
  const cuts = [
    ...new Set([0, ...values.flatMap(({ gap }) => (gap !== null && gap >= 0 ? [gap] : []))]),
  ].sort((a, b) => a - b);
  let best: {
    controlMargin: number;
    errorUpper95: number;
    coverage: number;
    decisions: number;
  } | null = null;
  for (const cut of cuts) {
    const accepted = values.filter(({ gap }) => gap === null || gap >= cut);
    const correct = accepted.filter(
      ({ row }) => row.expectedLabel === 'supported' && row.relationJudgment === 'valid'
    ).length;
    const lower = precisionLowerBound(correct, accepted.length);
    const coverage = accepted.length / values.length;
    if (
      accepted.length < options.minDecisions ||
      coverage < options.minCoverage ||
      lower < options.minPrecision
    )
      continue;
    const errorUpper95 = 1 - lower;
    if (!best || errorUpper95 < best.errorUpper95)
      best = { controlMargin: cut, errorUpper95, coverage, decisions: accepted.length };
  }
  return best;
}

export type VerdictTargets = {
  minPrecision: Record<SemanticLabel, number>;
  errorReduction: number;
  wrongSupportReduction: number;
  confusionReduction: number;
  supportedRetention: number;
  maxClearAbstention: number;
  minPerClass: number;
};

/** Compare held-out natural inputs at equal coverage; diagnostic contrasts remain a separate report. */
export function compareVerdictPolicies(
  rows: VerdictReviewCase[],
  before: NliDecisionPolicy,
  after: NliDecisionPolicy,
  coverage: number,
  targets: VerdictTargets
) {
  if (
    !Number.isSafeInteger(targets.minPerClass) ||
    targets.minPerClass < 1 ||
    [
      targets.errorReduction,
      targets.wrongSupportReduction,
      targets.confusionReduction,
      targets.supportedRetention,
      targets.maxClearAbstention,
      ...Object.values(targets.minPrecision),
    ].some((value) => !unit(value))
  )
    throw new Error('Invalid verdict evaluation targets.');
  const unique = checkedVerdictReviews(rows);
  const holdout = unique.filter((row) => row.split === 'holdout' && row.kind === 'natural');
  const baseline = metrics(holdout, before, DEFAULT_RELATION_POLICY.entailmentThreshold);
  const improved = metrics(holdout, after, DEFAULT_RELATION_POLICY.entailmentThreshold);
  const beforeRisk = riskAtCoverage(holdout, coverage, before);
  const afterRisk = riskAtCoverage(holdout, coverage, after);
  const comparable =
    beforeRisk.decided > 0 &&
    beforeRisk.decided === afterRisk.decided &&
    beforeRisk.decided === coverageBudget(beforeRisk.scored, coverage);
  const reduction = (a: number | null, b: number | null) =>
    a !== null && a > 0 && b !== null ? (a - b) / a : null;
  const decreasePass = (a: number | null, b: number | null, target: number) =>
    a === null || b === null || a === 0 ? null : (a - b) / a >= target;
  const previousSupported = assess(
    holdout,
    before,
    DEFAULT_RELATION_POLICY.entailmentThreshold
  ).filter(
    ({ row, decision }) => row.expectedLabel === 'supported' && decision.verdict === 'supported'
  );
  const retained = previousSupported.filter(
    ({ row }) =>
      decideNli(row.validation?.scores, DEFAULT_RELATION_POLICY.entailmentThreshold, after)
        .verdict === 'supported'
  ).length;
  const retention = proportion(retained, previousSupported.length);
  const precisionChecks = Object.fromEntries(
    NLI_LABELS.map((label) => {
      const p = improved.byLabel[label].precision;
      return [
        label,
        p.total < targets.minPerClass || p.value === null
          ? null
          : p.interval95![0] >= targets.minPrecision[label],
      ];
    })
  );
  const checks = {
    ...precisionChecks,
    equalCoverageError: comparable
      ? decreasePass(beforeRisk.error.value, afterRisk.error.value, targets.errorReduction)
      : null,
    wrongSupport: decreasePass(
      baseline.wrongSupport.value,
      improved.wrongSupport.value,
      targets.wrongSupportReduction
    ),
    neutralContradiction: decreasePass(
      baseline.neutralContradictionConfusion.value,
      improved.neutralContradictionConfusion.value,
      targets.confusionReduction
    ),
    supportedRetention:
      retention.value === null ? null : retention.value >= targets.supportedRetention,
    clearAbstention:
      improved.clearSourceAbstention.value === null
        ? null
        : improved.clearSourceAbstention.value <= targets.maxClearAbstention,
  };
  return {
    before: baseline,
    after: improved,
    equalCoverage: {
      comparable,
      before: beforeRisk,
      after: afterRisk,
      errorReduction: comparable ? reduction(beforeRisk.error.value, afterRisk.error.value) : null,
    },
    supportedRetention: retention,
    checks,
    status: Object.values(checks).includes(false)
      ? 'failed'
      : Object.values(checks).includes(null)
      ? 'insufficient-data'
      : 'passed',
    diagnostics: evaluateVerdicts(
      unique.filter((row) => row.kind === 'contrast'),
      after
    ),
  };
}
