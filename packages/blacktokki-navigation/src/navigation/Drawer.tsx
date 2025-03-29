import { Auth } from '@blacktokki/account';
import { Colors, useColorScheme, useResizeContext } from '@blacktokki/core';
import { useTheme } from '@react-navigation/native';
import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

export default ({ auth, children }: { auth: Auth; children: React.ReactNode }) => {
  const { colors } = useTheme();
  const theme = useColorScheme();
  const { height } = useWindowDimensions();
  const windowType = useResizeContext();
  return (
    <View
      style={
        windowType === 'landscape'
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
      {windowType === 'landscape' && auth.user && children}
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
