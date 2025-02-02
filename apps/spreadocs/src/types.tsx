export type PostContent = {
    userId: number,
    parentId: number,
    type: 'SCRAP'|'NOTE'|'FEEDCONTENT'|'FEED'|'FEEDGROUP'|'LIBRARY',
    order: number,
    input: string,
    content?: string
}

export type Content = PostContent & {
    id: number,
    title: string
}