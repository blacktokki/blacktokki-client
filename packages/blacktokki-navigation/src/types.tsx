import { ModalComponent } from '@blacktokki/core';
import { PathConfig, DocumentTitleOptions } from '@react-navigation/native';

export type Screens = Record<
  string,
  PathConfig & { title: string; component: React.ComponentType<any> }
>;

export type NavigationConfig = {
  main: Screens;
  login: Screens;
  prefixes: string[];
  rootPath: string;
  documentTitle: DocumentTitleOptions;
  ExtraProvider: React.ComponentType<any>;
  rootScreen: {
    main: string;
    login: string;
  };
  headerLeftIcon: JSX.Element;
  headerRight: JSX.Element;
  modals: ModalComponent[];
  drawer: React.ReactNode;
};
