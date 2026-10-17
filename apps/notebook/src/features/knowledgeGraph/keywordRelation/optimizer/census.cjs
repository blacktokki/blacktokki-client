/** Full source review by the assistant. Exports and counts judgments; never infers them. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
};
const countBy = (values) =>
  values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
const fraction = (n, d) => (d ? n / d : null);
const semanticLabels = ['supported', 'neutral', 'contradicted'];
const verdictLabels = [...semanticLabels, 'uncertain', 'unverified'];
const relationJudgments = ['valid', 'cooccurrence', 'parse-error', 'insufficient'];
const sourceClarities = ['clear', 'ambiguous', 'non-assertion', 'not-applicable'];
const validSupport = (truth) =>
  truth?.relationJudgment === 'valid' &&
  (truth.expectedLabel === 'supported' || truth.sourceClarity === 'not-applicable');
const expectedDecision = (truth) => (validSupport(truth) ? 'supported' : truth.expectedLabel);
const truthLabel = (truth) =>
  truth.expectedLabel ||
  (truth.sourceClarity === 'not-applicable' ? 'not-applicable' : 'unresolved');

/** Unknown source truth is neither correct nor incorrect; show the possible error range. */
function errorSummary(count, errors, unresolved, pending, complete) {
  return {
    confirmedErrors: errors,
    unresolved,
    pending,
    errorRate: complete && !unresolved ? fraction(errors, count) : null,
    confirmedErrorRate: complete ? fraction(errors, count) : null,
    reviewedConfirmedErrorRate: fraction(errors, count - pending),
    errorRateBounds: complete && count ? [errors / count, (errors + unresolved) / count] : null,
  };
}

function overallErrors(byVerdict) {
  const groups = Object.values(byVerdict);
  const sum = (field) => groups.reduce((total, group) => total + (group[field] || 0), 0);
  const pending = sum('pending');
  return {
    cases: sum('predicted'),
    wrongDecisions: groups
      .filter((group) => group.kind === 'decision')
      .reduce((total, group) => total + group.confirmedErrors, 0),
    missedDecisions: sum('missedDecisions'),
    ...errorSummary(sum('predicted'), sum('confirmedErrors'), sum('unresolved'), pending, !pending),
  };
}

function classMembership(truth, label, relationship) {
  if (!truth) return null;
  if (relationship && label === 'supported') {
    if (
      (truth.expectedLabel !== null && truth.expectedLabel !== 'supported') ||
      ['cooccurrence', 'parse-error'].includes(truth.relationJudgment)
    )
      return false;
    return validSupport(truth) ? true : null;
  }
  return semanticLabels.includes(truth.expectedLabel) ? truth.expectedLabel === label : null;
}

function abstentionStatus(truth, relationship) {
  if (
    semanticLabels.includes(relationship ? expectedDecision(truth) : truth.expectedLabel) &&
    (!relationship || truth.expectedLabel !== 'supported' || truth.relationJudgment === 'valid')
  )
    return 'missed';
  return relationship && ['cooccurrence', 'parse-error'].includes(truth.relationJudgment)
    ? 'non-actionable'
    : 'unresolved';
}

/** Count existing assistant labels; abstention is an execution status, never an invented gold class. */
function verdictMetrics(rows, outputOf, relationship = false) {
  const complete = rows.every((row) => row.judgment);
  const belongsTo = (row, label) => classMembership(row.judgment, label, relationship);
  return Object.fromEntries(
    verdictLabels.map((label) => {
      const predicted = rows.filter((row) => outputOf(row) === label);
      const reviewed = predicted.filter((row) => row.judgment);
      const counts = {
        predicted: predicted.length,
        reviewed: reviewed.length,
        pending: predicted.length - reviewed.length,
      };
      if (!semanticLabels.includes(label)) {
        const missed = reviewed.filter(
          (row) => abstentionStatus(row.judgment, relationship) === 'missed'
        );
        // An invalid extracted pair need not become a supported relation. Its copied sentence
        // can still have a clear semantic label, so semantic and relationship omissions differ.
        const nonActionable = reviewed.filter(
          (row) => abstentionStatus(row.judgment, relationship) === 'non-actionable'
        ).length;
        const unresolved = reviewed.length - missed.length - nonActionable;
        const heldValid = reviewed.filter((row) => validSupport(row.judgment)).length;
        return [
          label,
          {
            ...counts,
            kind: 'abstention',
            ...errorSummary(predicted.length, missed.length, unresolved, counts.pending, complete),
            missedDecisions: missed.length,
            missedByExpectedLabel: countBy(
              missed.map((row) =>
                relationship ? expectedDecision(row.judgment) : row.judgment.expectedLabel
              )
            ),
            nonActionable,
            falseDiscoveryRate: null,
            falsePositiveRate: null,
            knownSemanticLabels: countBy(reviewed.map((row) => truthLabel(row.judgment))),
            heldValid,
            heldValidRate: complete ? fraction(heldValid, predicted.length) : null,
            reviewedHeldValidRate: fraction(heldValid, reviewed.length),
          },
        ];
      }
      const positive = rows.filter((row) => belongsTo(row, label) === true);
      const negative = rows.filter((row) => belongsTo(row, label) === false);
      const truePositive = positive.filter((row) => outputOf(row) === label).length;
      const falsePositive = negative.filter((row) => outputOf(row) === label).length;
      const falseNegative = positive.length - truePositive;
      const trueNegative = negative.length - falsePositive;
      const evaluated = truePositive + falsePositive;
      const unresolved = reviewed.length - evaluated;
      const unresolvedSources = rows.filter(
        (row) => row.judgment && belongsTo(row, label) === null
      ).length;
      return [
        label,
        {
          ...counts,
          kind: 'decision',
          ...errorSummary(predicted.length, falsePositive, unresolved, counts.pending, complete),
          evaluated,
          truePositive,
          falsePositive,
          falseNegative,
          trueNegative,
          // Predicted-class error (FP / (TP + FP)) differs from statistical FPR (FP / (FP + TN)).
          falseDiscoveryRate: complete && !unresolved ? fraction(falsePositive, evaluated) : null,
          reviewedFalseDiscoveryRate: fraction(falsePositive, evaluated),
          falsePositiveRate:
            complete && !unresolvedSources ? fraction(falsePositive, negative.length) : null,
          reviewedFalsePositiveRate: fraction(falsePositive, negative.length),
        },
      ];
    })
  );
}

function loadDatasets(config) {
  const datasets = config.datasets.map(({ name, directory }) => ({
    name,
    predictions: read(path.join(directory, 'predictions.json')),
    manifest: read(path.join(directory, 'manifest.json')),
  }));
  const digests = new Set(datasets.map((dataset) => dataset.manifest.portableNotebookDigest));
  if (digests.size !== 1 || digests.has(undefined))
    throw new Error('All datasets must describe the same notebook snapshot.');
  return datasets;
}

/** Every detected pair and hypothesis variant is included; predictions are hidden from the judge. */
function prepareReview(datasets, notebookRoot) {
  const cases = new Map();
  const references = [];
  const documents = {};
  const names = new Set();
  for (const dataset of datasets) {
    if (!dataset.name || names.has(dataset.name)) throw new Error('Dataset names must be unique.');
    names.add(dataset.name);
    if (dataset.manifest && dataset.manifest.observations !== dataset.predictions.length)
      throw new Error('The dataset does not contain every observation: ' + dataset.name);
    dataset.predictions.forEach(({ observation: item, validation }, index) => {
      if (!item || !validation?.evidence || !validation.hypothesis)
        throw new Error('Missing observation or validation input.');
      const source = {
        noteTitle: item.noteTitle,
        section: item.section,
        sectionPath: item.sectionPath || [],
        origin: item.origin,
        entity1: item.source,
        entity2: item.target,
        evidence: item.evidence,
        template: item.template,
        direction: item.direction,
        schema: item.schema,
      };
      if (notebookRoot && !documents[item.noteTitle]) {
        const root = path.resolve(notebookRoot);
        const file = path.resolve(root, item.noteTitle + '.md');
        if (!file.startsWith(root + path.sep))
          throw new Error('Source note escapes notebook root.');
        const markdown = fs.readFileSync(file, 'utf8');
        documents[item.noteTitle] = {
          file,
          sha256: createHash('sha256').update(markdown).digest('hex'),
          markdown,
        };
      }
      const observationId = hash([
        source.noteTitle,
        source.sectionPath,
        source.section,
        source.origin,
        source.entity1,
        source.entity2,
        source.evidence,
        source.template,
        source.direction,
      ]);
      const inputHash = hash([validation.evidence, validation.hypothesis]);
      const semanticApplicable =
        !validation.verification || validation.verification.kind === 'semantic';
      const id = hash([
        observationId,
        inputHash,
        ...(source.schema?.location ? [source.schema] : []),
        semanticApplicable,
      ]);
      const content = {
        observationId,
        source,
        premise: validation.evidence,
        hypothesis: validation.hypothesis,
        semanticApplicable,
        sourceDocumentHash: documents[item.noteTitle]?.sha256 || null,
      };
      if (!cases.has(id)) cases.set(id, { id, contentHash: hash(content), ...content });
      else if (cases.get(id).contentHash !== hash(content))
        throw new Error('Conflicting source context for the same observation.');
      references.push({ dataset: dataset.name, index, observationId, caseId: id });
    });
  }
  const values = [...cases.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: 'assistant-source-review-v1',
    notebookDigest: datasets[0]?.manifest?.portableNotebookDigest || null,
    packetHash: hash(values.map(({ id, contentHash }) => [id, contentHash])),
    judge: 'assistant',
    instructions: [
      'Read the source note, section, entity pair and hypothesis directly. Do not use model predictions as gold.',
      'Judge NLI meaning from the exported premise alone; use the original note to audit extraction and relationship context, never to supply missing facts to the NLI premise.',
      'Judge meaning and pair validity separately. A copied sentence does not prove that its two selected words have a direct relationship.',
      'Preserve negation, condition, modality, time, direction and record roles. Do not infer completion from plans or checkboxes.',
      'Neutral means the source neither entails nor contradicts the hypothesis. Absence of an entity is not automatically contradiction.',
      'For ambiguous or non-assertion sources, use a null semantic label and explain the relation judgment. Model uncertainty is not a gold class.',
      'Enter an explanation and exact source quotation for each reviewed case. Leave unread cases absent from judgments.',
      'Review every case, including observations removed by a compared optimization. No sample limit applies.',
    ],
    documents,
    cases: values,
    references,
  };
}

/** Completed judgments require assistant authorship, evidence and the exact source hash. */
function checkedJudgments(packet, review) {
  if (review.packetHash !== packet.packetHash) throw new Error('Review packet hash mismatch.');
  for (const document of Object.values(packet.documents))
    if (createHash('sha256').update(document.markdown).digest('hex') !== document.sha256)
      throw new Error('The archived source document changed.');
  for (const { id, contentHash, ...content } of packet.cases)
    if (
      hash(content) !== contentHash ||
      content.sourceDocumentHash !== (packet.documents[content.source.noteTitle]?.sha256 || null)
    )
      throw new Error('The review case changed after export: ' + id);
  if (hash(packet.cases.map(({ id, contentHash }) => [id, contentHash])) !== packet.packetHash)
    throw new Error('The review packet contents changed.');
  const cases = new Map(packet.cases.map((row) => [row.id, row]));
  const judgments = new Map();
  for (const row of review.judgments) {
    const source = cases.get(row.id);
    if (!source || row.contentHash !== source.contentHash)
      throw new Error('Unknown or stale source judgment: ' + row.id);
    if (judgments.has(row.id)) throw new Error('Duplicate source judgment: ' + row.id);
    if (
      row.reviewer !== 'assistant' ||
      !row.reviewedAt ||
      !Number.isFinite(Date.parse(row.reviewedAt)) ||
      !sourceClarities.includes(row.sourceClarity) ||
      !relationJudgments.includes(row.relationJudgment) ||
      !row.reason?.trim() ||
      (row.sourceClarity === 'clear'
        ? !semanticLabels.includes(row.expectedLabel)
        : row.expectedLabel !== null) ||
      (row.sourceClarity === 'non-assertion' && row.relationJudgment === 'valid') ||
      (row.sourceClarity === 'not-applicable' && source.semanticApplicable !== false)
    )
      throw new Error('Incomplete assistant judgment: ' + row.id);
    const document = packet.documents[source.source.noteTitle]?.markdown || '';
    if (
      !Array.isArray(row.evidenceQuotes) ||
      !row.evidenceQuotes.length ||
      row.evidenceQuotes.some(
        (quote) =>
          typeof quote !== 'string' ||
          !quote.trim() ||
          (!source.premise.includes(quote) && !document.includes(quote))
      )
    )
      throw new Error('A source quotation does not match the reviewed source: ' + row.id);
    judgments.set(row.id, row);
  }
  return judgments;
}

/** Compare saved application predictions with direct judgments, without any judge-model calls. */
function reportReview(datasets, packet, review) {
  const fresh = prepareReview(datasets);
  const signatures = (value) => value.references.map((row) => [row.dataset, row.index, row.caseId]);
  if (hash(signatures(fresh)) !== hash(signatures(packet)))
    throw new Error('Saved predictions do not match the review packet.');
  const sources = (value) =>
    value.cases.map(({ id, source, premise, hypothesis }) => [id, source, premise, hypothesis]);
  if (hash(sources(fresh)) !== hash(sources(packet)))
    throw new Error('Saved source context does not match the review packet.');
  const judgments = checkedJudgments(packet, review);
  const knownValid = new Set(
    packet.cases
      .filter((row) => {
        const judgment = judgments.get(row.id);
        return validSupport(judgment);
      })
      .map((row) => row.observationId)
  );
  const references = new Map(packet.references.map((row) => [row.dataset + ':' + row.index, row]));
  const caseHashes = new Map(packet.cases.map((row) => [row.id, row.contentHash]));
  const allObservations = new Set(packet.references.map((row) => row.observationId));
  const fullyReviewed = new Set(
    [...allObservations].filter((id) =>
      packet.references
        .filter((row) => row.observationId === id)
        .every((row) => judgments.has(row.caseId))
    )
  );
  return {
    judge: 'assistant',
    evaluationModelCalls: 0,
    downloadedJudgeModels: 0,
    notebookDigest: packet.notebookDigest,
    cases: packet.cases.length,
    reviewedCases: judgments.size,
    pendingCases: packet.cases.length - judgments.size,
    observations: allObservations.size,
    reviewedObservations: fullyReviewed.size,
    pendingObservations: allObservations.size - fullyReviewed.size,
    status: judgments.size === packet.cases.length ? 'complete' : 'pending-review',
    llmSemanticLabels: countBy([...judgments.values()].map(truthLabel)),
    llmRelationJudgments: countBy([...judgments.values()].map((row) => row.relationJudgment)),
    datasets: datasets.map((dataset) => {
      const rows = dataset.predictions.map((prediction, index) => ({
        ...prediction,
        caseId: references.get(dataset.name + ':' + index)?.caseId,
        observationId: references.get(dataset.name + ':' + index)?.observationId,
        judgment: judgments.get(references.get(dataset.name + ':' + index)?.caseId),
      }));
      const reviewed = rows.filter((row) => row.judgment);
      const accepted = reviewed.filter((row) => row.validation.verdict === 'supported');
      const valid = reviewed.filter((row) => validSupport(row.judgment));
      const semanticRows = rows.filter(
        (row) => !row.validation.verification || row.validation.verification.kind === 'semantic'
      );
      const semanticComplete = semanticRows.every((row) => row.judgment);
      const meaning = semanticRows.filter(
        (row) => row.judgment && row.judgment.expectedLabel !== null
      );
      const outputOf = (row) => row.validation.semantic?.verdict || 'unverified';
      const decided = meaning.filter((row) => semanticLabels.includes(outputOf(row)));
      const incorrect = decided.filter((row) => outputOf(row) !== row.judgment.expectedLabel);
      const invalidAccepted = accepted.filter(
        (row) =>
          (row.judgment.expectedLabel !== null && row.judgment.expectedLabel !== 'supported') ||
          ['cooccurrence', 'parse-error'].includes(row.judgment.relationJudgment)
      );
      const unresolvedAccepted = accepted.filter(
        (row) =>
          !invalidAccepted.includes(row) &&
          ((!validSupport(row.judgment) && row.judgment.expectedLabel === null) ||
            row.judgment.relationJudgment === 'insufficient')
      );
      const definiteAccepted = accepted.length - unresolvedAccepted.length;
      const heldValid = valid.filter((row) => row.validation.verdict !== 'supported');
      const acceptedValid = accepted.filter((row) => validSupport(row.judgment));
      const acceptedValidIds = new Set(acceptedValid.map((row) => row.observationId));
      const decidedRelations = reviewed.filter((row) =>
        semanticLabels.includes(row.validation.verdict)
      );
      const confirmedDecisions = decidedRelations.filter(
        (row) =>
          row.validation.verdict === expectedDecision(row.judgment) &&
          (row.validation.verdict !== 'supported' || row.judgment.relationJudgment === 'valid')
      );
      const confusion = Object.fromEntries(
        semanticLabels.map((gold) => [
          gold,
          countBy(meaning.filter((row) => row.judgment.expectedLabel === gold).map(outputOf)),
        ])
      );
      const semanticByVerdict = verdictMetrics(semanticRows, outputOf);
      const relationshipByVerdict = verdictMetrics(rows, (row) => row.validation.verdict, true);
      return {
        name: dataset.name,
        evaluationIdentity: {
          population: hash([
            dataset.manifest?.portableNotebookDigest || dataset.manifest?.notesDigest || null,
            rows
              .map((row) => [row.caseId, caseHashes.get(row.caseId)])
              .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
          ]),
          unresolvedDecisions: hash(
            rows
              .filter((row) => {
                if (!row.judgment) return false;
                return semanticLabels.includes(row.validation.verdict)
                  ? classMembership(row.judgment, row.validation.verdict, true) === null
                  : abstentionStatus(row.judgment, true) === 'unresolved';
              })
              .map((row) => [
                row.caseId,
                semanticLabels.includes(row.validation.verdict) ? row.validation.verdict : 'held',
              ])
              .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
          ),
        },
        observations: rows.length,
        reviewed: reviewed.length,
        pending: rows.length - reviewed.length,
        sourceJudgments: countBy(reviewed.map((row) => row.judgment.relationJudgment)),
        candidatePreservation: {
          knownValidInUnion: knownValid.size,
          retainedKnownValid: [...knownValid].filter((id) =>
            packet.references.some(
              (row) => row.dataset === dataset.name && row.observationId === id
            )
          ).length,
          missingKnownValid: [...knownValid].filter(
            (id) =>
              !packet.references.some(
                (row) => row.dataset === dataset.name && row.observationId === id
              )
          ).length,
          note: 'Only assistant-reviewed valid claims in the union are counted; removed claims are not silently excluded.',
        },
        semantic: {
          notApplicable: rows.length - semanticRows.length,
          reviewed: meaning.length,
          decided: decided.length,
          unverified: meaning.filter((row) => outputOf(row) === 'unverified').length,
          abstained: meaning.filter((row) => outputOf(row) === 'uncertain').length,
          incorrect: incorrect.length,
          decisionErrorRate: semanticComplete ? fraction(incorrect.length, decided.length) : null,
          reviewedDecisionErrorRate: fraction(incorrect.length, decided.length),
          scope: semanticComplete ? 'complete-census' : 'reviewed-cases-only',
          coverage: fraction(decided.length, meaning.length),
          confusion,
          byVerdict: semanticByVerdict,
          overallError: overallErrors(semanticByVerdict),
        },
        relationship: {
          accepted: accepted.length,
          confirmedAccepted: acceptedValid.length,
          falseSupport: invalidAccepted.length,
          unresolvedAccepted: unresolvedAccepted.length,
          // Every accepted result remains in this denominator, including unresolved sources.
          confirmedPrecision:
            reviewed.length === rows.length
              ? fraction(acceptedValid.length, accepted.length)
              : null,
          precision:
            reviewed.length === rows.length
              ? fraction(definiteAccepted - invalidAccepted.length, definiteAccepted)
              : null,
          reviewedPrecision: fraction(definiteAccepted - invalidAccepted.length, definiteAccepted),
          heldValid: heldValid.length,
          validRetention:
            reviewed.length === rows.length
              ? fraction(valid.length - heldValid.length, valid.length)
              : null,
          reviewedValidRetention: fraction(valid.length - heldValid.length, valid.length),
          // Removed candidates and duplicate observations cannot inflate whole-corpus recovery.
          unionValidRetention:
            judgments.size === packet.cases.length
              ? fraction(acceptedValidIds.size, knownValid.size)
              : null,
          decided: decidedRelations.length,
          confirmedDecisions: confirmedDecisions.length,
          decisionAccuracy:
            reviewed.length === rows.length
              ? fraction(confirmedDecisions.length, decidedRelations.length)
              : null,
          abstained: reviewed.filter((row) => row.validation.verdict === 'uncertain').length,
          unverified: reviewed.filter((row) => row.validation.verdict === 'unverified').length,
          decisionCoverage:
            reviewed.length === rows.length ? fraction(decidedRelations.length, rows.length) : null,
          byVerdict: relationshipByVerdict,
          overallError: overallErrors(relationshipByVerdict),
          note: 'Unreviewed and unresolved cases are not silently correct. No definite accepted relations means precision is null.',
        },
      };
    }),
  };
}

/** Compare final errors, including omissions, only for the same complete saved claim population. */
function relationshipErrorComparison(before, after) {
  const baseline = before.relationship.overallError,
    current = after.relationship.overallError;
  const comparable =
    !!before.evaluationIdentity?.population &&
    before.evaluationIdentity.population === after.evaluationIdentity?.population;
  const result = {
    status: 'changed-population',
    comparable,
    baselineConfirmedErrors: baseline.confirmedErrors,
    currentConfirmedErrors: current.confirmedErrors,
    confirmedErrorReductionRate: null,
    errorReductionRate: null,
    errorReductionRateBounds: null,
  };
  if (!comparable) return result;
  if (!baseline.confirmedErrors) {
    result.status = baseline.unresolved ? 'unresolved-baseline' : 'zero-baseline-errors';
    return result;
  }
  result.status = 'comparable';
  const delta = baseline.confirmedErrors - current.confirmedErrors;
  result.confirmedErrorReductionRate = delta / baseline.confirmedErrors;
  if (
    before.evaluationIdentity.unresolvedDecisions === after.evaluationIdentity.unresolvedDecisions
  ) {
    // Unchanged unresolved predictions have the same unknown error contribution on both sides.
    result.errorReductionRateBounds = [
      delta / baseline.confirmedErrors,
      delta / (baseline.confirmedErrors + baseline.unresolved),
    ].sort((a, b) => a - b);
  } else {
    result.errorReductionRateBounds = [
      1 - (current.confirmedErrors + current.unresolved) / baseline.confirmedErrors,
      1 - current.confirmedErrors / (baseline.confirmedErrors + baseline.unresolved),
    ];
  }
  const [lower, upper] = result.errorReductionRateBounds;
  if (lower === upper) result.errorReductionRate = lower;
  return result;
}

/** Both error risk and whole-corpus recovery must pass; abstention is never a correct decision. */
function assessComparison(report, beforeName, afterName, targets) {
  for (const key of [
    'minPrecision',
    'minDecisionAccuracy',
    'minValidRetention',
    'minDecisionCoverage',
  ])
    if (!Number.isFinite(targets?.[key]) || targets[key] < 0 || targets[key] > 1)
      throw new Error(
        'Explicit precision, decision-accuracy, valid-retention and decision-coverage targets are required.'
      );
  if (
    targets.minErrorReductionRate !== undefined &&
    (!Number.isFinite(targets.minErrorReductionRate) ||
      targets.minErrorReductionRate < 0 ||
      targets.minErrorReductionRate > 1)
  )
    throw new Error('The final error-reduction target must be between zero and one.');
  const before = report.datasets.find((dataset) => dataset.name === beforeName);
  const after = report.datasets.find((dataset) => dataset.name === afterName);
  if (!before || !after || before === after) throw new Error('Select two different datasets.');
  if (report.status !== 'complete')
    return { status: 'pending-review', passed: false, errorReductionRate: null };
  const finalErrors = relationshipErrorComparison(before, after);
  const criteria = {
    precision:
      after.relationship.confirmedPrecision !== null &&
      after.relationship.confirmedPrecision >= targets.minPrecision,
    decisionAccuracy:
      after.relationship.decisionAccuracy !== null &&
      after.relationship.decisionAccuracy >= targets.minDecisionAccuracy,
    validRetention:
      after.relationship.unionValidRetention !== null &&
      after.relationship.unionValidRetention >= targets.minValidRetention,
    decisionCoverage:
      after.relationship.decisionCoverage !== null &&
      after.relationship.decisionCoverage >= targets.minDecisionCoverage,
    noPrecisionRegression:
      before.relationship.confirmedPrecision === null ||
      (after.relationship.confirmedPrecision !== null &&
        after.relationship.confirmedPrecision >= before.relationship.confirmedPrecision),
    noDecisionAccuracyRegression:
      before.relationship.decisionAccuracy === null ||
      (after.relationship.decisionAccuracy !== null &&
        after.relationship.decisionAccuracy >= before.relationship.decisionAccuracy),
    noSemanticErrorIncrease:
      before.semantic.decided === 0
        ? after.semantic.decided === 0 || after.semantic.decisionErrorRate === 0
        : after.semantic.decided > 0 &&
          after.semantic.decisionErrorRate <= before.semantic.decisionErrorRate,
    noSemanticCoverageRegression:
      before.semantic.decided === 0 || after.semantic.coverage >= before.semantic.coverage,
    noRecoveryRegression:
      before.relationship.unionValidRetention !== null &&
      after.relationship.unionValidRetention !== null &&
      after.relationship.unionValidRetention >= before.relationship.unionValidRetention,
  };
  if (targets.minErrorReductionRate !== undefined)
    criteria.errorReduction =
      finalErrors.errorReductionRateBounds !== null &&
      finalErrors.errorReductionRateBounds[0] >= targets.minErrorReductionRate;
  const comparableMeaning =
    before.semantic.decided > 0 &&
    after.semantic.decided > 0 &&
    after.semantic.coverage >= before.semantic.coverage;
  return {
    status: Object.values(criteria).every(Boolean) ? 'targets-met' : 'targets-not-met',
    passed: Object.values(criteria).every(Boolean),
    criteria,
    targets,
    errorReductionRate: finalErrors.errorReductionRate,
    errorReductionRateBounds: finalErrors.errorReductionRateBounds,
    finalErrors,
    // Meaning-only errors remain separate from the application's final relationship judgments.
    semanticErrorReductionRate:
      comparableMeaning && before.semantic.decisionErrorRate > 0
        ? 1 - after.semantic.decisionErrorRate / before.semantic.decisionErrorRate
        : null,
    falseSupportReductionRate:
      before.relationship.falseSupport > 0 && criteria.noRecoveryRegression
        ? 1 - after.relationship.falseSupport / before.relationship.falseSupport
        : null,
    comparableMeaning,
  };
}

function main() {
  const [command, configFile] = process.argv.slice(2);
  if (!['prepare', 'report', 'calibrate'].includes(command) || !configFile)
    throw new Error(
      'Usage: census.cjs prepare|report|calibrate <config.json>. Judgments are authored by the assistant.'
    );
  const config = read(configFile);
  const datasets = loadDatasets(config);
  const output = path.resolve(config.output);
  const packetFile = path.join(output, 'review-packet.json');
  const reviewFile = path.join(output, 'assistant-judgments.json');
  if (command === 'prepare') {
    const packet = prepareReview(datasets, config.notebookRoot);
    if (fs.existsSync(reviewFile) && read(reviewFile).packetHash !== packet.packetHash)
      throw new Error('Sources changed. Use a new output folder to preserve existing judgments.');
    write(packetFile, packet);
    if (!fs.existsSync(reviewFile))
      write(reviewFile, { packetHash: packet.packetHash, judgments: [] });
    process.stdout.write(
      JSON.stringify({
        cases: packet.cases.length,
        observations: new Set(packet.references.map((row) => row.observationId)).size,
        judge: 'assistant',
        evaluationModelCalls: 0,
      }) + '\n'
    );
  } else if (command === 'calibrate') {
    const result = require('./review-calibration.cjs').calibrateReviewedPacket(
      datasets,
      read(packetFile),
      read(reviewFile),
      config.calibration
    );
    write(path.join(output, 'calibration-summary.json'), result);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const result = reportReview(datasets, read(packetFile), read(reviewFile));
    write(path.join(output, 'summary.json'), result);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}
module.exports = { prepareReview, checkedJudgments, reportReview, assessComparison };
if (require.main === module)
  try {
    main();
  } catch (error) {
    process.stderr.write(error.stack + '\n');
    process.exitCode = 1;
  }
