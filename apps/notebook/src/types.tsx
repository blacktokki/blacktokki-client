export type BoardOption = {
  BOARD_NOTE_IDS: number[];
  BOARD_HEADER_LEVEL: number;
  PAT_DESCRIPTION?: undefined;
};

export type PostContent = {
  userId: number;
  parentId: number;
  type: 'NOTE' | 'BOOKMARK' | 'SNAPSHOT' | 'DELTA' | 'BOARD';
  order: number;
  input: string;
  title: string;
  description?: string;
  option: {
    SNAPSHOT_ID?: number;
  } & (
    | BoardOption
    | {
        BOARD_NOTE_IDS?: undefined;
        PAT_DESCRIPTION?: string;
      }
  );
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

export type Pat = {
  id: number;
  description: string;
  expired: string;
};

export type ParagraphKey =
  | {
      paragraph?: string;
      section?: undefined;
    }
  | {
      paragraph: string;
      section?: string;
    };

export type NavigationParamList = {
  Home: undefined;
  RecentPages: { title?: string };
  NotePage: { title: string; archiveId?: number; kanban?: string } & ParagraphKey;
  NoteViewer: { key: string } & ParagraphKey;
  EditPage: { title: string; kanban?: string } & ParagraphKey;
  MovePage: { title: string } & ParagraphKey;
  Archive: { title?: string };
  KanbanPage: { title: string };
  SearchPage: { query: string };
};
