import { StorageConfig } from './types';
import { Content, PostContent } from '../../types';
import { getDB } from '../db';

const CONFIG_STORE = 'FS_CONFIG';

export async function getNotebookItems(): Promise<Content[]> {
  const db = await getDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG_STORE, 'readonly');
    const request = tx.objectStore(CONFIG_STORE).getAll();
    tx.oncomplete = () =>
      resolve(
        (request.result as StorageConfig[])
          .map((config) => config.notebook)
          .filter((notebook): notebook is Content => notebook !== undefined)
      );
    tx.onabort = () => reject(tx.error || new Error('Could not load notebooks'));
  });
}

export async function saveNotebookItems(
  contents: (Content | PostContent)[],
  deleteIdOrTitle?: number | string
): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CONFIG_STORE, 'readwrite');
    const store = tx.objectStore(CONFIG_STORE);
    const request = store.getAll();
    const savedIds: { content: Content | PostContent; id: number }[] = [];
    tx.oncomplete = () => {
      for (const { content, id } of savedIds) {
        (content as Content).id = id;
      }
      resolve();
    };
    tx.onabort = () => reject(tx.error || new Error('Could not save notebooks'));

    request.onsuccess = () => {
      try {
        const configs = new Map(
          (request.result as StorageConfig[]).map((config) => [config.parentId, config])
        );
        let maxId = Math.max(0, ...configs.keys());
        if (contents.length > 0) {
          for (const content of contents) {
            const id = (content as Content).id ?? ++maxId;
            maxId = Math.max(maxId, id);
            const config: StorageConfig = {
              parentId: id,
              type: 'local',
              pathName: `notebook-${id}`,
              ...configs.get(id),
              notebook: { ...content, id } as Content,
            };
            store.put(config);
            configs.set(id, config);
            savedIds.push({ content, id });
          }
        } else if (deleteIdOrTitle !== undefined) {
          for (const config of configs.values()) {
            if (
              String(config.parentId) === String(deleteIdOrTitle) ||
              config.notebook?.title === deleteIdOrTitle
            ) {
              store.delete(config.parentId);
            }
          }
        }
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
  });
}
