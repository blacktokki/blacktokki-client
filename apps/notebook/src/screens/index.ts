// import HomeScreen from "./main/home/HomeScreen";

import { EditPageScreen } from "./main/EditPageScreen";
import HomeScreen from "./main/home/HomeScreen";
import { MovePageScreen } from "./main/MovePageScreen";
import { RecentPagesScreen } from "./main/RecentPageScreen";
import { WikiPageScreen } from "./main/WikiPageScreen";

export const main = {
    Home:{
      title:'Blacktokki Notebook',
      component:HomeScreen,
      path:'home',
    },
    WikiPage:{
      title:'Blacktokki Notebook',
      component:WikiPageScreen,
      path:'wiki',
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
  