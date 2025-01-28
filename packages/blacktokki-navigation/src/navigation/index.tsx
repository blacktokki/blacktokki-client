/**
 * If you are not familiar with React Navigation, refer to the "Fundamentals" guide:
 * https://reactnavigation.org/docs/getting-started
 *
 */
import { ResizeContextProvider, useColorScheme } from '@blacktokki/core';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  NavigationContainerRef,
} from '@react-navigation/native';
import * as React from 'react';
import { enableScreens } from 'react-native-screens';

import { NavigationConfig } from '../types';
import RootNavigator from './RootNavigator';
import linkingConfiguration from './linkingConfiguration';

enableScreens();

const navigationRef = React.createRef<NavigationContainerRef>();

export function navigate(name: string, params?: any) {
  if (params) navigationRef.current?.navigate(name, params);
  navigationRef.current?.navigate(name);
}

let electronVersion: string | undefined;
try {
  electronVersion = process?.versions?.['electron'];
} catch (e) {
  electronVersion = undefined;
}

export default function Navigation({ config }: { config: NavigationConfig }) {
  const colorScheme = useColorScheme();
  return (
    <NavigationContainer
      ref={navigationRef}
      documentTitle={config.documentTitle}
      linking={electronVersion ? undefined : linkingConfiguration(config)}
      theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <ResizeContextProvider>
        <RootNavigator config={config} />
      </ResizeContextProvider>
    </NavigationContainer>
  );
}

const IGNORE_WERNINGS: string[] = ['setNativeProps', 'useNativeDriver'];

const warnLogger = console.warn;

console.warn = (message: string | object) => {
  let warn = true;
  if (message instanceof Object) {
    warn = false;
  } else if (IGNORE_WERNINGS.some((log) => message.includes(log))) {
    warn = false;
  }
  if (warn) {
    warnLogger(message);
  } else {
    // console.log(message)
  }
};
