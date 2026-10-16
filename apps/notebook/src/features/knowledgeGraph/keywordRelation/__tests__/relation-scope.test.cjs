const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');

function source({
  requested = true,
  metadataOnly = false,
  focused = true,
  local = true,
  userId,
  notebookId = 7,
  privateMode = false,
  privacyLoading = false,
  usageMode = 'NOTEBOOK',
} = {}) {
  const queries = [];
  const reads = [];
  const { useRelationAnalysisNotes, useRelationAnalysisScope } = loadTs(
    'useRelationAnalysisNotes.ts',
    {
      '@blacktokki/account': {
        useAuthContext: () => ({ auth: { isLocal: local, user: userId ? { id: userId } : null } }),
      },
      '@react-navigation/native': { useIsFocused: () => focused },
      react: { useEffect: () => {} },
      'react-query': {
        useQuery: (query) => {
          queries.push(query);
          return query;
        },
      },
      '../../../hooks/usePrivate': {
        usePrivate: () => ({ data: { enabled: privateMode }, isLoading: privacyLoading }),
        isHiddenTitle: (title) => title.startsWith('.') || title.includes('/.'),
      },
      '../../../hooks/useUsageMode': {
        useUsageMode: () => ({ usageMode, notebook: { id: notebookId, title: 'Notebook' } }),
      },
      '../../../hooks/useNoteStorage': {
        getContents: async (request) => {
          reads.push(request);
          return [
            { type: 'NOTE', title: 'Z', description: '<b>React Native</b>', updated: 'unused' },
            { type: 'NOTE', title: '.Hidden', description: 'private' },
            { type: 'NOTE', title: 'A', description: 'body' },
            { type: 'NOTE', title: 'Nested/.Hidden', description: 'private' },
            { type: 'NOTE', title: 'Empty', description: '  ' },
            { type: 'NOTEBOOK', title: 'Container', description: 'metadata' },
          ];
        },
      },
    }
  );
  const data = metadataOnly
    ? useRelationAnalysisScope(requested)
    : useRelationAnalysisNotes(requested);
  return { ...data, queries, reads };
}

test('relation sources independently fetch only visible note text with stable title order', async () => {
  const data = source();
  assert.equal(data.queries.length, 1);
  assert.deepEqual(data.notes.queryKey, ['relationAnalysisNotes', 'local:7:normal']);
  assert.deepEqual(await data.notes.queryFn(), [
    { title: 'A', description: 'body' },
    { title: 'Z', description: '<b>React Native</b>' },
  ]);
  assert.deepEqual(data.reads, [
    { isOnline: false, types: ['NOTE'], parentId: 7, throwOnError: true },
  ]);
  const privateData = source({ privateMode: true });
  assert.equal((await privateData.notes.queryFn()).length, 4);
});

test('feature queries isolate accounts, notebooks and privacy while retaining existing final-score scopes', () => {
  const scopes = [
    source(),
    source({ notebookId: 8 }),
    source({ privateMode: true }),
    source({ local: false, userId: 1 }),
    source({ local: false, userId: 2 }),
  ];
  assert.equal(new Set(scopes.map((item) => item.scope)).size, 5);
  assert.equal(new Set(scopes.map((item) => JSON.stringify(item.notes.queryKey))).size, 5);
  assert.equal(scopes[2].scope, 'local:7:private');
  assert.equal(scopes[3].scope, 'user:1:7:normal');
  assert.ok(scopes.every((item) => item.reads.length === 0));
});

test('disabled, simple-mode, unresolved privacy and unauthenticated sessions cannot fetch sources', () => {
  for (const options of [
    { requested: false },
    { usageMode: 'SIMPLE' },
    { privacyLoading: true },
    { local: false },
  ]) {
    const data = source(options);
    assert.equal(data.notes.enabled, false);
    assert.equal(data.reads.length, 0);
    assert.equal(data.available, false);
  }
});

test('enabled extension sources are available without a focused analysis screen', () => {
  const data = source({ focused: false });
  assert.equal(data.available, true);
  assert.equal(data.notes.enabled, true);
});

test('session observers resolve the same access scope without querying note contents', () => {
  const data = source({ metadataOnly: true, focused: false, privateMode: true });
  assert.equal(data.scope, 'local:7:private');
  assert.equal(data.available, true);
  assert.equal(data.queries.length, 0);
  assert.equal(data.reads.length, 0);
});
