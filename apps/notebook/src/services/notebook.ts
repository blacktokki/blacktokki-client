import { Content, PostContent, CellType, Link } from '../types';
import { axiosCreate } from '@blacktokki/account';

const axios = axiosCreate("notebook")

export const getContentOne = async (id:number)=>{
    return (await axios.get(`/api/v1/content/${id}`)).data as Content
}

export const getContentList = async (parentId?:number, type?: Content['type'])=>{
    const parentIdParam = parentId !== undefined?`&parentId=${parentId}`: ''
    const typeParam = type !== undefined?`&type=${type}` : ''
    return (await axios.get(`/api/v1/content?self=true&size=256${parentIdParam}${typeParam}`) ).data.value as Content[]
}

export const postContent = async (postContent:PostContent)=>{
    return ((await axios.post(`/api/v1/content`, postContent)).data as Content).id
}

export const patchContent = async ({id, updated}:{id:number, updated:PostContent})=>{
    await axios.patch(`/api/v1/content`,{ids: [id], updated})
}

export const deleteContent = async (id: number) =>{
    await axios.delete(`/api/v1/content/${id}`)
}

export const postCells = async (contents:{created:(PostContent & {type:CellType})[], deleted:{parentId:number}}) => {
    await axios.post(`/api/v1/content/bulk`, contents)
}

export const executeCells = async (cells:({type: CellType |'OUTPUT'} & ({query:string} | {id:number}))[]) => { // TBA
    return (await axios.post(`/api/v1/cell/`, cells)).data
}

const _tmp = (re:RegExp, description :string)=>{
    let str = description;
    let index = 0;
    let match;
    let arr = []
    while ((match = new RegExp(re).exec(str)) != null) {
      arr.push({index, str:str.substring(0, match.index)})
      const end = match.index + match[0].length
      arr.push({index:index + match.index, str:str.substring(match.index, end)})
      index += end;
      str = str.substring(end)
    }
    arr.push({index, str})
    return arr
  }

const re = /https?:\/\/(?:www\\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi

const toUrls = (str:string)=>{
    return _tmp(re, str).filter((v, i)=>i % 2 == 1).map(v=>v.str)
}

export const previewScrap = async (preview: {query:string}) => {
    const data:Link[] = []
    for (const query of toUrls(preview.query)){
        data.push((await axios.get(`/api/v1/preview/autocomplete?query=${query}`)).data)
    }
    return data
}

