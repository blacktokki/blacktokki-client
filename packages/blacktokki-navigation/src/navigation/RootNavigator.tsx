/* eslint-disable prettier/prettier */
import { useAuthContext } from '@blacktokki/account';
import { useLangContext, useColorScheme, Colors, useResizeContext, ModalsProvider, useIsMobile, CommonButton } from '@blacktokki/core';
import { CardStyleInterpolators, createStackNavigator } from '@react-navigation/stack';
import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';

import NotFoundScreen from '../screens/NotFoundScreen';
import { NavigationConfig } from '../types';
import Drawer from './Drawer';


const Root = createStackNavigator();

function headerLeft(
  navigation: any,
  route: any,
  windowType: string,
  theme: 'light' | 'dark',
  isMobile: boolean,
  config: NavigationConfig
) {
  const canGOBackScreen = [config.rootScreen.login, config.rootScreen.main].findIndex((v) => v === route.name) === -1;
  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else if (canGOBackScreen) navigation.replace(config.rootScreen.main);
  };
  if (windowType === 'portrait' && canGOBackScreen)
    return (
      <TouchableOpacity onPress={goBack} disabled={!isMobile}>
        <CommonButton
          title={''}
          color={isMobile ? Colors[theme].buttonBackgroundColor : Colors[theme].hoverColor}
          onPress={goBack}
          disabled={isMobile}
          style={{ width: 32, height: 32, margin: 16, paddingVertical: 1, paddingHorizontal: 4 }}
        >
          {config.headerLeftIcon}
        </CommonButton>
      </TouchableOpacity>
    );
  return null;
}

export default ({ config }: { config: NavigationConfig }) => {
  const windowType = useResizeContext();
  const isMobile = useIsMobile();
  const { auth } = useAuthContext();
  const theme = useColorScheme();
  const {lang, locale} = useLangContext()
  const entries = useMemo(() => {
    if (auth.user === undefined) return [];
    console.log('current user: ', auth.user);
    return Object.entries(auth.user === null ? config.login : config.main);
  }, [auth, locale]);
  const modalValues = useMemo(() => {
    if (auth.user === undefined) return [];
    return auth.user === null ? [] : config.modals;
  }, [auth]);
  const backgroundStyle = theme === 'light' ? {} : { backgroundColor: '#010409' };
  const ExtraProvider:React.ComponentType<any> = config.ExtraProvider || ((props) => props.children);
  return auth.user !== undefined ? (
    <View style={{ flexDirection: 'row', flex: 1 }}>
      <ModalsProvider modals={modalValues}>
        {auth.user ? <Drawer auth={auth} children={config.drawer}/> : undefined}
        <View style={[{ flex: 1 }, backgroundStyle]}>
          <ExtraProvider>
            <Root.Navigator
              screenOptions={({ navigation, route }) => ({
                headerStyle: {
                  backgroundColor: Colors[theme].header,
                  height: isMobile ? 50 : undefined,
                },
                headerTitleStyle: { color: Colors[theme].text },
                headerLeft: () => headerLeft(navigation, route, windowType, theme, isMobile, config),
                headerRight: () => config.headerRight,
                headerLeftContainerStyle: {
                  backgroundColor: Colors[theme].header,
                  borderBottomWidth: 1,
                  borderColor: Colors[theme].headerBottomColor,
                },
                cardStyle: [{ flexShrink: 1 }, backgroundStyle],
                animationEnabled: windowType === 'portrait',
                cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
              })}
            >
              {entries.map(([key, screen]) => (
                <Root.Screen
                  key={key}
                  name={key}
                  component={screen.component}
                  options={{ title: lang(screen.title) }}
                />
              ))}
              <Root.Screen
                name="NotFound"
                component={NotFoundScreen}
                options={{ title: 'Oops!' }}
              />
            </Root.Navigator>
          </ExtraProvider>
        </View>
      </ModalsProvider>
    </View>
  ) : (
    <></>
  );
};
