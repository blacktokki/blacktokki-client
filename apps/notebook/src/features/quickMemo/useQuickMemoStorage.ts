import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { usePrivate } from '../../hooks/usePrivate';

const QUICK_MEMO_KEY = '@blacktokki:notebook:quick_memo:';
const QUICK_MEMO_PRIVACY_KEY = '@blacktokki:notebook:quick_memo_private:';

export type QuickMemoSelection = {
  title: string;
  path?: string; // Paragraph['path']
};

export const useQuickMemoSelection = () => {
  const { auth } = useAuthContext();
  const { data: privateConfig } = usePrivate();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const isPrivate = privateConfig.enabled;

  return useQuery({
    // 프라이빗 모드 상태가 변경될 때마다 쿼리가 갱신되도록 queryKey에 포함
    queryKey: ['quickMemoSelection', subkey, isPrivate],
    queryFn: async () => {
      const key = isPrivate ? QUICK_MEMO_PRIVACY_KEY : QUICK_MEMO_KEY;
      const jsonValue = await AsyncStorage.getItem(key + subkey);
      return jsonValue ? (JSON.parse(jsonValue) as QuickMemoSelection) : null;
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
      await AsyncStorage.setItem(key + subkey, JSON.stringify(selection));
    },
    onSuccess: () => {
      // 성공 시 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['quickMemoSelection', subkey] });
    },
  });
};
