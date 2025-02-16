import { Content, PostContent, PreviewRequest, ScrapPreview, FeedPreview } from '../types';
import axios from './axios';


export const getContentOne = async (id:number)=>{
    return (await axios.get(`/api/v1/content/${id}`)).data as Content
}


export const getContentList = async (parentId?:number, type?: Content['type'], page?:number)=>{
    const size = page !== undefined ? "20": "256"
    const parentIdParam = parentId !== undefined?`&parentId=${parentId}`: ''
    const typeParam = type !== undefined?`&type=${type}` : ''
    const pageParam = page !== undefined?`&page=${page}`:''
    return (await axios.get(`/api/v1/content?self=true&size=${size}${parentIdParam}${typeParam}${pageParam}`) ).data.value as Content[]
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

export const pullFeed = async () =>{
    await axios.get('/api/v1/feed/pull')
}

export const previewScrap = async (preview: PreviewRequest) => {
    const data = (await axios.get(`/api/v1/preview/autocomplete?query=${preview.query}`)).data
    return {type:"SCRAP", ...data} as ScrapPreview
}

export const previewFeed = async (preview: PreviewRequest) => {
    const data =  (await axios.get(`/api/v1/feed/autocomplete?query=${preview.query}`)).data
    return {type:"FEED", ...data} as FeedPreview
}