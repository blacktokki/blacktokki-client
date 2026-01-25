// import HomeScreen from "./main/home/HomeScreen";

import { Auth } from '@blacktokki/account';

import { ArchiveScreen } from './main/ArchiveScreen';
import { EditPageScreen } from './main/EditPageScreen';
import { BoardItemScreen } from './main/BoardItemScreen';
import { BoardListScreen } from './main/BoardListScreen';
import { MovePageScreen } from './main/MovePageScreen';
import { NoteViewerScreen } from './main/NoteViewerScreen';
import { ProblemsScreen } from './main/ProblemScreen';
import { RecentPagesScreen } from './main/RecentPageScreen';
import { SearchPageScreen } from './main/SearchPageScreen';
import HomeScreen from './main/home/HomeScreen';
import { NotePageScreen } from './main/notepage/NotePageScreen';
import { TimeLineScreen } from './main/timeline/TimeLineScreen';

const title = (auth: Auth) =>
  !auth.isLocal ? 'Blacktokki Notebook' : 'Blacktokki Notebook - Local';
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
  Problem: {
    title,
    component: ProblemsScreen,
    path: 'problem',
  },
  Archive: {
    title,
    component: ArchiveScreen,
    path: 'archive',
  },
  TimeLine: {
    title,
    component: TimeLineScreen,
    path: 'timeline',
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
  SearchPage: {
    title,
    component: SearchPageScreen,
    path: 'search',
  },
  NoteViewer: {
    title,
    component: NoteViewerScreen,
    path: 'viewer',
  },
};
