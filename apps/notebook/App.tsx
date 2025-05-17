import { useInitColorScheme } from '@blacktokki/core';
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
  const Navigation = React.lazy(() => import('./src/navigation'));
  const isAppearenceComplete = useInitColorScheme();

  return isAppearenceComplete ? (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Suspense fallback={<></>}>
        <AuthProvider>
          <QueryClientProvider>
            <Navigation />
          </QueryClientProvider>
        </AuthProvider>
      </Suspense>
    </SafeAreaProvider>
  ) : (
    <></>
  );
}

const pathnameLength = 'blacktokki-notebook'.length + 1;

(function (l) {
  // for github-page
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
