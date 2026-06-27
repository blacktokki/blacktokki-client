import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { useUsageMode } from './useUsageMode';
import { getDB } from '../services/db';
import { deleteContent, getContentList, patchContent, postContent } from '../services/notebook';
import { Content, NotebookOption, PostContent } from '../types';

const CURRENT_NOTEBOOK_KEY = '@blacktokki:notebook:current_id:';

const getCurrentNotebookId = async (subkey: string): Promise<number | null> => {
  try {
    const value = await AsyncStorage.getItem(CURRENT_NOTEBOOK_KEY + subkey);
    return value ? parseInt(value, 10) : null;
  } catch (e) {
    return null;
  }
};

// useCurrentNotebook에 통합되었습니다. 내부적으로만 사용되는 queryKey 유지를 위해 코드는 남겨두되 export는 통합본에서 합니다.

export const useSetCurrentNotebookId = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  return useMutation({
    mutationFn: async (id: number | null) => {
      if (id === null) {
        await AsyncStorage.removeItem(CURRENT_NOTEBOOK_KEY + subkey);
      } else {
        await AsyncStorage.setItem(CURRENT_NOTEBOOK_KEY + subkey, String(id));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentNotebookId', subkey] });
      queryClient.invalidateQueries({ queryKey: ['pageContents'] });
      queryClient.invalidateQueries({ queryKey: ['boardContents'] });
      queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
    },
  });
};

const getNotebookContents = async (isOnline: boolean): Promise<Content[]> => {
  if (isOnline) {
    return await getContentList(undefined, ['NOTEBOOK'], undefined, true);
  }
  const db = await getDB();
  return new Promise((resolve) => {
    const transaction = db.transaction('NOTEBOOK', 'readonly');
    const store = transaction.objectStore('NOTEBOOK');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as Content[]);
    request.onerror = () => resolve([]);
  });
};

const saveNotebookContent = async (
  isOnline: boolean,
  contents: (Content | PostContent)[],
  deleteId?: number
): Promise<void> => {
  const content = contents.length === 1 ? contents[0] : undefined;
  if (isOnline) {
    if (content) {
      const id = (content as Content).id;
      if (id) {
        await patchContent(id, content);
      } else {
        await postContent(content);
      }
    } else if (deleteId) {
      await deleteContent(deleteId);
    }
    return;
  }

  const db = await getDB();
  const tx = db.transaction('NOTEBOOK', 'readwrite');
  const store = tx.objectStore('NOTEBOOK');

  if (content) {
    const contentItem = content as Content;
    if (contentItem.id === undefined) {
      const cursorRequest = store.openCursor(null, 'prev');
      const lastItem = await new Promise<Content | null>((resolve) => {
        cursorRequest.onsuccess = () => resolve(cursorRequest.result?.value || null);
        cursorRequest.onerror = () => resolve(null);
      });
      contentItem.id = lastItem ? lastItem.id + 1 : 1;
    }
    store.put(contentItem);
  } else if (deleteId) {
    store.delete(deleteId);
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
};

export const useNotebooks = () => {
  const { auth } = useAuthContext();
  return useQuery({
    queryKey: ['notebookContents', !auth.isLocal],
    queryFn: () => getNotebookContents(!auth.isLocal),
  });
};

export const useNotebook = (id: number) => {
  const { data: notebooks = [] } = useNotebooks();
  return useQuery({
    queryKey: ['notebookContent', id],
    queryFn: () => notebooks.find((n) => n.id === id) || null,
    enabled: notebooks.length > 0,
  });
};

export const useCreateOrUpdateNotebook = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();

  return useMutation({
    mutationFn: async ({
      id,
      title,
      description,
      notebookType,
    }: {
      id?: number;
      title: string;
      description?: string;
      notebookType: NotebookOption['NOTEBOOK_TYPE'];
    }) => {
      const updated = auth.isLocal ? new Date().toISOString() : undefined;

      const notebookData: PostContent | Content = {
        title,
        description: description || '',
        input: title,
        userId: auth.user?.id || 0,
        parentId: 0,
        type: 'NOTEBOOK',
        order: 0,
        updated,
        option: {
          NOTEBOOK_TYPE: notebookType,
        } as NotebookOption,
      };

      if (id) {
        (notebookData as Content).id = id;
      }

      await saveNotebookContent(!auth.isLocal, [notebookData], id);
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebookContents'] });
    },
  });
};

export const useDeleteNotebook = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { mutate: setCurrentNotebookId } = useSetCurrentNotebookId();

  return useMutation({
    mutationFn: async (id: number) => {
      await saveNotebookContent(!auth.isLocal, [], id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['notebookContents'] });
      const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
      getCurrentNotebookId(subkey).then((currentId) => {
        if (currentId === id) {
          setCurrentNotebookId(null);
        }
      });
    },
  });
};

export const useCurrentNotebook = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;

  const { data: currentNotebookId } = useQuery({
    queryKey: ['currentNotebookId', subkey],
    queryFn: () => getCurrentNotebookId(subkey),
  });

  const { data: usageMode } = useUsageMode();
  const { data: notebook } = useNotebook(currentNotebookId || 0);

  // 글로벌 모드(간단, 노트)인 경우 보드 비활성화
  if (usageMode !== 'NOTEBOOK') {
    return {
      currentNotebookId,
      notebook: null,
      isBoardEnabled: false,
      isPrivateEnabled: false,
      isNotebookMode: false,
    };
  }

  // 노트북 모드이긴 하지만 전역 네임스페이스에 있는 경우 (선택 안됨)
  if (!currentNotebookId || !notebook) {
    return {
      currentNotebookId,
      notebook,
      isBoardEnabled: false,
      isPrivateEnabled: false,
      isNotebookMode: true,
    };
  }

  const notebookType = notebook.option?.NOTEBOOK_TYPE;

  return {
    currentNotebookId,
    notebook,
    isBoardEnabled: notebookType === 'WORKSPACE' || notebookType === 'PRIVATE_WORKSPACE',
    isPrivateEnabled: notebookType === 'PRIVATE_NOTE' || notebookType === 'PRIVATE_WORKSPACE',
    isNotebookMode: true,
  };
};
