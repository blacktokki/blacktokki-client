import { IntlProvider, useInitColorScheme } from '@blacktokki/core';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import React, { Suspense } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const AuthProvider = React.lazy(() =>
    import('@blacktokki/account').then((m) => ({ default: m.AuthProvider }))
  );
  const QueryClientProvider = React.lazy(() =>
    import('react-query').then(({ QueryClient, QueryClientProvider }) => {
      const queryClient = new QueryClient();
      return {
        default: (props: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
        ),
      };
    })
  );
  const ko = require('./src/lang/ko.json');
  const Navigation = React.lazy(() => import('./src/navigation'));
  const isAppearenceComplete = useInitColorScheme();

  return isAppearenceComplete ? (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Suspense fallback={<></>}>
        <AuthProvider guestType="local">
          <QueryClientProvider>
            <IntlProvider translations={{ ko }}>
              <Navigation />
            </IntlProvider>
          </QueryClientProvider>
        </AuthProvider>
      </Suspense>
    </SafeAreaProvider>
  ) : (
    <></>
  );
}

const ignoreErrors = ['Support for defaultProps will be removed'];

const error = console.error;
console.error = (...arg) => {
  for (const error of ignoreErrors) if (arg[0].includes(error)) return;
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
