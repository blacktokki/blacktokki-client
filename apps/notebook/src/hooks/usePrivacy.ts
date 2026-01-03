import { useAuthContext } from '@blacktokki/account';
import { useModalsContext } from '@blacktokki/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import OtpModal from '../modals/OtpModal';
import { getPrivacyConfigs, patchContent, postContent } from '../services/notebook';
import { PostContent, FetchPrivacyConfig } from '../types';

const PRIVACY_KEY = '@blacktokki:notebook:privacy';

const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10분

export type PrivacyConfig = {
  enabled: boolean;
  otpRequired: boolean;
  autoUnlock: boolean;
  resetOnSession: boolean;
};

const toPrivacyConfig = (config?: FetchPrivacyConfig) =>
  ({
    enabled: config?.enabled?.[1] || false,
    otpRequired: config?.otpRequired?.[1] || false,
    autoUnlock: config?.autoUnlock?.[1] || false,
    resetOnSession: config?.resetOnSession?.[1] || false,
  } as PrivacyConfig);

export const isHiddenTitle = (title: string) => {
  return title.startsWith('.') || title.includes('/.');
};

const getPrivacyConfig = async (isOnline: boolean): Promise<FetchPrivacyConfig> => {
  if (isOnline) {
    return await getPrivacyConfigs();
  } else {
    try {
      return JSON.parse((await AsyncStorage.getItem(PRIVACY_KEY)) || '{}');
    } catch (e) {
      console.error('Error loading privacy config', e);
      return {};
    }
  }
};

const savePrivacyConfig = async (
  key: string,
  value: boolean,
  userId?: number,
  id?: number,
  otpToken?: string
): Promise<void> => {
  if (userId !== undefined) {
    const title = `privacy.${key}`;
    const description = String(value);
    const contentData: PostContent = {
      title,
      description,
      type: 'CONFIG',
      userId,
      parentId: 0,
      order: 0,
      input: title,
      option: {},
    };

    if (id) {
      await patchContent(id, contentData, otpToken);
    } else {
      await postContent(contentData, otpToken);
    }
  } else {
    try {
      const newConfig = await getPrivacyConfig(false);
      newConfig[key as keyof FetchPrivacyConfig] = [undefined, value];

      await AsyncStorage.setItem(PRIVACY_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.error('Error saving privacy config', e);
    }
  }
};

let interval: NodeJS.Timeout | null = null;
let isOnline: boolean | null = null;

export const usePrivacy = () => {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['privacyMode', !auth.isLocal],
    queryFn: () => getPrivacyConfig(!auth.isLocal),
  });
  const config = toPrivacyConfig(query.data);
  const enabledId = query.data?.enabled?.[0];

  useEffect(() => {
    const _isOnline = !auth.isLocal;
    if (config.enabled && config.autoUnlock) {
      const lastActive = Date.now();
      const checkInactivity = async () => {
        const now = Date.now();
        const timer = INACTIVITY_LIMIT - (now - lastActive);
        console.log(`privacy mode timer: ${Math.floor(timer / 1000)}s`);
        if (timer <= 0) {
          await savePrivacyConfig(
            'enabled',
            false,
            auth.isLocal ? undefined : auth.user?.id,
            enabledId
          );
          queryClient.invalidateQueries({ queryKey: ['privacyMode', _isOnline] });
        }
      };
      if (interval) {
        clearInterval(interval);
      }
      interval = setInterval(checkInactivity, 30000);
      return () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };
    }
  }, [query, auth, queryClient]);

  useEffect(() => {
    if (query.isFetched && config.resetOnSession && isOnline !== !auth.isLocal) {
      isOnline = !auth.isLocal;
      if (config.enabled) {
        savePrivacyConfig(
          'enabled',
          false,
          auth.isLocal ? undefined : auth.user?.id,
          enabledId
        ).then(() => {
          queryClient.invalidateQueries({ queryKey: ['privacyMode', !auth.isLocal] });
          queryClient.invalidateQueries({ queryKey: ['pageContents'] });
          queryClient.invalidateQueries({ queryKey: ['boardContents'] });
          queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
        });
      }
    }
  }, [query.isFetched, config?.enabled, config?.resetOnSession, auth.isLocal]);

  return { ...query, data: config };
};

const _setPrivacy = async (
  updates: Partial<PrivacyConfig>,
  oldConfig: FetchPrivacyConfig,
  userId?: number,
  otpToken?: string
) => {
  for (const [key, value] of Object.entries(updates)) {
    await savePrivacyConfig(
      key,
      value,
      userId,
      oldConfig[key as keyof FetchPrivacyConfig]?.[0],
      otpToken
    );
  }
};

export const useSetPrivacy = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const { setModal } = useModalsContext();
  const onSuccess = async (enableChanged: boolean) => {
    await queryClient.invalidateQueries({ queryKey: ['privacyMode', !auth.isLocal] });
    if (enableChanged) {
      await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
      await queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
    }
  };

  return {
    ...useMutation({
      mutationFn: async (updates: Partial<PrivacyConfig>) => {
        const oldConfig = await getPrivacyConfig(!auth.isLocal);
        const current = toPrivacyConfig(oldConfig);
        const enableChanged = updates.enabled !== undefined && current.enabled !== updates.enabled;
        if (
          auth.useOtp &&
          current.otpRequired &&
          ((current.enabled === false && updates.enabled === true) || updates.otpRequired === false)
        ) {
          setModal(OtpModal, {
            onSuccess: (token: string) =>
              _setPrivacy(updates, oldConfig, auth.isLocal ? undefined : auth.user?.id, token).then(
                () => onSuccess(enableChanged)
              ),
          });
          return [false, enableChanged];
        } else {
          await _setPrivacy(updates, oldConfig, auth.isLocal ? undefined : auth.user?.id);
          return [true, enableChanged];
        }
      },
      onSuccess: async ([success, enableChanged]) => {
        if (success) {
          onSuccess(enableChanged);
        }
      },
    }),
  };
};
