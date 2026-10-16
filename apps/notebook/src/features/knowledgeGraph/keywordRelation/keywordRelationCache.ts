import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYWORD_RELATION_CACHE = '@blacktokki:notebook:keyword_relation';
const legacyAnalysis = '@blacktokki:notebook:relation-analysis:';
const legacyAnalysisDatabase = '@Blacktokki:notebook:relation-analysis';
const legacySearch = '@blacktokki:notebook:graph-search:v1:';
const sha = /^[a-f0-9]{64}$/;

/** Strip everything except the model tag and hashed vector identities. */
export function minimalSearchVectors(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const record = value as { model?: unknown; vectors?: unknown };
  if (
    typeof record.model !== 'string' ||
    !/^[A-Za-z0-9._/-]{1,128}:mean:normalized:search-v1$/.test(record.model) ||
    !Array.isArray(record.vectors)
  )
    return;
  const vectors = record.vectors
    .filter(
      (item: unknown): item is [string, number[]] =>
        Array.isArray(item) &&
        sha.test(item[0]) &&
        Array.isArray(item[1]) &&
        item[1].length > 0 &&
        item[1].length <= 2048 &&
        item[1].every(Number.isFinite)
    )
    .map(([identity, vector]: [string, number[]]) => [identity, vector] as [string, number[]]);
  return { model: record.model, vectors };
}

export type CacheEntries = {
  read: (keys: string[]) => Promise<(string | null)[]>;
  write: (entries: [string, string][]) => Promise<void>;
  remove: (keys: string[]) => Promise<void>;
  keys: (prefix: string) => Promise<string[]>;
};

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return (database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(KEYWORD_RELATION_CACHE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('entries');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  }));
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, finish: (value: T) => void) => void
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('entries', mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Keyword relation cache transaction aborted.'));
    tx.onerror = () => reject(tx.error);
    action(tx.objectStore('entries'), (value) => (result = value));
  });
}

const rawEntries: CacheEntries = {
  read: async (keys) => {
    if (typeof indexedDB === 'undefined')
      return (await AsyncStorage.multiGet(keys)).map(([, value]) => value);
    return transaction('readonly', (store, finish) => {
      const values: (string | null)[] = Array(keys.length).fill(null);
      keys.forEach((key, index) => {
        const request = store.get(key);
        request.onsuccess = () => (values[index] = request.result ?? null);
      });
      finish(values);
    });
  },
  write: async (entries) => {
    if (typeof indexedDB === 'undefined') {
      for (const [key, value] of entries) await AsyncStorage.setItem(key, value);
      return undefined;
    }
    return transaction('readwrite', (store, finish) => {
      entries.forEach(([key, value]) => store.put(value, key));
      finish(undefined);
    });
  },
  remove: async (keys) => {
    if (typeof indexedDB === 'undefined') return AsyncStorage.multiRemove(keys);
    return transaction('readwrite', (store, finish) => {
      keys.forEach((key) => store.delete(key));
      finish(undefined);
    });
  },
  keys: async (prefix) => {
    if (typeof indexedDB === 'undefined')
      return (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    return transaction('readonly', (store, finish) => {
      const request = store.getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff'));
      request.onsuccess = () => finish(request.result.map(String));
    });
  },
};

const validScores = (
  value: unknown
): value is {
  entailment: number;
  neutral: number;
  contradiction: number;
} => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const scores = [item.entailment, item.neutral, item.contradiction];
  return (
    scores.every((score) => typeof score === 'number' && score >= 0 && score <= 1) &&
    Math.abs((scores as number[]).reduce((sum, score) => sum + score, 0) - 1) < 0.001
  );
};

function migratedEntry(key: string, value: unknown): [string, string] | undefined {
  if (key.startsWith(legacyAnalysis)) {
    const match =
      /^@blacktokki:notebook:relation-analysis:([^/]+)\/nli\/([a-f0-9]{64})\/([a-f0-9]{64})$/.exec(
        key
      );
    if (!match || typeof value !== 'string') return;
    try {
      const record = JSON.parse(value);
      const scores = validScores(record?.scores) ? record.scores : record;
      if (!validScores(scores)) return;
      const finalScores = {
        entailment: scores.entailment,
        neutral: scores.neutral,
        contradiction: scores.contradiction,
      };
      const relationships = Array.isArray(record?.relationships)
        ? record.relationships
            .filter(
              (item: { id?: string; patterns?: string[] }) =>
                sha.test(item?.id || '') &&
                Array.isArray(item.patterns) &&
                item.patterns.length > 0 &&
                item.patterns.every((pattern) => sha.test(pattern))
            )
            .map((item: { id: string; patterns: string[] }) => ({
              id: item.id,
              patterns: item.patterns,
            }))
        : [];
      return [
        `${KEYWORD_RELATION_CACHE}:${match[1]}/nli/${match[2]}/${match[3]}`,
        JSON.stringify(relationships.length ? { scores: finalScores, relationships } : finalScores),
      ];
    } catch {
      return;
    }
  }
  if (key.startsWith(legacySearch)) {
    try {
      const [scope, kind] = JSON.parse(key.slice(legacySearch.length));
      if (typeof scope !== 'string' || kind !== 'vectors') return;
      const record = typeof value === 'string' ? JSON.parse(value) : value;
      const minimal = minimalSearchVectors(record);
      if (!minimal) return;
      return [`${KEYWORD_RELATION_CACHE}:${scope}/search/vectors`, JSON.stringify(minimal)];
    } catch {
      return undefined;
    }
  }
}

async function migrateNative() {
  const keys = (await AsyncStorage.getAllKeys()).filter(
    (key) => key.startsWith(legacyAnalysis) || key.startsWith(legacySearch)
  );
  for (let offset = 0; offset < keys.length; offset += 100) {
    const batch = keys.slice(offset, offset + 100);
    const old = await AsyncStorage.multiGet(batch);
    const migrated = old
      .map(([key, value]) => migratedEntry(key, value))
      .filter((entry): entry is [string, string] => !!entry);
    if (migrated.length) await writeMissing(migrated);
    await AsyncStorage.multiRemove(batch);
  }
}

async function writeMissing(entries: [string, string][]) {
  const present = await rawEntries.read(entries.map(([key]) => key));
  const missing = entries.filter((_, index) => present[index] == null);
  if (missing.length) await rawEntries.write(missing);
}

async function migrateDatabase(name: string) {
  const old = await new Promise<IDBDatabase | undefined>((resolve) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
  if (!old) return;
  try {
    if (old.objectStoreNames.contains('entries')) {
      const migrated = await new Promise<[string, string][]>((resolve, reject) => {
        const result: [string, string][] = [];
        const tx = old.transaction('entries', 'readonly');
        const request = tx.objectStore('entries').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const entry = migratedEntry(String(cursor.key), cursor.value);
          if (entry) result.push(entry);
          cursor.continue();
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      });
      for (let offset = 0; offset < migrated.length; offset += 100)
        await writeMissing(migrated.slice(offset, offset + 100));
    }
  } finally {
    old.close();
  }
}

let migration: Promise<void> | undefined;
const migrationMarker = `${KEYWORD_RELATION_CACHE}:migration/v1`;
async function ensureMigration() {
  if (!migration)
    migration = (async () => {
      const [done] = await rawEntries.read([migrationMarker]);
      if (!done) {
        if (typeof indexedDB === 'undefined') await migrateNative();
        else {
          await migrateDatabase(legacyAnalysisDatabase);
          await migrateDatabase(legacySearch);
        }
        await rawEntries.write([[migrationMarker, '1']]);
      }
      if (typeof indexedDB !== 'undefined') {
        for (const name of [legacyAnalysisDatabase, legacySearch]) {
          await new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
          });
        }
      }
    })().catch((error) => {
      migration = undefined;
      throw error;
    });
  return migration;
}

/** One namespace holds only hashed NLI identities and hashed search vectors. */
export const keywordRelationEntries: CacheEntries = {
  read: async (keys) => {
    await ensureMigration();
    return rawEntries.read(keys);
  },
  write: async (entries) => {
    await ensureMigration();
    return rawEntries.write(entries);
  },
  remove: async (keys) => {
    await ensureMigration();
    return rawEntries.remove(keys);
  },
  keys: async (prefix) => {
    await ensureMigration();
    return rawEntries.keys(prefix);
  },
};
