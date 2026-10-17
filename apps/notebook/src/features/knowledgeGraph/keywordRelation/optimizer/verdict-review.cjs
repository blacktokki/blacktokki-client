/** Aggregate assistant source judgments against existing application predictions; never load a judge model. */
const fs = require('node:fs');
const path = require('node:path');
const { moduleLoader } = require('./run-corpus.cjs');
const load = moduleLoader();
const evaluation = load(path.join(__dirname, 'verdict-evaluation.ts'));
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
};

async function main() {
  const [command, input, output, optionsFile] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      'Usage: verdict-review.cjs report|compare <input.json> <output.json> [options.json]'
    );
  const config = optionsFile ? read(optionsFile) : {};
  let result;
  if (command === 'infer' || command === 'sample' || command === 'calibrate')
    throw new Error(
      'Evaluation uses the assistant-authored full source review. Use census.cjs prepare/report/calibrate; inference, sampling and unverified calibration were removed.'
    );
  const rows = read(input);
  if (command === 'report')
    result = evaluation.evaluateVerdicts(rows, config.nli, undefined, config.coverages);
  else if (command === 'compare') {
    if (!optionsFile)
      throw new Error('Comparison requires before/after policies, coverage and targets.');
    const before = config.beforePolicyFile ? read(config.beforePolicyFile).nli : config.before;
    const after = config.afterPolicyFile ? read(config.afterPolicyFile).nli : config.after;
    result = evaluation.compareVerdictPolicies(
      rows,
      before || {},
      after || {},
      config.coverage,
      config.targets
    );
  } else throw new Error('Unknown verdict review command.');
  write(output, result);
  process.stdout.write(JSON.stringify({ output, ...result }) + '\n');
}
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
