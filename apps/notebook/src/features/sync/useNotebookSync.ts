import { useAuthContext } from '@blacktokki/account';
import { toHtml, toMarkdown } from '@blacktokki/editor';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import {
  DEFAULT_SYNC_OPTIONS,
  SyncActionType,
  SyncAnchor,
  SyncDiffItem,
  SyncDiffStatus,
  SyncOptions,
} from './types';
import { useUsageMode } from '../../hooks/useUsageMode';
import { getContentList, patchContent, postContent } from '../../services/notebook';
import { getStoreItems, saveStoreItems } from '../../services/storage';
import { Content, PostContent } from '../../types';

const SYNC_OPTIONS_KEY = '@blacktokki:notebook:sync_options:';
const SYNC_ANCHOR_KEY = '@blacktokki:notebook:sync_anchor:';

export const hashContent = (text: string): string => {
  let hash = 5381;
  const str = (text || '').trim().replace(/\r\n/g, '\n');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
};

export const getSyncAnchorKey = (userId: number | string, notebookTitle: string): string => {
  return `${SYNC_ANCHOR_KEY}${userId}:${notebookTitle.trim().toLowerCase()}`;
};

export const getSyncAnchor = async (anchorKey: string): Promise<SyncAnchor> => {
  try {
    const value = await AsyncStorage.getItem(anchorKey);
    return value ? JSON.parse(value) : {};
  } catch (e) {
    return {};
  }
};

export const saveSyncAnchor = async (anchorKey: string, anchor: SyncAnchor): Promise<void> => {
  try {
    await AsyncStorage.setItem(anchorKey, JSON.stringify(anchor));
  } catch (e) {
    console.error('Failed to save sync anchor', e);
  }
};

export const getSyncOptions = async (subkey: string): Promise<SyncOptions> => {
  try {
    const value = await AsyncStorage.getItem(SYNC_OPTIONS_KEY + subkey);
    if (!value) return DEFAULT_SYNC_OPTIONS;
    return { ...DEFAULT_SYNC_OPTIONS, ...JSON.parse(value) };
  } catch (e) {
    return DEFAULT_SYNC_OPTIONS;
  }
};

export const setSyncOptions = async (subkey: string, options: SyncOptions): Promise<void> => {
  try {
    await AsyncStorage.setItem(SYNC_OPTIONS_KEY + subkey, JSON.stringify(options));
  } catch (e) {
    console.error('Failed to save sync options', e);
  }
};

export const useSyncOptions = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id || ''}`;
  const queryClient = useQueryClient();

  const { data: options = DEFAULT_SYNC_OPTIONS } = useQuery({
    queryKey: ['syncOptions', subkey],
    queryFn: () => getSyncOptions(subkey),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (newOptions: SyncOptions) => {
      await setSyncOptions(subkey, newOptions);
      return newOptions;
    },
    onSuccess: (newOptions) => {
      queryClient.setQueryData(['syncOptions', subkey], newOptions);
      queryClient.invalidateQueries(['notebookSyncDiff']);
    },
  });

  return { options, setOptions: mutation.mutateAsync, isUpdating: mutation.isLoading };
};

/**
 * 두 텍스트(마크다운/HTML)의 실질적인 내용 동일 여부 판별
 */
const isContentEqual = (type: 'NOTE' | 'BOARD', localDesc: string, remoteDesc: string): boolean => {
  if (type === 'NOTE') {
    // 로컬 마크다운과 원격 HTML을 모두 마크다운으로 정규화하여 비교
    const normalizedLocal = localDesc.trim().replace(/\r\n/g, '\n');
    const normalizedRemote = toMarkdown(remoteDesc || '')
      .trim()
      .replace(/\r\n/g, '\n');
    return normalizedLocal === normalizedRemote;
  } else {
    // BOARD: JSON 비교
    try {
      const obj1 = typeof localDesc === 'string' ? JSON.parse(localDesc) : localDesc;
      const obj2 = typeof remoteDesc === 'string' ? JSON.parse(remoteDesc) : remoteDesc;
      return JSON.stringify(obj1) === JSON.stringify(obj2);
    } catch {
      return (localDesc || '').trim() === (remoteDesc || '').trim();
    }
  }
};

/**
 * 동기화 실행 뮤테이션
 */
export const useExecuteSync = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { notebook } = useUsageMode();

  return useMutation({
    mutationFn: async ({
      diffItems,
      matchedLocalNotebook,
    }: {
      diffItems: SyncDiffItem[];
      matchedLocalNotebook: Content | null;
    }) => {
      if (!notebook) throw new Error('현재 선택된 원격 노트북이 없습니다.');

      let targetLocalNotebookId = matchedLocalNotebook?.id;

      // 1. 로컬 노트북이 없는 경우 자동 생성
      if (!targetLocalNotebookId) {
        const newLocalNotebookData: Content | PostContent = {
          title: notebook.title,
          description: notebook.description || '',
          input: notebook.title,
          userId: 0,
          parentId: 0,
          type: 'NOTEBOOK',
          order: 0,
          updated: new Date().toISOString(),
          option: notebook.option || ({} as any),
        } as Content;

        await saveStoreItems('NOTEBOOK', [newLocalNotebookData], undefined, 0);

        // 생성된 로컬 노트북 다시 조회하여 ID 획득
        const localNotebooks = await getStoreItems('NOTEBOOK', 0);
        const created = localNotebooks.find(
          (nb) => nb.title?.trim().toLowerCase() === notebook.title?.trim().toLowerCase()
        );
        if (!created) {
          throw new Error('로컬 노트북 자동 생성에 실패하였습니다.');
        }
        targetLocalNotebookId = created.id;
      }

      // 2. 각 항목별 동기화 실행
      for (const item of diffItems) {
        if (item.action === 'SKIP') continue;

        if (item.action === 'LOCAL_TO_REMOTE') {
          // 로컬 -> 원격
          const htmlDesc =
            item.type === 'NOTE'
              ? toHtml(item.localContent?.description || '')
              : item.localContent?.description || '';

          if (item.remoteContent?.id) {
            // 원격에 이미 존재하므로 수정 (PATCH)
            await patchContent(item.remoteContent.id, {
              title: item.title,
              description: htmlDesc,
              input: item.title,
              userId: auth.user?.id || 0,
              parentId: notebook.id,
              type: item.type,
              order: 0,
              option: (item.localContent?.raw?.option as any) || {},
            });
          } else {
            // 원격에 새로 생성 (POST)
            await postContent({
              title: item.title,
              description: htmlDesc,
              input: item.title,
              userId: auth.user?.id || 0,
              parentId: notebook.id,
              type: item.type,
              order: 0,
              option: (item.localContent?.raw?.option as any) || {},
            });
          }
        } else if (item.action === 'REMOTE_TO_LOCAL') {
          // 원격 -> 로컬
          if (item.type === 'NOTE') {
            const noteContent: Content | PostContent = {
              title: item.title,
              description: item.remoteContent?.description || '',
              input: item.title,
              userId: 0,
              parentId: targetLocalNotebookId,
              type: 'NOTE',
              order: 0,
              updated: item.remoteContent?.updated || new Date().toISOString(),
              option: item.remoteContent?.raw?.option || ({} as any),
            } as Content;
            await saveStoreItems('NOTE', [noteContent], undefined, targetLocalNotebookId);
          } else if (item.type === 'BOARD') {
            const boardContent: Content | PostContent = {
              title: item.title,
              description: item.remoteContent?.description || '',
              input: item.title,
              userId: 0,
              parentId: targetLocalNotebookId,
              type: 'BOARD',
              order: 0,
              updated: item.remoteContent?.updated || new Date().toISOString(),
              option: item.remoteContent?.raw?.option || ({} as any),
            } as Content;
            await saveStoreItems('BOARD', [boardContent], undefined, targetLocalNotebookId);
          }
        }
      }

      // 3. 동기화 성공 항목들 sync anchor 업데이트
      const anchorKey = getSyncAnchorKey(auth.user?.id || 0, notebook.title);
      const anchorData = await getSyncAnchor(anchorKey);
      const now = new Date().toISOString();

      for (const item of diffItems) {
        if (item.action === 'SKIP') continue;
        let finalDesc = '';
        if (item.action === 'LOCAL_TO_REMOTE') {
          finalDesc = item.localContent?.description || '';
        } else if (item.action === 'REMOTE_TO_LOCAL') {
          finalDesc =
            item.type === 'NOTE'
              ? toMarkdown(item.remoteContent?.description || '')
              : item.remoteContent?.description || '';
        }
        const norm =
          item.type === 'NOTE'
            ? finalDesc
            : typeof finalDesc === 'string'
            ? finalDesc
            : JSON.stringify(finalDesc);

        anchorData[item.id] = {
          hash: hashContent(norm),
          syncedAt: now,
        };
      }
      await saveSyncAnchor(anchorKey, anchorData);

      return { success: true };
    },
    onSuccess: () => {
      // 관련 모든 쿼리 캐시 무효화
      queryClient.invalidateQueries(['notebookSyncDiff']);
      queryClient.invalidateQueries(['pageContents']);
      queryClient.invalidateQueries(['boardContents']);
      queryClient.invalidateQueries(['notebookContents']);
    },
  });
};

export const useNotebookSync = () => {
  const { auth } = useAuthContext();
  const { usageMode, notebook } = useUsageMode();
  const { options } = useSyncOptions();
  const queryClient = useQueryClient();
  const executeSync = useExecuteSync();
  const isAutoSyncingRef = useRef(false);

  const isSyncAvailable =
    !auth.isLocal &&
    auth.user !== null &&
    auth.user !== undefined &&
    usageMode === 'NOTEBOOK' &&
    !!notebook?.title;

  const currentRemoteNotebookId = notebook?.id || 0;
  const currentNotebookTitle = notebook?.title?.trim() || '';

  const queryKey = ['notebookSyncDiff', currentRemoteNotebookId, currentNotebookTitle];

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isSyncAvailable) {
        return {
          matchedLocalNotebook: null,
          isLocalNotebookMissing: false,
          diffItems: [] as SyncDiffItem[],
          diffCount: 0,
        };
      }

      // 1. 로컬 노트북 목록 조회
      let localNotebooks: Content[] = [];
      try {
        localNotebooks = await getStoreItems('NOTEBOOK', 0);
      } catch (e) {
        console.error('Error fetching local notebooks for sync:', e);
      }

      const matchedLocalNotebook =
        localNotebooks.find(
          (nb) => nb.title?.trim().toLowerCase() === currentNotebookTitle.toLowerCase()
        ) || null;

      const isLocalNotebookMissing = matchedLocalNotebook === null;

      // 2. 원격 컨텐츠 수집 (NOTE, BOARD)
      let remoteContents: Content[] = [];
      try {
        remoteContents = await getContentList(currentRemoteNotebookId, ['NOTE', 'BOARD']);
      } catch (e) {
        console.error('Error fetching remote contents for sync:', e);
      }

      // 3. 로컬 컨텐츠 수집
      let localNotes: Content[] = [];
      let localBoards: Content[] = [];
      if (matchedLocalNotebook) {
        try {
          localNotes = await getStoreItems('NOTE', matchedLocalNotebook.id);
          localBoards = await getStoreItems('BOARD', matchedLocalNotebook.id);
        } catch (e) {
          console.error('Error fetching local items for sync:', e);
        }
      }

      const localItemsMap = new Map<string, Content>();
      for (const n of localNotes) {
        // 가상 폴더 노트는 제외
        if (n.description !== undefined) {
          localItemsMap.set(`NOTE:${n.title.trim()}`, n);
        }
      }
      for (const b of localBoards) {
        localItemsMap.set(`BOARD:${b.title.trim()}`, b);
      }

      const remoteItemsMap = new Map<string, Content>();
      for (const r of remoteContents) {
        remoteItemsMap.set(`${r.type}:${r.title.trim()}`, r);
      }

      const allKeys = new Set([...localItemsMap.keys(), ...remoteItemsMap.keys()]);
      const diffItems: SyncDiffItem[] = [];

      const anchorKey = getSyncAnchorKey(auth.user?.id || 0, currentNotebookTitle);
      const anchorData = await getSyncAnchor(anchorKey);
      let anchorUpdated = false;

      for (const key of allKeys) {
        const [typeStr, ...titleParts] = key.split(':');
        const type = typeStr as 'NOTE' | 'BOARD';
        const title = titleParts.join(':');

        const localItem = localItemsMap.get(key);
        const remoteItem = remoteItemsMap.get(key);

        if (localItem && !remoteItem) {
          // 로컬에만 존재
          diffItems.push({
            id: key,
            type,
            title,
            status: 'LOCAL_ONLY',
            action: 'LOCAL_TO_REMOTE',
            isConflict: false,
            localContent: {
              description: toMarkdown(localItem.description || ''),
              lastModified: localItem.updated,
              raw: localItem,
            },
          });
        } else if (!localItem && remoteItem) {
          // 원격에만 존재
          diffItems.push({
            id: key,
            type,
            title,
            status: 'REMOTE_ONLY',
            action: 'REMOTE_TO_LOCAL',
            isConflict: false,
            remoteContent: {
              id: remoteItem.id,
              description: remoteItem.description || '',
              updated: remoteItem.updated,
              raw: remoteItem,
            },
          });
        } else if (localItem && remoteItem) {
          // 양쪽에 모두 존재 -> 내용 비교
          const localDesc = toMarkdown(localItem.description || '');
          const remoteDesc = remoteItem.description || '';
          const equal = isContentEqual(type, localDesc, remoteDesc);

          if (!equal) {
            const localTime = new Date(localItem.updated || 0).getTime();
            const remoteTime = new Date(remoteItem.updated || 0).getTime();
            const defaultAction: SyncActionType =
              localTime > remoteTime ? 'LOCAL_TO_REMOTE' : 'REMOTE_TO_LOCAL';

            const anchor = anchorData[key];
            let isConflict = false;
            let status: SyncDiffStatus = 'MODIFIED';

            if (anchor) {
              const localNorm =
                type === 'NOTE'
                  ? localDesc
                  : typeof localDesc === 'string'
                  ? localDesc
                  : JSON.stringify(localDesc);
              const remoteNorm =
                type === 'NOTE'
                  ? toMarkdown(remoteDesc)
                  : typeof remoteDesc === 'string'
                  ? remoteDesc
                  : JSON.stringify(remoteDesc);

              const localHash = hashContent(localNorm);
              const remoteHash = hashContent(remoteNorm);

              const localChanged = localHash !== anchor.hash;
              const remoteChanged = remoteHash !== anchor.hash;

              if (localChanged && remoteChanged) {
                isConflict = true;
                status = 'CONFLICT';
              } else if (localChanged && !remoteChanged) {
                isConflict = false;
                status = 'MODIFIED';
              } else if (!localChanged && remoteChanged) {
                isConflict = false;
                status = 'MODIFIED';
              } else {
                // 해시가 기준점과 동일하지만 내용이 다른 예외 상황 -> 충돌로 안전 처리
                isConflict = true;
                status = 'CONFLICT';
              }
            } else {
              // 기준점이 없는 상태에서 양쪽 내용이 다름 -> 동시 편집/충돌로 간주
              isConflict = true;
              status = 'CONFLICT';
            }

            diffItems.push({
              id: key,
              type,
              title,
              status,
              action: defaultAction,
              isConflict,
              localTime,
              remoteTime,
              localContent: {
                description: localDesc,
                lastModified: localItem.updated,
                raw: localItem,
              },
              remoteContent: {
                id: remoteItem.id,
                description: remoteDesc,
                updated: remoteItem.updated,
                raw: remoteItem,
              },
            });
          } else if (!anchorData[key]) {
            // 이미 동일한 항목은 기준점이 없으면 자동 등록
            const norm =
              type === 'NOTE'
                ? localDesc
                : typeof localDesc === 'string'
                ? localDesc
                : JSON.stringify(localDesc);
            anchorData[key] = {
              hash: hashContent(norm),
              syncedAt: new Date().toISOString(),
            };
            anchorUpdated = true;
          }
        }
      }

      if (anchorUpdated) {
        await saveSyncAnchor(anchorKey, anchorData);
      }

      return {
        matchedLocalNotebook,
        isLocalNotebookMissing,
        diffItems,
        diffCount: diffItems.length,
      };
    },
    enabled: isSyncAvailable,
    refetchOnWindowFocus: options.autoCheckOnFocus,
    refetchInterval:
      options.pollingIntervalMinutes > 0 ? options.pollingIntervalMinutes * 60 * 1000 : false,
    staleTime: 1000 * 30, // 30초 캐싱
  });

  const syncResult = useMemo(
    () =>
      data || {
        matchedLocalNotebook: null,
        isLocalNotebookMissing: false,
        diffItems: [] as SyncDiffItem[],
        diffCount: 0,
      },
    [data]
  );

  // 노트/보드 저장 시 자동 차이 검사
  useEffect(() => {
    if (!options.autoCheckOnSave || !isSyncAvailable) return;

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (!event) return;
      const key = event.query?.queryKey?.[0];
      if (
        !isAutoSyncingRef.current &&
        !executeSync.isLoading &&
        (key === 'pageContents' || key === 'boardContents') &&
        (event.type === 'queryUpdated' || event.type === 'observerResultsUpdated')
      ) {
        queryClient.invalidateQueries(queryKey);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [options.autoCheckOnSave, isSyncAvailable, queryClient, queryKey, executeSync.isLoading]);

  // 미충돌 노트 한정 자동 동기화
  useEffect(() => {
    if (!options.autoSyncNonConflicted || !isSyncAvailable) return;
    if (isLoading || isFetching || executeSync.isLoading || isAutoSyncingRef.current) return;

    const nonConflictedItems = (data?.diffItems || []).filter(
      (item) => !item.isConflict && item.status !== 'CONFLICT' && item.action !== 'SKIP'
    );

    if (nonConflictedItems.length === 0) return;

    isAutoSyncingRef.current = true;
    executeSync
      .mutateAsync({
        diffItems: nonConflictedItems,
        matchedLocalNotebook: data?.matchedLocalNotebook || null,
      })
      .catch((err) => {
        console.error('Auto sync non-conflicted items failed:', err);
      })
      .finally(() => {
        isAutoSyncingRef.current = false;
      });
  }, [
    options.autoSyncNonConflicted,
    isSyncAvailable,
    isLoading,
    isFetching,
    executeSync,
    data?.diffItems,
    data?.matchedLocalNotebook,
  ]);

  return {
    isSyncAvailable,
    isLoading,
    isFetching,
    isAutoSyncing: isAutoSyncingRef.current || executeSync.isLoading,
    ...syncResult,
    refetch,
    manualRefresh: async () => {
      await queryClient.invalidateQueries(queryKey);
      return await refetch();
    },
  };
};
