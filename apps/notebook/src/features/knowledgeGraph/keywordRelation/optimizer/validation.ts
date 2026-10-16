import type {
  EntailmentScores,
  RelationDiscoveryResult,
  RelationObservation,
  RelationValidation,
} from '../relationDiscovery';
import { createRelationKeywordMatcher, relationKeywordKey as key } from '../relationKeywords';
import { namedAtoms } from './claims';
import { reviewedRole, RoleEvidencePolicy, validateRoleEvidencePolicy } from './role-evidence';
import { schemaHypothesis, schemaMembership, schemaOf, SchemaObservation } from './schema';
import { decideNli, NliDecisionPolicy, SemanticDecision, validateDecisionPolicy } from './semantic';
import { analyzeSyntaxClaim, optimizationStage, syntaxRevision, SyntaxClaim } from './syntax';

/** Initial operating values, not measured accuracy. Evaluation can supply calibrated values. */
export const DEFAULT_RELATION_POLICY = { similarityThreshold: 0.9, entailmentThreshold: 0.8 };
export type RelationPolicy = typeof DEFAULT_RELATION_POLICY & {
  extractionRevision?: string;
  maxMergeNliChecks?: number;
  nli?: NliDecisionPolicy;
  roleEvidence?: RoleEvidencePolicy;
};

export type OptimizedValidation = RelationValidation & {
  claim?: SyntaxClaim;
  semantic?: SemanticDecision;
  eligibility?: { status: 'eligible' | 'unresolved'; reason: string };
  decisionReason?: string;
  decisionPolicy?: NliDecisionPolicy;
  controlError?: string;
  verification?: {
    kind: 'semantic' | 'record-membership' | 'source-reconstruction';
    membership?: boolean;
  };
  controlMatch?: {
    status: 'observed-role' | 'inventory' | 'unavailable';
    source?: Pick<RelationObservation, 'noteTitle' | 'section' | 'sectionPath'>;
  };
};

export function relationPolicy(overrides: Partial<RelationPolicy> = {}): RelationPolicy {
  const policy = {
    ...DEFAULT_RELATION_POLICY,
    ...overrides,
    extractionRevision: optimizationStage()
      ? `reviewed-claims-v9:${optimizationStage()}:${syntaxRevision()}`
      : 'reviewed-claims-v9',
  };
  if (
    [policy.similarityThreshold, policy.entailmentThreshold].some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1
    )
  )
    throw new Error('Relation thresholds must be finite values between zero and one.');
  if (
    policy.maxMergeNliChecks !== undefined &&
    (!Number.isSafeInteger(policy.maxMergeNliChecks) || policy.maxMergeNliChecks < 0)
  )
    throw new Error('The merge comparison budget must be a nonnegative integer.');
  validateDecisionPolicy(policy.nli || {});
  if (policy.roleEvidence) validateRoleEvidencePolicy(policy.roleEvidence);
  return policy;
}

/** Role signatures come from observed schemas/patterns, never field-name or relation dictionaries. */
export function observationRole(observation: RelationObservation): string {
  const schema = schemaOf(observation);
  return JSON.stringify([
    observation.origin,
    schema ? [key(schema.sourceHeader || ''), key(schema.targetHeader)] : key(observation.template),
    observation.sourceType,
    observation.targetType,
  ]);
}

function eligibilityOf(
  observation: RelationObservation,
  claim?: SyntaxClaim,
  policy?: RoleEvidencePolicy
): NonNullable<OptimizedValidation['eligibility']> {
  if (reviewedRole(observation, claim, policy))
    return { status: 'eligible', reason: 'reviewed-role-evidence' };
  if (observation.origin === 'table')
    return { status: 'unresolved', reason: 'unreviewed-table-roles' };
  if (claim && claim.status !== 'direct') return { status: 'unresolved', reason: claim.reason };
  return {
    status: 'eligible',
    reason: observation.origin === 'field' ? 'recorded-role' : claim?.reason || 'semantic-pattern',
  };
}

/** Reconstruction/membership checks do not call NLI or manufacture model probabilities. */
export function needsSemanticValidation(validation: OptimizedValidation) {
  return !validation.verification || validation.verification.kind === 'semantic';
}

/** A different note cannot make an identical quotation an independent validation. */
export function prepareRelationValidation(
  observation: RelationObservation,
  template: string,
  donor: RelationObservation,
  alternatives: { text: string; type: string | null }[],
  render: (template: string, observation: RelationObservation) => string
): RelationValidation {
  // Render the copula as a unit: the legacy renderer treats the 이 in 이다 as a subject particle.
  const renderClaim = (value: RelationObservation) => {
    if (value.origin !== 'field' || !template.endsWith('{{E2}}이다.'))
      return render(template, value);
    const prefix = render(template.slice(0, -'{{E2}}이다.'.length), value);
    const last = value.target.charCodeAt(value.target.length - 1) - 0xac00;
    const ending = last >= 0 && last <= 11171 && last % 28 === 0 ? '다.' : '이다.';
    return prefix + value.target + ending;
  };
  const claim =
    observation.origin === 'sentence'
      ? analyzeSyntaxClaim(
          observation.evidence,
          [observation.source, observation.target].map((text) => ({
            text,
            key: key(text),
            type: null,
            start: observation.evidence.indexOf(text),
            end: observation.evidence.indexOf(text) + text.length,
          }))
        )
      : undefined;
  const schema = schemaOf(observation);
  const fieldMember =
    observation.origin === 'field' && schema
      ? namedAtoms(
          schema.value,
          createRelationKeywordMatcher([
            ...alternatives,
            { text: observation.target, type: observation.targetType },
          ])
        )?.some((item) => item.key === key(observation.target))
      : false;
  const hypothesis = schema
    ? schemaHypothesis(schema, observation.target)
    : claim?.status === 'direct'
    ? claim.hypothesis!
    : renderClaim(observation);
  const reconstructed = key(hypothesis) === key(observation.evidence);
  const locallyGenerated = !!schema || claim?.status === 'direct';
  const hypothesisSource = locallyGenerated ? observation : donor;
  const heldOut =
    !reconstructed &&
    !locallyGenerated &&
    donor.noteTitle !== observation.noteTitle &&
    key(donor.evidence) !== key(observation.evidence);
  // The upstream runner still uses its original draft format. The optimizer rebuilds
  // controls and verification from the complete corpus in prepareResultValidations.
  const replacement = alternatives.find(
    (entity) =>
      entity.type === observation.targetType &&
      key(entity.text) !== key(observation.target) &&
      key(entity.text) !== key(observation.source) &&
      !key(observation.evidence).includes(key(entity.text))
  );
  const result: OptimizedValidation = {
    noteTitle: observation.noteTitle,
    evidence: observation.evidence,
    hypothesis,
    hypothesisSource: {
      noteTitle: hypothesisSource.noteTitle,
      section: hypothesisSource.section,
      sectionPath: hypothesisSource.sectionPath,
    },
    heldOut,
    basis: reconstructed ? 'reconstruction' : heldOut ? 'cross-note' : 'source',
    ...(claim ? { claim } : {}),
    ...(fieldMember
      ? { verification: { kind: 'record-membership' as const, membership: true } }
      : reconstructed
      ? { verification: { kind: 'source-reconstruction' as const } }
      : {}),
    eligibility:
      observation.origin === 'table'
        ? { status: 'eligible', reason: 'recorded-role' }
        : eligibilityOf(observation, claim),
    control: replacement
      ? {
          hypothesis: schema
            ? schemaHypothesis(schema, replacement.text)
            : claim?.status === 'direct'
            ? hypothesis.replace(observation.target, () => replacement.text)
            : renderClaim({ ...observation, target: replacement.text }),
        }
      : undefined,
    controlMatch: { status: replacement ? 'inventory' : 'unavailable' },
    verdict: 'unverified',
    skipReason: 'pending',
  };
  return result;
}

export function relationScoreVerdict(
  scores: EntailmentScores,
  threshold = DEFAULT_RELATION_POLICY.entailmentThreshold
): RelationValidation['verdict'] {
  return decideNli(scores, threshold).verdict;
}

/** Rebuild specificity checks from the entire observed role population, without inventory fallback. */
export function prepareResultValidations(result: RelationDiscoveryResult, policy: RelationPolicy) {
  const fields = new Map<string, RelationObservation[]>();
  for (const candidate of result.candidates)
    for (const observation of candidate.observations) {
      if (observation.origin !== 'field') continue;
      const id = JSON.stringify([
        observation.noteTitle,
        observation.sectionPath || [],
        observation.section,
        observation.evidence,
      ]);
      const values = fields.get(id) || [];
      values.push(observation);
      fields.set(id, values);
    }
  for (const observations of fields.values()) {
    const schema = schemaOf(observations[0]);
    if (!schema) continue;
    const match = createRelationKeywordMatcher(
      observations.map((o) => ({ text: o.target, type: o.targetType }))
    );
    const values = namedAtoms(schema.value, match);
    for (const observation of observations) {
      const value = values?.find((item) => item.key === key(observation.target));
      if (value)
        (observation as SchemaObservation).schema = {
          ...schema,
          location: { targetStart: value.start, targetEnd: value.end },
        };
    }
  }
  const roles = new Map<string, RelationObservation[]>();
  for (const candidate of result.candidates)
    for (const observation of candidate.observations) {
      const role = observationRole(observation);
      const values = roles.get(role) || [];
      values.push(observation);
      roles.set(role, values);
    }
  const stableKey = (observation: RelationObservation) =>
    JSON.stringify([
      key(observation.target),
      observation.noteTitle,
      observation.sectionPath || [],
      observation.section,
      observation.evidence,
      observation.source,
    ]);
  for (const values of roles.values())
    values.sort((a, b) => stableKey(a).localeCompare(stableKey(b)));
  for (const candidate of result.candidates)
    candidate.validations.forEach((value, index) => {
      const validation = value as OptimizedValidation;
      const observation = candidate.observations[index];
      if (!observation) return;
      validation.decisionPolicy = policy.nli;
      validation.eligibility = eligibilityOf(observation, validation.claim, policy.roleEvidence);
      const recorded = schemaOf(observation);
      if (recorded) {
        validation.hypothesis = schemaHypothesis(recorded, observation.target);
        validation.verification = {
          kind: 'record-membership',
          membership: schemaMembership(recorded, observation.target),
        };
      } else if (key(validation.evidence) === key(validation.hypothesis)) {
        validation.verification = { kind: 'source-reconstruction' };
      } else {
        validation.verification = { kind: 'semantic' };
      }
      const replacement = roles
        .get(observationRole(observation))
        ?.find(
          (other) =>
            key(other.target) !== key(observation.source) &&
            key(other.target) !== key(observation.target) &&
            !key(observation.evidence).includes(key(other.target))
        );
      // Restrict replacement to the value cell when available. A target inside a subject name
      // cannot be safely replaced by an unscoped string operation.
      const schema = schemaOf(observation);
      const occurrences = validation.hypothesis.split(observation.target).length - 1;
      const hypothesis = replacement
        ? schema
          ? schemaHypothesis(schema, replacement.target)
          : occurrences === 1 && !observation.source.includes(observation.target)
          ? validation.hypothesis.replace(observation.target, () => replacement.target)
          : undefined
        : undefined;
      validation.control = hypothesis ? { hypothesis } : undefined;
      validation.controlMatch = {
        status: hypothesis ? 'observed-role' : 'unavailable',
        ...(hypothesis && replacement
          ? {
              source: {
                noteTitle: replacement.noteTitle,
                section: replacement.section,
                sectionPath: replacement.sectionPath,
              },
            }
          : {}),
      };
    });
}

export function validationSemanticDecision(validation: OptimizedValidation, threshold: number) {
  return decideNli(validation.scores, threshold, validation.decisionPolicy);
}

/** Controls are optional diagnostics until a review-calibrated gap is explicitly configured. */
export function needsControlValidation(validation: OptimizedValidation, threshold: number) {
  return (
    needsSemanticValidation(validation) &&
    !!validation.control &&
    validation.decisionPolicy?.controlMargin !== undefined &&
    validation.controlMatch?.status === 'observed-role' &&
    validation.eligibility?.status !== 'unresolved' &&
    validationSemanticDecision(validation, threshold).verdict === 'supported'
  );
}

/** Keep the semantic verdict and relationship eligibility independent of control availability. */
export function optimizedValidationVerdict(
  validation: OptimizedValidation,
  threshold = DEFAULT_RELATION_POLICY.entailmentThreshold
): RelationValidation['verdict'] {
  const hold = (reason: string): RelationValidation['verdict'] => {
    validation.decisionReason = reason;
    return 'uncertain';
  };
  if (!needsSemanticValidation(validation)) {
    // Old saved scores may describe a literal copy, not the relationship under review.
    // Keep those raw scores for inspection; never count them as independent semantic evidence.
    delete validation.semantic;
    if (
      validation.verification?.kind === 'record-membership' &&
      !validation.verification.membership
    )
      return hold('unconfirmed-record-position');
    if (validation.eligibility?.status === 'unresolved') return hold(validation.eligibility.reason);
    if (
      validation.verification?.kind === 'source-reconstruction' &&
      validation.eligibility?.reason !== 'reviewed-role-evidence'
    )
      return hold('reconstruction-only');
    validation.decisionReason =
      validation.verification?.kind === 'record-membership'
        ? 'recorded-membership'
        : 'reviewed-role-evidence';
    return 'supported';
  }
  const semantic = validationSemanticDecision(validation, threshold);
  validation.semantic = semantic;
  validation.decisionReason = semantic.reason;
  if (semantic.verdict !== 'supported') return semantic.verdict;
  // Preserve the upstream runner's existing contract until it opts into optimizer preparation.
  // This branch is never used by optimizer/analysis.ts or the full-corpus optimizer export.
  if (!validation.verification && !validation.decisionPolicy && validation.control) {
    const control = decideNli(validation.control.scores, threshold);
    if (!control.scores) {
      validation.decisionReason = 'control-unverified';
      return 'unverified';
    }
    if (control.label === 'supported' || control.verdict === 'uncertain')
      return hold('control-uncertain');
    if (semantic.scores!.entailment <= control.scores.entailment) return hold('control-margin');
  }
  if (validation.eligibility?.status === 'unresolved') return hold(validation.eligibility.reason);
  if (
    validation.claim &&
    validation.claim.status !== 'direct' &&
    validation.eligibility?.reason !== 'reviewed-role-evidence'
  )
    return hold(validation.claim.reason);
  // An absent, unscored, invalid or uncertain alternative says nothing against the main claim.
  if (
    validation.controlMatch?.status !== 'observed-role' ||
    validation.decisionPolicy?.controlMargin === undefined ||
    !validation.control
  )
    return semantic.verdict;
  const control = decideNli(validation.control.scores, threshold, validation.decisionPolicy);
  if (!control.scores || control.verdict === 'uncertain') return semantic.verdict;
  if (
    semantic.scores!.entailment - control.scores.entailment <
    validation.decisionPolicy.controlMargin
  )
    return hold('calibrated-control-gap');
  return semantic.verdict;
}

/** Unique claims contribute once; reconstruction scores remain visible without an independent vote. */
export function independentSupportRank(
  validations: (OptimizedValidation | undefined)[],
  total = validations.length
) {
  const supportOf = (value?: OptimizedValidation) =>
    value?.semantic?.scores?.entailment ?? value?.scores?.entailment;
  const claims = new Map<string, OptimizedValidation | undefined>();
  for (let index = 0; index < total; index++) {
    const value = validations[index];
    const id = value
      ? JSON.stringify([key(value.evidence), key(value.hypothesis)])
      : `pending:${index}`;
    const previous = claims.get(id);
    // Use the least favorable available judgment if inconsistent duplicates are supplied.
    if (
      !claims.has(id) ||
      !value?.scores ||
      (previous?.scores && supportOf(value)! < supportOf(previous)!)
    )
      claims.set(id, value);
  }
  let support = 0;
  let supportCount = 0;
  for (const value of claims.values()) {
    const score = supportOf(value);
    if (
      (value && !needsSemanticValidation(value)) ||
      value?.basis === 'reconstruction' ||
      value?.verdict === 'unverified' ||
      score === undefined ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    )
      continue;
    support += score;
    if (
      value?.verdict === 'supported' &&
      value.eligibility?.status !== 'unresolved' &&
      needsSemanticValidation(value)
    )
      supportCount++;
  }
  const meanSupport = claims.size ? support / claims.size : 0;
  return {
    meanSupport,
    supportCount,
    confidence: (meanSupport * supportCount) / (supportCount + 1),
  };
}
