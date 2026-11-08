const { existsSync, readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

module.exports = (relativePath, dependencies = {}) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (request) => {
    if (Object.hasOwn(dependencies, request)) return dependencies[request];
    if (request.startsWith('.')) {
      const target = ['.ts', '.tsx']
        .map((extension) => path.resolve(path.dirname(filename), request + extension))
        .find(existsSync);
      if (target)
        return module.exports(path.relative(path.resolve(__dirname, '..'), target), dependencies);
    }
    return originalRequire(request);
  };
  loaded._compile(
    ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    filename
  );
  return loaded.exports;
};
