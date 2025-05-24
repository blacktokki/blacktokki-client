import { Colors, useColorScheme, useResizeContext } from '@blacktokki/core';
import { login, Navigation, NavigationConfig } from '@blacktokki/navigation';
import React, { Suspense } from 'react';
import { List, MD2DarkTheme, MD2LightTheme, PaperProvider } from 'react-native-paper';

import { SearchBar } from '../components/SearchBar';
import DatePickerModal from '../modals/DatePikcerModal';
import { main } from '../screens';
import Drawer from './Drawer';

const HeaderRight = () => {
  const windowType = useResizeContext();
  return windowType === 'landscape' ? <SearchBar /> : undefined;
};

const getConfig = async () => {
  const Linking = await import('expo-linking');
  return {
    main,
    login,
    prefixes: [Linking.makeUrl('/')],
    rootPath: 'blacktokki-notebook',
    documentTitle: {
      formatter: () => {
        return 'blacktokki-notebook';
      },
    },
    rootScreen: {
      main: 'Home',
      login: 'LoginScreen',
    },
    headerLeftIcon: <List.Icon icon="backburger" style={{ left: -18, top: -14 }} />,
    headerRight: <HeaderRight />,
    modals: [DatePickerModal],
    drawer: <Drawer />,
  } as NavigationConfig;
};

export default () => {
  const scheme = useColorScheme();
  const preTheme = scheme === 'dark' ? MD2DarkTheme : MD2LightTheme;
  const theme: typeof preTheme = {
    ...preTheme,
    colors: { ...preTheme.colors, primary: Colors[scheme].text },
  };
  const NavigationLazy = React.lazy(() =>
    getConfig().then((config) => ({ default: () => <Navigation config={config} /> }))
  );
  return (
    <PaperProvider theme={theme}>
      <Suspense fallback={<></>}>
        <NavigationLazy />
      </Suspense>
    </PaperProvider>
  );
};
