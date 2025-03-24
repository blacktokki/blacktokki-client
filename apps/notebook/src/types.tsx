export type CellType = 'EDITOR'|'MARKDOWN'|'LINK'

export type PostContent = {
    userId: number,
    parentId: number,
    type: 'NOTEV2'|'PAGE'| CellType,
    order: number,
    title: string,
    description?: string
    option:{
        INPUT?: string,
        IMAGE_URL?: string,
        EXECUTION_COUNT?: string,
        EXECUTION_STATUS?: string,
        INPUT_VISIBLE?:boolean,
        OUTPUT_VISIBLE?:boolean
    }
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