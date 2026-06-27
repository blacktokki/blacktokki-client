export const DB_NAME = '@Blacktokki:notebook';
export const DB_VERSION = 3;

let dbInstance: IDBDatabase | undefined;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('NOTE')) {
        db.createObjectStore('NOTE', { keyPath: 'title' });
      }
      if (!db.objectStoreNames.contains('BOARD')) {
        db.createObjectStore('BOARD', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('NOTEBOOK')) {
        db.createObjectStore('NOTEBOOK', { keyPath: 'id' });
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
