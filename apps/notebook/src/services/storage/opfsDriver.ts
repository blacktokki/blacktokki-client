import { getNestedDirHandle, readContentsFromDir, saveContentsToDir } from './fsHelper';
import { DEFAULT_OPFS_DIR } from './types';
import { Content, PostContent } from '../../types';

export async function getOpfsDirHandle(pathName: string): Promise<any> {
  const opfsRoot = await navigator.storage.getDirectory();
  return await getNestedDirHandle(opfsRoot, pathName || DEFAULT_OPFS_DIR, true);
}

export async function opfsGetStoreItems(
  storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA',
  parentId: number,
  pathName: string
): Promise<Content[]> {
  try {
    const dirHandle = await getOpfsDirHandle(pathName);
    return await readContentsFromDir(dirHandle, storeName, parentId);
  } catch (e) {
    console.error('opfsGetStoreItems error:', e);
    return [];
  }
}

export async function opfsSaveItems(
  storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA',
  parentId: number,
  pathName: string,
  contents: (Content | PostContent)[],
  deleteIdOrTitle?: number | string
): Promise<void> {
  const dirHandle = await getOpfsDirHandle(pathName);
  await saveContentsToDir(dirHandle, storeName, parentId, contents, deleteIdOrTitle);
}
