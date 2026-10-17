/** Read historical relationship reviews. New source review/calibration goes through census.cjs. */
const fs = require('node:fs');
const path = require('node:path');
const { moduleLoader } = require('./run-corpus.cjs');

function main() {
  const [command, input, predictionsFile] = process.argv.slice(2);
  if (command !== 'report' || !input)
    throw new Error(
      'Use census.cjs prepare/report/calibrate for the complete assistant source review. Historical reports: evaluate.cjs report <review.json> [predictions.json]'
    );
  const evaluation = moduleLoader()(path.join(__dirname, 'evaluation.ts'));
  let rows = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (predictionsFile) {
    const supplied = JSON.parse(fs.readFileSync(predictionsFile, 'utf8'));
    const predictions = Array.isArray(supplied)
      ? supplied
      : supplied.candidates.flatMap((candidate) =>
          candidate.observations.map((observation, index) => ({
            observation,
            validation: candidate.validations[index],
          }))
        );
    rows = evaluation.applyRelationPredictions(rows, predictions);
  }
  process.stdout.write(
    JSON.stringify(
      {
        scope: 'historical-reviewed-cases-only',
        all: evaluation.evaluateRelationReviews(rows),
        holdout: evaluation.evaluateRelationReviews(rows.filter((row) => row.split === 'holdout')),
      },
      null,
      2
    ) + '\n'
  );
}
if (require.main === module)
  try {
    main();
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
