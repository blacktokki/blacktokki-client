import {AccountService, AuthProvider, UserMembership} from '@blacktokki/account';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import React, { Suspense } from 'react';


const service:AccountService = {
  checkLogin: function (): Promise<UserMembership | null> {
    return new Promise(()=>{
      throw new Error('Function not implemented.');
    });
  },
  login: function (username: string, password: string): Promise<UserMembership | null | undefined> {
    throw new Error('Function not implemented.');
  },
  logout: function (): Promise<any> {
    throw new Error('Function not implemented.');
  }
}

export default function App() {
  const Navigation = React.lazy(()=> import('./src/navigation'))
  return <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider service={service}>
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
