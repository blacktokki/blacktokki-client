import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { getContents, saveContents } from './useNoteStorage';
import { BoardOption, Content, PostContent } from '../types';

const RECENT_BOARD_KEY = '@blacktokki:notebook:recent_board';

const getRecentBoard = async (): Promise<number | undefined> => {
  try {
    const id = await AsyncStorage.getItem(RECENT_BOARD_KEY);
    return id !== null ? parseInt(id, 10) : undefined;
  } catch (e) {
    console.error('Error loading recent notes', e);
    return undefined;
  }
};

const saveRecentBoard = async (id: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(RECENT_BOARD_KEY, `${id}`);
  } catch (e) {
    console.error('Error saving recent notes', e);
  }
};

export const useBoardPages = () => {
  const { auth } = useAuthContext();
  return useQuery({
    queryKey: ['boardContents', !auth.isLocal],
    queryFn: async () =>
      (await getContents({ isOnline: !auth.isLocal, types: ['BOARD'] })).sort(
        (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
      ),
  });
};

export const useRecentBoard = () => {
  const { data: contents = [], isFetching } = useBoardPages();
  return useQuery({
    queryKey: ['recentBoard'],
    queryFn: async () => {
      const id = await getRecentBoard();
      return contents.find((c) => c.id === id);
    },
    enabled: !isFetching,
  });
};

export const useCreateOrUpdateBoard = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { data: contents = [] } = useBoardPages();
  return useMutation({
    mutationFn: async ({
      id,
      title,
      description,
      option,
    }: {
      id?: number;
      title: string;
      description: string;
      option: BoardOption;
    }) => {
      const page = contents.find((c) => c.id === id);
      let updatedContents: (Content | PostContent)[];
      const updated = auth.isLocal ? new Date().toISOString() : undefined;
      if (page) {
        updatedContents = contents.map((c, i) =>
          c.id === page.id ? ({ ...c, title, description, updated, option } as PostContent) : c
        );
      } else {
        const newPage = {
          title,
          description,
          input: title,
          userId: auth.user?.id || 0,
          parentId: 0,
          type: 'BOARD',
          order: 0,
          updated,
          option,
        } as PostContent;
        updatedContents = [...contents, newPage];
      }

      await saveContents(!auth.isLocal, updatedContents, page?.id);
      return { id };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
    },
  });
};

export const useDeleteBoard = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { data: contents = [] } = useBoardPages();
  return useMutation({
    mutationFn: async (id: number) => {
      const updatedContents = contents.filter((c) => c.id !== id);
      await saveContents(!auth.isLocal, updatedContents, id);
      return { id };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['recentBoard'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
    },
  });
};

export const useUpdateRecentBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      // Update recent pages
      const recentBoard = await getRecentBoard();
      if (recentBoard !== id) {
        await saveRecentBoard(id);
      }

      return { id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentBoard'] });
    },
  });
};
