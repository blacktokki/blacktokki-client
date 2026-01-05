import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { useBoardPages } from './useBoardStorage';
import { focusListener, useNotePages } from './useNoteStorage';
import { usePrivate } from './usePrivate';

const RECENT_TABS_KEY = '@blacktokki:notebook:recent_tabs';
const RECENT_TABS_PRIVACY_KEY = '@blacktokki:notebook:recent_tabs_private';

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

const getRecentTabs = async (isPrivate: boolean): Promise<number[]> => {
  try {
    const key = isPrivate ? RECENT_TABS_PRIVACY_KEY : RECENT_TABS_KEY;
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading recent notes', e);
    return [];
  }
};

const saveRecentTabs = async (ids: number[], isPrivate: boolean): Promise<void> => {
  try {
    const key = isPrivate ? RECENT_TABS_PRIVACY_KEY : RECENT_TABS_KEY;
    const jsonValue = JSON.stringify(ids);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (e) {
    console.error('Error saving recent notes', e);
  }
};
export const useRecentTabs = () => {
  const { data: contents = [], isFetching } = useNotePages();
  const { data: boards = [], isFetching: isFetchingBoard } = useBoardPages();
  const { data: privateConfig } = usePrivate();

  return useQuery({
    queryKey: ['recentTabs', privateConfig.enabled],
    queryFn: async () => {
      const recentTabs = await getRecentTabs(privateConfig.enabled);
      return recentTabs
        .map((id) => [...contents, ...boards].find((c) => id === c.id))
        .filter((c) => c !== undefined);
    },
    enabled: !isFetching && !isFetchingBoard,
  });
};

export const useAddRecentTab = () => {
  const queryClient = useQueryClient();
  const { data: privateConfig } = usePrivate();

  return useMutation({
    mutationFn: async ({ id, direct }: { id: number; direct?: boolean }) => {
      const recentTabs = await getRecentTabs(privateConfig.enabled);
      if (recentTabs.find((v) => v === id) === undefined || direct) {
        const updatedRecentTabs = [id, ...recentTabs];
        await saveRecentTabs(updatedRecentTabs, privateConfig.enabled);
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
  const { data: privateConfig } = usePrivate();

  return useMutation({
    mutationFn: async (id: number) => {
      const recentTabs = await getRecentTabs(privateConfig.enabled);
      const updatedRecentTabs = recentTabs.filter((v) => id !== v);
      await saveRecentTabs(updatedRecentTabs, privateConfig.enabled);

      return { id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
      queryClient.invalidateQueries({ queryKey: ['pageContent'] });
    },
  });
};

export const useReorderRecentTabs = () => {
  const queryClient = useQueryClient();
  const { data: privateConfig } = usePrivate();

  return useMutation({
    mutationFn: async (ids: number[]) => {
      await saveRecentTabs(ids, privateConfig.enabled);
      return ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
    },
  });
};

focusListener.push(async (queryClient, id) => {
  lastTab = id;
  await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
});
