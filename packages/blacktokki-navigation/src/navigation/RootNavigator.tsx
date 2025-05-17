/* eslint-disable prettier/prettier */
import { useAuthContext } from '@blacktokki/account';
import { useLangContext, useColorScheme, Colors, useResizeContext, ModalsProvider, useIsMobile, CommonButton } from '@blacktokki/core';
import { CardStyleInterpolators, createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';

import NotFoundScreen from '../screens/NotFoundScreen';
import { NavigationConfig } from '../types';
import Drawer from './Drawer';


const Root = createStackNavigator();
const rootRef: {current?:StackNavigationProp<any>} = {}

export function push<T>(name: string, params?: T) {
  const routes = rootRef.current?.getState().routes;
  const route = routes?routes[routes?.length - 1]:undefined
  if (route === undefined || name === route.name && JSON.stringify(params) === JSON.stringify(route.params)){
    return;
  }
  if (params) rootRef.current?.push(name, params);
  else rootRef.current?.push(name);
}

function HeaderLeft({navigation, route, config}:{
  navigation: any,
  route: any,
  config: NavigationConfig
}) {
  const isMobile = useIsMobile();
  const theme = useColorScheme();
  const windowType = useResizeContext();
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
              screenOptions={({ navigation, route }) => {
                rootRef.current = navigation;
                return {
                  headerStyle: {
                    backgroundColor: Colors[theme].header,
                    height: isMobile ? 50 : undefined,
                  },
                  headerTitleStyle: { color: Colors[theme].text },
                  headerLeft: () => <HeaderLeft {...{navigation, route, config}}/>,
                  headerRight: () => config.headerRight,
                  headerLeftContainerStyle: {
                    backgroundColor: Colors[theme].header,
                    borderBottomWidth: 1,
                    borderColor: Colors[theme].headerBottomColor,
                  },
                  cardStyle: [{ flexShrink: 1 }, backgroundStyle],
                  animationEnabled: isMobile,
                  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
                }
              }}
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
