import { Content, PostContent } from '../types';
import axios from './axios';

export const getContentList = async (parentId:number)=>{
    return (await axios.get(`/api/v1/content?self=true&parentId=${parentId}`) ).data.value as Content[]
}

export const postContent = async (postContent:PostContent)=>{
    await axios.post(`/api/v1/content`, postContent)
}

export const patchContent = async ({id, updated}:{id:number, updated:PostContent})=>{
    await axios.patch(`/api/v1/content`,{ids: [id], updated})
}