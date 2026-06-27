import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

export type UsageMode = 'SIMPLE' | 'NOTE' | 'NOTEBOOK';

const USAGE_MODE_KEY = '@blacktokki:notebook:usage_mode:';

const getUsageMode = async (subkey: string): Promise<UsageMode> => {
  try {
    const jsonValue = await AsyncStorage.getItem(USAGE_MODE_KEY + subkey);
    return (jsonValue as UsageMode) || 'SIMPLE';
  } catch (e) {
    return 'SIMPLE';
  }
};

export const useUsageMode = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  return useQuery({
    queryKey: ['usageMode', subkey],
    queryFn: () => getUsageMode(subkey),
  });
};

export const useSetUsageMode = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  return useMutation({
    mutationFn: async (mode: UsageMode) => {
      await AsyncStorage.setItem(USAGE_MODE_KEY + subkey, mode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usageMode', subkey] });
    },
  });
};
