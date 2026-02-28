import { Auth } from '@blacktokki/account';
import { TabViewData, ModalComponent } from '@blacktokki/core';
import { PathConfig, DocumentTitleOptions } from '@react-navigation/native';

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
  headerRight: React.JSX.Element;
  modals: ModalComponent[];
  drawer: React.ReactNode;
};
