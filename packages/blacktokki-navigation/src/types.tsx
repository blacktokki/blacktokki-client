import { TabViewData, ModalComponent } from '@blacktokki/core';
import { PathConfig, DocumentTitleOptions } from '@react-navigation/native';

export type Screens = Record<
  string,
  PathConfig<any> & { title: string; component: React.ComponentType<any> }
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
  headerLeftIcon: JSX.Element;
  headerRight: JSX.Element;
  modals: ModalComponent[];
  drawer: React.ReactNode;
};
