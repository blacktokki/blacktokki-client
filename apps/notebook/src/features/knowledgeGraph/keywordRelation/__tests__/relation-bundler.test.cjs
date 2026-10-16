const babel = require('@babel/core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../../../../../..');
const filename = path.join(root, 'node_modules/@huggingface/transformers/dist/transformers.web.js');
const source = fs.readFileSync(filename, 'utf8');

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
