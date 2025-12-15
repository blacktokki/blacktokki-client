import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

const PRIVACY_KEY = '@blacktokki:notebook:privacy:';

export const isHiddenTitle = (title: string) => {
  return title.startsWith('.') || title.includes('/.');
};

const getPrivacyMode = async (subkey: string | undefined): Promise<boolean> => {
  try {
    const jsonValue = await AsyncStorage.getItem(PRIVACY_KEY + subkey);
    return jsonValue ? JSON.parse(jsonValue) : false;
  } catch (e) {
    console.error('Error loading privacy mode', e);
    return false;
  }
};

const savePrivacyMode = async (subkey: string | undefined, enabled: boolean): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(enabled);
    await AsyncStorage.setItem(PRIVACY_KEY + subkey, jsonValue);
  } catch (e) {
    console.error('Error saving privacy mode', e);
  }
};

export const usePrivacy = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? 'local' : `${auth.user?.id}`;
  const query = useQuery({
    queryKey: ['privacyMode', subkey],
    queryFn: async () => {
      return await getPrivacyMode(subkey);
    },
  });
  return { ...query, isPrivacyMode: query.data || false };
};

export const useSetPrivacy = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? 'local' : `${auth.user?.id}`;

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await savePrivacyMode(subkey, enabled);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['privacyMode', subkey] });
      await queryClient.invalidateQueries({ queryKey: ['pageContents'] }); // 노트 목록 갱신
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] }); // 보드 목록 갱신
      await queryClient.invalidateQueries({ queryKey: ['recentTabs'] }); // 최근 탭 갱신
    },
  });
};
