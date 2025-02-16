import { QueryKey, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "react-query";
import { deleteContent, getInfiniteContentList, patchContent, postContent, pullFeed } from "../services/feedynote";
import { Content } from "../types";

export type ContentPage = {
  next?:ContentPage
  current:Content[]
}

export default function useInfiniteContentList(parentId:number, type:'TIMELINE'|'LIBRARY'|'FEED'){
  const { data, fetchNextPage } = useInfiniteQuery<ContentPage>(
    ["ContentList", parentId], 
    async({pageParam})=>await getInfiniteContentList(parentId, type,  pageParam), 
    {
      select:data=>{
        if(data.pages.length > 1)
          data.pages[data.pages.length - 2].next = data.pages[data.pages.length - 1]
        return data;
      },
      getNextPageParam:(lastPage, allPages)=>allPages.length,
      refetchOnReconnect:false,
      //refetchOnWindowFocus:refetch
    }
  )
  
  return { data, fetchNextPage }
}