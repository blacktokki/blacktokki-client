export type PostContent = {
  userId: number;
  parentId: number;
  type: 'NOTE' | 'BOOKMARK' | 'SNAPSHOT';
  order: number;
  input: string;
  title: string;
  description?: string;
  option: {
    //     INPUT?: string,
    //     IMAGE_URL?: string,
    //     EXECUTION_COUNT?: string,
    //     EXECUTION_STATUS?: string,
    //     INPUT_VISIBLE?:boolean,
    //     OUTPUT_VISIBLE?:boolean
  };
};

export type Content = PostContent & {
  id: number;
  updated: string;
};

export type Link = {
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
};

export type NavigationParamList = {
  Home: undefined;
  NotePage: { title: string; paragraph?: string; archiveId?: number };
  NoteViewer: { key: string; paragraph?: string };
  EditPage: { title: string };
  MovePage: { title: string; paragraph?: string };
  Archive: { title?: string };
};
