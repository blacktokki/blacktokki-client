import type { EntailmentScores } from '../relationDiscovery';

/** NLI labels describe the premise/hypothesis pair; abstention is not a fourth truth label. */
export const NLI_LABELS = ['supported', 'neutral', 'contradicted'] as const;
export type SemanticLabel = (typeof NLI_LABELS)[number];
export type NliDecisionPolicy = {
  thresholds?: Partial<Record<SemanticLabel, number>>;
  temperature?: number;
  minMargin?: number;
  /** Required separation between the original and the role-matched alternative. */
  controlMargin?: number;
};
export type SemanticDecision = {
  label: SemanticLabel | null;
  verdict: SemanticLabel | 'uncertain' | 'unverified';
  reason: 'decided' | 'missing-scores' | 'invalid-scores' | 'tie' | 'low-score' | 'low-margin';
  scores?: EntailmentScores;
  confidence?: number;
  margin?: number;
};
const scoreKeys = {
  supported: 'entailment',
  neutral: 'neutral',
  contradicted: 'contradiction',
} as const;

export function validateDecisionPolicy(policy: NliDecisionPolicy) {
  for (const [label, threshold] of Object.entries(policy.thresholds || {}))
    if (!NLI_LABELS.includes(label as SemanticLabel) || !unit(threshold))
      throw new Error('NLI thresholds must map semantic labels to probabilities.');
  for (const margin of [policy.minMargin, policy.controlMargin])
    if (margin !== undefined && !unit(margin)) throw new Error('Invalid NLI margin.');
  if (
    policy.temperature !== undefined &&
    (!Number.isFinite(policy.temperature) || policy.temperature <= 0)
  )
    throw new Error('NLI temperature must be positive and finite.');
}
const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

/** Validate all three probabilities, including malformed or partially restored cache entries. */
export function validNliScores(scores: EntailmentScores): boolean {
  const values = Object.values(scoreKeys).map((key) => scores[key]);
  return values.every(unit) && Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-5;
}

/** Temperature rescales probabilities without changing their order; raw scores remain untouched. */
export function calibratedNliScores(scores: EntailmentScores, temperature = 1): EntailmentScores {
  if (!validNliScores(scores) || !Number.isFinite(temperature) || temperature <= 0)
    throw new Error('Invalid NLI probabilities or temperature.');
  if (temperature === 1) return { ...scores };
  const keys = Object.values(scoreKeys);
  const logits = keys.map((key) => Math.log(Math.max(Number.MIN_VALUE, scores[key])) / temperature);
  const maximum = Math.max(...logits);
  const values = logits.map((value) => Math.exp(value - maximum));
  const total = values.reduce((a, b) => a + b, 0);
  return Object.fromEntries(keys.map((key, i) => [key, values[i] / total])) as EntailmentScores;
}

export function decideNli(
  raw: EntailmentScores | undefined,
  fallbackThreshold: number,
  policy: NliDecisionPolicy = {}
): SemanticDecision {
  validateDecisionPolicy(policy);
  if (!unit(fallbackThreshold)) throw new Error('Invalid fallback NLI threshold.');
  if (!raw) return { label: null, verdict: 'unverified', reason: 'missing-scores' };
  if (!validNliScores(raw)) return { label: null, verdict: 'unverified', reason: 'invalid-scores' };
  const scores = calibratedNliScores(raw, policy.temperature);
  const ordered = [...NLI_LABELS].sort((a, b) => scores[scoreKeys[b]] - scores[scoreKeys[a]]);
  const label = ordered[0];
  const confidence = scores[scoreKeys[label]];
  const margin = confidence - scores[scoreKeys[ordered[1]]];
  const reason =
    margin === 0
      ? 'tie'
      : confidence < (policy.thresholds?.[label] ?? fallbackThreshold)
      ? 'low-score'
      : margin < (policy.minMargin ?? 0)
      ? 'low-margin'
      : 'decided';
  return {
    label,
    verdict: reason === 'decided' ? label : 'uncertain',
    reason,
    scores,
    confidence,
    margin,
  };
}
