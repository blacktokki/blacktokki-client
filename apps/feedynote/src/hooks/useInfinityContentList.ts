import { QueryKey, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "react-query";
import { deleteContent, getContentList, patchContent, postContent, pullFeed } from "../services/feedynote";
import { Content } from "../types";

export type ContentPage = {
  next?:ContentPage
  current?:Content[]
}

export default function useInfinityContentList(parentId?:number, type?: Content['type']){
  const { data, fetchNextPage } = useInfiniteQuery<ContentPage>(
    ["ContentList", parentId, type], 
    async({pageParam})=>(parentId!==undefined || type!==undefined)?await getContentList(parentId, type, pageParam).then(current=>({current})):{}, 
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