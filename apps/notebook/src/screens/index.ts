import { Auth } from '@blacktokki/account';

import { ArchiveScreen } from './main/ArchiveScreen';
import { BoardItemScreen } from './main/BoardItemScreen';
import { BoardListScreen } from './main/BoardListScreen';
import { EditPageScreen } from './main/EditPageScreen';
import { ExtensionScreen } from './main/ExtensionScreen';
import { MovePageScreen } from './main/MovePageScreen';
import { NotePageScreen } from './main/NotePageScreen';
import { NoteViewerScreen } from './main/NoteViewerScreen';
import { RecentPagesScreen } from './main/RecentPageScreen';
import HomeScreen from './main/home/HomeScreen';

const title = (auth: Auth) =>
  !auth.isLocal ? 'Blacktokki Notebook' : 'Blacktokki Notebook - Local';
export const screenTitle = title;
export const main = {
  Home: {
    title,
    component: HomeScreen,
    path: 'home',
  },
  NotePage: {
    title,
    component: NotePageScreen,
    path: 'page',
  },
  EditPage: {
    title,
    component: EditPageScreen,
    path: 'edit',
  },
  MovePage: {
    title,
    component: MovePageScreen,
    path: 'move',
  },
  RecentPages: {
    title,
    component: RecentPagesScreen,
    path: 'recent',
  },
  Archive: {
    title,
    component: ArchiveScreen,
    path: 'archive',
  },
  BoardList: {
    title,
    component: BoardListScreen,
    path: 'boardlist',
  },
  BoardPage: {
    title,
    component: BoardItemScreen,
    path: 'board',
  },
  NoteViewer: {
    title,
    component: NoteViewerScreen,
    path: 'viewer',
  },
  Extension: {
    title,
    component: ExtensionScreen,
    path: 'extension',
  },
};
