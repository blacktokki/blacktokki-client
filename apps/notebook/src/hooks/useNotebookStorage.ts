import { useAuthContext } from '@blacktokki/account';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { deleteContent, getContentList, patchContent, postContent } from '../services/notebook';
import {
  deleteStorageConfig,
  getStoreItems,
  saveStoreItems,
  setStorageConfig,
} from '../services/storage';
import { Content, NotebookOption, PostContent } from '../types';

const getNotebookContents = async (isOnline: boolean): Promise<Content[]> => {
  if (isOnline) {
    return await getContentList(undefined, ['NOTEBOOK'], undefined);
  }
  try {
    return await getStoreItems('NOTEBOOK', 0);
  } catch (e) {
    console.error('Error loading notebooks from File System:', e);
    return [];
  }
};

const saveNotebookContent = async (
  isOnline: boolean,
  contents: (Content | PostContent)[],
  deleteId?: number
): Promise<number | undefined> => {
  const content = contents.length === 1 ? contents[0] : undefined;
  if (isOnline) {
    if (content) {
      const id = (content as Content).id;
      if (id) {
        await patchContent(id, content);
        return id;
      } else {
        const newId = await postContent(content);
        return newId;
      }
    } else if (deleteId) {
      await deleteContent(deleteId);
      return deleteId;
    }
    return undefined;
  }

  try {
    await saveStoreItems('NOTEBOOK', contents, deleteId, 0);
    if (deleteId) {
      await deleteStorageConfig(deleteId);
      return deleteId;
    }
    if (content) {
      return (content as Content).id;
    }
  } catch (e) {
    console.error('Error saving notebook to File System:', e);
  }
  return undefined;
};

export const useNotebooks = () => {
  const { auth } = useAuthContext();
  return useQuery({
    queryKey: ['notebookContents', !auth.isLocal],
    queryFn: async () => {
      const contents = await getNotebookContents(!auth.isLocal);
      return contents.sort(
        (a, b) => new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime()
      );
    },
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
};

export const useNotebook = (id: number) => {
  const { data: notebooks } = useNotebooks();
  return useQuery({
    queryKey: ['notebookContent', id],
    queryFn: () => notebooks?.find((n) => n.id === id) || null,
    enabled: notebooks !== undefined,
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
      storageConfig,
    }: {
      id?: number;
      title: string;
      description?: string;
      notebookType: NotebookOption['NOTEBOOK_TYPE'];
      storageConfig?: {
        pathName?: string;
        handle?: any;
      };
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

      const savedId = await saveNotebookContent(!auth.isLocal, [notebookData], id);
      const targetId = savedId || id;

      if (auth.isLocal && targetId && storageConfig) {
        await setStorageConfig({
          parentId: targetId,
          type: 'local',
          pathName: storageConfig.pathName?.trim() || `notebook-${targetId}`,
          handle: storageConfig.handle,
        });
      }

      return { id: targetId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebookContents'] });
    },
  });
};

export const useDeleteNotebook = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();

  return useMutation({
    mutationFn: async (id: number) => {
      await saveNotebookContent(!auth.isLocal, [], id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['notebookContents'] });
    },
  });
};
