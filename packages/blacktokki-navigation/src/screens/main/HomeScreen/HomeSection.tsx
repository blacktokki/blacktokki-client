import { TabView, useResizeContext, TabViewData } from '@blacktokki/core';
import { useNavigation, useRoute } from '@react-navigation/core';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';

import { TabViewOption } from '../../../types';

const useHeaderSetter = (tabViews: TabViewData[]) => {
  const tempref = useRef<NodeJS.Timeout>();
  const indexRef = useRef<number>();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  useEffect(() => {
    return () => {
      clearInterval(tempref.current);
    };
  }, []);
  return (ref: any) => {
    clearInterval(tempref.current);
    tempref.current = setInterval(() => {
      /*@ts-ignore */
      ref?.measure((fx, fy, _, height, px, py) => {
        const i = Math.round(-px / width);
        if (indexRef.current !== i) {
          indexRef.current = i;
          navigation.setOptions(tabViews[i]);
        }
      });
    }, 300);
  };
};

const renderIndexDetector = (
  Component: React.ComponentType<any>,
  headerIndexRef: (ref: any) => void
) => {
  return (props: any) => (
    <View style={{ flex: 1 }} ref={headerIndexRef}>
      <Component {...props} />
    </View>
  );
};

export default function HomeSection({
  tabViews,
  title,
  children,
}: {
  tabViews: TabViewOption[];
  title: string;
  children?: React.ReactNode;
}) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const windowType = useResizeContext();
  const [home, setHome] = useState(windowType === 'landscape');
  useLayoutEffect(() => {
    const index = route?.params?.tab | 0;
    setTimeout(() => {
      navigation.setOptions(
        windowType === 'portrait'
          ? tabViews[index]
          : {
              title,
              headerRight: () => <></>,
            }
      );
    }, 1);
  }, [navigation, route, windowType]);
  useEffect(() => {
    setHome(windowType === 'landscape');
  }, [windowType]);
  const headerSetter = useHeaderSetter(tabViews);
  return home ? (
    <ScrollView contentContainerStyle={{ flex: 1, alignItems: 'center' }}>{children}</ScrollView>
  ) : (
    <TabView
      tabs={Object.fromEntries(
        tabViews.map((v, i) => [
          v.title,
          {
            ...v,
            component: i === 0 ? renderIndexDetector(v.component, headerSetter) : v.component,
          },
        ])
      )}
      tabBarPosition="bottom"
      index={parseInt(route.params?.['tab'] || 0, 10)}
      onTab={(index) => {
        navigation.setParams({ tab: index });
      }}
    />
  );
}
