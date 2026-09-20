import { Auth } from '@blacktokki/account';
import { Colors, useColorScheme, useResizeContext } from '@blacktokki/core';
import { useTheme } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

let setDrawerVisibleGlobal: ((visible: boolean) => void) | undefined;
export const setDrawerVisible = (visible: boolean) => {
  setDrawerVisibleGlobal?.(visible);
};

export default ({ auth, children }: { auth: Auth; children: React.ReactNode }) => {
  const { colors } = useTheme();
  const theme = useColorScheme();
  const { height } = useWindowDimensions();
  const windowType = useResizeContext();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setDrawerVisibleGlobal = setVisible;
    return () => {
      setDrawerVisibleGlobal = undefined;
    };
  }, []);

  const isVisible = Boolean(windowType === 'landscape' && auth.isLogin && visible && children);
  const childrenComponent = useMemo(() => (isVisible ? children : null), [isVisible, children]);
  return (
    <View
      style={
        isVisible
          ? [
              styles.tabBar,
              {
                backgroundColor: Colors[theme].background,
                borderTopColor: colors.border,
                maxHeight: height,
              },
            ]
          : { width: 0 }
      }
      pointerEvents={'auto'}
    >
      {childrenComponent}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    width: 240,
    elevation: 8,
    borderRightWidth: 1,
    borderColor: Colors.borderColor,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
});
