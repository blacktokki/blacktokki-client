import { TabView, useResizeContext } from '@blacktokki/core';
import { useNavigation, useRoute } from '@react-navigation/core';
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';

import { TabViewOption } from '../../../types';

function firstComponent(tabViews: TabViewOption[], headerTitle?: string) {
  const Component = tabViews[0].component;
  const FirstTabView = (props: any) => {
    const tempref = useRef<NodeJS.Timeout>(undefined);
    const indexRef = useRef<number>(undefined);
    const { width } = useWindowDimensions();
    const navigation = useNavigation();
    useEffect(() => {
      return () => {
        clearInterval(tempref.current);
      };
    }, []);
    const headerIndexRef = (ref: any) => {
      clearInterval(tempref.current);
      tempref.current = setInterval(() => {
        /*@ts-ignore */
        ref?.measure((fx, fy, _, height, px, py) => {
          const i = Math.round(-px / width);
          if (indexRef.current !== i) {
            indexRef.current = i;
            navigation.setOptions({
              ...tabViews[i],
              title: headerTitle ? headerTitle : tabViews[i].title,
            });
          }
        });
      }, 300);
    };
    return (
      <View style={{ flex: 1 }} ref={headerIndexRef}>
        <Component {...props} />
      </View>
    );
  };
  return FirstTabView;
}

export default function HomeSection({
  tabViews,
  homeView,
  headerTitle,
  children,
}: {
  tabViews: TabViewOption[];
  homeView: { title: string; headerRight: () => React.JSX.Element };
  headerTitle?: string;
  children?: React.ReactNode;
}) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const windowType = useResizeContext();
  const [home, setHome] = useState(windowType === 'landscape');
  useLayoutEffect(() => {
    const index = route?.params?.tab | 0;
    setTimeout(() => {
      navigation.setOptions({
        ...(windowType === 'portrait' ? tabViews[index] : homeView),
        ...(headerTitle ? { title: headerTitle } : {}),
      });
    }, 1);
  }, [navigation, route, windowType]);
  useEffect(() => {
    setHome(windowType === 'landscape');
  }, [windowType]);
  const tabs = useMemo(
    () =>
      Object.fromEntries(
        tabViews.map((v, i) => [
          v.title,
          {
            ...v,
            component: i === 0 ? firstComponent(tabViews, headerTitle) : v.component,
          },
        ])
      ),
    [tabViews]
  );
  return home ? (
    <ScrollView contentContainerStyle={{ flex: 1, alignItems: 'center' }}>{children}</ScrollView>
  ) : (
    <>
      {homeView.headerRight()}
      <TabView
        tabs={tabs}
        tabBarPosition="bottom"
        index={parseInt(route.params?.['tab'] || 0, 10)}
        onTab={(index) => {
          navigation.setParams({ tab: index });
        }}
      />
    </>
  );
}
