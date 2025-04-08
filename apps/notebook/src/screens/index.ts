import ContentListScreen from "./main/ContentListScreen";
import NoteScreen from "./main/NoteScreen";
import HomeScreen from "./main/home/HomeScreen";

export const main = {
    HomeScreen:{
      title:'home',
      component:HomeScreen,
      path:'home',
    },
    NoteScreen: {
      path: 'notes',
      title: 'notes',
      component: NoteScreen
    },
    ContentListScreen: {
      path: 'contents',
      title: 'contents',
      component: ContentListScreen
    }
  };
  