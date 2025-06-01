import { useResizeContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';

import { SearchBar } from '../../components/SearchBar';
import useProblem from '../../hooks/useProblem';
import { NavigationParamList } from '../../types';
import { NoteListSection } from './NoteListSection';

export const ProblemsScreen: React.FC = () => {
  const _window = useResizeContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data, isLoading } = useProblem(1);

  return (
    <>
      {_window === 'portrait' && <SearchBar />}
      <NoteListSection
        contents={data}
        onPress={(title) => navigation.push('EditPage', { title })}
        isLoading={isLoading}
        emptyMessage="There are no notes needed to be written."
      />
    </>
  );
};
