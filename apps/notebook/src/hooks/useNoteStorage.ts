import { useAuthContext } from '@blacktokki/account';
import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { useIsFocused } from '@react-navigation/core';
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, QueryClient } from 'react-query';

import { deleteContent, getContentList, patchContent, postContent } from '../services/notebook';
import { Content, PostContent } from '../types';

const DB_NAME = '@Blacktokki:notebook';
const DB_VERSION = 2;

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('NOTE')) {
        db.createObjectStore('NOTE', { keyPath: 'title' });
      }
      if (!db.objectStoreNames.contains('BOARD')) {
        db.createObjectStore('BOARD', { keyPath: 'id' });
      }
      getContents({ isOnline: false, types: ['NOTE'] }).then((contents) =>
        saveContents(false, 'NOTE', contents)
      );
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
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
  try {
    const db = await openDB();
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
  id?: number
): Promise<void> => {
  const content = contents.find((v) => id === (v as { id?: number }).id);
  if (isOnline) {
    if (content) {
      const savedId = await (id
        ? patchContent({ id, updated: content }).then(() => id)
        : postContent(content));
      if (content.type === 'NOTE') {
        const snapshot: Content | PostContent = {
          ...content,
          type: 'SNAPSHOT',
          id: undefined,
          parentId: savedId,
        };
        await postContent(snapshot);
      }
    } else if (id) {
      await deleteContent(id);
    }
    return;
  }
  try {
    const db = await openDB();
    const tx = db.transaction([type /*, 'SNAPSHOT' */], 'readwrite');
    const store = tx.objectStore(type);
    // const archive = tx.objectStore('SNAPSHOT');
    const ids = contents.map((v) => (v as Content).id).filter((v) => v !== undefined);
    let maxId = ids.length > 0 ? Math.max(...ids) : 0;
    for (const contentItem of contents as Content[]) {
      if (contentItem.id === undefined) {
        contentItem.id = maxId + 1;
        maxId += 1;
      }
      store.put(contentItem);
    }
    // if (content) {
    //   const snapshot: Content | PostContent = {
    //     ...content,
    //     type: 'SNAPSHOT',
    //   };
    //   archive.put(snapshot);
    // }
    if (content === undefined && id) {
      store.delete(id);
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
  return useQuery({
    queryKey: ['pageContents', !auth.isLocal],
    queryFn: async () => await getContents({ isOnline: !auth.isLocal, types: ['NOTE'] }),
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
      focusListener.forEach((f) => f(queryClient, id));
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
      let updatedContents: (Content | PostContent)[];
      const updated = auth.isLocal ? new Date().toISOString() : undefined;
      if (page) {
        updatedContents = contents.map((c, i) =>
          c.id === page.id ? ({ ...c, description, updated } as PostContent) : c
        );
      } else {
        const newPage = {
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
        updatedContents = [...contents, newPage];
      }

      await saveContents(!auth.isLocal, 'NOTE', updatedContents, page?.id);
      return { title, description, skip: !isLast };
    },
    onSuccess: async (data) => {
      if (!data.skip) {
        await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
        await queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
        await queryClient.invalidateQueries({ queryKey: ['snapshotContentsAll'] });
        await queryClient.invalidateQueries({ queryKey: ['pageContent', data.title] });
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
    }: {
      oldTitle: string;
      newTitle: string;
      description?: string;
    }) => {
      const page = contents.find((c) => c.title === oldTitle);

      if (!page) {
        throw new Error('Page not found');
      }

      if (contents.some((c) => c.title === newTitle)) {
        throw new Error('Page with new title already exists');
      }

      const updatedContents = contents.map((c) =>
        c.title === oldTitle
          ? { ...c, title: newTitle, description: description || page.description }
          : c
      );

      await saveContents(!auth.isLocal, 'NOTE', updatedContents, page.id);

      return { oldTitle, newTitle };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
      await queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
      await queryClient.invalidateQueries({ queryKey: ['snapshotContentsAll'] });
      await queryClient.invalidateQueries({ queryKey: ['pageContent', data.oldTitle] });
      await queryClient.invalidateQueries({ queryKey: ['pageContent', data.newTitle] });
      await queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
      await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
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
