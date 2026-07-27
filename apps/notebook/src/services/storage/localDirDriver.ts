import { verifyDirectoryPermission } from './config';
import { readContentsFromDir, saveContentsToDir } from './fsHelper';
import { Content, PostContent } from '../../types';

export async function localDirGetStoreItems(
  storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA',
  parentId: number,
  handle: any
): Promise<Content[]> {
  if (!handle) {
    // console.warn('Local directory handle missing for parentId:', parentId);
    return [];
  }
  const permitted = await verifyDirectoryPermission(handle, false);
  if (!permitted) {
    console.warn('Permission not granted for local directory handle:', parentId);
    return [];
  }
  try {
    return await readContentsFromDir(handle, storeName, parentId);
  } catch (e) {
    console.error('localDirGetStoreItems error:', e);
    return [];
  }
}

export async function localDirSaveItems(
  storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA',
  parentId: number,
  handle: any,
  contents: (Content | PostContent)[],
  deleteIdOrTitle?: number | string
): Promise<void> {
  if (!handle) {
    throw new Error('로컬 디렉토리 핸들이 존재하지 않습니다. 설정을 다시 확인해주세요.');
  }
  const permitted = await verifyDirectoryPermission(handle, true);
  if (!permitted) {
    throw new Error('해당 디렉토리에 대한 쓰기 권한이 없습니다.');
  }
  await saveContentsToDir(handle, storeName, parentId, contents, deleteIdOrTitle);
}
