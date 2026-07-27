import { DEFAULT_OPFS_DIR, StorageConfig } from './types';
import { getDB } from '../db';

const CONFIG_STORE = 'FS_CONFIG';

export async function getStorageConfig(parentId: number): Promise<StorageConfig> {
  if (parentId === 0) {
    return {
      parentId: 0,
      type: 'opfs',
      pathName: DEFAULT_OPFS_DIR,
    };
  }
  try {
    const db = await getDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(CONFIG_STORE, 'readonly');
      const store = tx.objectStore(CONFIG_STORE);
      const request = store.get(parentId);
      request.onsuccess = () => {
        const result = request.result as StorageConfig | undefined;
        if (result) {
          resolve(result);
        } else {
          resolve({
            parentId,
            type: 'local',
            pathName: '',
          });
        }
      };
      request.onerror = () => {
        resolve({
          parentId,
          type: 'local',
          pathName: '',
        });
      };
    });
  } catch (e) {
    console.error('Failed to get storage config from IndexedDB', e);
    return {
      parentId,
      type: 'local',
      pathName: '',
    };
  }
}

export async function setStorageConfig(config: StorageConfig): Promise<void> {
  if (config.parentId === 0) return;
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG_STORE, 'readwrite');
    const store = tx.objectStore(CONFIG_STORE);
    store.put(config);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteStorageConfig(parentId: number): Promise<void> {
  if (parentId === 0) return;
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG_STORE, 'readwrite');
    const store = tx.objectStore(CONFIG_STORE);
    store.delete(parentId);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllStorageConfigs(): Promise<StorageConfig[]> {
  try {
    const db = await getDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(CONFIG_STORE, 'readonly');
      const store = tx.objectStore(CONFIG_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const list = (request.result as StorageConfig[]) || [];
        resolve(list.filter((c) => c.parentId !== 0));
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

export async function selectLocalDirectory(parentId: number): Promise<StorageConfig | null> {
  if (parentId === 0) {
    throw new Error('일반/간단 모드는 별도의 설정 없이 항상 OPFS를 사용합니다.');
  }
  if (!(window as any).showDirectoryPicker) {
    throw new Error('이 브라우저에서는 로컬 디렉토리 직접 지정 기능이 지원되지 않습니다.');
  }
  try {
    const handle = await (window as any).showDirectoryPicker();
    const config: StorageConfig = {
      parentId,
      type: 'local',
      pathName: handle.name,
      handle,
    };
    await setStorageConfig(config);
    return config;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return null;
    }
    throw e;
  }
}

export async function verifyDirectoryPermission(handle: any, readWrite = true): Promise<boolean> {
  if (!handle || !handle.queryPermission || !handle.requestPermission) {
    return false;
  }
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}
