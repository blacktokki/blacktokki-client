import { useAuthContext } from '@blacktokki/account';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { ParagraphKey } from '../types';
import { isHiddenTitle, usePrivacy } from './usePrivacy';

const KEYWORDS_KEY = '@blacktokki:notebook:keywords:';

export type KeywordContent =
  | {
      type: '_LINK';
      name: string;
      url: string;
      origin: string;
    }
  | ({
      type: '_NOTELINK';
      name: string;
      title: string;
      origin: string;
    } & ParagraphKey)
  | {
      type: '_KEYWORD';
      title: string;
    }
  | {
      type: '_QUERY';
      query: string;
    };

const getKeywords = async (subkey: string | undefined): Promise<KeywordContent[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(KEYWORDS_KEY + subkey);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading keywords', e);
    return [];
  }
};

const saveKeywords = async (
  subkey: string | undefined,
  keywords: KeywordContent[]
): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(keywords);
    await AsyncStorage.setItem(KEYWORDS_KEY + subkey, jsonValue);
  } catch (e) {
    console.error('Error saving keywords', e);
  }
};

export const useKeywords = () => {
  const { auth } = useAuthContext();
  const { isPrivacyMode } = usePrivacy();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;
  return useQuery({
    queryKey: ['keywords', subkey, isPrivacyMode],
    queryFn: async () => {
      const keywords = await getKeywords(subkey);
      return isPrivacyMode
        ? keywords
        : keywords.filter(
            (v) =>
              (v.type === '_KEYWORD' && !isHiddenTitle(v.title)) ||
              (v.type === '_NOTELINK' && !isHiddenTitle(v.origin) && !isHiddenTitle(v.title)) ||
              (v.type === '_LINK' && !isHiddenTitle(v.origin)) ||
              v.type === '_QUERY'
          );
    },
  });
};

export const useAddKeyowrd = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;

  return useMutation({
    mutationFn: async (keyword: KeywordContent) => {
      const keywords = await getKeywords(subkey);
      const newKeywords = [
        ...new Set([JSON.stringify(keyword), ...keywords.map((v) => JSON.stringify(v))]),
      ].map((v) => JSON.parse(v));
      await saveKeywords(subkey, newKeywords);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['keywords', subkey] });
    },
  });
};

export const useResetKeyowrd = () => {
  const queryClient = useQueryClient();
  const { auth } = useAuthContext();
  const subkey = auth.isLocal ? '' : `${auth.user?.id}`;

  return useMutation({
    mutationFn: async () => {
      await saveKeywords(subkey, []);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['keywords', subkey] });
    },
  });
};
