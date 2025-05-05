// import HomeScreen from "./main/home/HomeScreen";

import { EditPageScreen } from "./main/EditPageScreen";
import HomeScreen from "./main/home/HomeScreen";
import { MovePageScreen } from "./main/MovePageScreen";
import { RecentPagesScreen } from "./main/RecentPageScreen";
import { NotePageScreen } from "./main/NotePageScreen";

export const main = {
    Home:{
      title:'Blacktokki Notebook',
      component:HomeScreen,
      path:'home',
    },
    NotePage:{
      title:'Blacktokki Notebook',
      component:NotePageScreen,
      path:'page',
    },
    EditPage:{
      title:'Blacktokki Notebook',
      component:EditPageScreen,
      path:'edit',
    },
    MovePage:{
      title:'Blacktokki Notebook',
      component:MovePageScreen,
      path:'move',
    },
    RecentPages:{
      title:'Blacktokki Notebook',
      component:RecentPagesScreen,
      path:'recent',
    },

  };
  