import {AccountService, AuthProvider } from '@blacktokki/account';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import React, { Suspense } from 'react';
import { accountService } from './src/services/account';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useInitColorScheme } from '@blacktokki/core';


const queryClient = new QueryClient();

export default function App() {
  const Navigation = React.lazy(()=> import('./src/navigation'))
  const isAppearenceComplete = useInitColorScheme()
  return isAppearenceComplete?
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider service={accountService}>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<></>}>
            <Navigation/>
          </Suspense>
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>:
    <></>
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});


(function(l) {  // for github-page
  if (l !== undefined && l.search[1] === '/' ) {
      var decoded = l.search.slice(1).split('&').map(function(s) { 
      return s.replace(/~and~/g, '&')
      }).join('?');
      window.history.replaceState(null, '',
          l.pathname.slice(0, -1) + decoded + l.hash
      );
  }
  if (l.pathname.substring(10).replaceAll('/', '').length === 0){
    window.history.replaceState(null, '', l.pathname.substring(0, 10) + '/home')
  }
}(window.location))