import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { getContentList, patchContent, postContent } from '../services/notebook';
import { Content, PostContent } from '../types';

const DB_NAME = '@Blacktokki:notebook';
const DB_VERSION = 1;

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('NOTE')) {
        db.createObjectStore('NOTE', { keyPath: 'title' }); // id 필드로 고유 식별
      }
      if (!db.objectStoreNames.contains('SNAPSHOT')) {
        db.createObjectStore('SNAPSHOT', { keyPath: ['title', 'updated'] }); // id 필드로 고유 식별
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

const RECENT_PAGES_KEY = '@blacktokki:notebook:recent_pages';

let lastPage: string | undefined;

const getContents = async (isOnline: boolean, type: 'NOTE' | 'SNAPSHOT'): Promise<Content[]> => {
  if (isOnline) {
    return await getContentList(undefined, [type]);
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
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

const saveNoteContents = async (
  isOnline: boolean,
  contents: (Content | PostContent)[],
  id?: number
): Promise<void> => {
  const content = contents.find((v) => id === (v as { id?: number }).id);
  if (isOnline) {
    if (content) {
      const savedId = await (id
        ? patchContent({ id, updated: content }).then(() => id)
        : postContent(content));
      const snapshot: Content | PostContent = {
        ...content,
        type: 'SNAPSHOT',
        id: undefined,
        parentId: savedId,
      };
      await postContent(snapshot);
    }
    return;
  }
  try {
    const db = await openDB();
    const tx = db.transaction(['NOTE', 'SNAPSHOT'], 'readwrite');
    const store = tx.objectStore('NOTE');
    const archive = tx.objectStore('SNAPSHOT');

    for (const contentItem of contents) {
      store.put(contentItem); // id를 기준으로 덮어씌움 (없으면 추가)
    }
    if (content) {
      const snapshot: Content | PostContent = {
        ...content,
        type: 'SNAPSHOT',
      };
      archive.put(snapshot);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Error saving contents to IndexedDB', e);
  }
};

const getRecentPages = async (): Promise<string[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(RECENT_PAGES_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading recent pages', e);
    return [];
  }
};

const saveRecentPages = async (titles: string[]): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(titles);
    await AsyncStorage.setItem(RECENT_PAGES_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving recent pages', e);
  }
};

export const useNotePages = () => {
  const { auth } = useAuthContext();
  return useQuery({
    queryKey: ['pageContents', !auth.isLocal],
    queryFn: async () => await getContents(!auth.isLocal, 'NOTE'),
  });
};

export const useSnapshotPages = () => {
  const { auth } = useAuthContext();
  return useQuery({
    queryKey: ['snapshotContents', !auth.isLocal],
    queryFn: async () => await getContents(!auth.isLocal, 'SNAPSHOT'),
  });
};

export const useNotePage = (title: string) => {
  const queryClient = useQueryClient();
  const { data: contents = [], isFetching } = useNotePages();
  return useQuery({
    queryKey: ['pageContent', title],
    queryFn: async () => {
      const page = contents.find((c) => c.title === title);

      // Add to recent pages
      if (page) {
        const recentPages = await getRecentPages();
        if (recentPages.find((v) => v === title) === undefined) {
          lastPage = title;
          await queryClient.invalidateQueries({ queryKey: ['lastPage'] });
        }
      }
      return page || { title, description: '', id: undefined };
    },
    enabled: !isFetching,
  });
};

export const useRecentPages = () => {
  const { data: contents = [], isFetching } = useNotePages();
  return useQuery({
    queryKey: ['recentPages'],
    queryFn: async () => {
      const recentTitles = await getRecentPages();
      return recentTitles
        .map((title) => contents.find((c) => c.title === title))
        .filter((c) => c !== undefined) as Content[];
    },
    enabled: !isFetching,
  });
};

export const useLastPage = () => {
  const { data: contents = [], isFetching } = useNotePages();
  return useQuery({
    queryKey: ['lastPage'],
    queryFn: async () => {
      return contents.find((v) => v.title === lastPage);
    },
    enabled: !isFetching,
  });
};

export const useCreateOrUpdatePage = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { data: contents = [] } = useNotePages();
  return useMutation({
    mutationFn: async ({ title, description }: { title: string; description: string }) => {
      const page = contents.find((c) => c.title === title);

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

      await saveNoteContents(!auth.isLocal, updatedContents, page?.id);
      return { title, description };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
      await queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
      await queryClient.invalidateQueries({ queryKey: ['pageContent', data.title] });
      await queryClient.invalidateQueries({ queryKey: ['recentPages'] });
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

      await saveNoteContents(!auth.isLocal, updatedContents, page.id);

      // Update recent pages
      const recentPages = await getRecentPages();
      const updatedRecentPages = recentPages.map((title) =>
        title === oldTitle ? newTitle : title
      );
      await saveRecentPages(updatedRecentPages);

      return { oldTitle, newTitle };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pageContents'] });
      queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
      queryClient.invalidateQueries({ queryKey: ['pageContent', data.oldTitle] });
      queryClient.invalidateQueries({ queryKey: ['pageContent', data.newTitle] });
      queryClient.invalidateQueries({ queryKey: ['recentPages'] });
    },
  });
};

export const useAddRecentPage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, direct }: { title: string; direct?: boolean }) => {
      // Update recent pages
      const recentPages = await getRecentPages();
      if (recentPages.find((v) => v === title) === undefined || direct) {
        const updatedRecentPages = [title, ...recentPages];
        await saveRecentPages(updatedRecentPages);
      }

      return { title };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentPages'] });
    },
  });
};

export const useDeleteRecentPage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title: string) => {
      // Update recent pages
      const recentPages = await getRecentPages();
      const updatedRecentPages = recentPages.filter((_title) => title !== _title);
      lastPage = undefined;
      await saveRecentPages(updatedRecentPages);

      return { title };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentPages'] });
      queryClient.invalidateQueries({ queryKey: ['pageContent'] });
      queryClient.invalidateQueries({ queryKey: ['lastPage'] });
    },
  });
};
