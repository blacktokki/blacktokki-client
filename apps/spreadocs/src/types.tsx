export type PostContent = {
    userId: number,
    parentId: number,
    type: 'SCRAP'|'NOTE'|'FEEDCONTENT'|'FEED'|'SEARCH'|'SEARCHCONTENT'|'TIMELINE'|'LIBRARY',
    order: number,
    input: string,
    description?: string
}

export type Content = PostContent & {
    id: number,
    title: string,
    updated: string
}