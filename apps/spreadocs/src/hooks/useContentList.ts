import { useMutation, useQuery, useQueryClient } from "react-query";
import { deleteContent, getContentList, patchContent, postContent, pullFeed } from "../services/spreadocs";
import { Content } from "../types";
import { useEffect } from "react";

let isPullFeed = false

export default function useContentList(parentId?:number, type?: Content['type']){
  const queryClient = useQueryClient()
  const { data } = useQuery(["ContentList", parentId, type] , async()=> (parentId!==undefined || type!==undefined)?await getContentList(parentId, type):undefined)
  useEffect(()=>{
    if (!isPullFeed){
      isPullFeed = true;
      pullFeed().catch(()=>{isPullFeed=false}).then(()=>queryClient.invalidateQueries("ContentList"))
    }
  }, [])
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
  const _pullFeed = useMutation(pullFeed, {
    onSuccess: ()=>{
      queryClient.invalidateQueries("ContentList")
    }
  })

  return {create:create.mutateAsync, update:update.mutateAsync, delete:_delete.mutateAsync, pullFeed:_pullFeed.mutateAsync}
}