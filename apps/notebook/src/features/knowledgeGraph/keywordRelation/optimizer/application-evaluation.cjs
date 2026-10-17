/** Capture the actual application runner's final results in memory; never reclassify them here. */
const { createHash } = require('node:crypto');
const path = require('node:path');

const { moduleLoader } = require('./run-corpus.cjs');

function memoryStore() {
  const records = new Map();
  return {
    load: async (_scope, _version, ids) =>
      new Map(ids.filter((id) => records.has(id)).map((id) => [id, records.get(id)])),
    save: async (_scope, _version, entries) => {
      for (const [id, scores] of entries) records.set(id, scores);
    },
    prune: async (_scope, _version, ids) => {
      for (const id of records.keys()) if (!ids.has(id)) records.delete(id);
    },
  };
}

async function runApplicationEvaluation(notes, options, load = moduleLoader()) {
  if (!options?.scope) throw new Error('An explicit application evaluation scope is required.');
  const entrypoint = path.resolve(__dirname, '../relationAnalysis.ts');
  const engine = load(entrypoint);
  const result = await engine.runInductiveRelationAnalysis(notes, {
    ...options,
    store: options.store || memoryStore(),
  });
  const models = load(path.resolve(__dirname, '../relationModels.ts'));
  const predictions = result.candidates.flatMap((candidate) =>
    candidate.observations.map((observation, index) => ({
      observation,
      validation: candidate.validations[index],
    }))
  );
  return {
    name: options.scope,
    manifest: {
      runner: 'application',
      entrypoint,
      runtime: options.runtimeFactory ? 'injected-application-runtime' : 'application-default',
      notes: notes.length,
      notesDigest: createHash('sha256').update(JSON.stringify(notes)).digest('hex'),
      observations: predictions.length,
      finalized:
        !result.discoveryIncomplete &&
        result.validationProgress?.status === 'completed' &&
        result.validationProgress.completed === predictions.length &&
        result.validationProgress.failed === 0,
      validationProgress: result.validationProgress,
      discoveryIncomplete: !!result.discoveryIncomplete,
      models: models.RELATION_MODELS,
      dtypes: models.RELATION_MODEL_DTYPES,
      policy: load(path.resolve(__dirname, 'validation.ts')).relationPolicy(options.policy),
      sourceInputs: [...load.sources].map(([file, sha256]) => ({ file, sha256 })),
    },
    result,
    predictions,
  };
}

module.exports = { runApplicationEvaluation };
