import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { usePrivate } from '../../hooks/usePrivate';

const QUICK_MEMO_KEY = '@blacktokki:notebook:quick_memo:';
const QUICK_MEMO_PRIVACY_KEY = '@blacktokki:notebook:quick_memo_private:';

export type QuickMemoSelection = {
  title: string;
  path?: string;
};

export const useQuickMemoSelection = () => {
  const { auth } = useAuthContext();
  const { data: privateConfig } = usePrivate();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const isPrivate = privateConfig.enabled;

  return useQuery({
    queryKey: ['quickMemoSelection', subkey, isPrivate],
    queryFn: async () => {
      const key = isPrivate ? QUICK_MEMO_PRIVACY_KEY : QUICK_MEMO_KEY;
      const jsonValue = await AsyncStorage.getItem(key + subkey);
      if (!jsonValue) return [];
      return JSON.parse(jsonValue) as QuickMemoSelection[];
    },
  });
};

export const useSetQuickMemoSelection = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { data: privateConfig } = usePrivate();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const isPrivate = privateConfig.enabled;

  return useMutation({
    mutationFn: async (selection: QuickMemoSelection) => {
      const key = isPrivate ? QUICK_MEMO_PRIVACY_KEY : QUICK_MEMO_KEY;
      const jsonValue = await AsyncStorage.getItem(key + subkey);
      let list: QuickMemoSelection[] = [];

      if (jsonValue) {
        const parsed = JSON.parse(jsonValue);
        list = Array.isArray(parsed) ? parsed : [parsed];
      }

      const filtered = list.filter(
        (item) => !(item.title === selection.title && item.path === selection.path)
      );
      const newList = [selection, ...filtered].slice(0, 10);

      await AsyncStorage.setItem(key + subkey, JSON.stringify(newList));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quickMemoSelection', subkey] });
    },
  });
};
