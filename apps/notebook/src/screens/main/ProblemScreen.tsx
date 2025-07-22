import { Text, useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { NoteListSection } from './NoteListSection';
import { SearchBar } from '../../components/SearchBar';
import useProblem from '../../hooks/useProblem';
import { NavigationParamList } from '../../types';

export const ProblemsScreen: React.FC = () => {
  const _window = useResizeContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data, isLoading } = useProblem(1);
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const iconColor = theme === 'dark' ? '#E4E4E4' : '#333333';

  return (
    <>
      {_window === 'portrait' && <SearchBar />}
      <TouchableOpacity
        onPress={() =>
          navigation.push('NoteViewer', {
            key: 'Usage',
            paragraph: '🧾 ' + lang('Edit Suggestions'),
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
      <NoteListSection
        contents={data}
        onPress={(title) => navigation.push('EditPage', { title })}
        isLoading={isLoading}
        emptyMessage="There are no notes needed to be written."
      />
    </>
  );
};
