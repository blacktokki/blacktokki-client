const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const loadTs = require('./loadTs.cjs');
const helpers = loadTs('template.ts');
beforeEach((t) => t.mock.method(console, 'log', () => {}));
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

function directoryFixture() {
  const files = new Map([
    ['First.md', '**Alpha**'],
    ['Second.md', '**Beta**'],
    ['Board.json', JSON.stringify({ type: 'BOARD', title: 'Board' })],
  ]);
  const calls = { scans: 0, files: 0, texts: 0, conversions: 0 };
  let fail = false;
  let pauseNext;
  const clone = () => ({
    identity: files,
    isSameEntry: async (other) => other.identity === files,
    getFileHandle: async (name, { create }) => {
      if (!create && !files.has(name))
        throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      return {
        createWritable: async () => ({
          write: async (text) => files.set(name, text),
          close: async () => {},
        }),
      };
    },
    async *entries() {
      calls.scans++;
      for (const name of files.keys())
        yield [
          name,
          {
            kind: 'file',
            getFile: async () => {
              calls.files++;
              if (fail) throw new Error('temporary read error');
              const text = files.get(name);
              return {
                lastModified: 1000,
                size: text.length,
                text: async () => {
                  calls.texts++;
                  const pause = pauseNext;
                  pauseNext = undefined;
                  await pause?.();
                  await new Promise(setImmediate);
                  return text;
                },
              };
            },
          },
        ];
    },
  });
  const helpers = loadTs('../../services/storage/fsHelper.ts', {
    '@blacktokki/editor': {
      toMarkdown: (text) => text,
      toHtml: (text) => {
        calls.conversions++;
        return text;
      },
    },
  });
  return {
    files,
    calls,
    clone,
    helpers,
    fail: (value) => (fail = value),
    pauseRead: () => {
      let entered;
      let release;
      const waiting = new Promise((resolve) => (entered = resolve));
      const pending = new Promise((resolve) => (release = resolve));
      pauseNext = () => {
        entered();
        return pending;
      };
      return { waiting, release };
    },
  };
}

test('concurrent notebook consumers share file reads across cloned directory handles', async () => {
  const { helpers, clone, calls } = directoryFixture();
  const [first, second, third, boards] = await Promise.all([
    helpers.readContentsFromDir(clone(), 'NOTE', 71),
    helpers.readContentsFromDir(clone(), 'NOTE', 71),
    helpers.readContentsFromDir(clone(), 'NOTE', 71),
    helpers.readContentsFromDir(clone(), 'BOARD', 71),
  ]);
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(first.length, 2);
  assert.equal(boards[0].title, 'Board');
  assert.deepEqual(calls, { scans: 1, files: 3, texts: 3, conversions: 2 });
  assert.notEqual(first, second, 'callers keep independently constructed content arrays');
  assert.equal(console.log.mock.calls.length, 0, 'local source reads do not print timing logs');
});

test('local storage reads return notes without diagnostic logging', async () => {
  const notes = [{ title: 'Source' }];
  const { getStoreItems } = loadTs('../../services/storage/index.ts', {
    './config': {
      getStorageConfig: async (parentId) => {
        assert.equal(parentId, 82);
        return { type: 'local', handle: {} };
      },
    },
    './localDirDriver': {
      localDirGetStoreItems: async () => {
        return notes;
      },
    },
    './opfsDriver': {},
    './types': {},
    './fsHelper': {},
  });
  assert.equal(await getStoreItems('NOTE', 82), notes);
  assert.equal(console.log.mock.calls.length, 0);
});

test('a completed read is not retained and refresh detects edits with unchanged file metadata', async () => {
  const { helpers, clone, calls, files } = directoryFixture();
  await helpers.readContentsFromDir(clone(), 'NOTE', 72);
  files.set('First.md', '**Gamma**');
  const edited = await helpers.readContentsFromDir(clone(), 'NOTE', 72);
  assert.equal(edited.find((note) => note.title === 'First').description, '**Gamma**');
  assert.equal(calls.files, 4);
  assert.equal(calls.conversions, 3);
  await helpers.readContentsFromDir(clone(), 'NOTE', 72);
  assert.equal(calls.files, 6, 'every new refresh reads current files');
  assert.equal(calls.conversions, 3, 'unchanged contents reuse only their conversion');
  files.delete('Second.md');
  files.set('Third.md', '**New**');
  assert.deepEqual(
    (await helpers.readContentsFromDir(clone(), 'NOTE', 72)).map((note) => note.title),
    ['First', 'Third']
  );
});

test('a delayed file does not stop other available reads and results retain source order', async (t) => {
  t.mock.method(console, 'log', () => {});
  const helpers = loadTs('../../services/storage/fsHelper.ts', {
    '@blacktokki/editor': { toHtml: (text) => text },
  });
  let release;
  const delayed = new Promise((resolve) => (release = resolve));
  const started = [];
  let active = 0;
  let peak = 0;
  const root = {
    async *entries() {
      for (let index = 0; index < 64; index++)
        yield [
          `Note ${index}.md`,
          {
            kind: 'file',
            getFile: async () => {
              started.push(index);
              active++;
              peak = Math.max(peak, active);
              if (index === 0) await delayed;
              return {
                lastModified: 1000,
                size: 1,
                text: async () => {
                  active--;
                  return 'x';
                },
              };
            },
          },
        ];
    },
  };
  const pending = helpers.readContentsFromDir(root, 'NOTE', 81);
  try {
    await new Promise(setImmediate);
    assert.equal(started.length, 64, 'one slow file must not hold back later files');
    assert.ok(peak <= 32, 'file I/O remains bounded while slow reads are pending');
  } finally {
    release();
  }
  assert.deepEqual(
    (await pending).map((note) => note.title),
    Array.from({ length: 64 }, (_, index) => `Note ${index}`).sort((a, b) => a.localeCompare(b))
  );
});

test('directory enumeration overlaps independent folders with bounded concurrency and retains traversal order', async () => {
  const helpers = loadTs('../../services/storage/fsHelper.ts', { '@blacktokki/editor': {} });
  let active = 0;
  let peak = 0;
  const directory = (index) => ({
    kind: 'directory',
    async *entries() {
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise(setImmediate);
        yield [`${index}.md`, { kind: 'file' }];
      } finally {
        active--;
      }
    },
  });
  const root = {
    async *entries() {
      for (let index = 0; index < 24; index++) yield [`Folder ${index}`, directory(index)];
      yield ['.hidden', directory('hidden')];
    },
  };
  const entries = await helpers.scanDirectoryRecursive(root);
  assert.ok(peak > 1 && peak <= 8, `independent folder enumerations were ${peak}`);
  assert.deepEqual(
    entries.map((entry) => entry.path),
    Array.from({ length: 24 }, (_, index) => [
      `Folder ${index}`,
      `Folder ${index}/${index}.md`,
    ]).flat()
  );
});

test('failed reads are retried and a remapped notebook cannot reuse another directory', async (t) => {
  t.mock.method(console, 'error', () => {});
  const first = directoryFixture();
  first.fail(true);
  assert.deepEqual(await first.helpers.readContentsFromDir(first.clone(), 'NOTE', 73), []);
  first.fail(false);
  assert.equal((await first.helpers.readContentsFromDir(first.clone(), 'NOTE', 73)).length, 2);
  const other = directoryFixture();
  other.files.clear();
  other.files.set('Other.md', '**Separate**');
  const separate = await first.helpers.readContentsFromDir(other.clone(), 'NOTE', 73);
  assert.deepEqual(
    separate.map((note) => note.title),
    ['Other']
  );
});

test('a refresh after saving cannot join a read of the previous file contents', async () => {
  const { helpers, clone, pauseRead } = directoryFixture();
  const paused = pauseRead();
  const before = helpers.readContentsFromDir(clone(), 'NOTE', 74);
  await paused.waiting;
  await helpers.saveContentsToDir(clone(), 'NOTE', 74, [
    { title: 'First', description: '**Saved**' },
  ]);
  const refreshed = helpers.readContentsFromDir(clone(), 'NOTE', 74);
  await new Promise(setImmediate);
  paused.release();
  const [original, current] = await Promise.all([before, refreshed]);
  assert.equal(original.find((note) => note.title === 'First').description, '**Alpha**');
  assert.equal(current.find((note) => note.title === 'First').description, '**Saved**');
});
