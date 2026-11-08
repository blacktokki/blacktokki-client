import { AuthProvider } from '@blacktokki/account';
import { IntlProvider, useInitColorScheme } from '@blacktokki/core';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AntDesign from 'react-native-vector-icons/AntDesign';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { QueryClient, QueryClientProvider } from 'react-query';

import Navigation from './src/navigation';

const queryClient = new QueryClient();

const ko = require('./src/lang/ko.json');

const iconFonts = {
  [FontAwesome.getFontFamily()]: require('react-native-vector-icons/Fonts/FontAwesome.ttf'),
  [MaterialCommunityIcons.getFontFamily()]: require('react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
  [AntDesign.getFontFamily()]: require('react-native-vector-icons/Fonts/AntDesign.ttf'),
};

export default function App() {
  const isAppearenceComplete = useInitColorScheme();
  const [iconsLoaded, iconFontError] = useFonts(iconFonts);

  if (iconFontError) throw iconFontError;

  return isAppearenceComplete && iconsLoaded ? (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider guestType="local">
        <QueryClientProvider client={queryClient}>
          <IntlProvider translations={{ ko }}>
            <Navigation />
          </IntlProvider>
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  ) : (
    <></>
  );
}

const ignoreErrors = ['Support for defaultProps will be removed'];

const error = console.error;
console.error = (...arg) => {
  try {
    for (const error of ignoreErrors) if (arg[0].includes(error)) return;
  } catch {}
  error(...arg);
};

const subpath = Constants.easConfig.experiments.baseUrl;
const pathnameLength = subpath?.length || 0;
(function (l) {
  // for github-page
  if (l !== undefined) {
    process.env.PUBLIC_URL = process.env.NODE_ENV === 'production' ? subpath : '';
  }
  if (l !== undefined && l.search[1] === '/') {
    const decoded = l.search
      .slice(1)
      .split('&')
      .map(function (s) {
        return s.replace(/~and~/g, '&');
      })
      .join('?');
    window.history.replaceState(null, '', l.pathname.slice(0, -1) + decoded + l.hash);
  }
  if (
    l.pathname.length >= pathnameLength &&
    l.pathname.substring(pathnameLength).replaceAll('/', '').length === 0
  ) {
    window.history.replaceState(null, '', l.pathname.substring(0, pathnameLength) + '/home');
  }
})(window.location);
