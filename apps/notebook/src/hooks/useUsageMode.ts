import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { useNotebook } from './useNotebookStorage';

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

  const { data: usageMode = 'SIMPLE', isLoading: isModeLoading } = useQuery({
    queryKey: ['usageMode', subkey],
    queryFn: () => getUsageMode(subkey),
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: currentNotebookId, isLoading: isIdLoading } = useQuery({
    queryKey: ['currentNotebookId', subkey],
    queryFn: () => getCurrentNotebookId(subkey),
    staleTime: Infinity,
    cacheTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: notebook, isLoading: isNotebookLoading } = useNotebook(currentNotebookId || 0);

  if (isModeLoading || isIdLoading || isNotebookLoading) {
    return {
      usageMode: undefined,
      notebook: undefined,
      isBoardEnabled: undefined,
    };
  }

  if (usageMode !== 'NOTEBOOK') {
    return {
      usageMode,
      notebook: null,
      isBoardEnabled: false,
    };
  }
  if (currentNotebookId === 0 || !notebook) {
    return {
      usageMode: 'NOTE',
      notebook: null,
      isBoardEnabled: false,
    };
  }

  const notebookType = notebook.option?.NOTEBOOK_TYPE;

  return {
    usageMode,
    notebook,
    isBoardEnabled: notebookType === 'WORKSPACE' || notebookType === 'PRIVATE_WORKSPACE',
  };
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
      | { mode: 'SIMPLE' | 'NOTE'; notebookId?: undefined }
      | { mode: 'NOTEBOOK'; notebookId: number }) => {
      await AsyncStorage.setItem(USAGE_MODE_KEY + subkey, mode);
      if (notebookId !== undefined) {
        if (notebookId === null) {
          await AsyncStorage.removeItem(CURRENT_NOTEBOOK_KEY + subkey);
        } else {
          await AsyncStorage.setItem(CURRENT_NOTEBOOK_KEY + subkey, String(notebookId));
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usageMode', subkey] });
      queryClient.invalidateQueries({ queryKey: ['currentNotebookId', subkey] });
    },
  });
};
