import { useColorScheme, useLangContext, Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { createCommonStyles } from '../styles';
import { NavigationParamList } from '../types';

export default ({ paragraph }: { paragraph: string }) => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const commonStyles = createCommonStyles(theme);
  return (
    <View
      style={{
        padding: 4,
        paddingBottom: 0,
        paddingTop: 10,
        zIndex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        backgroundColor: commonStyles.container.backgroundColor,
      }}
    >
      <TouchableOpacity
        onPress={() =>
          navigation.push('NoteViewer', {
            key: 'Usage',
            paragraph,
          })
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text style={{ marginRight: 6 }}>{lang('Usage')}</Text>
        <Icon
          name="chevron-right"
          style={{ marginRight: 20 }}
          size={12}
          color={commonStyles.text.color}
        />
      </TouchableOpacity>
    </View>
  );
};
