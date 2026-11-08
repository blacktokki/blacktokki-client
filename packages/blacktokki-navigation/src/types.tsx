import { Auth } from '@blacktokki/account';
import { TabViewData, ModalComponent } from '@blacktokki/core';
import { PathConfig, DocumentTitleOptions } from '@react-navigation/native';
import { ColorValue, StyleProp, ViewStyle } from 'react-native';

export type Screens = Record<
  string,
  PathConfig<any> & {
    title: string | ((auth: Auth) => string);
    component: React.ComponentType<any>;
  }
>;

export type TabViewOption = TabViewData & {
  headerRight: () => React.JSX.Element;
  onPress?: () => void;
};

export type NavigationConfig = {
  main: Screens;
  login: Screens;
  prefixes: string[];
  rootPath: string;
  documentTitle: DocumentTitleOptions;
  ExtraProvider?: React.ComponentType<any>;
  rootScreen: {
    main: string;
    login: string;
  };
  headerLeftIcon: React.JSX.Element;
  headerLeftButtonStyle?: StyleProp<ViewStyle>;
  headerLeftButtonHoverColor?: ColorValue;
  headerRight: React.JSX.Element;
  headerTitle?: (props?: any) => React.ReactNode;
  headerStyle?: any;
  headerCompactStyle?: StyleProp<ViewStyle>;
  headerTitleStyle?: any;
  headerLeftContainerStyle?: any;
  modals: ModalComponent[];
  drawer: React.ReactNode;
  drawerStyle?: StyleProp<ViewStyle>;
};
