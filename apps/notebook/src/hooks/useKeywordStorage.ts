import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "react-query";

const KEYWORDS_KEY = '@blacktokki:notebook:keywords';


const getKeywords = async (): Promise<string[]> => {
try {
    const jsonValue = await AsyncStorage.getItem(KEYWORDS_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
} catch (e) {
    console.error('Error loading keywords', e);
    return [];
}
};
    
const saveKeywords = async (keywords: string[]): Promise<void> => {
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
    mutationFn: async (keyword:string) => {
      const keywords = await getKeywords();
      const newKeywords = [...new Set([...keywords, keyword])].filter(v=>v.trim()).slice(0, 10)
      await saveKeywords(newKeywords)
    },
    onSuccess: async() => {
      await queryClient.invalidateQueries({ queryKey: ['keywords'] });
    },
  });
}