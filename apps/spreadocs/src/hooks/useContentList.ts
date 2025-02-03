import { useMutation, useQuery, useQueryClient } from "react-query";
import { getContentList, patchContent, postContent } from "../services/spreadocs";

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
  const update = useMutation(patchContent, {
    onSuccess: () => {
      queryClient.invalidateQueries("ContentList")
    }
  })
  return {create:create.mutateAsync, update:update.mutateAsync}
}