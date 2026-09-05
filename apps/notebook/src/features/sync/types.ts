import { Content, PostContent } from '../../types';

export type SyncContentType = 'NOTE' | 'BOARD';

export type SyncActionType = 'LOCAL_TO_REMOTE' | 'REMOTE_TO_LOCAL' | 'SKIP';

export type SyncDiffStatus = 'LOCAL_ONLY' | 'REMOTE_ONLY' | 'MODIFIED';

export type SyncDiffItem = {
  id: string; // `NOTE:title` 또는 `BOARD:title`
  type: SyncContentType;
  title: string;
  status: SyncDiffStatus;
  action: SyncActionType;
  localContent?: {
    description: string;
    lastModified?: string;
    raw?: Content | PostContent;
  };
  remoteContent?: {
    id: number;
    description: string;
    updated: string;
    raw?: Content;
  };
};

export type SyncOptions = {
  autoCheckOnFocus: boolean; // 화면 포커스 시 자동 검사
  autoCheckOnSave: boolean; // 문서 저장 시 자동 검사
  pollingIntervalMinutes: number; // 주기적 백그라운드 검사 (0: 끔, 1, 5, 15분)
};

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  autoCheckOnFocus: true,
  autoCheckOnSave: true,
  pollingIntervalMinutes: 0,
};
