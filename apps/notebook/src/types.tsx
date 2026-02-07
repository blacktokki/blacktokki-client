export type BoardOption = {
  BOARD_NOTE_IDS: number[];
  BOARD_TYPE?: 'KANBAN' | 'SCRUM';
  BOARD_HEADER_LEVEL: number;
  PAT_DESCRIPTION?: undefined;
};

export type PostContent = {
  userId: number;
  parentId: number;
  type: 'NOTE' | 'BOOKMARK' | 'SNAPSHOT' | 'DELTA' | 'BOARD' | 'CONFIG';
  order: number;
  input: string;
  /**
   * type이 `NOTE`인 경우
   * * '/' 포함시 경로 및 하위 노트로 처리된다.
   * * `.`으로 시작하거나 경로에 `/.`가 포함된 경우 프라이빗 모드가 비활성 상태일 때 목록에서 제외하고 접근을 차단한다.
   */
  title: string;
  /**
   * type이 `NOTE`,`SNAPSHOT`인 경우 HTML 문자열로 저장된 노트의 본문을 포함한다.

   * type이 `NOTE`인 경우 빈 문자열일 경우 삭제된 노트로 간주되고, 재생성 하려면 수정 API로 내용을 채워야 한다.

   * type이 `DIFF`인 경우
   * * Content.option.SNAPSHOT_ID를 id로 하는 type이 `SNAPSHOT`인 `Content.description`에서 변경된 부분을 `diff-match-patch`을 사용하여 저장한다.
   * * `diffToSnapshot(SNAPSHOT description, DIFF description)`을 사용하여 원래 내용을 확인해야 한다.
   */
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
  NotePage: { title: string; archiveId?: number; board?: string } & ParagraphKey;
  NoteViewer: { key: string } & ParagraphKey;
  EditPage: { title: string; board?: string } & ParagraphKey;
  MovePage: { title: string } & ParagraphKey;
  Archive: { title?: string };
  BoardPage: { title: string };
  Extension: undefined;
};
