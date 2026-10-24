const { readFileSync, existsSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relativePath, dependencies = {}, internals = [], modules) {
  const filename = path.resolve(__dirname, '..', relativePath);
  if (modules?.has(filename)) return modules.get(filename);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (request) => {
    if (request === '@blacktokki/editor') {
      const root = path.dirname(require.resolve('@blacktokki/editor/package.json'));
      const editor = loadTs(
        path.relative(path.resolve(__dirname, '..'), path.join(root, 'src/lib/markdown.ts')),
        {},
        [],
        modules
      );
      return {
        toHtml: editor.renderer,
        toMarkdown: editor.parser,
        toToken: editor.toToken,
        ...dependencies[request],
      };
    }
    if (Object.hasOwn(dependencies, request)) return dependencies[request];
    const local = ['.ts', '.tsx']
      .map((extension) => path.resolve(path.dirname(filename), request + extension))
      .find(existsSync);
    if (request.startsWith('.') && local)
      return loadTs(path.relative(path.resolve(__dirname, '..'), local), dependencies, [], modules);
    return originalRequire(request);
  };
  // Existing algorithm regressions can inspect helpers without adding production exports.
  const source =
    readFileSync(filename, 'utf8') +
    (internals.length ? `\nexport { ${internals.join(', ')} };\n` : '');
  loaded._compile(
    ts.transpileModule(source, {
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
  modules?.set(filename, loaded.exports);
  return loaded.exports;
}

function keywordHarness(dependencies = {}) {
  const { extractKeywords } = loadTs('keyword/extractKeywords.ts', dependencies);
  const { collectKeywordRelations } = loadTs('keyword/collectKeywordRelations.ts', dependencies);
  const { collectKeywordTypes } = loadTs('keyword/collectKeywordTypes.ts', dependencies);
  const { createRelationDiscoveryMemory } = loadTs('keyword/keywordUtils.ts', dependencies);
  const { evaluateKeywordAssociations } = loadTs(
    'keyword/evaluateKeywordAssociations.ts',
    dependencies
  );
  return {
    createRelationDiscoveryMemory,
    discoverKeywordAssociations: async (notes, options = {}) => {
      const memory = options.memory || createRelationDiscoveryMemory();
      memory.stats = createRelationDiscoveryMemory().stats;
      const keywords = await extractKeywords(notes, { ...options, memory });
      const types = await collectKeywordTypes(keywords, options);
      const prepared = await collectKeywordRelations(types, options);
      return options.prepareOnly ? prepared.result : evaluateKeywordAssociations(prepared, options);
    },
    extractRelationEntities: async (notes, signal, onEntityProgress, memory) => {
      const keywords = await extractKeywords(notes, { signal, onEntityProgress, memory });
      const types = await collectKeywordTypes(keywords, { signal });
      return (await collectKeywordRelations(types, { signal })).result.entityExtraction;
    },
  };
}

function cacheHarness() {
  const values = new Map();
  const entries = {
    read: async (keys) => keys.map((key) => values.get(key) ?? null),
    write: async (rows) => rows.forEach(([key, value]) => values.set(key, value)),
  };
  const cache = loadTs('keywordRelationCache.ts');
  return {
    values,
    entries,
    dependencies: {
      './keywordRelationCache': {
        ...cache,
        KEYWORD_RELATION_CACHE: '@blacktokki:notebook:keyword_relation',
        keywordRelationEntries: entries,
        relationPatternCacheStore: cache.createRelationPatternCacheStore(entries),
      },
    },
  };
}

/** Minimal hook lifecycle: render, dependency changes, functional updates and unmount. */
function hookHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const same = (a, b) =>
    a && b && a.length === b.length && b.every((value, i) => Object.is(value, a[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: (calculate, dependencies) => {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies))
        slots[index] = { dependencies, value: calculate() };
      return slots[index].value;
    },
    useEffect: (effect, dependencies) => {
      const index = cursor++;
      if (same(slots[index]?.dependencies, dependencies)) return;
      const previous = slots[index];
      const current = { dependencies };
      slots[index] = current;
      effects.push(() => {
        previous?.cleanup?.();
        current.cleanup = effect();
      });
    },
  };
  react.useCallback = (callback, dependencies) => react.useMemo(() => callback, dependencies);
  let nextId = 0;
  react.useId = () => react.useRef(`test-${++nextId}`).current;
  return {
    react,
    render: (component) => {
      cursor = 0;
      const value = component();
      const pending = effects;
      effects = [];
      for (const effect of pending) effect();
      return value;
    },
    unmount: () => {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}

function resultFixture() {
  const entities = ['Orama', 'IndexedDB', 'React Native', 'Unconnected'].map((text) => ({
    text,
    type: 'KEYWORD',
    noteCount: 3,
    mentionCount: 5,
  }));
  const candidate = (id, pairs) => ({
    id,
    label: 'uses',
    template: '{{E1}} uses {{E2}}.',
    variants: [],
    noteSupport: 1,
    pairSupport: pairs.length,
    recurring: false,
    observations: pairs.map(([source, target]) => ({
      source,
      target,
      sourceType: 'KEYWORD',
      targetType: 'KEYWORD',
      noteTitle: 'Folder/One',
      section: 'Storage',
      evidence: 'Shared source text',
      template: '{{E1}} uses {{E2}}.',
      origin: 'sentence',
      direction: 'text-order',
    })),
    association: {
      context: 'sentence',
      score: id === 'uses-ui' ? 0.8 : 0.6,
      evidenceCount: pairs.length,
      generalizationScore: 0.2,
    },
    measurements: pairs.map((_, i) => ({
      noteTitle: 'Folder/One',
      evidence: 'Shared source text',
      evidenceId: `evidence-${i}`,
      association: {
        context: 'sentence',
        score: i ? 0.3 : 0.97,
        contextCount: 10,
        sourceCount: 3,
        targetCount: 3,
        pairCount: 2,
        lift: 2.2,
        npmi: 0.5,
        specificity: 0.66,
      },
    })),
  });
  return {
    status: 'completed',
    entities: { status: 'completed', noteCount: 3, inputCount: 4, mentionCount: 20, entities },
    patterns: [{ label: 'Hidden pattern inventory', template: 'not shown in the UI' }],
    result: {
      candidates: [
        candidate('uses-storage', [
          ['ORAMA', 'IndexedDB'],
          ['React Native', 'IndexedDB'],
        ]),
        candidate('uses-ui', [['Orama', 'React Native']]),
      ],
      warnings: [],
    },
  };
}

module.exports = Object.assign(loadTs, {
  /** Exercise the real shared source key and fetcher with a controlled backend. */
  noteSourceHarness: ({
    local = true,
    userId,
    notebookId = 7,
    usageMode = 'NOTEBOOK',
    useQuery,
    read,
  }) =>
    loadTs('../../../hooks/useNoteStorage.ts', {
      '@blacktokki/account': {
        useAuthContext: () => ({ auth: { isLocal: local, user: userId ? { id: userId } : null } }),
      },
      '@blacktokki/core': {},
      'react-query': { useQuery },
      './useUsageMode': { useUsageMode: () => ({ usageMode, notebook: { id: notebookId } }) },
      '../services/storage': {
        getStoreItems: (type, parentId) => read({ isOnline: false, types: [type], parentId }),
      },
      '../services/notebook': {
        getContentList: (parentId, types) => read({ isOnline: true, types, parentId }),
      },
    }),
  /** Match production module reuse inside one performance test without changing global loaders. */
  createCachedLoader: (dependencies = {}) => {
    const modules = new Map();
    return (relativePath, internals = []) => loadTs(relativePath, dependencies, internals, modules);
  },
  keywordHarness,
  cacheHarness,
  hookHarness,
  elements,
  resultFixture,
});
