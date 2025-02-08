import { Content, PostContent } from '../types';
import axios from './axios';

export const getContentList = async (parentId?:number, type?: Content['type'])=>{
    const parentIdParam = parentId !== undefined?`&parentId=${parentId}`: ''
    const typeParam = type !== undefined?`&type=${type}` : ''
    return (await axios.get(`/api/v1/content?self=true${parentIdParam}${typeParam}`) ).data.value as Content[]
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