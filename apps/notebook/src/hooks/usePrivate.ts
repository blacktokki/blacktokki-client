import { useAuthContext } from '@blacktokki/account';
import { useModalsContext } from '@blacktokki/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import OtpModal from '../modals/OtpModal';
import { getPrivateConfigs, patchContent, postContent } from '../services/notebook';
import { PostContent } from '../types';

const PRIVATE_KEY = '@blacktokki:notebook:private:';
const PRIVATE_TIMER_KEY = '@blacktokki:notebook:private_timer:';
const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10분

export type PrivateConfig = {
  enabled: boolean;
  autoUnlock: boolean;
};

const defaultConfig: PrivateConfig = {
  enabled: false,
  autoUnlock: false,
};

export const isHiddenTitle = (title: string) => {
  return title.startsWith('.') || title.includes('/.');
};

const getPrivateConfig = async (subkey: string): Promise<PrivateConfig> => {
  try {
    const jsonValue = await AsyncStorage.getItem(`${PRIVATE_KEY}${subkey}`);
    return jsonValue ? { ...defaultConfig, ...JSON.parse(jsonValue) } : defaultConfig;
  } catch (e) {
    console.error('Error loading local private data', e);
    return defaultConfig;
  }
};

const getOtpRequired = async (isOnline: boolean): Promise<{ value: boolean; id?: number }> => {
  if (isOnline) {
    const serverConfigs = await getPrivateConfigs();
    return serverConfigs.otpRequired || { value: false };
  }
  return { value: false };
};

const savePrivateConfig = async (subkey: string, config: PrivateConfig): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(config);
    await AsyncStorage.setItem(PRIVATE_KEY + subkey, jsonValue);
  } catch (e) {
    console.error('Error saving private mode', e);
  }
};

const setOtpRequired = async (userId: number, value: boolean, id?: number) => {
  const title = `private.otpRequired`;
  const contentData: PostContent = {
    title,
    description: String(value),
    type: 'CONFIG',
    userId,
    parentId: 0,
    order: 0,
    input: title,
    option: {},
  };

  if (id) {
    await patchContent(id, contentData);
  } else {
    await postContent(contentData);
  }
};

const privateLastActive = async (subkey: string, value?: number | null) => {
  const privateTimerkey = `${PRIVATE_TIMER_KEY}${subkey}`;
  if (value === undefined) {
    const raw = await AsyncStorage.getItem(privateTimerkey);
    return raw !== null ? parseInt(raw, 10) : null;
  } else if (value !== null) {
    await AsyncStorage.setItem(privateTimerkey, `${value}`);
  } else {
    await AsyncStorage.removeItem(privateTimerkey);
  }
  return null;
};

let interval: NodeJS.Timeout | null = null;

export const usePrivate = () => {
  const { auth, otp } = useAuthContext();
  const queryClient = useQueryClient();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;

  const query = useQuery({
    queryKey: ['privateMode', subkey],
    queryFn: () => getPrivateConfig(subkey),
  });

  const config = query.data || defaultConfig;

  useEffect(() => {
    if (config.enabled && config.autoUnlock) {
      const checkInactivity = async () => {
        const lastActive = await privateLastActive(subkey);
        if (lastActive === null) {
          return;
        }
        const now = Date.now();
        const timer = INACTIVITY_LIMIT - (now - lastActive);
        console.log(`private mode timer: ${Math.floor(timer / 1000)}s`);
        if (timer <= 0) {
          await otp?.verify();
          await privateLastActive(subkey, null);
          await savePrivateConfig(subkey, {
            ...config,
            enabled: false,
          });
          await queryClient.invalidateQueries({ queryKey: ['privateMode', subkey] });
          queryClient.invalidateQueries({ queryKey: ['pageContents'] });
          queryClient.invalidateQueries({ queryKey: ['boardContents'] });
          queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
        }
      };
      if (interval) {
        clearInterval(interval);
      } else {
        privateLastActive(subkey).then(async (lastActive) => {
          const now = Date.now();
          if (
            lastActive === null ||
            (now - lastActive > 1000 && INACTIVITY_LIMIT - (now - lastActive) > 0)
          ) {
            await privateLastActive(subkey, now);
            await checkInactivity();
          } else if (INACTIVITY_LIMIT - (now - lastActive) <= 0) {
            await checkInactivity();
          }
        });
      }
      interval = setInterval(checkInactivity, 30000);
      return () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };
    } else if (!config.enabled) {
      privateLastActive(subkey, null);
    }
  }, [query, auth]);
  return { ...query, data: config };
};

export const usePrivateOtp = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const query = useQuery({
    queryKey: ['privateOtp', subkey],
    queryFn: async () => await getOtpRequired(!auth.isLocal),
  });
  return query;
};

export const useSetPrivate = () => {
  const queryClient = useQueryClient();
  const { auth, otp } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const { setModal } = useModalsContext();
  const onSuccess = async (enableChanged: boolean) => {
    await queryClient.invalidateQueries({ queryKey: ['privateMode', subkey] });
    if (enableChanged) {
      await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
      await queryClient.invalidateQueries({ queryKey: ['boardContents'] });
      await queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
    }
  };

  return useMutation({
    mutationFn: async (updates: Partial<PrivateConfig>) => {
      const current = await getPrivateConfig(subkey);
      const otpRequired = await getOtpRequired(!auth.isLocal);
      const enableChanged = updates.enabled !== undefined && current.enabled !== updates.enabled;
      const changed = { ...current, ...updates };
      if (auth.hasOtp && otpRequired.value && enableChanged) {
        if (current.enabled === true && updates.enabled === false) {
          await otp?.verify();
          await savePrivateConfig(subkey, changed);
          await onSuccess(enableChanged);
        } else {
          setModal(OtpModal, {
            onSuccess: async () => {
              await savePrivateConfig(subkey, changed);
              await onSuccess(enableChanged);
            },
          });
        }
        return [false, enableChanged];
      } else {
        await savePrivateConfig(subkey, changed);
        return [true, enableChanged];
      }
    },
    onSuccess: async ([success, enableChanged]) => {
      if (success) {
        onSuccess(enableChanged);
      }
    },
  });
};

export const useSetPrivateOtp = () => {
  const queryClient = useQueryClient();
  const { auth, otp } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const { setModal } = useModalsContext();
  const onSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['privateMode', subkey] });
    await queryClient.invalidateQueries({ queryKey: ['privateOtp', subkey] });
  };
  return useMutation({
    mutationFn: async (value: boolean) => {
      const otpRequired = await getOtpRequired(!auth.isLocal);
      if (!auth.user) {
        return false;
      }
      const userId = auth.user.id;
      if (auth.hasOtp && otpRequired.value === true && value === false) {
        setModal(OtpModal, {
          onSuccess: async () => {
            await setOtpRequired(userId, value, otpRequired.id);
            await otp?.verify();
            await onSuccess();
          },
        });
        return false;
      } else {
        await setOtpRequired(userId, value, otpRequired.id);
        return true;
      }
    },
    onSuccess: async (success) => {
      if (success) {
        await onSuccess();
      }
    },
  });
};
