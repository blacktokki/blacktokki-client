/** Run independent regression data against the installed browser's DOM and IndexedDB. */
const { spawn } = require('node:child_process');
const { existsSync, readFileSync, mkdtempSync, rmSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const browserPath = [
  process.env.PROGRAMFILES &&
    path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] &&
    path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
].find((filename) => filename && existsSync(filename));
const feature = path.resolve(__dirname, '../..');
const root = path.resolve(feature, '../../../../../..');

function bundle(entries) {
  const modules = {};
  const register = (filename) => {
    const id = path.relative(root, filename).replaceAll('\\', '/');
    if (modules[id]) return id;
    if (filename.endsWith(path.join('hooks', 'useNotebookTheme.ts'))) {
      modules[id] = { code: 'module.exports = {}', imports: {} };
      return id;
    }
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;
    const imports = {};
    modules[id] = { code, imports };
    for (const [, request] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
      if (!request.startsWith('.')) continue;
      const target = ['.ts', '.tsx']
        .map((extension) => path.resolve(path.dirname(filename), request + extension))
        .find(existsSync);
      if (target) imports[request] = register(target);
    }
    return id;
  };
  const entryIds = entries.map((entry) => register(path.resolve(feature, entry)));
  const editor = register(path.join(root, 'packages/blacktokki-editor/src/lib/dom.ts'));
  const renderer = register(path.join(root, 'packages/blacktokki-editor/src/lib/markdown.ts'));
  return `
    const sources = ${JSON.stringify(modules)};
    const cache = {};
    const external = {
      'markdown-it': markdownit, 'markdown-it-anchor': markdownItAnchor,
      'turndown': TurndownService, 'turndown-plugin-gfm': turndownPluginGfm,
      'react-native': {StyleSheet:{create: value => value}},
      'react-native-vector-icons/FontAwesome': {}, '@blacktokki/core': {},
    };
    function load(id) {
      if (cache[id]) return cache[id].exports;
      const module = cache[id] = {exports:{}};
      const source = sources[id];
      if (!source) throw new Error('Unsupported browser test module: ' + id);
      const require = name => {
        if (name === '@blacktokki/editor') {
          const markdown = load(${JSON.stringify(renderer)});
          return {...load(${JSON.stringify(
            editor
          )}), toMarkdown: markdown.parser, toToken: markdown.toToken, toHtml: markdown.renderer};
        }
        if (name in external) return external[name];
        if (source.imports[name]) return load(source.imports[name]);
        throw new Error('Unsupported browser test import: ' + name);
      };
      new Function('require','module','exports',source.code)(require,module,module.exports);
      return module.exports;
    }
    window.production = ${JSON.stringify(entryIds)}.map(load);
  `;
}

async function runBrowser(t, entries, script) {
  if (!browserPath) {
    t.skip('No installed Chromium browser');
    return;
  }
  const temp = mkdtempSync(path.join(os.tmpdir(), 'notebook-browser-regression-'));
  const scripts = [
    `window.browserErrors=[]; addEventListener('error',event=>browserErrors.push((event.error?.stack || event.message)+' at '+event.filename+':'+event.lineno+':'+event.colno));`,
    readFileSync(require.resolve('markdown-it/dist/markdown-it.js'), 'utf8'),
    readFileSync(
      path.join(path.dirname(require.resolve('turndown/package.json')), 'dist/turndown.js'),
      'utf8'
    ),
    readFileSync(
      path.join(
        path.dirname(require.resolve('markdown-it-anchor/package.json')),
        'dist/markdownItAnchor.umd.js'
      ),
      'utf8'
    ),
    readFileSync(
      path.join(
        path.dirname(require.resolve('turndown-plugin-gfm/package.json')),
        'dist/turndown-plugin-gfm.js'
      ),
      'utf8'
    ),
    bundle(entries),
    `window.regression = (async () => { if (browserErrors.length) throw new Error(browserErrors.join('; ')); ${script}})(); window.regression.catch(() => {});`,
  ];
  const html =
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    scripts.map((_, index) => '<script src="/script' + index + '.js"></script>').join('') +
    '</body></html>';
  const server = http.createServer((request, response) => {
    const match = /^\/script(\d+)\.js$/.exec(request.url);
    response.setHeader(
      'Content-Type',
      (match ? 'text/javascript' : 'text/html') + '; charset=utf-8'
    );
    response.end(match ? scripts[Number(match[1])] : html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      '--remote-debugging-port=0',
      '--user-data-dir=' + temp,
      'about:blank',
    ],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let browserError = '';
  child.stderr.on('data', (chunk) => {
    browserError = (browserError + chunk).slice(-2000);
  });
  let socket;
  const closed = new Promise((resolve) => child.once('close', resolve));
  t.after(async () => {
    socket?.close();
    child.kill();
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1000))]);
    await new Promise((resolve) => server.close(resolve));
    // Only remove the absolute directory created by mkdtemp under the OS temp directory.
    if (
      path.dirname(temp) === path.resolve(os.tmpdir()) &&
      path.basename(temp).startsWith('notebook-browser-regression-')
    )
      rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const endpoint = path.join(temp, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  while (!existsSync(endpoint)) {
    if (child.exitCode !== null)
      throw new Error('Browser exited: ' + child.exitCode + ' ' + browserError);
    if (Date.now() >= deadline) throw new Error('Browser debugging endpoint did not start');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const [port] = readFileSync(endpoint, 'utf8').split('\n');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    const task = pending.get(event.id);
    if (!task) return;
    pending.delete(event.id);
    if (event.error) task.reject(new Error(event.error.message));
    else task.resolve(event.result);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  const result = await call('Runtime.evaluate', {
    expression: `new Promise((resolve,reject) => { const poll = () => { if (window.regression) window.regression.then(resolve,reject); else setTimeout(poll,10); }; poll(); })`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

module.exports = { runBrowser, browserPath };
