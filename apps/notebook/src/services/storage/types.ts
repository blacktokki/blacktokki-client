import { Content, PostContent } from '../../types';

export const DEFAULT_OPFS_DIR = 'blacktokki-notebook';

export type StorageConfig = {
  parentId: number; // 0: 일반/간단 모드, 1, 2...: 개별 노트북 ID
  type: 'opfs' | 'local';
  pathName: string; // 폴더 이름 또는 OPFS 하위 디렉토리 경로
  handle?: any; // FileSystemDirectoryHandle (type === 'local'일 때 IndexedDB에 보존됨)
};

export interface IFileStorageDriver {
  getStoreItems(
    storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA'
  ): Promise<Content[]>;
  saveItems(
    storeName: 'NOTE' | 'BOARD' | 'NOTEBOOK' | 'SNAPSHOT' | 'DELTA',
    contents: (Content | PostContent)[],
    deleteId?: number | string
  ): Promise<void>;
  verifyPermission?(): Promise<boolean>;
}
