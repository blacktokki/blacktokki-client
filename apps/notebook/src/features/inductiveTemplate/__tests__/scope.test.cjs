const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTs = require('./loadTs.cjs');
const template = loadTs('template.ts');

function scopedQueries({
  isLocal = true,
  userId,
  notebookId = 1,
  isPrivate = false,
  notebookTitle = 'Notebook',
  folderName = 'Folder',
  rootLoading = false,
} = {}) {
  const queries = [];
  let reads = 0;
  let storageReads = 0;
  const hook = loadTs('useInductiveTemplates.ts', {
    '@blacktokki/account': {
      useAuthContext: () => ({ auth: { isLocal, user: userId ? { id: userId } : null } }),
    },
    '@react-navigation/native': { useIsFocused: () => true },
    react: { useEffect: () => {} },
    'react-query': {
      useQuery: (value) => {
        queries.push(value);
        return {
          ...value,
          isLoading: value.queryKey[0] === 'inductiveTemplateNotebookRoots' && rootLoading,
        };
      },
    },
    './template': template,
    '../../hooks/useNoteStorage': {
      getContents: async (request) => {
        assert.deepEqual(request.types, ['NOTE']);
        reads++;
        return [
          {
            type: 'NOTE',
            title: 'Public/Meeting',
            description: '<h2>Agenda</h2>',
            updated: '2026',
          },
          { type: 'NOTE', title: '.Private/Meeting', description: 'secret', updated: '2026' },
          { type: 'NOTE', title: 'Public/.Private', description: 'secret', updated: '2026' },
          {
            type: 'NOTEBOOK',
            title: notebookTitle,
            description: '<h2>Agenda</h2>',
            updated: '2026',
          },
        ];
      },
    },
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
  const result = hook.useInductiveTemplates();
  return {
    result,
    queries,
    examples: queries.find((query) => query.queryKey[0] === 'inductiveTemplateExamples'),
    roots: queries.find((query) => query.queryKey[0] === 'inductiveTemplateNotebookRoots'),
    reads: () => reads,
    storageReads: () => storageReads,
  };
}

test('normal-mode example queries exclude hidden paths before suggestions or inference can see them', async () => {
  const { examples } = scopedQueries();
  assert.deepEqual(
    (await examples.queryFn()).map((note) => note.title),
    ['Public/Meeting']
  );
  const privateExamples = scopedQueries({ isPrivate: true }).examples;
  assert.equal((await privateExamples.queryFn()).length, 3);
});

test('account, notebook and privacy changes use separate source caches', () => {
  const scopes = [
    scopedQueries(),
    scopedQueries({ notebookId: 2 }),
    scopedQueries({ isPrivate: true }),
    scopedQueries({ isLocal: false, userId: 1 }),
    scopedQueries({ isLocal: false, userId: 2 }),
  ];
  assert.equal(new Set(scopes.map(({ examples }) => JSON.stringify(examples.queryKey))).size, 5);
  assert.equal(new Set(scopes.map(({ roots }) => JSON.stringify(roots.queryKey))).size, 5);
  assert.ok(scopes.every(({ queries }) => queries.length === 2));
  assert.ok(scopes.every(({ reads }) => reads() === 0));
});

test('root metadata resolves the current notebook and selected local directory names only', async () => {
  const local = scopedQueries({
    notebookId: 7,
    notebookTitle: 'Team wiki',
    folderName: '그룹웨어1팀wiki',
  });
  assert.deepEqual(await local.roots.queryFn(), ['Team wiki', '그룹웨어1팀wiki']);
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
