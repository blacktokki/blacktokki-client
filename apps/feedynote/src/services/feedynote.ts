import { toUrls } from '../components/LinkPreview';
import { Content, PostContent, CellType, Link } from '../types';
import { axiosCreate } from '@blacktokki/account';

const axios = axiosCreate("feedynote")

export const getContentOne = async (id:number)=>{
    return (await axios.get(`/api/v1/content/${id}`)).data as Content
}

export const getContentList = async (parentId?:number, type?: Content['type'])=>{
    const parentIdParam = parentId !== undefined?`&parentId=${parentId}`: ''
    const typeParam = type !== undefined?`&type=${type}` : ''
    return (await axios.get(`/api/v1/content?self=true&size=256${parentIdParam}${typeParam}`) ).data.value as Content[]
}

export const getInfiniteContentList = async (parentId:number, type:'TIMELINEV2'|'NOTEV2', page:number)=>{
    //const parentIdParam = parentId ? `&grandParentId=${parentId}`: `&parentId=${parentId}`
    const parentIdParam = parentId < 1 ? ``: `&parentId=${parentId}`
    const size = type ==="NOTEV2"?"256":"20"
    return { current: (await axios.get(`/api/v1/content?self=true&sort=id,DESC&size=${size}&page=${page}${parentIdParam}`) ).data.value as Content[] }
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

export const postCells = async (contents:(PostContent & {type:CellType})[]) => {
    await axios.post(`/api/v1/cell`, contents)
}

export const executeMultiTurn = async (cells:({type: CellType |'OUTPUT'} & ({query:string} | {id:number}))[]) => {
    return (await axios.post(`/api/v1/cell/multiturn`, cells)).data
}

export const previewScrap = async (preview: {query:string}) => {
    return (await axios.get(`/api/v1/preview/autocomplete?query=${preview.query}`)).data as Link
}

