import { useAuthContext } from '@blacktokki/account';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { deleteSyncAnchor, deleteSyncOptions } from '../features/sync/useNotebookSync';
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
    queryKey: ['notebookContents', auth.user, !auth.isLocal],
    queryFn: async () => {
      if (auth.user === undefined) {
        return [];
      }
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
  const { data: notebooks, isLoading } = useNotebooks();
  const notebook = useMemo(() => {
    if (notebooks === undefined) return undefined;
    if (!id) return null;
    return notebooks.find((n) => String(n.id) === String(id)) || null;
  }, [notebooks, id]);

  return { data: notebook, isLoading };
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
      isLocal,
    }: {
      id?: number;
      title: string;
      description?: string;
      notebookType: NotebookOption['NOTEBOOK_TYPE'];
      storageConfig?: {
        pathName?: string;
        handle?: any;
      };
      isLocal?: boolean;
    }) => {
      const isTargetLocal = isLocal !== undefined ? isLocal : auth.isLocal;
      const updated = isTargetLocal ? new Date().toISOString() : undefined;

      const notebookData: PostContent | Content = {
        title,
        description: description || '',
        input: title,
        userId: isTargetLocal ? 0 : auth.user?.id || 0,
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

      const savedId = await saveNotebookContent(!isTargetLocal, [notebookData], id);
      const targetId = savedId || id;

      if (isTargetLocal && targetId && storageConfig) {
        await setStorageConfig({
          parentId: targetId,
          type: 'local',
          pathName: storageConfig.pathName?.trim() || `notebook-${targetId}`,
          handle: storageConfig.handle,
        });
      }

      return {
        id: targetId,
        title,
        description: description || '',
        option: notebookData.option,
      } as Content;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebookContents'] });
      // queryClient.invalidateQueries({ queryKey: ['notebookContent'] });
    },
  });
};

export const useDeleteNotebook = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();

  return useMutation({
    mutationFn: async (param: number | { id: number; title?: string }) => {
      const id = typeof param === 'number' ? param : param.id;
      const title = typeof param === 'number' ? undefined : param.title;
      await saveNotebookContent(!auth.isLocal, [], id);

      if (auth.user?.id) {
        if (title) {
          try {
            await deleteSyncAnchor(auth.user.id, title);
          } catch (e) {
            console.error('Failed to delete sync anchor for notebook', e);
          }
        }
        try {
          await deleteSyncOptions(auth.user.id, id);
        } catch (e) {
          console.error('Failed to delete sync options for notebook', e);
        }
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['notebookContents'] });
      queryClient.invalidateQueries({ queryKey: ['notebookSyncDiff'] });
      // queryClient.invalidateQueries({ queryKey: ['notebookContent'] });
      // if (id) {
      //   queryClient.removeQueries({ queryKey: ['notebookContent', id] });
      // }
    },
  });
};
