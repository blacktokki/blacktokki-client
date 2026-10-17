/** Export every candidate for direct assistant review, without loading or downloading models. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const digest = (text) => createHash('sha256').update(text).digest('hex');
const write = (filename, value) =>
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');

function moduleLoader(dependencies = {}) {
  const cache = new Map();
  const sources = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const entry = new Module(filename, module);
    entry.filename = filename;
    entry.paths = Module._nodeModulePaths(path.dirname(filename));
    const original = entry.require.bind(entry);
    entry.require = (request) => {
      if (request === '@blacktokki/editor') {
        const root = path.dirname(require.resolve('@blacktokki/editor/package.json'));
        const editor = load(path.join(root, 'src/lib/markdown.ts'));
        return { toMarkdown: editor.parser, toToken: editor.toToken, ...dependencies[request] };
      }
      if (Object.hasOwn(dependencies, request)) return dependencies[request];
      const local = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), request + ext))
        .find(fs.existsSync);
      return request.startsWith('.') && local ? load(local) : original(request);
    };
    cache.set(filename, entry);
    const source = fs.readFileSync(filename, 'utf8');
    sources.set(filename, digest(source));
    entry._compile(
      ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      filename
    );
    return entry.exports;
  }
  load.sources = sources;
  return load;
}
function notebookFiles(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name.startsWith('.')) return [];
      const filename = path.join(root, entry.name);
      return entry.isDirectory()
        ? notebookFiles(filename)
        : /\.md$/i.test(filename)
        ? [filename]
        : [];
    })
    .sort();
}
async function main() {
  const [rootArg, outputArg, featureArg, mode = 'extract', configFile] = process.argv.slice(2);
  if (!rootArg || !outputArg)
    throw new Error(
      'Usage: run-corpus.cjs <notebook> <output> [feature-source] [extract] [config.json]'
    );
  if (mode !== 'extract')
    throw new Error('Only candidate extraction is supported. Use census.cjs for assistant review.');
  const config = configFile ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const runner = config.runner ?? 'optimized';
  if (!['app', 'optimized'].includes(runner)) throw new Error('Unknown analysis runner: ' + runner);
  const root = path.resolve(rootArg),
    output = path.resolve(outputArg);
  const feature = path.resolve(featureArg || path.join(__dirname, '..'));
  fs.mkdirSync(output, { recursive: true });
  const dependencies = { '@react-native-async-storage/async-storage': {} };
  const load = moduleLoader(dependencies);
  const editorRoot = path.dirname(require.resolve('@blacktokki/editor/package.json'));
  const editor = load(path.join(editorRoot, 'src/lib/markdown.ts'));
  const files = notebookFiles(root),
    texts = files.map((file) => fs.readFileSync(file, 'utf8'));
  const notes = files.map((file, i) => ({
    title: path.relative(root, file).split(path.sep).join('/').replace(/\.md$/i, ''),
    description: editor.renderer(texts[i]),
  }));
  const started = performance.now();
  const syntaxPath = path.join(feature, 'optimizer/syntax.ts');
  const stage = config.stage ?? 0;
  if (fs.existsSync(syntaxPath)) {
    const syntax = load(syntaxPath);
    syntax.configureRelationOptimization({ stage });
  }
  const discovery = load(path.join(feature, 'relationDiscovery.ts'));
  const memory = discovery.createRelationDiscoveryMemory();
  const result = await discovery.discoverInductiveRelations(notes, {
    memory,
    maxMergeNliChecks: 0,
    runtime: {
      embed: async () => [],
      entailment: async () => {
        throw new Error('Candidate export must not run model inference.');
      },
    },
  });
  const validation = load(path.join(feature, 'optimizer/validation.ts'));
  if (runner === 'optimized' && validation.prepareResultValidations)
    validation.prepareResultValidations(result, validation.relationPolicy(config.policy));
  const diagnostics = [];
  const claimsPath = path.join(feature, 'optimizer/claims.ts');
  if (fs.existsSync(claimsPath)) {
    const claims = load(claimsPath);
    for (const [noteTitle, parsed] of memory.notes)
      for (const item of claims.deferredRelationBlocks(parsed.blocks))
        diagnostics.push({ noteTitle, ...item });
  }
  const predictions = result.candidates.flatMap((candidate) =>
    candidate.observations.map((observation, i) => ({
      observation,
      validation: candidate.validations[i],
      candidateId: candidate.id,
    }))
  );
  write(path.join(output, 'predictions.json'), predictions);
  write(path.join(output, 'result.json'), result);
  const claimModule = path.join(feature, 'optimizer/claims.ts');
  write(
    path.join(output, 'deferred-blocks.json'),
    fs.existsSync(claimModule) && load(claimModule).deferredRelationCorpus
      ? load(claimModule).deferredRelationCorpus()
      : diagnostics
  );
  const manifest = {
    createdAt: new Date().toISOString(),
    mode,
    runner,
    stage,
    syntaxParser: 'unavailable',
    notebook: root,
    notebookDigest: digest(
      files.map((file, i) => path.relative(root, file) + '\0' + texts[i]).join('\0')
    ),
    portableNotebookDigest: digest(notes.map((note, i) => note.title + '\0' + texts[i]).join('\0')),
    notes: notes.length,
    entities: result.entityCount,
    patterns: result.inputPatterns?.length,
    relationGroups: result.candidates.length,
    observations: predictions.length,
    byOrigin: Object.fromEntries(
      ['table', 'field', 'sentence'].map((origin) => [
        origin,
        predictions.filter((p) => p.observation.origin === origin).length,
      ])
    ),
    policy: load(path.join(feature, 'optimizer/validation.ts')).relationPolicy(config.policy),
    verdicts: Object.fromEntries(
      ['supported', 'contradicted', 'neutral', 'uncertain', 'unverified'].map((verdict) => [
        verdict,
        predictions.filter((p) => p.validation.verdict === verdict).length,
      ])
    ),
    nliStats: result.nliStats,
    patternChanges: result.patternChanges,
    cacheRestored: result.cacheRestored ?? null,
    validationProgress: result.validationProgress,
    elapsedSeconds: (performance.now() - started) / 1000,
    modelsExecuted: false,
    sourceInputs: [...load.sources].map(([filename, sha256]) => ({
      file: path.relative(process.cwd(), filename),
      sha256,
      unchangedAtCompletion: digest(fs.readFileSync(filename, 'utf8')) === sha256,
    })),
  };
  write(path.join(output, 'manifest.json'), manifest);
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}
module.exports = { moduleLoader, notebookFiles };
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(error.stack + '\n');
    process.exitCode = 1;
  });
