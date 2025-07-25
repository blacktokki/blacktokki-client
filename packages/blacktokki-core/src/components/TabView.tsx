import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Dimensions, Platform, View } from 'react-native';
import {
  TabView,
  SceneMap,
  NavigationState,
  SceneRendererProps,
  TabBar,
} from 'react-native-tab-view';

import Colors from '../constants/Colors';
import useColorScheme from '../hooks/useColorScheme';
import useLangContext from '../hooks/useLangContext';

export type TabViewData = { title: string; component: React.ComponentType<any>; icon: JSX.Element };

const empty = () => <></>;

export default (props: {
  tabs: Record<string, TabViewData>;
  tabBarPosition: 'top' | 'bottom';
  index?: number;
  onTab?: (index: number) => void;
}) => {
  const { lang } = useLangContext();
  const index = props.index || 0;
  const theme = useColorScheme();
  const entries = Object.entries(props.tabs);
  const onTab = props.onTab;
  const icons = Object.assign({}, ...entries.map(([k, v]) => ({ [k]: v.icon })));
  const [resizing, setResizing] = useState(false);
  const [mount, setMount] = useState(false);
  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    const listener = Dimensions.addEventListener('change', () => {
      if (timeout) {
        clearTimeout(timeout);
      } else {
        setResizing(true);
      }
      timeout = setTimeout(() => {
        setResizing(false);
        timeout = undefined;
      }, 300);
    });
    setTimeout(() => setMount(true), 1);
    return () => listener.remove();
  }, []);
  const color = '#2196F3';
  return (
    <>
      {!mount && (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={color} />
        </View>
      )}
      <TabView
        style={mount ? { flex: 1 } : { flex: 0 }}
        renderTabBar={(props: SceneRendererProps & { navigationState: NavigationState<any> }) => {
          return (
            <TabBar
              {...props}
              indicatorStyle={{ backgroundColor: color }}
              style={{ backgroundColor: Colors[theme].background }}
              /* @ts-ignore */
              labelStyle={{ whiteSpace: 'nowrap' }}
              activeColor={Colors[theme].text}
              inactiveColor={Colors[theme].text}
              renderIcon={(scene) => icons[scene.route.key]}
              onTabPress={(scene) => onTab?.(entries.findIndex(([k, v]) => k === scene.route.key))}
            />
          );
        }}
        navigationState={{
          index,
          routes: entries.map(([k, v]) => ({ key: k, title: lang(v.title) })),
        }}
        onIndexChange={(v) => {
          onTab?.(v);
        }}
        onSwipeStart={() => {
          if (Platform.OS === 'web') {
            if (window.getSelection) {
              const sel = window.getSelection();
              sel?.removeAllRanges();
            }
          }
        }}
        renderScene={SceneMap(
          Object.assign(
            {},
            ...entries.map(([k, v], i) => ({ [k]: !resizing || i === index ? v.component : empty }))
          )
        )}
        tabBarPosition={props.tabBarPosition}
        initialLayout={{
          width: Dimensions.get('window').width,
          height: 0,
        }}
      />
    </>
  );
};
