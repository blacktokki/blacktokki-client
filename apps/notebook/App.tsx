import { useInitColorScheme } from '@blacktokki/core';
import React, { Suspense } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const AuthProvider = React.lazy(()=> import('@blacktokki/account').then(m=>({"default": m.AuthProvider})))
  const QueryClientProvider = React.lazy(()=> import('react-query').then(({QueryClient, QueryClientProvider})=>{
    const queryClient = new QueryClient();
    return {"default": (props:{children:React.ReactNode})=><QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>}
  }))
  const Navigation = React.lazy(()=> import('./src/navigation'))
  const isAppearenceComplete = useInitColorScheme()

  return isAppearenceComplete?
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Suspense fallback={<></>}>
        <AuthProvider>
          <QueryClientProvider>
              <Navigation/>
          </QueryClientProvider>
        </AuthProvider>
      </Suspense>
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
  if (l.pathname.length >= 10 && l.pathname.substring(10).replaceAll('/', '').length === 0){
    window.history.replaceState(null, '', l.pathname.substring(0, 10) + '/home')
  }
}(window.location))