import { useQuery, useMutation, useQueryClient } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Content, PostContent } from '../types';
import { deleteContent, getContentList, patchContent, postContent } from '../services/notebook';
import { useAuthContext } from '@blacktokki/account';

const PAGE_STORAGE_KEY = '@blacktokki:notebook:contents';
const RECENT_PAGES_KEY = '@blacktokki:recent_pages';
const ONLINE = true;
let lastPage:string|undefined

const getNoteContents = async (): Promise<Content[]> => {
  if (ONLINE){
    return (await getContentList()).filter(v=>(v.type==='NOTE'|| v.type==='BOOKMARK'))
  }
  try {
    const jsonValue = await AsyncStorage.getItem(PAGE_STORAGE_KEY);
    return jsonValue ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading page contents', e);
    return [];
  }
};

const saveNoteContents = async (contents: (Content|PostContent)[], id?:number): Promise<void> => {
  if (ONLINE){
    const content = contents.find(v=>id===(v as {id?:number}).id);
    if (content){
      await (id?patchContent({id, updated:content}):postContent(content));
    }
  }
  try {
    const jsonValue = JSON.stringify(contents);
    await AsyncStorage.setItem(PAGE_STORAGE_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving page contents', e);
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
  
export const useNotePages = () => {
  return useQuery({
    queryKey: ['pageContents'],
    queryFn: getNoteContents,
  });
};

export const useNotePage = (title: string) => {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['pageContent', title],
    queryFn: async () => {
      const contents = await getNoteContents();
      const page = contents.find(c => c.title === title);
      
      // Add to recent pages
      if (page) {
        const recentPages = await getRecentPages();
        if (recentPages.find(v=>v===title)===undefined){
          lastPage = title;
          await queryClient.invalidateQueries({ queryKey: ['lastPage'] });
        }
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
        const contents = await getNoteContents();
        return recentTitles
          .map(title => contents.find(c => c.title === title))
          .filter(c => c !== undefined) as Content[];
      },
    });
  };

  export const useLastPage = () => {
    return useQuery({
      queryKey: ['lastPage'],
      queryFn: async() => {
        const contents = await getNoteContents();
        return contents.find(v=>v.title === lastPage)
      } 
    });
  }
  
  export const useCreateOrUpdatePage = () => {
    const queryClient = useQueryClient();
    const { auth } = useAuthContext()
    return useMutation({
      mutationFn: async ({ title, description }: {title:string, description:string}) => {
        const contents = await getNoteContents();
        const page = contents.find(c => c.title === title);
        
        let updatedContents: (Content|PostContent)[];
        if (page) {
          updatedContents = contents.map((c, i) => 
            c.id === page.id ? { ...c, description } : c
          );
        } else {
          const newPage:PostContent = { title, description, userId:auth.user?.id || 0, parentId:0, type:'NOTE', order:0, option: {} }
          updatedContents = [...contents, newPage];
        }
        
        await saveNoteContents(updatedContents, page?.id);
        return { title, description };
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['pageContents'] });
        queryClient.invalidateQueries({ queryKey: ['pageContent', data.title] });
        queryClient.invalidateQueries({ queryKey: ['recentPages'] });
      },
    });
  };
  
  export const useMovePage = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
      mutationFn: async ({ oldTitle, newTitle }: { oldTitle: string, newTitle: string }) => {
        const contents = await getNoteContents();
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
        
        await saveNoteContents(updatedContents, page.id);
        
        // Update recent pages
        const recentPages = await getRecentPages();
        const updatedRecentPages = recentPages.map(title => 
          title === oldTitle ? newTitle : title
        );
        await saveRecentPages(updatedRecentPages);
        
        return { oldTitle, newTitle };
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['pageContents'] });
        queryClient.invalidateQueries({ queryKey: ['pageContent', data.oldTitle] });
        queryClient.invalidateQueries({ queryKey: ['pageContent', data.newTitle] });
        queryClient.invalidateQueries({ queryKey: ['recentPages'] });
      },
    });
  };

export const useAddRecentPage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({title, direct}:{title:string, direct?:boolean}) => {
      
      // Update recent pages
      const recentPages = await getRecentPages();
      if (recentPages.find(v=>v===title) === undefined || direct){
        const updatedRecentPages = [title, ...recentPages]
        await saveRecentPages(updatedRecentPages);
      }
      
      return { title };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentPages'] });
    },
  });
}

export const useDeleteRecentPage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (title:string) => {
      
      // Update recent pages
      const recentPages = await getRecentPages();
      const updatedRecentPages = recentPages.filter(_title => 
        title !== _title
      );
      lastPage = undefined
      await saveRecentPages(updatedRecentPages);
      
      return { title };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentPages'] });
      queryClient.invalidateQueries({ queryKey: ['pageContent'] });
      queryClient.invalidateQueries({ queryKey: ['lastPage']})
    },
  });
}