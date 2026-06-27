import { useAuthContext } from '@blacktokki/account';
import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { useIsFocused } from '@react-navigation/core';
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, QueryClient } from 'react-query';

import { useCurrentNotebook } from './useNotebookStorage';
import { useUsageMode } from './useUsageMode';
import { getDB } from '../services/db';
import { deleteContent, getContentList, patchContent, postContent } from '../services/notebook';
import { Content, PostContent } from '../types';

export const getSplitTitle = (title: string) => {
  const splitTitle = title.split('/');
  if (splitTitle.length < 2) {
    return [title];
  }
  return [splitTitle.slice(0, splitTitle.length - 1).join('/'), splitTitle[splitTitle.length - 1]];
};

export const focusListener: ((queryClient: QueryClient, id: number) => Promise<void>)[] = [];

export const getContents = async (
  data:
    | {
        isOnline: true;
        types: Content['type'][];
        withHidden: boolean;
        page?: number;
        parentId?: number;
      }
    | { isOnline: false; types: Content['type'][]; withHidden: boolean }
): Promise<Content[]> => {
  if (data.isOnline) {
    return await getContentList(data.parentId, data.types, data.page, data.withHidden);
  }
  if (data.types.length !== 1 || ['NOTE', 'BOARD'].find((v) => v === data.types[0]) === undefined) {
    return [];
  }
  const type = data.types[0];
  const db = await getDB();
  try {
    return new Promise((resolve) => {
      const transaction = db.transaction(type, 'readonly');
      const store = transaction.objectStore(type);

      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as Content[]);
      };
      request.onerror = () => {
        console.error('Error loading contents from IndexedDB:', request.error);
        throw request.error;
      };
    });
  } catch (e) {
    console.error('Error opening IndexedDB', e);
    return [];
  }
};

export const saveContents = async (
  isOnline: boolean,
  type: 'NOTE' | 'BOARD',
  contents: (Content | PostContent)[],
  deleteId?: number
): Promise<void> => {
  const content = contents.length === 1 ? contents[0] : undefined;
  if (isOnline) {
    if (content) {
      const id = (content as Content).id;
      const savedId = await (id ? patchContent(id, content).then(() => id) : postContent(content));
      if (content.type === 'NOTE') {
        const snapshot: Content | PostContent = {
          ...content,
          type: 'SNAPSHOT',
          id: undefined,
          parentId: savedId,
        };
        await postContent(snapshot);
      }
    } else if (deleteId) {
      await deleteContent(deleteId);
    }
    return;
  }
  const db = await getDB();
  try {
    const tx = db.transaction([type /*, 'SNAPSHOT' */], 'readwrite');
    const store = tx.objectStore(type);
    let nextId = 1;
    const newItems = contents.filter((c) => (c as Content).id === undefined);

    if (newItems.length > 0) {
      const cursorRequest = store.openCursor(null, 'prev'); // 역순 정렬 커서
      const lastItem = await new Promise((resolve) => {
        cursorRequest.onsuccess = () => resolve(cursorRequest.result?.value);
        cursorRequest.onerror = () => resolve(null);
      });
      if (lastItem) {
        nextId = (lastItem as Content).id + 1;
      }
    }

    for (const item of contents) {
      const contentItem = item as Content;
      if (contentItem.id === undefined) {
        contentItem.id = nextId++;
      }
      store.put(contentItem);
    }

    if (contents.length === 0 && deleteId) {
      if (type === 'NOTE') {
        const titleToDelete = await new Promise<string | undefined>((resolve) => {
          const getRequest = store.get(deleteId);
          getRequest.onsuccess = () => resolve(getRequest.result?.title);
          getRequest.onerror = () => resolve(undefined);
        });

        if (titleToDelete) {
          store.delete(titleToDelete);
        }
      } else {
        store.delete(deleteId);
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Error saving contents to IndexedDB', e);
  }
};

export const useNotePages = (targetNotebookId?: number | null) => {
  const { auth } = useAuthContext();
  const { data: usageMode } = useUsageMode();
  const { currentNotebookId } = useCurrentNotebook();

  const activeNotebookId = targetNotebookId !== undefined ? targetNotebookId : currentNotebookId;

  return useQuery({
    queryKey: ['pageContents', !auth.isLocal, usageMode, activeNotebookId],
    queryFn: async () => {
      const parentId = usageMode !== 'SIMPLE' ? activeNotebookId || 0 : 0;
      const contents = await getContents({
        isOnline: !auth.isLocal,
        types: ['NOTE'],
        withHidden: true,
        parentId,
      });
      return contents;
    },
  });
};

export const useSnapshotPages = (parentId?: number) => {
  const { auth } = useAuthContext();
  return useInfiniteQuery<Content[], number>({
    queryKey: ['snapshotContents', !auth.isLocal, parentId],
    queryFn: async ({ pageParam }) =>
      await getContents({
        isOnline: !auth.isLocal,
        types: ['SNAPSHOT', 'DELTA'],
        withHidden: true,
        parentId,
        page: pageParam || 0,
      }),
    getNextPageParam: (lastPage, allPages) => (lastPage?.length ? allPages.length : undefined),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
};

export const useNotePage = (title: string) => {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { data: contents = [], isFetching } = useNotePages();

  const query = useQuery({
    queryKey: ['pageContent', title],
    queryFn: async () => {
      const page = contents.find((c) => c.title === title);
      return page || { title, description: '', id: undefined };
    },
    enabled: !isFetching,
  });

  useEffect(() => {
    const id = query.data?.id;
    if (id && isFocused) {
      (async () => {
        for (const f of focusListener) {
          await f(queryClient, id);
        }
      })();
    }
  }, [query.data?.id, isFocused, title, queryClient]);

  return query;
};

export const useSnapshotAll = (parentId?: number) => {
  const { auth } = useAuthContext();
  return useQuery({
    queryKey: ['snapshotContentsAll', !auth.isLocal, parentId],
    queryFn: async () =>
      parentId
        ? await getContents({
            isOnline: !auth.isLocal,
            types: ['SNAPSHOT', 'DELTA'],
            withHidden: true,
            parentId,
          })
        : undefined,
  });
};

export const useCreateOrUpdatePage = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { data: usageMode } = useUsageMode();
  const { currentNotebookId } = useCurrentNotebook();

  return useMutation({
    mutationFn: async ({
      title,
      description,
      isLast = true,
      newParentId,
    }: {
      title: string;
      description: string;
      isLast?: boolean;
      newParentId?: number;
    }) => {
      const parentId =
        newParentId !== undefined
          ? newParentId
          : usageMode !== 'SIMPLE'
          ? currentNotebookId || 0
          : 0;
      const contents = await getContents({
        isOnline: !auth.isLocal,
        types: ['NOTE'],
        withHidden: true,
      });
      const page = contents.find((c) => c.title === title);
      if (page?.description === description) {
        return { title, description, skip: true };
      }
      let updatedContent: Content | PostContent;
      const updated = auth.isLocal ? new Date().toISOString() : undefined;
      if (page) {
        updatedContent = { ...page, description, updated } as PostContent;
        if (newParentId !== undefined) {
          updatedContent.parentId = newParentId;
        }
      } else {
        updatedContent = {
          title,
          description,
          input: title,
          userId: auth.user?.id || 0,
          parentId: parentId || 0,
          type: 'NOTE',
          order: 0,
          updated,
          option: {},
        } as PostContent;
      }

      await saveContents(!auth.isLocal, 'NOTE', [updatedContent], page?.id);
      return { title, description, skip: !isLast };
    },
    onSuccess: async (data) => {
      if (!data.skip) {
        await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
        await queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
        await queryClient.invalidateQueries({ queryKey: ['snapshotContentsAll'] });
        await queryClient.invalidateQueries({ queryKey: ['pageContent'] });
        await queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
        await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
      }
    },
  });
};

export const useMovePage = () => {
  const queryClient = useQueryClient();
  const { data: contents = [] } = useNotePages();
  const { auth } = useAuthContext();

  return useMutation({
    mutationFn: async ({
      oldTitle,
      newTitle,
      description,
      isLast = true,
      newParentId,
    }: {
      oldTitle: string;
      newTitle: string;
      description?: string;
      isLast?: boolean;
      newParentId?: number;
    }) => {
      const page = contents.find((c) => c.title === oldTitle);

      if (!page) {
        throw new Error('Page not found');
      }

      if (contents.some((c) => c.title === newTitle && c.title !== oldTitle)) {
        throw new Error('Page with new title already exists');
      }

      const updatedContent = {
        ...page,
        title: newTitle,
        description: description !== undefined ? description : page.description,
        updated: auth.isLocal ? new Date().toISOString() : undefined,
      } as PostContent;
      if (newParentId !== undefined) {
        updatedContent.parentId = newParentId;
      }

      await saveContents(!auth.isLocal, 'NOTE', [updatedContent], page.id);
      if (auth.isLocal && newTitle !== oldTitle) {
        await saveContents(false, 'NOTE', [], page.id);
      }
      return { oldTitle, newTitle, skip: !isLast };
    },
    onSuccess: async (data) => {
      if (!data.skip) {
        await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
        await queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
        await queryClient.invalidateQueries({ queryKey: ['snapshotContentsAll'] });
        await queryClient.invalidateQueries({ queryKey: ['pageContent'] });
        await queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
        await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
      }
    },
  });
};

export const useNoteViewers = () => {
  const { lang, locale } = useLangContext();
  return useQuery({
    queryKey: ['viewerContents', locale],
    queryFn: async () => {
      return await Promise.all(
        ['Usage'].map(async (key) => {
          const title = lang(key);
          const v2 = await fetch(process.env.PUBLIC_URL + '/' + title + '.md');
          const description = toHtml(await v2.text());
          return { key, description };
        })
      );
    },
  });
};
