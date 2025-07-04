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
  createNavigationContainerRef,
} from '@react-navigation/native';
import * as React from 'react';
import { enableScreens } from 'react-native-screens';

import { NavigationConfig } from '../types';
import RootNavigator from './RootNavigator';
import linkingConfiguration from './linkingConfiguration';
export { push } from './RootNavigator';

enableScreens();

const navigationRef = createNavigationContainerRef<any>();

export function navigate(name: string, params?: any) {
  if (params) navigationRef.current?.navigate(name, params);
  else navigationRef.current?.navigate(name);
}

export default function Navigation({ config }: { config: NavigationConfig }) {
  const colorScheme = useColorScheme();
  return (
    <NavigationContainer
      ref={navigationRef}
      documentTitle={config.documentTitle}
      linking={linkingConfiguration(config)}
      theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <ResizeContextProvider>
        <RootNavigator config={config} />
      </ResizeContextProvider>
    </NavigationContainer>
  );
}
