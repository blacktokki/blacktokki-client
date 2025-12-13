import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { focusListener, useNotePage, useNotePages } from './useNoteStorage';
import { Content } from '../types';
import { useBoardPages } from './useBoardStorage';

const RECENT_TABS_KEY = '@blacktokki:notebook:recent_tabs';
let lastTab: number | undefined;

export const useLastTab = () => {
  const { data: contents = [], isFetching } = useNotePages();
  const { data: boards = [], isFetching: isFetchingBoard } = useBoardPages();
  return useQuery({
    queryKey: ['lastTab'],
    queryFn: async () => {
      return [...boards, ...contents].find((v) => v.id === lastTab);
    },
    enabled: !isFetching && !isFetchingBoard,
  });
};

export const useCurrentPage = (lastPage?: Content) => {
  const { data: currentNote } = useNotePage(
    new URLSearchParams(location.search).get('title') || ''
  );
  return currentNote?.id ? currentNote : lastPage;
};

const getRecentTabs = async (): Promise<number[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(RECENT_TABS_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading recent notes', e);
    return [];
  }
};

const saveRecentTabs = async (ids: number[]): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(ids);
    await AsyncStorage.setItem(RECENT_TABS_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving recent notes', e);
  }
};

export const useRecentTabs = () => {
  const { data: contents = [], isFetching } = useNotePages();
  const { data: boards = [], isFetching: isFetchingBoard } = useBoardPages();
  return useQuery({
    queryKey: ['recentTabs'],
    queryFn: async () => {
      const recentTabs = await getRecentTabs();
      return recentTabs
        .map((id) => [...contents, ...boards].find((c) => id === c.id))
        .filter((c) => c !== undefined);
    },
    enabled: !isFetching && !isFetchingBoard,
  });
};

export const useAddRecentTab = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, direct }: { id: number; direct?: boolean }) => {
      const recentTabs = await getRecentTabs();
      if (recentTabs.find((v) => v === id) === undefined || direct) {
        const updatedRecentTabs = [id, ...recentTabs];
        await saveRecentTabs(updatedRecentTabs);
      }

      return { id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
    },
  });
};

export const useDeleteRecentTab = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const recentTabs = await getRecentTabs();
      const updatedRecentTabs = recentTabs.filter((v) => id !== v);
      await saveRecentTabs(updatedRecentTabs);

      return { id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
      queryClient.invalidateQueries({ queryKey: ['pageContent'] });
    },
  });
};

focusListener.push(async (queryClient, id) => {
  const recentTabs = await getRecentTabs();
  if (recentTabs.find((v) => v === id) === undefined) {
    lastTab = id;
  }
  await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
});
