export const DB_NAME = '@Blacktokki:notebook:sync';
export const DB_VERSION = 1;

let dbInstance: IDBDatabase | undefined;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('SYNC_ANCHOR')) {
        db.createObjectStore('SYNC_ANCHOR', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
  return dbInstance!;
}

export async function getSyncAnchorFromDB<T = any>(key: string): Promise<T> {
  try {
    const db = await getDB();
    return await new Promise((resolve) => {
      const tx = db.transaction('SYNC_ANCHOR', 'readonly');
      const store = tx.objectStore('SYNC_ANCHOR');
      const request = store.get(key);
      request.onsuccess = () => {
        resolve((request.result?.data as T) || ({} as T));
      };
      request.onerror = () => {
        resolve({} as T);
      };
    });
  } catch (e) {
    return {} as T;
  }
}

export async function saveSyncAnchorToDB(key: string, data: any): Promise<void> {
  try {
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('SYNC_ANCHOR', 'readwrite');
      const store = tx.objectStore('SYNC_ANCHOR');
      store.put({ key, data });
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Failed to save sync anchor to IndexedDB', e);
  }
}

export async function deleteSyncAnchorFromDB(key: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('SYNC_ANCHOR', 'readwrite');
      const store = tx.objectStore('SYNC_ANCHOR');
      store.delete(key);
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Failed to delete sync anchor from IndexedDB', e);
  }
}
