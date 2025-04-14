import { useQuery, useMutation, useQueryClient } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Content, PostContent } from '../types';
import { getContentList, patchContent, postContent } from '../services/notebook';
import { useAuthContext } from '@blacktokki/account';

const WIKI_STORAGE_KEY = '@blacktokki:notebook:contents';
const RECENT_PAGES_KEY = '@blacktokki:recent_pages';
const ONLINE = true;

const getWikiContents = async (): Promise<Content[]> => {
  if (ONLINE){
    return (await getContentList()).filter(v=>v.type==='NOTE'|| v.type==='BOOKMARK')
  }
  try {
    const jsonValue = await AsyncStorage.getItem(WIKI_STORAGE_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading wiki contents', e);
    return [];
  }
};

const saveWikiContents = async (contents: (Content|PostContent)[], id?:number): Promise<void> => {
  if (ONLINE){
    const content = contents.find(v=>id===(v as {id?:number}).id);
    content && await (id?patchContent({id, updated:content}):postContent(content));
  }
  try {
    const jsonValue = JSON.stringify(contents);
    await AsyncStorage.setItem(WIKI_STORAGE_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving wiki contents', e);
  }
};
  
const getRecentPages = async (): Promise<string[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(RECENT_PAGES_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading recent pages', e);
    return [];
  }
};
  
const saveRecentPages = async (titles: string[]): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(titles);
    await AsyncStorage.setItem(RECENT_PAGES_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving recent pages', e);
  }
};
  
export const useWikiPages = () => {
  return useQuery({
    queryKey: ['wikiContents'],
    queryFn: getWikiContents,
  });
};

export const useWikiPage = (title: string, opened:boolean) => {
  return useQuery({
    queryKey: ['wikiContent', title, opened],
    queryFn: async () => {
      const contents = await getWikiContents();
      const page = contents.find(c => c.title === title);
      
      // Add to recent pages
      if (page && opened) {
        const recentPages = await getRecentPages();
        const updatedRecentPages = [title, ...recentPages.filter(p => p !== title)].slice(0, 10);
        await saveRecentPages(updatedRecentPages);
      }
      return page || { title, description: '' };
    },
  });
};
  
  export const useRecentPages = () => {
    return useQuery({
      queryKey: ['recentPages'],
      queryFn: async () => {
        const recentTitles = await getRecentPages();
        const contents = await getWikiContents();
        return recentTitles
          .map(title => contents.find(c => c.title === title))
          .filter(c => c !== undefined) as Content[];
      },
    });
  };
  
  export const useCreateOrUpdatePage = () => {
    const queryClient = useQueryClient();
    const { auth } = useAuthContext()
    return useMutation({
      mutationFn: async ({ title, description }: {title:string, description:string}) => {
        const contents = await getWikiContents();
        const page = contents.find(c => c.title === title);
        
        let updatedContents: (Content|PostContent)[];
        if (page) {
          updatedContents = contents.map((c, i) => 
            c.id === page.id ? { ...c, description } : c
          );
        } else {
          const newPage:PostContent = { title, description, userId:auth.user?.id || 0, parentId:0, type:'NOTE', order:0 }
          updatedContents = [...contents, newPage];
        }
        
        await saveWikiContents(updatedContents, page?.id);
        return { title, description };
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['wikiContents'] });
        queryClient.invalidateQueries({ queryKey: ['wikiContent', data.title] });
        queryClient.invalidateQueries({ queryKey: ['recentPages'] });
      },
    });
  };
  
  export const useMovePage = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
      mutationFn: async ({ oldTitle, newTitle }: { oldTitle: string, newTitle: string }) => {
        const contents = await getWikiContents();
        const page = contents.find(c => c.title === oldTitle);
        
        if (!page) {
          throw new Error('Page not found');
        }
        
        if (contents.some(c => c.title === newTitle)) {
          throw new Error('Page with new title already exists');
        }
        
        const updatedContents = contents.map(c => 
          c.title === oldTitle ? { ...c, title: newTitle } : c
        );
        
        await saveWikiContents(updatedContents, page.id);
        
        // Update recent pages
        const recentPages = await getRecentPages();
        const updatedRecentPages = recentPages.map(title => 
          title === oldTitle ? newTitle : title
        );
        await saveRecentPages(updatedRecentPages);
        
        return { oldTitle, newTitle };
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['wikiContents'] });
        queryClient.invalidateQueries({ queryKey: ['wikiContent', data.oldTitle] });
        queryClient.invalidateQueries({ queryKey: ['wikiContent', data.newTitle] });
        queryClient.invalidateQueries({ queryKey: ['recentPages'] });
      },
    });
  };