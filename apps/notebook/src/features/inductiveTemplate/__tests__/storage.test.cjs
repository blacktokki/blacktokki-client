const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTs = require('./loadTs.cjs');
const helpers = loadTs('template.ts');
const template = (id, name = id) => ({
  id,
  name,
  markdown: '# {{title}}',
  sourceTitles: ['example'],
  updatedAt: 'now',
});

test('persists template edits, isolates notebooks, imports, and deletes without losing other templates', async () => {
  const values = new Map();
  const deps = {
    './template': helpers,
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => values.get(key),
      setItem: async (key, value) => values.set(key, value),
    },
  };
  const store = loadTs('storage.ts', deps);
  await store.saveTemplate('local:1:normal', template('one'));
  await store.saveTemplate('local:1:normal', template('two'));
  await store.saveTemplate('local:2:normal', template('one', 'other notebook'));
  await store.saveTemplate('local:1:private', template('hidden'));
  await store.saveTemplate('local:1:normal', template('one', 'updated'));
  const restarted = loadTs('storage.ts', deps);
  assert.deepEqual(
    (await restarted.loadTemplates('local:1:normal')).map((item) => item.name),
    ['updated', 'two']
  );
  assert.equal((await restarted.loadTemplates('local:2:normal'))[0].name, 'other notebook');
  assert.equal((await restarted.loadTemplates('local:1:private'))[0].name, 'hidden');
  await restarted.deleteTemplate('local:1:normal', 'one');
  assert.deepEqual(
    (await restarted.loadTemplates('local:1:normal')).map((item) => item.id),
    ['two']
  );
});

test('propagates storage failures and refuses to overwrite a corrupt library', async () => {
  let writes = 0;
  const store = loadTs('storage.ts', {
    './template': helpers,
    '@react-native-async-storage/async-storage': {
      getItem: async () => '[{"unexpected":true}]',
      setItem: async () => {
        writes++;
      },
    },
  });
  await assert.rejects(store.saveTemplate('scope', template('new')), /Could not load/);
  assert.equal(writes, 0);
  const failing = loadTs('storage.ts', {
    './template': helpers,
    '@react-native-async-storage/async-storage': {
      getItem: async () => null,
      setItem: async () => {
        throw new Error('Quota exceeded');
      },
    },
  });
  await assert.rejects(failing.saveTemplate('scope', template('new')), /Quota/);
});

function pageHook(options = {}) {
  const calls = [];
  const storage = {
    getStoreItems: async () => {
      if (options.readError) throw options.readError;
      return options.pages || [];
    },
    saveStoreItems: async (...args) => {
      calls.push(args);
      if (options.writeError) throw options.writeError;
    },
  };
  const hooks = loadTs('../../hooks/useNoteStorage.ts', {
    '@blacktokki/account': { useAuthContext: () => ({ auth: { isLocal: true, user: null } }) },
    '@blacktokki/core': {},
    '@react-navigation/core': {},
    react: {},
    'react-query': {
      useQueryClient: () => ({ invalidateQueries: async () => {} }),
      useMutation: (config) => config,
    },
    './useUsageMode': { useUsageMode: () => ({ usageMode: 'NOTEBOOK', notebook: { id: 42 } }) },
    '../services/notebook': {},
    '../services/storage': storage,
  });
  return { hook: hooks.useCreateOrUpdatePage(), calls };
}

test('new-note creation rechecks current titles with Unicode and case normalization', async () => {
  const { hook, calls } = pageHook({
    pages: [{ id: 1, title: 'Notes/한글'.normalize('NFD'), description: 'existing' }],
  });
  await assert.rejects(
    hook.mutationFn({ title: 'notes/한글', description: 'replacement', createOnly: true }),
    /already exists/
  );
  assert.equal(calls.length, 0);
});

test('new-note creation passes notebook scope and create-only to storage and propagates failures', async () => {
  const { hook, calls } = pageHook();
  await hook.mutationFn({ title: 'New', description: '<p>new</p>', createOnly: true });
  assert.equal(calls[0][3], 42);
  assert.equal(calls[0][4], true);
  await assert.rejects(
    pageHook({ readError: new Error('read failed') }).hook.mutationFn({
      title: 'New',
      description: 'new',
      createOnly: true,
    }),
    /read failed/
  );
  await assert.rejects(
    pageHook({ writeError: new Error('write failed') }).hook.mutationFn({
      title: 'New',
      description: 'new',
      createOnly: true,
    }),
    /write failed/
  );
});

test('ordinary note editing continues to update an existing note', async () => {
  const { hook, calls } = pageHook({
    pages: [{ id: 7, title: 'Existing', description: 'old', parentId: 42 }],
  });
  await hook.mutationFn({ title: 'Existing', description: 'new' });
  assert.equal(calls[0][1][0].id, 7);
  assert.equal(calls[0][4], false);
});

test('filesystem create-only refuses existing md and markdown files, even if the note list missed them', async () => {
  const { saveContentsToDir } = loadTs('../../services/storage/fsHelper.ts', {
    '@blacktokki/editor': { toMarkdown: (value) => value },
  });
  for (const extension of ['md', 'markdown']) {
    let writes = 0;
    const root = {
      getFileHandle: async (name, { create }) => {
        if (name === `New.${extension}`)
          return {
            createWritable: async () => {
              writes++;
            },
          };
        if (!create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
        return {
          createWritable: async () => {
            writes++;
          },
        };
      },
    };
    await assert.rejects(
      saveContentsToDir(
        root,
        'NOTE',
        100 + extension.length,
        [{ title: 'New', description: 'new' }],
        undefined,
        true
      ),
      /already exists/
    );
    assert.equal(writes, 0);
  }
});

test('filesystem creation stops on access errors instead of assuming a file is absent', async () => {
  const { saveContentsToDir } = loadTs('../../services/storage/fsHelper.ts', {
    '@blacktokki/editor': { toMarkdown: (value) => value },
  });
  const root = {
    getFileHandle: async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    },
  };
  await assert.rejects(
    saveContentsToDir(root, 'NOTE', 200, [{ title: 'New', description: 'new' }], undefined, true),
    /denied/
  );
});
