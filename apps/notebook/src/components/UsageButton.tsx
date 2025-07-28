import { useColorScheme, useLangContext, Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { NavigationParamList } from '../types';

export default ({ paragraph }: { paragraph: string }) => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const iconColor = theme === 'dark' ? '#E4E4E4' : '#333333';
  return (
    <TouchableOpacity
      onPress={() =>
        navigation.push('NoteViewer', {
          key: 'Usage',
          paragraph,
        })
      }
      style={{
        padding: 4,
        paddingBottom: 0,
        top: 6,
        zIndex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <Text style={{ marginRight: 6 }}>{lang('Usage')}</Text>
      <Icon name="chevron-right" style={{ marginRight: 20 }} size={12} color={iconColor} />
    </TouchableOpacity>
  );
};
