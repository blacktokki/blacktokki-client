const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTs = require('./loadTs.cjs');
const template = loadTs('template.ts');
const { noteSourceHarness } = require('../../knowledgeGraph/keywordRelation/__tests__/loadTs.cjs');

function scopedQueries({
  isLocal = true,
  userId,
  notebookId = 1,
  isPrivate = false,
  notebookTitle = 'Notebook',
  folderName = 'Folder',
  rootLoading = false,
  requested = true,
  background = false,
} = {}) {
  const queries = [];
  let reads = 0;
  let storageReads = 0;
  const useQuery = (value) => {
    const view = {
      ...value,
      queryFn: async () => {
        const result = await value.queryFn();
        return value.select ? value.select(result) : result;
      },
    };
    queries.push(view);
    return {
      ...view,
      isLoading: value.queryKey[0] === 'inductiveTemplateNotebookRoots' && rootLoading,
    };
  };
  const hook = loadTs('useInductiveTemplates.ts', {
    '@blacktokki/account': {
      useAuthContext: () => ({ auth: { isLocal, user: userId ? { id: userId } : null } }),
    },
    '@react-navigation/native': {
      useIsFocused: () => {
        if (background) throw new Error('Navigation is unavailable in the background');
        return true;
      },
    },
    react: {
      useEffect: () => {},
      useCallback: (value) => value,
      useRef: (value) => ({ current: value }),
    },
    'react-query': { useQuery },
    './template': template,
    '../../hooks/useNoteStorage': noteSourceHarness({
      local: isLocal,
      userId,
      notebookId,
      useQuery,
      read: async (request) => {
        assert.deepEqual(request.types, ['NOTE']);
        reads++;
        return [
          {
            type: 'NOTE',
            title: 'Public/Shape',
            description: '<h2>Vertices</h2>',
            updated: '2026',
          },
          { type: 'NOTE', title: '.Private/Shape', description: 'secret', updated: '2026' },
          { type: 'NOTE', title: 'Public/.Private', description: 'secret', updated: '2026' },
          {
            type: 'NOTEBOOK',
            title: notebookTitle,
            description: '<h2>Vertices</h2>',
            updated: '2026',
          },
        ];
      },
    }),
    '../../hooks/usePrivate': {
      usePrivate: () => ({ data: { enabled: isPrivate }, isLoading: false }),
      isHiddenTitle: (title) => title.startsWith('.') || title.includes('/.'),
    },
    '../../hooks/useUsageMode': {
      useUsageMode: () => ({
        usageMode: 'NOTEBOOK',
        notebook: { id: notebookId, title: notebookTitle },
      }),
    },
    '../../services/storage': {
      getStorageConfig: async (id) => {
        storageReads++;
        assert.equal(id, notebookId);
        return { pathName: folderName, handle: { name: folderName } };
      },
    },
  });
  const result = background
    ? hook.useInductiveTemplatesData(requested)
    : hook.useInductiveTemplates(requested);
  return {
    result,
    queries,
    examples: queries.find((query) => query.queryKey[0] === 'pageContents'),
    roots: queries.find((query) => query.queryKey[0] === 'inductiveTemplateNotebookRoots'),
    reads: () => reads,
    storageReads: () => storageReads,
  };
}

test('background template queries work without a navigation object', () => {
  const { result, examples } = scopedQueries({ background: true });
  assert.equal(result.enabled, true);
  assert.equal(examples.enabled, true);
});

test('initial focus uses the source query while returning from a source checks for edits', () => {
  const { hookHarness } = require('../../knowledgeGraph/keywordRelation/__tests__/loadTs.cjs');
  const harness = hookHarness();
  const refreshes = [];
  const examples = { refetch: () => refreshes.push('notes') };
  const roots = { data: [], isLoading: false, refetch: () => refreshes.push('roots') };
  let focused = true;
  let notebookId = 1;
  const { useInductiveTemplatesData } = loadTs('useInductiveTemplates.ts', {
    react: harness.react,
    'react-query': { useQuery: () => roots },
    '@blacktokki/account': { useAuthContext: () => ({ auth: { isLocal: true, user: null } }) },
    '@react-navigation/native': {},
    './template': template,
    '../../hooks/useNoteStorage': { useNotePages: () => examples },
    '../../hooks/usePrivate': { usePrivate: () => ({ data: { enabled: false } }) },
    '../../hooks/useUsageMode': {
      useUsageMode: () => ({ usageMode: 'NOTEBOOK', notebook: { id: notebookId } }),
    },
    '../../services/storage': {},
  });
  const render = () => harness.render(() => useInductiveTemplatesData(true, focused));
  render();
  render();
  assert.deepEqual(refreshes, [], 'mounting a focused consumer must not force another scan');
  focused = false;
  render();
  focused = true;
  render();
  assert.deepEqual(refreshes, ['notes', 'roots']);
  render();
  notebookId = 2;
  render();
  assert.deepEqual(refreshes, ['notes', 'roots'], 'the new notebook query owns its initial read');
  harness.unmount();
});

test('normal-mode example queries exclude hidden paths before suggestions or inference can see them', async () => {
  const { examples } = scopedQueries();
  assert.deepEqual(
    (await examples.queryFn()).map((note) => note.title),
    ['Public/Shape']
  );
  const privateExamples = scopedQueries({ isPrivate: true }).examples;
  assert.equal((await privateExamples.queryFn()).length, 3);
});

test('account and notebook sources are isolated while privacy modes select separate results', () => {
  const scopes = [
    scopedQueries(),
    scopedQueries({ notebookId: 2 }),
    scopedQueries({ isPrivate: true }),
    scopedQueries({ isLocal: false, userId: 1 }),
    scopedQueries({ isLocal: false, userId: 2 }),
  ];
  assert.equal(new Set(scopes.map(({ examples }) => JSON.stringify(examples.queryKey))).size, 4);
  assert.equal(new Set(scopes.map(({ result }) => result.scope)).size, 5);
  assert.equal(new Set(scopes.map(({ roots }) => JSON.stringify(roots.queryKey))).size, 5);
  assert.ok(scopes.every(({ queries }) => queries.length === 2));
  assert.ok(scopes.every(({ reads }) => reads() === 0));
});

test('root metadata resolves the current notebook and selected local directory names only', async () => {
  const local = scopedQueries({
    notebookId: 7,
    notebookTitle: 'Synthetic root',
    folderName: '예제 폴더',
  });
  assert.deepEqual(await local.roots.queryFn(), ['Synthetic root', '예제 폴더']);
  assert.equal(local.storageReads(), 1);
  const online = scopedQueries({ isLocal: false, userId: 9, notebookTitle: 'Online wiki' });
  assert.deepEqual(await online.roots.queryFn(), ['Online wiki']);
  assert.equal(online.storageReads(), 0);
  assert.equal(scopedQueries({ rootLoading: true }).result.enabled, false);
});

test('online sources stay disabled until an account is available', () => {
  const { result, queries } = scopedQueries({ isLocal: false });
  assert.equal(result.enabled, false);
  assert.ok(queries.every((query) => query.enabled === false));
  assert.equal(scopedQueries().result.enabled, true);
});

test('inactive graph template integration disables source and notebook-root queries', () => {
  const { result, queries, reads, storageReads } = scopedQueries({ requested: false });
  assert.equal(result.enabled, false);
  assert.ok(queries.every((query) => query.enabled === false));
  assert.equal(reads(), 0);
  assert.equal(storageReads(), 0);
});
