import React from 'react';
import { Platform } from 'react-native';
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
  return (
    <TabView
      renderTabBar={(props: SceneRendererProps & { navigationState: NavigationState<any> }) => {
        return (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: '#2196F3' }}
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
      renderScene={SceneMap(Object.assign({}, ...entries.map(([k, v]) => ({ [k]: v.component }))))}
      tabBarPosition={props.tabBarPosition}
    />
  );
};
