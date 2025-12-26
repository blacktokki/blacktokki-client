import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { useBoardPages } from './useBoardStorage';
import { focusListener, useNotePage, useNotePages } from './useNoteStorage';
import { usePrivacy } from './usePrivacy';
import { Content } from '../types';

const RECENT_TABS_KEY = '@blacktokki:notebook:recent_tabs';
const RECENT_TABS_PRIVACY_KEY = '@blacktokki:notebook:recent_tabs_privacy';

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
  const title = new URLSearchParams(location.search).get('title') || '';
  const { data: currentNote } = useNotePage(title);
  return currentNote?.id && currentNote.title === title
    ? currentNote
    : lastPage?.type === 'NOTE'
    ? lastPage
    : undefined;
};

const getRecentTabs = async (isPrivacy: boolean): Promise<number[]> => {
  try {
    const key = isPrivacy ? RECENT_TABS_PRIVACY_KEY : RECENT_TABS_KEY;
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading recent notes', e);
    return [];
  }
};

const saveRecentTabs = async (ids: number[], isPrivacy: boolean): Promise<void> => {
  try {
    const key = isPrivacy ? RECENT_TABS_PRIVACY_KEY : RECENT_TABS_KEY;
    const jsonValue = JSON.stringify(ids);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (e) {
    console.error('Error saving recent notes', e);
  }
};
export const useRecentTabs = () => {
  const { data: contents = [], isFetching } = useNotePages();
  const { data: boards = [], isFetching: isFetchingBoard } = useBoardPages();
  const { isPrivacyMode } = usePrivacy(); // [추가] 프라이버시 상태 가져오기

  return useQuery({
    queryKey: ['recentTabs', isPrivacyMode], // [수정] 쿼리키에 모드 추가 (모드 변경시 갱신)
    queryFn: async () => {
      const recentTabs = await getRecentTabs(isPrivacyMode); // [수정] 모드 전달
      return recentTabs
        .map((id) => [...contents, ...boards].find((c) => id === c.id))
        .filter((c) => c !== undefined);
    },
    enabled: !isFetching && !isFetchingBoard,
  });
};

export const useAddRecentTab = () => {
  const queryClient = useQueryClient();
  const { isPrivacyMode } = usePrivacy(); // [추가]

  return useMutation({
    mutationFn: async ({ id, direct }: { id: number; direct?: boolean }) => {
      const recentTabs = await getRecentTabs(isPrivacyMode); // [수정]
      if (recentTabs.find((v) => v === id) === undefined || direct) {
        const updatedRecentTabs = [id, ...recentTabs];
        await saveRecentTabs(updatedRecentTabs, isPrivacyMode); // [수정]
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
  const { isPrivacyMode } = usePrivacy(); // [추가]

  return useMutation({
    mutationFn: async (id: number) => {
      const recentTabs = await getRecentTabs(isPrivacyMode); // [수정]
      const updatedRecentTabs = recentTabs.filter((v) => id !== v);
      await saveRecentTabs(updatedRecentTabs, isPrivacyMode); // [수정]

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
  const { isPrivacyMode } = usePrivacy(); // [추가]

  return useMutation({
    mutationFn: async (ids: number[]) => {
      await saveRecentTabs(ids, isPrivacyMode); // [수정]
      return ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
    },
  });
};

focusListener.push(async (queryClient, isPrivacy, id) => {
  const recentTabs = await getRecentTabs(isPrivacy);
  if (recentTabs.find((v) => v === id) === undefined) {
    lastTab = id;
  }
  await queryClient.invalidateQueries({ queryKey: ['lastTab'] });
});
