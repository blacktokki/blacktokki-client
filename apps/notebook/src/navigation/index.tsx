import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { login, Navigation, NavigationConfig } from '@blacktokki/navigation';
import React, { Suspense, useMemo } from 'react';
import { List, MD2DarkTheme, MD2LightTheme, PaperProvider } from 'react-native-paper';

import { SearchBar } from '../components/SearchBar';
import features from '../features';
import Drawer from './Drawer';
import { useExtension } from '../hooks/useExtension';
import { createCommonStyles } from '../hooks/useNotebookTheme';
import { useUsageMode } from '../hooks/useUsageMode';
import modals from '../modals';
import { main, screenTitle } from '../screens';

const HeaderRight = () => {
  const windowType = useResizeContext();
  return windowType === 'landscape' ? <SearchBar /> : undefined;
};

const getConfig = async () => {
  const Linking = await import('expo-linking');
  return {
    main: { ...main, ...features(screenTitle) },
    login,
    prefixes: [Linking.createURL('/')],
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
    modals,
    drawer: <Drawer />,
  } as NavigationConfig;
};

const NavigationLazy = React.lazy(async () => {
  const config = await getConfig();
  return {
    default: (props: {
      headerStyle?: any;
      headerTitleStyle?: any;
      headerLeftContainerStyle?: any;
      active: boolean;
    }) =>
      props.active && (
        <Navigation
          config={{
            ...config,
            headerStyle: props.headerStyle,
            headerTitleStyle: props.headerTitleStyle,
            headerLeftContainerStyle: props.headerLeftContainerStyle,
          }}
        />
      ),
  };
});

export default () => {
  const scheme = useColorScheme();
  const { usageMode, notebook } = useUsageMode();
  const { data: extension } = useExtension();

  const commonStyles = useMemo(() => {
    return createCommonStyles(scheme, extension?.feature.createCommonStylesList || []);
  }, [scheme, extension?.feature.createCommonStylesList]);

  const theme = useMemo(() => {
    const preTheme = scheme === 'dark' ? MD2DarkTheme : MD2LightTheme;
    const customFonts = { ...preTheme.fonts };
    if (commonStyles.text.fontFamily) {
      const customFontFamily = commonStyles.text.fontFamily;
      customFonts.regular = { ...customFonts.regular, fontFamily: customFontFamily };
      customFonts.medium = { ...customFonts.medium, fontFamily: customFontFamily };
      customFonts.light = { ...customFonts.light, fontFamily: customFontFamily };
      customFonts.thin = { ...customFonts.thin, fontFamily: customFontFamily };
    }
    return {
      ...preTheme,
      fonts: customFonts,
      colors: {
        ...preTheme.colors,
        primary: commonStyles.button.backgroundColor,
        text: commonStyles.text.color,
        background: commonStyles.container.backgroundColor,
        surface: commonStyles.card.backgroundColor,
        onSurface: commonStyles.text.color,
      },
    } as typeof preTheme;
  }, [scheme, commonStyles]);
  return (
    <PaperProvider theme={theme}>
      <Suspense fallback={<></>}>
        <NavigationLazy
          headerStyle={commonStyles.appHeader}
          headerTitleStyle={commonStyles.appHeaderTitle}
          headerLeftContainerStyle={commonStyles.appHeaderLeftContainer}
          active={usageMode !== undefined && notebook !== undefined}
        />
      </Suspense>
    </PaperProvider>
  );
};
