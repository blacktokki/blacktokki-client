// import HomeScreen from "./main/home/HomeScreen";

import { Auth } from '@blacktokki/account';

import { ArchiveScreen } from './main/ArchiveScreen';
import { EditPageScreen } from './main/EditPageScreen';
import { EmptyContentsScreen } from './main/EmptyContentScreen';
import { EmptyPagesScreen } from './main/EmptyPageScreen';
import { MovePageScreen } from './main/MovePageScreen';
import { NotePageScreen } from './main/NotePageScreen';
import { RecentPagesScreen } from './main/RecentPageScreen';
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
  EmptyPages: {
    title,
    component: EmptyPagesScreen,
    path: 'need',
  },
  EmptyContents: {
    title,
    component: EmptyContentsScreen,
    path: 'empty',
  },
  Archive: {
    title,
    component: ArchiveScreen,
    path: 'archive',
  },
};
