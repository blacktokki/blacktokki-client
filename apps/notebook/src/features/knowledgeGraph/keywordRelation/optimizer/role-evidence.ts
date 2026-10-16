import type { RelationObservation } from '../relationDiscovery';
import { relationKeywordKey as key } from '../relationKeywords';
import { schemaOf } from './schema';
import type { SyntaxClaim } from './syntax';

export type RoleReview = {
  id: string;
  family: string;
  split: 'calibration' | 'holdout';
  reviewer: 'assistant';
  observation: RelationObservation;
  claim?: SyntaxClaim;
  judgment: 'valid' | 'cooccurrence' | 'parse-error' | 'insufficient';
};
export type RoleEvidencePolicy = {
  revision: 'reviewed-roles-v4';
  fitIdentity: string;
  summary: {
    status: 'calibrated' | 'insufficient-data';
    families: number;
    acceptedFamilies: number;
    lowerPrecision: number | null;
    validRetention: number | null;
    caseValidRetention: number | null;
    diagnostics: {
      reviewedExamples: number;
      validExamples: number;
      scoredExamples: number;
      uniqueRelationships: number;
      validRelationships: number;
      bestLowerPrecision: number | null;
      maxValidRetentionAtPrecision: number | null;
      maxCaseValidRetentionAtPrecision: number | null;
      rejection: 'insufficient-families' | 'unscored' | 'precision' | 'retention' | null;
    };
  };
  accepts: (observation: RelationObservation, claim?: SyntaxClaim) => boolean;
};
const fittedPolicies = new WeakSet<RoleEvidencePolicy>();

/** A JSON rule table or manually constructed policy cannot replace an actual fit. */
export function validateRoleEvidencePolicy(policy: RoleEvidencePolicy) {
  if (!fittedPolicies.has(policy))
    throw new Error(
      'Fit role evidence in this process from assistant source reviews; serialized role rules are unsupported.'
    );
}

/** Numeric structural features contain no note, entity, header or sentence-pattern lookup keys. */
function features(observation: RelationObservation, claim?: SyntaxClaim): number[] {
  const schema = schemaOf(observation);
  const structure = schema?.structure;
  return [
    Number(observation.origin === 'table'),
    Number(observation.origin === 'field'),
    structure?.width || 0,
    structure?.sourcePosition || 0,
    structure?.targetPosition || 0,
    structure?.sourceUnique || 0,
    structure?.targetUnique || 0,
    structure?.sourceAtomic || 0,
    structure?.targetAtomic || 0,
    Number(!!structure?.unresolvedHeaders),
    Number(claim?.status === 'direct'),
    Number(claim?.status === 'separate'),
    Number(claim?.status === 'unresolved'),
    Number(!!claim?.roles?.length),
    observation.source.length / Math.max(1, observation.evidence.length),
    observation.target.length / Math.max(1, observation.evidence.length),
  ];
}

/** The lower Wilson bound is shared by role and score calibration. */
export function precisionLowerBound(correct: number, total: number) {
  if (!total) return 0;
  const z = 1.959963984540054;
  const p = correct / total;
  const denominator = 1 + (z * z) / total;
  return Math.max(
    0,
    (p +
      (z * z) / (2 * total) -
      z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      denominator
  );
}

type Example = { x: number[]; valid: boolean; family: string; unit: string };

/** Calibration and runtime must treat roundoff-sized score differences as the same tie. */
function acceptsScore(score: number, cutoff: number, dimensions: number) {
  return (
    score + Number.EPSILON * Math.max(1, Math.abs(score), Math.abs(cutoff)) * dimensions >= cutoff
  );
}

/** Match the census unit: repeated positions do not create a new relationship fact. */
function relationshipUnit(observation: RelationObservation) {
  return JSON.stringify([
    observation.noteTitle,
    observation.sectionPath || [],
    observation.section,
    observation.origin,
    observation.source,
    observation.target,
    observation.evidence,
    observation.template,
    observation.direction,
  ]);
}

/** Fit a standardized linear discriminant. Every coefficient comes from reviewed examples. */
function discriminant(examples: Example[]) {
  const positives = examples.filter((row) => row.valid),
    negatives = examples.filter((row) => !row.valid);
  if (!positives.length || !negatives.length) return;
  const units = new Map<string, Set<string>>(),
    repeats = new Map<string, number>();
  for (const row of examples) {
    const family = units.get(row.family) || new Set<string>();
    family.add(row.unit);
    units.set(row.family, family);
    repeats.set(row.unit, (repeats.get(row.unit) || 0) + 1);
  }
  const weightOf = (row: Example) => 1 / units.get(row.family)!.size / repeats.get(row.unit)!;
  const weights = examples.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  const average = (rows: Example[], at: number) => {
    const reference = rows[0].x[at];
    return (
      reference +
      rows.reduce((sum, row) => sum + (row.x[at] - reference) * weightOf(row), 0) /
        rows.reduce((sum, row) => sum + weightOf(row), 0)
    );
  };
  const mean = examples[0].x.map((_, at) => average(examples, at));
  const variances = mean.map(
    (value, at) =>
      examples.reduce((sum, row, i) => sum + (row.x[at] - value) ** 2 * weights[i], 0) / total
  );
  const positive = mean.map((_, at) => average(positives, at));
  const negative = mean.map((_, at) => average(negatives, at));
  const coefficients = mean.map((_, at) =>
    variances[at] ? (positive[at] - negative[at]) / variances[at] : 0
  );
  const center = positive.map((value, at) => (value + negative[at]) / 2);
  const scale = coefficients.reduce(
    (sum, value, at) => sum + (value * (positive[at] - negative[at])) / 2,
    0
  );
  if (!scale) return;
  const minimum = mean.map((_, at) =>
    examples.reduce((value, row) => Math.min(value, row.x[at]), Infinity)
  );
  const maximum = mean.map((_, at) =>
    examples.reduce((value, row) => Math.max(value, row.x[at]), -Infinity)
  );
  return {
    identity: JSON.stringify([coefficients, center, scale, minimum, maximum]),
    score: (x: number[]) =>
      x.some((value, at) => value < minimum[at] || value > maximum[at])
        ? null
        : x.reduce((sum, value, at) => sum + (value - center[at]) * coefficients[at], 0) / scale,
  };
}

/**
 * Leave whole source/copy families out when choosing the acceptance cut. Unread and holdout
 * labels never fit coefficients or thresholds. The trained policy stays in memory, not JSON.
 */
export function calibrateRoleEvidence(
  reviews: RoleReview[],
  options: { minFamilies: number; minPrecision: number; minValidRetention?: number }
): RoleEvidencePolicy {
  if (
    !Number.isSafeInteger(options.minFamilies) ||
    options.minFamilies < 1 ||
    !Number.isFinite(options.minPrecision) ||
    options.minPrecision < 0 ||
    options.minPrecision > 1 ||
    (options.minValidRetention !== undefined &&
      (!Number.isFinite(options.minValidRetention) ||
        options.minValidRetention < 0 ||
        options.minValidRetention > 1))
  )
    throw new Error('Invalid role calibration requirements.');
  const splits = new Map<string, string>(),
    inputs = new Map<string, string>(),
    judgments = new Map<string, boolean>(),
    ids = new Set<string>();
  const parent = new Map<string, string>(),
    copies = new Map<string, string>();
  const root = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, root(parent.get(id)!));
    return parent.get(id)!;
  };
  for (const review of reviews) {
    if (
      review.reviewer !== 'assistant' ||
      !review.family ||
      !review.id ||
      ids.has(review.id) ||
      !['calibration', 'holdout'].includes(review.split) ||
      !['valid', 'cooccurrence', 'parse-error', 'insufficient'].includes(review.judgment)
    )
      throw new Error('Role calibration requires unique, direct assistant source reviews.');
    ids.add(review.id);
    const unit = relationshipUnit(review.observation),
      valid = review.judgment === 'valid';
    if (judgments.has(unit) && judgments.get(unit) !== valid)
      throw new Error('Conflicting assistant validity reviews for the same relationship.');
    judgments.set(unit, valid);
    const input = key(review.observation.evidence);
    if (
      (splits.has(review.family) && splits.get(review.family) !== review.split) ||
      (inputs.has(input) && inputs.get(input) !== review.split)
    )
      throw new Error('A source/copy family crosses calibration and holdout splits.');
    splits.set(review.family, review.split);
    inputs.set(input, review.split);
    const previous = copies.get(input);
    if (previous) {
      const values = [root(previous), root(review.family)].sort();
      parent.set(values[1], values[0]);
    } else copies.set(input, review.family);
  }
  const examples: Example[] = reviews
    // Insufficient evidence cannot be taught as an acceptable relationship or disappear from
    // acceptance-risk calibration. This is an abstention target, not a semantic truth label.
    .filter((review) => review.split === 'calibration')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((review) => ({
      x: features(review.observation, review.claim),
      valid: review.judgment === 'valid',
      family: root(review.family),
      unit: relationshipUnit(review.observation),
    }));
  const families = [...new Set(examples.map((row) => row.family))].sort();
  const crossfit: { score: number | null; valid: boolean; family: string; unit: string }[] = [];
  for (const family of families) {
    const fit = discriminant(examples.filter((row) => row.family !== family));
    for (const example of examples.filter((row) => row.family === family))
      crossfit.push({
        score: fit?.score(example.x) ?? null,
        valid: example.valid,
        family,
        unit: example.unit,
      });
  }
  let cutoff: number | undefined,
    acceptedFamilies = 0,
    lowerPrecision: number | null = null,
    validRetention: number | null = null,
    caseValidRetention: number | null = null;
  let bestLowerPrecision: number | null = null,
    maxValidRetentionAtPrecision: number | null = null,
    maxCaseValidRetentionAtPrecision: number | null = null;
  const validUnits = new Set<string>(),
    validCounts = new Map<string, number>();
  for (const row of crossfit)
    if (row.valid && !validUnits.has(row.unit)) {
      validUnits.add(row.unit);
      validCounts.set(row.family, (validCounts.get(row.family) || 0) + 1);
    }
  const cuts = [
    ...new Set(crossfit.flatMap((row) => (row.score === null ? [] : [row.score]))),
  ].sort((a, b) => b - a);
  for (const cut of cuts) {
    const accepted = new Map<string, boolean>();
    const retained = new Map<string, number>(),
      retainedUnits = new Set<string>();
    for (const row of crossfit)
      if (row.score !== null && acceptsScore(row.score, cut, examples[0].x.length)) {
        accepted.set(row.family, (accepted.get(row.family) ?? true) && row.valid);
        if (row.valid && !retainedUnits.has(row.unit)) {
          retainedUnits.add(row.unit);
          retained.set(row.family, (retained.get(row.family) || 0) + 1);
        }
      }
    const retention = validCounts.size
      ? [...validCounts].reduce(
          (sum, [family, count]) => sum + (retained.get(family) || 0) / count,
          0
        ) / validCounts.size
      : 0;
    const caseRetention = validUnits.size ? retainedUnits.size / validUnits.size : 0;
    const lower = precisionLowerBound([...accepted.values()].filter(Boolean).length, accepted.size);
    if (accepted.size >= options.minFamilies) {
      bestLowerPrecision = Math.max(bestLowerPrecision ?? 0, lower);
      if (lower >= options.minPrecision) {
        maxValidRetentionAtPrecision = Math.max(maxValidRetentionAtPrecision ?? 0, retention);
        maxCaseValidRetentionAtPrecision = Math.max(
          maxCaseValidRetentionAtPrecision ?? 0,
          caseRetention
        );
      }
    }
    if (
      accepted.size >= options.minFamilies &&
      lower >= options.minPrecision &&
      retention >= (options.minValidRetention ?? 0) &&
      caseRetention >= (options.minValidRetention ?? 0) &&
      (caseValidRetention === null ||
        caseRetention > caseValidRetention ||
        (caseRetention === caseValidRetention &&
          (retention > validRetention! ||
            (retention === validRetention && lower > lowerPrecision!))))
    ) {
      cutoff = cut;
      acceptedFamilies = accepted.size;
      lowerPrecision = lower;
      validRetention = retention;
      caseValidRetention = caseRetention;
    }
  }
  const fit = discriminant(examples);
  const policy: RoleEvidencePolicy = {
    revision: 'reviewed-roles-v4',
    fitIdentity: key(JSON.stringify(['reviewed-roles-v4', fit?.identity, cutoff, options])),
    summary: {
      status: fit && cutoff !== undefined ? 'calibrated' : 'insufficient-data',
      families: families.length,
      acceptedFamilies,
      lowerPrecision,
      validRetention,
      caseValidRetention,
      diagnostics: {
        reviewedExamples: examples.length,
        validExamples: examples.filter((row) => row.valid).length,
        scoredExamples: crossfit.filter((row) => row.score !== null).length,
        uniqueRelationships: new Set(examples.map((row) => row.unit)).size,
        validRelationships: validUnits.size,
        bestLowerPrecision,
        maxValidRetentionAtPrecision,
        maxCaseValidRetentionAtPrecision,
        rejection:
          fit && cutoff !== undefined
            ? null
            : families.length < options.minFamilies
            ? 'insufficient-families'
            : !cuts.length
            ? 'unscored'
            : maxValidRetentionAtPrecision === null
            ? 'precision'
            : 'retention',
      },
    },
    accepts: (observation, claim) => {
      const values = features(observation, claim),
        score = fit?.score(values);
      return cutoff !== undefined && score != null && acceptsScore(score, cutoff, values.length);
    },
  };
  fittedPolicies.add(policy);
  return policy;
}

export function reviewedRole(
  observation: RelationObservation,
  claim: SyntaxClaim | undefined,
  policy?: RoleEvidencePolicy
) {
  if (!policy) return false;
  validateRoleEvidencePolicy(policy);
  return policy.accepts(observation, claim);
}
