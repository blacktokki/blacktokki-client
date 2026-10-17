const babel = require('@babel/core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const loadTs = require('./loadTs.cjs');

const root = path.resolve(__dirname, '../../../../../../..');
const filename = path.join(root, 'node_modules/@huggingface/transformers/dist/transformers.web.js');
const source = fs.readFileSync(filename, 'utf8');

test('graph entry points defer one shared runtime and retain props and component identity', async () => {
  const names = [
    'KnowledgeGraphScreen',
    'RelationAnalysisScreen',
    'GraphSearchSection',
    'KnowledgeGraphButton',
    'RelationAnalysisBackground',
  ];
  const runtime = Object.fromEntries(names.map((name) => [name, () => null]));
  const LoadingView = () => null;
  let runtimeLoads = 0;
  const dependencies = {
    react: {
      Suspense: 'Suspense',
      lazy: (load) => ({ load }),
      createElement: (type, props, ...children) => ({
        type,
        props: { ...props, children: children[0] },
      }),
    },
    '../../components/LoadingView': { __esModule: true, default: LoadingView },
  };
  Object.defineProperty(dependencies, './index', {
    get() {
      runtimeLoads++;
      return runtime;
    },
  });
  const entry = loadTs('../LazyKnowledgeGraph.tsx', dependencies);
  assert.equal(runtimeLoads, 0, 'registering a disabled feature must not load its runtime');

  const trees = names.map((name, index) => {
    const props = name === 'GraphSearchSection' ? { query: '고양이 관계' } : {};
    const tree = entry[name](props);
    assert.equal(tree.type, 'Suspense');
    assert.deepEqual(tree.props.children.props, { ...props, children: undefined });
    assert.equal(tree.props.fallback?.type ?? null, index < 3 ? LoadingView : null);
    assert.equal(entry[name](props).props.children.type, tree.props.children.type);
    return tree;
  });
  assert.equal(runtimeLoads, 0, 'only mounting a lazy child should request the runtime');
  const loaded = await Promise.all(trees.map((tree) => tree.props.children.type.load()));
  assert.equal(runtimeLoads, 1, 'concurrent screens and background share the same import');
  loaded.forEach((module, index) => assert.equal(module.default, runtime[names[index]]));
  await trees[2].props.children.type.load();
  assert.equal(runtimeLoads, 1, 'revisiting search must reuse the loaded runtime');
});

for (const isDev of [true, false]) {
  test(`Transformers.js web entry executes as a Metro script in ${
    isDev ? 'development' : 'production'
  }`, () => {
    const code = babel.transformSync(source, {
      filename,
      configFile: path.join(root, 'apps/notebook/babel.config.js'),
      babelrc: false,
      caller: { name: 'metro', bundler: 'metro', platform: 'web', isDev, supportsStaticESM: false },
    }).code;
    const exported = { exports: {} };
    // Use the same ONNX UMD entry as metro.config.js; no model weights or note contents are loaded.
    new vm.Script(code, { filename }).runInNewContext(
      {
        module: exported,
        exports: exported.exports,
        require: (name) =>
          name === 'onnxruntime-web'
            ? require(path.join(root, 'node_modules/onnxruntime-web/dist/ort.all.js'))
            : require(name),
        window: {},
        navigator: {},
        console,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
      },
      { timeout: 10000 }
    );
    assert.equal(typeof exported.exports.pipeline, 'function');
    assert.equal(
      exported.exports.env.version,
      require(path.join(root, 'node_modules/@huggingface/transformers/package.json')).version
    );
  });
}
