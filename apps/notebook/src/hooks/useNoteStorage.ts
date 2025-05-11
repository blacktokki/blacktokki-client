import { useQuery, useMutation, useQueryClient } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Content, PostContent } from '../types';
import { deleteContent, getContentList, patchContent, postContent } from '../services/notebook';
import { useAuthContext } from '@blacktokki/account';

const PAGE_STORAGE_KEY = '@blacktokki:notebook:contents';
const RECENT_PAGES_KEY = '@blacktokki:notebook:recent_pages';
const ONLINE = true;
let lastPage:string|undefined

const getContents = async (type:"NOTE"|"SNAPSHOT"): Promise<Content[]> => {
  if (ONLINE){
    return (await getContentList(undefined,[type]))
  }
  if(type==="SNAPSHOT"){
    return []
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
      const savedId = await (id?(patchContent({id, updated:content}).then(()=>id)):postContent(content));
      const snapshot:Content|PostContent = {...content, type:"SNAPSHOT", id:undefined, parentId:savedId}
      await postContent(snapshot)
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
    queryFn: async() => await getContents("NOTE"),
    staleTime: 1000
  });
};

export const useSnapshotPages = () => {
  return useQuery({
    queryKey: ['snapshotContents'],
    queryFn: async () => await getContents("SNAPSHOT"),
  });
};

export const useNotePage = (title: string) => {
  const queryClient = useQueryClient()
  const { data:contents=[], isLoading } = useNotePages()
  return useQuery({
    queryKey: ['pageContent', title, isLoading],
    queryFn: async () => {
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
    const { data:contents=[], isLoading } = useNotePages()
    return useQuery({
      queryKey: ['recentPages', isLoading],
      queryFn: async () => {
        const recentTitles = await getRecentPages();
        return recentTitles
          .map(title => contents.find(c => c.title === title))
          .filter(c => c !== undefined) as Content[];
      },
    });
  };

  export const useLastPage = () => {
    const { data:contents=[], isLoading } = useNotePages()
    return useQuery({
      queryKey: ['lastPage', isLoading],
      queryFn: async() => {
        console.log(lastPage, )
        return contents.find(v=>v.title === lastPage)
      } 
    });
  }
  
  export const useCreateOrUpdatePage = () => {
    const queryClient = useQueryClient();
    const { auth } = useAuthContext()
    const { data:contents=[] } = useNotePages()
    return useMutation({
      mutationFn: async ({ title, description }: {title:string, description:string}) => {
        const page = contents.find(c => c.title === title);
        
        let updatedContents: (Content|PostContent)[];
        if (page) {
          updatedContents = contents.map((c, i) => 
            c.id === page.id ? { ...c, description } : c
          );
        } else {
          const newPage:PostContent = { title, description, input:title, userId:auth.user?.id || 0, parentId:0, type:'NOTE', order:0, option: {} }
          updatedContents = [...contents, newPage];
        }
        
        await saveNoteContents(updatedContents, page?.id);
        return { title, description };
      },
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({ queryKey: ['pageContents'] });
        await queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
        await queryClient.invalidateQueries({ queryKey: ['pageContent', data.title] });
        await queryClient.invalidateQueries({ queryKey: ['recentPages'] });
      },
    });
  };
  
  export const useMovePage = () => {
    const queryClient = useQueryClient();
    const { data:contents=[] } = useNotePages()

    return useMutation({
      mutationFn: async ({ oldTitle, newTitle, description }: { oldTitle: string, newTitle: string, description?:string }) => {
        const page = contents.find(c => c.title === oldTitle);
        
        if (!page) {
          throw new Error('Page not found');
        }
        
        if (contents.some(c => c.title === newTitle)) {
          throw new Error('Page with new title already exists');
        }
        
        const updatedContents = contents.map(c => 
          c.title === oldTitle ? { ...c, title: newTitle, description:description || page.description } : c
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
        queryClient.invalidateQueries({ queryKey: ['snapshotContents'] });
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