export type PostContent = {
    userId: number,
    parentId: number,
    type: 'NOTE'|'BOOKMARK'|'SNAPSHOT',
    order: number,
    input: string,
    title: string,
    description?: string
    option:{
    //     INPUT?: string,
    //     IMAGE_URL?: string,
    //     EXECUTION_COUNT?: string,
    //     EXECUTION_STATUS?: string,
    //     INPUT_VISIBLE?:boolean,
    //     OUTPUT_VISIBLE?:boolean
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
  
export type NavigationParamList = {
    Home: undefined;
    NotePage: { title: string, section?:string, archiveId?:number };
    EditPage: { title: string };
    MovePage: { title: string, section?:string };
    Archive:  { title?: string };
};
