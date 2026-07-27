import { getAllStorageConfigs, getStorageConfig } from './config';
import { getDirStats } from './fsHelper';
import { localDirGetStoreItems, localDirSaveItems } from './localDirDriver';
import { getOpfsDirHandle, opfsGetStoreItems, opfsSaveItems } from './opfsDriver';
import { Content, PostContent } from '../../types';

export * from './config';
export * from './types';
export * from './fsHelper';

export async function getStoreItems(
  storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA',
  parentId = 0
): Promise<Content[]> {
  const config = await getStorageConfig(parentId);
  if (parentId > 0 || config.type === 'local') {
    return await localDirGetStoreItems(storeName, parentId, config.handle);
  }
  return await opfsGetStoreItems(storeName, parentId, config.pathName);
}

export async function saveStoreItems(
  storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA',
  contents: (Content | PostContent)[],
  deleteIdOrTitle?: number | string,
  parentId?: number
): Promise<void> {
  if (contents.length === 0 && deleteIdOrTitle !== undefined && parentId === undefined) {
    const allConfigs = await getAllStorageConfigs();
    const parentIds = new Set([0, ...allConfigs.map((c) => c.parentId)]);
    for (const pid of parentIds) {
      try {
        const config = await getStorageConfig(pid);
        if (pid > 0 || config.type === 'local') {
          await localDirSaveItems(storeName, pid, config.handle, [], deleteIdOrTitle);
        } else {
          await opfsSaveItems(storeName, pid, config.pathName, [], deleteIdOrTitle);
        }
      } catch (e) {}
    }
    return;
  }

  let targetParentId = parentId;
  if (targetParentId === undefined) {
    if (contents.length > 0 && contents[0].parentId !== undefined) {
      targetParentId = contents[0].parentId;
    } else {
      targetParentId = 0;
    }
  }

  const config = await getStorageConfig(targetParentId);
  if (targetParentId > 0 || config.type === 'local') {
    await localDirSaveItems(storeName, targetParentId, config.handle, contents, deleteIdOrTitle);
  } else {
    await opfsSaveItems(storeName, targetParentId, config.pathName, contents, deleteIdOrTitle);
  }
}

export async function getStorageStats(
  parentId = 0
): Promise<{ count: number; totalSize: number; lastModified: number }> {
  try {
    const config = await getStorageConfig(parentId);
    if (parentId > 0 || config.type === 'local') {
      if (!config.handle) return { count: 0, totalSize: 0, lastModified: 0 };
      return await getDirStats(config.handle);
    }
    const dirHandle = await getOpfsDirHandle(config.pathName);
    return await getDirStats(dirHandle);
  } catch (e) {
    return { count: 0, totalSize: 0, lastModified: 0 };
  }
}
