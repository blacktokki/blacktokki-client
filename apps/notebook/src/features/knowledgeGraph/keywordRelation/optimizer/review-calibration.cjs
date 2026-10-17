/** Fit only from the complete assistant census; no judge model or automatic labels are used. */
const path = require('node:path');
const { createHash } = require('node:crypto');
const { moduleLoader } = require('./run-corpus.cjs');
const normalized = (text) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** Connected document/copy families are indivisible, including copies with different titles. */
function reviewFamilies(packet, holdoutFraction) {
  if (!(holdoutFraction > 0 && holdoutFraction < 1))
    throw new Error('An explicit holdout fraction between zero and one is required.');
  const parents = new Map();
  const root = (id) => {
    if (!parents.has(id)) parents.set(id, id);
    if (parents.get(id) !== id) parents.set(id, root(parents.get(id)));
    return parents.get(id);
  };
  const union = (a, b) => {
    const values = [root(a), root(b)].sort();
    parents.set(values[1], values[0]);
  };
  const copies = new Map();
  const documents = new Map();
  for (const row of packet.cases) {
    const note = row.source.noteTitle;
    root(note);
    const premise = normalized(row.premise);
    if (copies.has(premise)) union(note, copies.get(premise));
    else copies.set(premise, note);
    const markdown = packet.documents[note]?.markdown;
    if (markdown) {
      const body = normalized(markdown);
      if (documents.has(body)) union(note, documents.get(body));
      else documents.set(body, note);
    }
  }
  const families = new Map();
  for (const note of parents.keys()) {
    const id = root(note);
    const members = families.get(id) || [];
    members.push(note);
    families.set(id, members);
  }
  const result = new Map();
  for (const members of families.values()) {
    const family = createHash('sha256').update(JSON.stringify(members.sort())).digest('hex');
    const split =
      parseInt(family.slice(0, 13), 16) / 16 ** 13 < holdoutFraction ? 'holdout' : 'calibration';
    for (const note of members) result.set(note, { family, split });
  }
  return result;
}

function calibrateReviewedPacket(datasets, packet, review, config, load = moduleLoader()) {
  const { checkedJudgments, reportReview } = require('./census.cjs');
  const audit = reportReview(datasets, packet, review);
  const judgments = checkedJudgments(packet, review);
  if (judgments.size !== packet.cases.length)
    return {
      status: 'pending-source-review',
      reviewed: judgments.size,
      pending: packet.cases.length - judgments.size,
      policy: null,
    };
  const selected = datasets.find((dataset) => dataset.name === config.dataset);
  if (!selected) throw new Error('Select the dataset whose saved model inputs will be calibrated.');
  if (
    !Number.isFinite(config.roles?.minValidRetention) ||
    config.roles.minValidRetention < 0 ||
    config.roles.minValidRetention > 1
  )
    throw new Error('An explicit valid-relationship retention target is required.');
  const families = reviewFamilies(packet, config.holdoutFraction);
  const byId = new Map(packet.cases.map((row) => [row.id, row]));
  const rows = packet.references
    .filter((ref) => ref.dataset === selected.name)
    .map((ref) => {
      const source = byId.get(ref.caseId);
      const truth = judgments.get(ref.caseId);
      const prediction = selected.predictions[ref.index];
      return {
        id: ref.caseId + ':' + ref.index,
        ...families.get(source.source.noteTitle),
        kind: 'natural',
        premise: source.premise,
        hypothesis: source.hypothesis,
        expectedLabel: truth.expectedLabel,
        sourceClarity: truth.sourceClarity,
        relationJudgment: truth.relationJudgment,
        reviewer: truth.reviewer,
        judgment: truth.relationJudgment,
        observation: prediction.observation,
        claim: prediction.validation.claim,
        validation: prediction.validation,
      };
    });
  const evaluation = load(path.join(__dirname, 'verdict-evaluation.ts'));
  const roles = load(path.join(__dirname, 'role-evidence.ts'));
  const roleEvidence = roles.calibrateRoleEvidence(rows, config.roles);
  // Literal copies and coordinate membership are not semantic calibration observations.
  const meaning = rows.filter(
    (row) => !row.validation.verification || row.validation.verification.kind === 'semantic'
  );
  const fitted = evaluation.calibrateVerdicts(meaning, config.semantic);
  const gap =
    fitted && config.controls
      ? evaluation.calibrateControlMargin(meaning, config.controls, fitted.nli)
      : null;
  const policy = fitted
    ? { nli: { ...fitted.nli, ...(gap ? { controlMargin: gap.controlMargin } : {}) } }
    : null;
  const roleCandidate = roleEvidence.summary.status === 'calibrated';
  const result = {
    status: policy || roleCandidate ? 'candidate-policy' : 'insufficient-calibration-data',
    policy,
    roleCalibration: roleEvidence.summary,
    calibration: fitted,
    controls: gap,
    independentHoldout: review.priorPredictionsPreviouslySeen === false,
    // A previously inspected holdout cannot be presented as an independent success.
    comparison:
      policy && review.priorPredictionsPreviouslySeen === false
        ? evaluation.compareVerdictPolicies(
            meaning,
            {},
            policy.nli,
            config.coverage,
            config.targets
          )
        : null,
    sourceReview: audit.status,
    evaluationModelCalls: 0,
  };
  // The caller can apply a fitted role policy with the same module loader. JSON output keeps
  // only aggregate diagnostics; functions, reviewed rows and fitted role state stay in memory.
  if (policy || roleCandidate)
    Object.defineProperty(result, 'runtimePolicy', {
      value: { ...policy, ...(roleCandidate ? { roleEvidence } : {}) },
      enumerable: false,
    });
  return result;
}
module.exports = { reviewFamilies, calibrateReviewedPacket };
