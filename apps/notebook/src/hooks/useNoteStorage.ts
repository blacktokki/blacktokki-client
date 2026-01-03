import { useAuthContext } from '@blacktokki/account';
import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { useIsFocused } from '@react-navigation/core';
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, QueryClient } from 'react-query';

import { deleteContent, getContentList, patchContent, postContent } from '../services/notebook';
import { Content, PostContent } from '../types';
import { usePrivacy } from './usePrivacy';

const DB_NAME = '@Blacktokki:notebook';
const DB_VERSION = 2;

let dbInstance: IDBDatabase | undefined;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('NOTE')) {
        db.createObjectStore('NOTE', { keyPath: 'title' });
      }
      if (!db.objectStoreNames.contains('BOARD')) {
        db.createObjectStore('BOARD', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
  return dbInstance!;
}

export const focusListener: ((queryClient: QueryClient, id: number) => Promise<void>)[] = [];

export const getContents = async (
  data:
    | { isOnline: true; types: Content['type'][]; page?: number; parentId?: number }
    | { isOnline: false; types: Content['type'][] }
): Promise<Content[]> => {
  if (data.isOnline) {
    return await getContentList(data.parentId, data.types, data.page);
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
    // const archive = tx.objectStore('SNAPSHOT');
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

export const useNotePages = () => {
  const { auth } = useAuthContext();
  const { data: privacy } = usePrivacy();

  return useQuery({
    queryKey: ['pageContents', !auth.isLocal, privacy.enabled],
    queryFn: async () => {
      return await getContents({ isOnline: !auth.isLocal, types: ['NOTE'] });
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
  const { data: privacy } = usePrivacy();
  const { data: contents = [], isFetching } = useNotePages();

  const query = useQuery({
    queryKey: ['pageContent', title, privacy.enabled],
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
        ? await getContents({ isOnline: !auth.isLocal, types: ['SNAPSHOT', 'DELTA'], parentId })
        : undefined,
  });
};

export const useCreateOrUpdatePage = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();

  return useMutation({
    mutationFn: async ({
      title,
      description,
      isLast = true,
    }: {
      title: string;
      description: string;
      isLast?: boolean;
    }) => {
      const contents = await getContents({ isOnline: !auth.isLocal, types: ['NOTE'] });
      const page = contents.find((c) => c.title === title);
      if (page?.description === description) {
        return { title, description, skip: true };
      }
      let updatedContent: Content | PostContent;
      const updated = auth.isLocal ? new Date().toISOString() : undefined;
      if (page) {
        updatedContent = { ...page, description, updated } as PostContent;
      } else {
        updatedContent = {
          title,
          description,
          input: title,
          userId: auth.user?.id || 0,
          parentId: 0,
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
    }: {
      oldTitle: string;
      newTitle: string;
      description?: string;
      isLast?: boolean;
    }) => {
      const page = contents.find((c) => c.title === oldTitle);

      if (!page) {
        throw new Error('Page not found');
      }

      if (contents.some((c) => c.title === newTitle)) {
        throw new Error('Page with new title already exists');
      }

      const updatedContent = {
        ...page,
        title: newTitle,
        description: description || page.description,
      };

      await saveContents(!auth.isLocal, 'NOTE', [updatedContent], page.id);
      if (auth.isLocal) {
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
