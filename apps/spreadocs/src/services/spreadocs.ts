import { Content, PostContent } from '../types';
import axios from './axios';

export const getContentList = async (parentId:number)=>{
    return (await axios.get(`/api/v1/content?self=true&parentId=${parentId}`) ).data.value as Content[]
}

export const postContent = async (postContent:PostContent)=>{
    return (await axios.post(`/api/v1/content`, postContent) ).data as Content
}