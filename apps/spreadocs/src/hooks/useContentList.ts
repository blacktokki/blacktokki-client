import { useMutation, useQuery, useQueryClient } from "react-query";
import { getContentList, postContent } from "../services/spreadocs";

export default function useContentList(parentId:number){
  const { data } = useQuery(["ContentList", parentId] , async()=>await getContentList(parentId))
  return data
}


export function useContentMutation(){
  const queryClient = useQueryClient()
  const create = useMutation(postContent, {
    onSuccess: ()=>{
      queryClient.invalidateQueries("ContentList")
    }
  })
  return {create:create.mutateAsync}
}