import { useAuthContext } from '@blacktokki/account';
import { getMarkdownUtil, toHtml, toMarkdown } from '@blacktokki/editor';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from 'react-query';

import { deleteSyncAnchorFromDB, getSyncAnchorFromDB, saveSyncAnchorToDB } from './db';
import {
  DEFAULT_SYNC_OPTIONS,
  SyncActionType,
  SyncAnchor,
  SyncDiffItem,
  SyncDiffStatus,
  SyncOptions,
} from './types';
import { DEFAULT_POLLING_INTERVAL } from '../../hooks/useNoteStorage';
import { useUsageMode } from '../../hooks/useUsageMode';
import { getContentList, patchContent, postContent } from '../../services/notebook';
import { getStorageConfig, getStoreItems, saveStoreItems } from '../../services/storage';
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
  return await getSyncAnchorFromDB<SyncAnchor>(anchorKey);
};

export const saveSyncAnchor = async (anchorKey: string, anchor: SyncAnchor): Promise<void> => {
  await saveSyncAnchorToDB(anchorKey, anchor);
};

export const deleteSyncAnchor = async (
  userId: number | string,
  notebookTitle: string
): Promise<void> => {
  const anchorKey = getSyncAnchorKey(userId, notebookTitle);
  await deleteSyncAnchorFromDB(anchorKey);
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

export const deleteSyncOptions = async (
  userId: number | string,
  notebookId: number | string
): Promise<void> => {
  try {
    await AsyncStorage.removeItem(`${SYNC_OPTIONS_KEY}${userId}:${notebookId}`);
  } catch (e) {
    console.error('Failed to delete sync options', e);
  }
};

export const useSyncOptions = () => {
  const { auth } = useAuthContext();
  const { notebook } = useUsageMode();
  const queryClient = useQueryClient();

  const notebookId = notebook?.id;
  const userId = auth.isLocal ? '' : `${auth.user?.id || ''}`;
  const subkey = userId && notebookId ? `${userId}:${notebookId}` : userId;

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
 * 현재 동기화(mutation)가 진행 중인 원격 노트북 ID 추적 (중복/동시 실행 전역 차단)
 */
export const runningSyncNotebookIds = new Set<number | string>();

/**
 * 동기화 실행 뮤테이션
 */
export const useExecuteSync = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { notebook } = useUsageMode();

  return useMutation({
    mutationKey: ['executeSync', notebook?.id],
    mutationFn: async ({
      diffItems,
      matchedLocalNotebook,
    }: {
      diffItems: SyncDiffItem[];
      matchedLocalNotebook: Content | null;
    }) => {
      if (!notebook) throw new Error('현재 선택된 원격 노트북이 없습니다.');

      const currentNotebookId = notebook.id;
      if (runningSyncNotebookIds.has(currentNotebookId)) {
        console.warn(
          `[Sync] Notebook ${currentNotebookId} is already syncing. Skipping duplicate execution.`
        );
        return { success: false, skipped: true };
      }
      runningSyncNotebookIds.add(currentNotebookId);

      try {
        let targetLocalNotebookId = matchedLocalNotebook?.id;

        // 로컬 노트북 ID가 없을 경우 재조회, 그래도 없으면 에러
        if (!targetLocalNotebookId) {
          const localNotebooks = await getStoreItems('NOTEBOOK', 0);
          const created = localNotebooks.find(
            (nb) => nb.title?.trim().toLowerCase() === notebook.title?.trim().toLowerCase()
          );
          if (created) {
            targetLocalNotebookId = created.id;
          } else {
            throw new Error(
              '동기화할 로컬 노트북이 없습니다. 로컬 노트북을 먼저 생성하고 폴더를 연결해주세요.'
            );
          }
        }

        // 원격 생성 시 중복 방지(Deduplication Guard)를 위해 최신 원격 컨텐츠 목록 사전 조회
        const latestRemoteMap = new Map<string, Content>();
        try {
          const latestRemotes = await getContentList(notebook.id, ['NOTE', 'BOARD']);
          for (const r of latestRemotes) {
            latestRemoteMap.set(`${r.type}:${r.title.trim()}`, r);
          }
        } catch (e) {
          console.warn('[Sync] Failed to fetch latest remote contents for deduplication check:', e);
        }

        // 2. 각 항목별 동기화 실행
        for (const item of diffItems) {
          if (item.action === 'SKIP') continue;

          if (item.action === 'LOCAL_TO_REMOTE') {
            // 로컬 -> 원격
            const rawDesc = item.localContent?.description || '';
            const htmlDesc =
              item.type === 'NOTE'
                ? rawDesc.trim().startsWith('<')
                  ? rawDesc
                  : (await getMarkdownUtil()).renderer(rawDesc)
                : rawDesc;

            // 멱등성 보장: diffItems의 remoteContent.id가 없더라도 최신 원격 목록에 동일 항목이 존재하면 PATCH로 전환
            const existingRemote = latestRemoteMap.get(`${item.type}:${item.title.trim()}`);
            const remoteId = item.remoteContent?.id || existingRemote?.id;

            if (remoteId) {
              // 원격에 이미 존재하므로 수정 (PATCH)
              await patchContent(remoteId, {
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
              const newRemoteId = await postContent({
                title: item.title,
                description: htmlDesc,
                input: item.title,
                userId: auth.user?.id || 0,
                parentId: notebook.id,
                type: item.type,
                order: 0,
                option: (item.localContent?.raw?.option as any) || {},
              });
              latestRemoteMap.set(`${item.type}:${item.title.trim()}`, {
                id: newRemoteId,
                title: item.title,
                type: item.type,
                description: htmlDesc,
              } as Content);
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
      } finally {
        runningSyncNotebookIds.delete(currentNotebookId);
      }
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

  const isSyncAvailable =
    !auth.isLocal &&
    auth.user !== null &&
    auth.user !== undefined &&
    usageMode === 'NOTEBOOK' &&
    !!notebook?.title;

  const currentRemoteNotebookId = notebook?.id || 0;
  const currentNotebookTitle = notebook?.title?.trim() || '';

  const isAnySyncMutating =
    useIsMutating({ mutationKey: ['executeSync', currentRemoteNotebookId] }) > 0;
  const isNotebookSyncing =
    runningSyncNotebookIds.has(currentRemoteNotebookId) ||
    isAnySyncMutating ||
    executeSync.isLoading;

  const queryKey = useMemo(
    () => ['notebookSyncDiff', currentRemoteNotebookId, currentNotebookTitle],
    [currentRemoteNotebookId, currentNotebookTitle]
  );

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

      let matchedLocalNotebook =
        localNotebooks.find(
          (nb) => nb.title?.trim().toLowerCase() === currentNotebookTitle.toLowerCase()
        ) || null;

      // 로컬 노트북이 목록에 있더라도 실제 PC 폴더(handle)가 연결되어 있지 않으면 미존재(미연결)로 판정
      if (matchedLocalNotebook) {
        try {
          const config = await getStorageConfig(matchedLocalNotebook.id);
          if (!config.handle) {
            console.log(
              `[useNotebookSync] Local notebook "${currentNotebookTitle}" (id: ${matchedLocalNotebook.id}) has no valid local folder handle. Treating as missing.`
            );
            matchedLocalNotebook = null;
          }
        } catch (e) {
          console.warn('[useNotebookSync] Error checking storage config for local notebook:', e);
          matchedLocalNotebook = null;
        }
      }

      const isLocalNotebookMissing = matchedLocalNotebook === null;

      console.log(
        `[useNotebookSync] Notebook "${currentNotebookTitle}" | matchedLocalNotebook:`,
        matchedLocalNotebook?.id ?? 'none',
        '| isLocalNotebookMissing:',
        isLocalNotebookMissing
      );

      // 로컬에 매칭되는 노트북이 없는 경우(삭제되었거나 미연결):
      // 계정 노트를 임의로 신규 동기화 항목(REMOTE_ONLY)으로 수집하지 않고,
      // diffItems를 빈 배열로 반환하여 불필요한 배지 및 오동작 차단
      if (!matchedLocalNotebook) {
        return {
          matchedLocalNotebook: null,
          isLocalNotebookMissing: true,
          diffItems: [] as SyncDiffItem[],
          diffCount: 0,
        };
      }

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

        const localNorm = localItem
          ? type === 'NOTE'
            ? toMarkdown(localItem.description || '')
            : typeof localItem.description === 'string'
            ? localItem.description
            : JSON.stringify(localItem.description || '')
          : null;
        const localHash = localNorm !== null ? hashContent(localNorm) : null;

        const remoteNorm = remoteItem
          ? type === 'NOTE'
            ? toMarkdown(remoteItem.description || '')
            : typeof remoteItem.description === 'string'
            ? remoteItem.description
            : JSON.stringify(remoteItem.description || '')
          : null;
        const remoteHash = remoteNorm !== null ? hashContent(remoteNorm) : null;

        const anchorHash = anchorData[key]?.hash ?? null;

        console.log(
          `[Sync] "${title}" | anchor.hash: ${anchorHash ?? 'none'} | remoteHash: ${
            remoteHash ?? 'none'
          } | localHash: ${localHash ?? 'none'}`
        );

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
              description: toHtml(toMarkdown(localItem.description || '')),
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
          const equal =
            (localHash !== null && remoteHash !== null && localHash === remoteHash) ||
            isContentEqual(type, localDesc, remoteDesc);

          if (!equal) {
            const localTime = new Date(localItem.updated || 0).getTime();
            const remoteTime = new Date(remoteItem.updated || 0).getTime();
            const defaultAction: SyncActionType =
              localTime > remoteTime ? 'LOCAL_TO_REMOTE' : 'REMOTE_TO_LOCAL';

            const anchor = anchorData[key];
            let isConflict = false;
            let status: SyncDiffStatus = 'MODIFIED';
            let action: SyncActionType = defaultAction;

            if (anchor && localHash !== null && remoteHash !== null) {
              const localChanged = localHash !== anchor.hash;
              const remoteChanged = remoteHash !== anchor.hash;

              if (localChanged && remoteChanged) {
                isConflict = true;
                status = 'CONFLICT';
              } else if (localChanged && !remoteChanged) {
                isConflict = false;
                status = 'MODIFIED';
                action = 'LOCAL_TO_REMOTE';
              } else if (!localChanged && remoteChanged) {
                isConflict = false;
                status = 'MODIFIED';
                action = 'REMOTE_TO_LOCAL';
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
              action,
              isConflict,
              localTime,
              remoteTime,
              localContent: {
                description: toHtml(toMarkdown(localItem.description || '')),
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
          } else if (!anchorData[key] || anchorData[key].hash !== localHash) {
            // 이미 동일한 항목은 기준점이 없거나 이전 해시와 다르면 현재 해시로 자동 갱신
            const norm =
              type === 'NOTE'
                ? localDesc
                : typeof localDesc === 'string'
                ? localDesc
                : JSON.stringify(localDesc);
            anchorData[key] = {
              hash: localHash || hashContent(norm),
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
    refetchInterval: options.autoSyncNonConflicted ? 15 * 1000 : DEFAULT_POLLING_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: 0,
    refetchOnMount: 'always',
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
        !runningSyncNotebookIds.has(currentRemoteNotebookId) &&
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
  }, [
    options.autoCheckOnSave,
    isSyncAvailable,
    queryClient,
    queryKey,
    executeSync.isLoading,
    currentRemoteNotebookId,
  ]);

  // 미충돌 노트 한정 자동 동기화
  useEffect(() => {
    if (!options.autoSyncNonConflicted || !isSyncAvailable) return;
    if (isLoading || isFetching || isNotebookSyncing) return;
    if (!data?.matchedLocalNotebook) return;

    const nonConflictedItems = (data?.diffItems || []).filter(
      (item) => !item.isConflict && item.status !== 'CONFLICT' && item.action !== 'SKIP'
    );

    if (nonConflictedItems.length === 0) return;

    executeSync
      .mutateAsync({
        diffItems: nonConflictedItems,
        matchedLocalNotebook: data?.matchedLocalNotebook || null,
      })
      .catch((err) => {
        console.error('Auto sync non-conflicted items failed:', err);
      });
  }, [
    options.autoSyncNonConflicted,
    isSyncAvailable,
    isLoading,
    isFetching,
    isNotebookSyncing,
    executeSync,
    data?.diffItems,
    data?.matchedLocalNotebook,
  ]);

  const manualRefresh = useCallback(async () => {
    await queryClient.invalidateQueries(queryKey);
    return await refetch();
  }, [queryClient, queryKey, refetch]);

  return {
    isSyncAvailable,
    isLoading,
    isFetching,
    isAutoSyncing: isNotebookSyncing,
    ...syncResult,
    refetch,
    manualRefresh,
  };
};
