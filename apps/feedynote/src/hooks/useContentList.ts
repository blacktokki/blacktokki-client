import { QueryKey, useMutation, useQuery, useQueryClient } from "react-query";
import { deleteContent, getContentList, patchContent, postContent, pullFeed } from "../services/feedynote";
import { Content } from "../types";
import { useEffect } from "react";

export default function useContentList(parentId?:number, type?: Content['type']){
  const { data } = useQuery(["ContentList", parentId, type] , async()=> (parentId!==undefined || type!==undefined)?await getContentList(parentId, type):undefined)
  return data
}

let feedInterval:NodeJS.Timer

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
      queryClient.invalidateQueries("Content")
    }
  })
  const _delete = useMutation(deleteContent, {
    onSuccess: () => {
      queryClient.invalidateQueries("ContentList")
    }
  })
  const _pullFeed = useMutation(async (key:QueryKey)=>{
    console.log('pulling feed: ' + key)
    const querykey = ["ContentList", ...key]
    await queryClient.setQueryData(querykey, undefined)
    await pullFeed()
    return querykey
  }, {
    onSuccess: (key)=>{
      queryClient.invalidateQueries(key)
    }
  })

  useEffect(()=>{
    if(feedInterval===undefined){
      _pullFeed.mutateAsync([])
      feedInterval = setInterval(()=>_pullFeed.mutateAsync([]), 20 * 60 * 1000)
    }
  }, [])

  return {create:create.mutateAsync, update:update.mutateAsync, delete:_delete.mutateAsync, pullFeed:_pullFeed.mutateAsync}
}