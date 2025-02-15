import ContentListScreen from "./main/ContentListScreen";
import EditorScreen from "./main/EditorScreen";
import HomeScreen from "./main/HomeScreen";

export const main = {
    HomeScreen:{
      title:'home',
      component:HomeScreen,
      path:'home',
    },
    EditorScreen: {
      path: 'editor',
      title: 'editor',
      component: EditorScreen
    },
    ContentListScreen: {
      path: 'contents',
      title: 'contents',
      component: ContentListScreen
    }
  };
  