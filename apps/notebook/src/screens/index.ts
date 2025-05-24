// import HomeScreen from "./main/home/HomeScreen";

import { Auth } from '@blacktokki/account';

import { ArchiveScreen } from './main/ArchiveScreen';
import { EditPageScreen } from './main/EditPageScreen';
import { MovePageScreen } from './main/MovePageScreen';
import { NotePageScreen } from './main/NotePageScreen';
import { ProblemsScreen } from './main/ProblemScreen';
import { RecentPagesScreen } from './main/RecentPageScreen';
import { TimeLineScreen } from './main/TimeLineScreen';
import HomeScreen from './main/home/HomeScreen';

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
};
