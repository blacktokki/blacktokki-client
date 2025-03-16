import { useInfiniteQuery } from "react-query";
import { getInfiniteContentList } from "../services/feedynote";
import { Content } from "../types";

export type ContentPage = {
  next?:ContentPage
  current:Content[]
}

export default function useInfiniteContentList(parentId:number, type:'NOTEV2'){
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