import { useMutation, useQuery, useQueryClient } from "react-query";
import { deleteContent, getContentList, patchContent, postCells, postContent } from "../services/feedynote";
import { Content } from "../types";
import { useEffect } from "react";

export default function useContentList(parentId?:number, type?: Content['type']){
  const { data } = useQuery(["ContentList", parentId, type] , async()=> (parentId!==undefined || type!==undefined)?await getContentList(parentId, type):undefined)
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
      queryClient.invalidateQueries("Content")
    }
  })
  const _delete = useMutation(deleteContent, {
    onSuccess: () => {
      queryClient.invalidateQueries("ContentList")
    }
  })
  const updateCells = useMutation(postCells, {
    onSuccess: () =>{
      queryClient.invalidateQueries("ContentList")
    }
  })

  useEffect(()=>{
  }, [])

  return {create:create.mutateAsync, update:update.mutateAsync, delete:_delete.mutateAsync, updateCells:updateCells.mutateAsync}
}