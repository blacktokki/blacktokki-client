export type CellType = 'EDITOR'|'LINK'

export type PostContent = {
    userId: number,
    parentId: number,
    type: 'TIMELINEV2'|'NOTEV2'|'PAGE'| CellType,
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

export type Link = {
    title:string,
    description?:string,
    url:string,
    imageUrl?:string
}