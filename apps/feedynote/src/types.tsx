export type PostContent = {
    userId: number,
    parentId: number,
    type: 'NOTE'|'FEEDCONTENT'|'FEED'|'SEARCH'|'SEARCHCONTENT'|'TIMELINE'|'LIBRARY',
    order: number,
    input: string,
    title: string,
    description?: string
    imageUrl?: string
}

export type Content = PostContent & {
    id: number,
    updated: string
}

export type PreviewRequest = {
    query:string
}

export type ScrapPreview = {
    type: 'SCRAP'
    title:string,
    description?:string,
    url:string,
    imageUrl?:string
}

export type FeedPreview = {
    type: 'FEED'
    title:string,
    description?:string
}