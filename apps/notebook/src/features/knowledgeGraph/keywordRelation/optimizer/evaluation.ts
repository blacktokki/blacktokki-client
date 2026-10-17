import type {
  RelationDiscoveryResult,
  RelationObservation,
  RelationValidation,
} from '../relationDiscovery';
import { relationKeywordKey as key } from '../relationKeywords';

export type ReviewJudgment = 'valid' | 'cooccurrence' | 'parse-error' | 'insufficient';
export type RelationReviewCase = {
  id: string;
  family: string;
  split: 'calibration' | 'holdout';
  purpose: 'precision' | 'recovery';
  observation: RelationObservation;
  validation?: RelationValidation;
  judgment: ReviewJudgment | null;
  secondJudgment?: ReviewJudgment | null;
  expectedPositive?: boolean | null;
  present?: boolean;
  similarity?: { value: number; equivalent: boolean };
};

const judgments = new Set<ReviewJudgment>(['valid', 'cooccurrence', 'parse-error', 'insufficient']);
function isReviewed(row: RelationReviewCase) {
  if (row.judgment == null) return false;
  if (
    !judgments.has(row.judgment) ||
    (row.secondJudgment != null && !judgments.has(row.secondJudgment))
  )
    throw new Error('Invalid review judgment.');
  if (row.expectedPositive === true && row.judgment !== 'valid')
    throw new Error('A positive gold reference must have a valid judgment.');
  return true;
}

/** Stable non-secret review order; artifacts containing source text must remain local. */
function order(text: string): number {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export const relationObservationIdentity = (item: RelationObservation) =>
  JSON.stringify([
    key(item.noteTitle),
    key(item.section),
    item.origin,
    key(item.template),
    key(item.source),
    key(item.target),
    key(item.evidence),
  ]);

/** Exact document pattern families stay entirely in one split, including copied weekly schemas. */
export function createRelationReviewSet(result: RelationDiscoveryResult): RelationReviewCase[] {
  const templates = new Map<string, Set<string>>();
  for (const candidate of result.candidates)
    for (const observation of candidate.observations) {
      const set = templates.get(observation.noteTitle) || new Set<string>();
      set.add(`${observation.origin}:${key(observation.template)}`);
      templates.set(observation.noteTitle, set);
    }
  const parent = new Map([...templates.keys()].map((note) => [note, note]));
  const root = (note: string): string => {
    const next = parent.get(note)!;
    if (next === note) return note;
    const value = root(next);
    parent.set(note, value);
    return value;
  };
  const owners = new Map<string, string>();
  const join = (note: string, signature: string) => {
    const owner = owners.get(signature);
    if (owner) parent.set(root(note), root(owner));
    else owners.set(signature, note);
  };
  for (const [note, values] of templates)
    join(note, 'schema:' + JSON.stringify([...values].sort()));
  for (const candidate of result.candidates)
    for (const observation of candidate.observations)
      join(observation.noteTitle, 'claim:' + key(observation.evidence));
  const families = new Map([...templates.keys()].map((note) => [note, root(note)]));
  const selected: RelationReviewCase[] = [];
  for (const origin of ['table', 'sentence', 'field'] as const) {
    const rows = result.candidates.flatMap((candidate) =>
      candidate.observations.flatMap((observation, index) =>
        observation.origin === origin
          ? [{ observation, validation: candidate.validations[index] }]
          : []
      )
    );
    rows.sort(
      (a, b) =>
        order(relationObservationIdentity(a.observation)) -
        order(relationObservationIdentity(b.observation))
    );
    for (const row of rows) {
      const family = families.get(row.observation.noteTitle)!;
      selected.push({
        id: relationObservationIdentity(row.observation),
        family,
        split: order(family) % 5 < 3 ? 'calibration' : 'holdout',
        purpose: 'precision',
        ...row,
        judgment: null,
      });
    }
  }

  return selected;
}

/** No labels or scores means no accuracy claim; unreviewed cases are never silently correct. */
export function evaluateRelationReviews(rows: RelationReviewCase[]) {
  const reviewed = rows.filter(isReviewed);
  const precision = reviewed.filter((row) => row.purpose === 'precision' && row.present !== false);
  const supported = precision.filter(
    (row) => row.validation?.verdict === 'supported' && row.validation.scores
  );
  const positives = reviewed.filter(
    (row) => row.purpose === 'recovery' && row.expectedPositive === true
  );
  const twice = reviewed.filter((row) => row.secondJudgment != null);
  const ratio = (numerator: number, denominator: number) =>
    denominator ? numerator / denominator : null;
  return {
    cases: rows.length,
    reviewed: reviewed.length,
    pending: rows.length - reviewed.length,
    candidatePrecision: ratio(
      precision.filter((row) => row.judgment === 'valid').length,
      precision.length
    ),
    supportedPrecision: ratio(
      supported.filter((row) => row.judgment === 'valid').length,
      supported.length
    ),
    positiveRecovery: ratio(
      positives.filter((row) => row.present === true).length,
      positives.length
    ),
    doubleReviewed: twice.length,
    agreement: ratio(
      twice.filter((row) => row.judgment === row.secondJudgment).length,
      twice.length
    ),
    byOrigin: Object.fromEntries(
      ['table', 'sentence', 'field'].map((origin) => {
        const group = precision.filter((row) => row.observation.origin === origin);
        return [
          origin,
          {
            reviewed: group.length,
            precision: ratio(group.filter((row) => row.judgment === 'valid').length, group.length),
          },
        ];
      })
    ),
  };
}

/** Recheck reviewed gold references against a new run instead of trusting old presence flags. */
export function applyRelationPredictions(
  rows: RelationReviewCase[],
  predictions: { observation: RelationObservation; validation?: RelationValidation }[]
): RelationReviewCase[] {
  const byIdentity = new Map(
    predictions.map((item) => [relationObservationIdentity(item.observation), item])
  );
  return rows.map((row) => {
    const prediction = byIdentity.get(relationObservationIdentity(row.observation));
    return { ...row, present: !!prediction, validation: prediction?.validation };
  });
}
