import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { useNotebook } from './useNotebookStorage';
import { getPrivateConfig } from '../services/notebook';

export type UsageMode = 'SIMPLE' | 'NOTE' | 'NOTEBOOK';

const USAGE_MODE_KEY = '@blacktokki:notebook:usage_mode:';
const CURRENT_NOTEBOOK_KEY = '@blacktokki:notebook:current_id:';

const getUsageMode = async (subkey: string): Promise<UsageMode> => {
  try {
    const jsonValue = await AsyncStorage.getItem(USAGE_MODE_KEY + subkey);
    return (jsonValue as UsageMode) || 'SIMPLE';
  } catch (e) {
    return 'SIMPLE';
  }
};

export const getCurrentNotebookId = async (subkey: string): Promise<number | null> => {
  try {
    const value = await AsyncStorage.getItem(CURRENT_NOTEBOOK_KEY + subkey);
    return value ? parseInt(value, 10) : null;
  } catch (e) {
    return null;
  }
};

export const useUsageMode = () => {
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  const isAuthReady = auth.user !== undefined && auth.isLocal !== undefined;

  const { data: usageMode, isLoading: isModeLoading } = useQuery({
    queryKey: ['usageMode', subkey],
    queryFn: () => getUsageMode(subkey),
    enabled: isAuthReady,
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: currentNotebookId, isLoading: isIdLoading } = useQuery({
    queryKey: ['currentNotebookId', subkey],
    queryFn: () => getCurrentNotebookId(subkey),
    enabled: isAuthReady,
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: privateConfig, isLoading: isPrivateLoading } = useQuery({
    queryKey: ['privateMode', subkey],
    queryFn: () => getPrivateConfig(subkey),
    enabled: isAuthReady,
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: notebook, isLoading: isNotebookLoading } = useNotebook(currentNotebookId || 0);
  const isLoading =
    !isAuthReady || isModeLoading || isIdLoading || isNotebookLoading || isPrivateLoading;
  const setUsageMode = useSetUsageMode();

  const isPrivateNotebook = !!notebook?.option?.NOTEBOOK_TYPE?.includes('PRIVATE');
  const isPrivateDisabled = isPrivateNotebook && !privateConfig?.enabled;
  const isNotebookInvalid =
    usageMode === 'NOTEBOOK' && (currentNotebookId === 0 || !notebook || isPrivateDisabled);

  useEffect(() => {
    if (!isLoading && isNotebookInvalid) {
      setUsageMode.mutate({ mode: 'NOTE', notebookId: null });
    }
  }, [isLoading, isNotebookInvalid, setUsageMode]);

  return useMemo(() => {
    if (
      isLoading ||
      usageMode === undefined ||
      (usageMode === 'NOTEBOOK' && currentNotebookId && notebook === undefined)
    ) {
      return {
        usageMode: undefined,
        notebook: undefined,
        isBoardEnabled: undefined,
        currentNotebookId: currentNotebookId ?? undefined,
      };
    }

    if (usageMode !== 'NOTEBOOK' || isNotebookInvalid) {
      return {
        usageMode: usageMode === 'SIMPLE' ? 'SIMPLE' : 'NOTE',
        notebook: null,
        isBoardEnabled: false,
        currentNotebookId: isNotebookInvalid ? null : currentNotebookId ?? null,
      };
    }

    const notebookType = notebook?.option?.NOTEBOOK_TYPE;

    return {
      usageMode,
      notebook,
      isBoardEnabled: notebookType === 'WORKSPACE' || notebookType === 'PRIVATE_WORKSPACE',
      currentNotebookId: currentNotebookId ?? null,
    };
  }, [usageMode, notebook, currentNotebookId, isLoading, isNotebookInvalid]);
};

export const useSetUsageMode = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;

  return useMutation({
    mutationFn: async ({
      mode,
      notebookId,
    }:
      | { mode: 'SIMPLE' | 'NOTE'; notebookId?: number | null }
      | { mode: 'NOTEBOOK'; notebookId: number | null }) => {
      await AsyncStorage.setItem(USAGE_MODE_KEY + subkey, mode);
      if (notebookId !== undefined) {
        if (notebookId === null) {
          await AsyncStorage.removeItem(CURRENT_NOTEBOOK_KEY + subkey);
        } else {
          await AsyncStorage.setItem(CURRENT_NOTEBOOK_KEY + subkey, String(notebookId));
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData(['usageMode', subkey], variables.mode);
      if (variables.notebookId !== undefined) {
        queryClient.setQueryData(['currentNotebookId', subkey], variables.notebookId);
      }
      queryClient.invalidateQueries({ queryKey: ['usageMode', subkey] });
      queryClient.invalidateQueries({ queryKey: ['currentNotebookId', subkey] });
      queryClient.invalidateQueries({ queryKey: ['pageContents'] });
      queryClient.invalidateQueries({ queryKey: ['pageContent'] });
      queryClient.invalidateQueries({ queryKey: ['boardContents'] });
      queryClient.invalidateQueries({ queryKey: ['boardContent'] });
      queryClient.invalidateQueries({ queryKey: ['recentTabs'] });
      queryClient.invalidateQueries({ queryKey: ['lastTab'] });
      queryClient.invalidateQueries({ queryKey: ['notebookSyncDiff'] });
      queryClient.invalidateQueries({ queryKey: ['keywords'] });
    },
  });
};
