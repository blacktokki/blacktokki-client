import { useMutation, useQuery, useQueryClient } from "react-query";
import { deleteContent, getContentList, patchContent, postContent } from "../services/spreadocs";
import { Content } from "../types";

export default function useContentList(parentId?:number, type?: Content['type']){
  const { data } = useQuery(["ContentList", parentId, type] , async()=> (parentId!==undefined || type!==undefined?await getContentList(parentId, type):undefined))
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
  const _delete = useMutation(deleteContent, {
    onSuccess: () => {
      queryClient.invalidateQueries("ContentList")
    }
  })
  return {create:create.mutateAsync, update:update.mutateAsync, delete:_delete.mutateAsync}
}