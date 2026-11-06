import { MemoTab, MemoTabs, checksumMemoContent } from './memoTabs';

const DB_NAME = '@Blacktokki:notebook:temporary_memo';
const ORDER_STORE = 'TAB_ORDER';
const DRAFT_STORE = 'DRAFTS';
let dbPromise: Promise<IDBDatabase> | undefined;

type StoredDraft = Omit<MemoTab, 'contentChecksum'>;
type StoredOrder = { tabIds: string[] };
type Writer = { committed?: MemoTabs; pending?: MemoTabs; running?: Promise<void> };
const writers = new Map<string, Writer>();

function getMemoDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(ORDER_STORE);
        request.result.createObjectStore(DRAFT_STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = undefined;
        };
        db.onclose = () => {
          dbPromise = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

export const memoStorageKey = (user: string, notebookId: number, isPrivate: boolean) =>
  '@blacktokki:notebook:temporary_memo:' + JSON.stringify([user, notebookId, isPrivate]);

/** Each scope stores only its order; each draft has its own compound key. */
export async function loadMemoTabs(key: string): Promise<MemoTabs> {
  const db = await getMemoDB();
  const records = await new Promise<{ order?: StoredOrder; drafts: StoredDraft[] }>(
    (resolve, reject) => {
      const tx = db.transaction([ORDER_STORE, DRAFT_STORE], 'readonly');
      const request = tx.objectStore(ORDER_STORE).get(key);
      const drafts: StoredDraft[] = [];
      request.onsuccess = () => {
        const order = request.result as StoredOrder | undefined;
        if (!Array.isArray(order?.tabIds) || !order.tabIds.every((id) => typeof id === 'string'))
          return;
        for (const [index, id] of order.tabIds.entries()) {
          const draft = tx.objectStore(DRAFT_STORE).get([key, id]);
          draft.onsuccess = () => {
            drafts[index] = draft.result;
          };
        }
      };
      tx.oncomplete = () => resolve({ order: request.result, drafts });
      tx.onabort = () => reject(tx.error || new Error('Could not restore temporary memos.'));
      tx.onerror = () => reject(tx.error || new Error('Could not restore temporary memos.'));
    }
  );
  if (
    records.order !== undefined &&
    (!Array.isArray(records.order.tabIds) ||
      !records.order.tabIds.every((id) => typeof id === 'string') ||
      new Set(records.order.tabIds).size !== records.order.tabIds.length ||
      records.drafts.length !== records.order.tabIds.length ||
      !records.order.tabIds.every((id, index) => {
        const draft = records.drafts[index];
        return (
          draft?.id === id &&
          typeof draft.title === 'string' &&
          (draft.noteId === undefined || typeof draft.noteId === 'number') &&
          (draft.content === undefined || typeof draft.content === 'string') &&
          (draft.originalChecksum === undefined ||
            /^sha256:[a-f0-9]{64}$/.test(draft.originalChecksum)) &&
          (draft.createdNoteTitle === undefined || typeof draft.createdNoteTitle === 'string')
        );
      }))
  ) {
    throw new Error('Could not restore temporary memos.');
  }
  const tabs = await Promise.all(
    records.drafts.map(async (draft) => {
      const contentChecksum = await checksumMemoContent(draft.content || '');
      return {
        ...draft,
        originalChecksum: draft.originalChecksum ?? contentChecksum,
        contentChecksum,
      };
    })
  );
  const state = { tabs, activeId: tabs[0]?.id };
  writers.set(key, { committed: { tabs: records.drafts } });
  await saveMemoTabs(key, state);
  return state;
}

const sameDraft = (previous: MemoTab | undefined, next: MemoTab) =>
  previous?.id === next.id &&
  previous.title === next.title &&
  previous.noteId === next.noteId &&
  previous.content === next.content &&
  previous.originalChecksum === next.originalChecksum &&
  previous.createdNoteTitle === next.createdNoteTitle;

function storedDraft(tab: MemoTab): StoredDraft {
  return {
    id: tab.id,
    title: tab.title,
    noteId: tab.noteId,
    content: tab.content,
    originalChecksum: tab.originalChecksum,
    createdNoteTitle: tab.createdNoteTitle,
  };
}

async function writeChanges(key: string, previous: MemoTabs | undefined, next: MemoTabs) {
  const cached = new Map(previous?.tabs.map((tab) => [tab.id, tab]));
  const changed = next.tabs.filter((tab) => !sameDraft(cached.get(tab.id), tab));
  const ids = new Set(next.tabs.map((tab) => tab.id));
  const removed = previous?.tabs.filter((tab) => !ids.has(tab.id)) || [];
  const orderChanged =
    previous?.tabs.length !== next.tabs.length ||
    next.tabs.some((tab, index) => previous?.tabs[index]?.id !== tab.id);
  if (!changed.length && !removed.length && !orderChanged) return;
  const db = await getMemoDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ORDER_STORE, DRAFT_STORE], 'readwrite');
    const drafts = tx.objectStore(DRAFT_STORE);
    for (const tab of changed) drafts.put(storedDraft(tab), [key, tab.id]);
    for (const tab of removed) drafts.delete([key, tab.id]);
    if (orderChanged) tx.objectStore(ORDER_STORE).put({ tabIds: [...ids] }, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Could not keep the draft on this device.'));
    tx.onerror = () => reject(tx.error || new Error('Could not keep the draft on this device.'));
  });
}

/** Coalesce pending edits and compare against the last successful transaction. */
export function saveMemoTabs(key: string, state: MemoTabs): Promise<void> {
  let writer = writers.get(key);
  if (!writer) {
    writer = {};
    writers.set(key, writer);
  }
  writer.pending = state;
  if (!writer.running) {
    const current = writer;
    current.running = Promise.resolve().then(async () => {
      try {
        while (current.pending) {
          const snapshot = current.pending;
          current.pending = undefined;
          try {
            await writeChanges(key, current.committed, snapshot);
            current.committed = snapshot;
          } catch (error) {
            current.pending ??= snapshot;
            throw error;
          }
        }
      } finally {
        current.running = undefined;
      }
    });
  }
  return writer.running!;
}
