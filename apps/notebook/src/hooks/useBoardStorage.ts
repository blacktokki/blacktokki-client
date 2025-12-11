import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/core';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { getContents, saveContents } from './useNoteStorage';
import { BoardOption, Content, PostContent } from '../types';

const RECENT_BOARD_KEY = '@blacktokki:notebook:last_board:';
let last_board: number | undefined = -1;

const getLastBoard = async (subkey: string): Promise<number | undefined> => {
  try {
    if (last_board === -1) {
      const id = await AsyncStorage.getItem(RECENT_BOARD_KEY + subkey);
      last_board = id !== null ? parseInt(id, 10) : undefined;
    }
    return last_board;
  } catch (e) {
    console.error('Error loading recent notes', e);
    return undefined;
  }
};

const saveLastBoard = async (subkey: string, id: number): Promise<void> => {
  try {
    last_board = id;
    await AsyncStorage.setItem(RECENT_BOARD_KEY + subkey, `${id}`);
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

export const useBoardPage = (title: string) => {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const { data: contents = [], isFetching } = useBoardPages();

  const query = useQuery({
    queryKey: ['boardContent', title],
    queryFn: async () => {
      const page = contents.find((c) => c.title === title);
      // Side Effect 제거됨
      return page;
    },
    enabled: !isFetching,
  });

  useEffect(() => {
    if (query.data?.id && isFocused) {
      const id = query.data?.id;
      (async () => {
        await saveLastBoard(subkey, id);
        await queryClient.invalidateQueries({ queryKey: ['lastBoard'] });
      })();
    }
  }, [query.data, isFocused, subkey, queryClient]);

  return query;
};

export const useLastBoard = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const { data: contents = [], isFetching } = useBoardPages();
  return useQuery({
    queryKey: ['lastBoard'],
    queryFn: async () => {
      const id = await getLastBoard(subkey);
      const board = contents.find((c) => c.id === id);
      return board;
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
      await saveContents(!auth.isLocal, 'BOARD', updatedContents, page?.id);
      return { id };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['lastBoard'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContent'] });
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
      await saveContents(!auth.isLocal, 'BOARD', updatedContents, id);
      return { id };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['lastBoard'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContent'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
    },
  });
};
