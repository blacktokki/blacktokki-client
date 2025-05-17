// import HomeScreen from "./main/home/HomeScreen";

import { ArchiveScreen } from './main/ArchiveScreen';
import { EditPageScreen } from './main/EditPageScreen';
import { EmptyContentsScreen } from './main/EmptyContentScreen';
import { EmptyPagesScreen } from './main/EmptyPageScreen';
import { MovePageScreen } from './main/MovePageScreen';
import { NotePageScreen } from './main/NotePageScreen';
import { RecentPagesScreen } from './main/RecentPageScreen';
import HomeScreen from './main/home/HomeScreen';

export const main = {
  Home: {
    title: 'Blacktokki Notebook',
    component: HomeScreen,
    path: 'home',
  },
  NotePage: {
    title: 'Blacktokki Notebook',
    component: NotePageScreen,
    path: 'page',
  },
  EditPage: {
    title: 'Blacktokki Notebook',
    component: EditPageScreen,
    path: 'edit',
  },
  MovePage: {
    title: 'Blacktokki Notebook',
    component: MovePageScreen,
    path: 'move',
  },
  RecentPages: {
    title: 'Blacktokki Notebook',
    component: RecentPagesScreen,
    path: 'recent',
  },
  EmptyPages: {
    title: 'Blacktokki Notebook',
    component: EmptyPagesScreen,
    path: 'need',
  },
  EmptyContents: {
    title: 'Blacktokki Notebook',
    component: EmptyContentsScreen,
    path: 'empty',
  },
  Archive: {
    title: 'Blacktokki Notebook',
    component: ArchiveScreen,
    path: 'archive',
  },
};
