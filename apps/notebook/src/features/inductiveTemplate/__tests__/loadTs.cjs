const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

module.exports = (relativePath, dependencies = {}) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (request) =>
    Object.hasOwn(dependencies, request) ? dependencies[request] : originalRequire(request);
  loaded._compile(
    ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename
  );
  return loaded.exports;
};
