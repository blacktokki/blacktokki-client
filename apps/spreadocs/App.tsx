import {AccountService, AuthProvider } from '@blacktokki/account';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import React, { Suspense } from 'react';
import { accountService } from './src/services/account';

export default function App() {
  const Navigation = React.lazy(()=> import('./src/navigation'))
  return <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider service={accountService}>
        <Suspense fallback={<></>}>
          <Navigation/>
        </Suspense>
      </AuthProvider>
    </SafeAreaProvider>
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
