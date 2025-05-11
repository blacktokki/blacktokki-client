import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "react-query";

const KEYWORDS_KEY = '@blacktokki:notebook:keywords';

export type KeywordContent = {
  type: "_NOTELINK",
  name: string, 
  title: string,
  section?: string
} | {
  type:  "_KEYWORD",
  title: string
}

const getKeywords = async (): Promise<KeywordContent[]> => {
try {
    const jsonValue = await AsyncStorage.getItem(KEYWORDS_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
} catch (e) {
    console.error('Error loading keywords', e);
    return [];
}
};
    
const saveKeywords = async (keywords: KeywordContent[]): Promise<void> => {
try {
    const jsonValue = JSON.stringify(keywords);
    await AsyncStorage.setItem(KEYWORDS_KEY, jsonValue);
} catch (e) {
    console.error('Error saving keywords', e);
}
};

export const useKeywords = () => {
    return useQuery({
        queryKey: ['keywords'],
        queryFn: async () => {
        return getKeywords()
        },
    });
};

export const useAddKeyowrd = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (keyword:KeywordContent) => {
      const keywords = await getKeywords();
      const newKeywords = [...new Set([JSON.stringify(keyword), ...keywords.map(v=>JSON.stringify(v))])].map(v=>JSON.parse(v))
      await saveKeywords(newKeywords)
    },
    onSuccess: async() => {
      await queryClient.invalidateQueries({ queryKey: ['keywords'] });
    },
  });
}

export const useResetKeyowrd = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      await saveKeywords([])
    },
    onSuccess: async() => {
      await queryClient.invalidateQueries({ queryKey: ['keywords'] });
    },
  });
}