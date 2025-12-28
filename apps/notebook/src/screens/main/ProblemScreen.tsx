import { useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';

import { NoteListSection } from './NoteListSection';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import UsageButton from '../../components/UsageButton';
import useProblem from '../../hooks/useProblem';
import { NavigationParamList } from '../../types';

export const ProblemsScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data, isLoading } = useProblem(1);
  const { lang } = useLangContext();

  return (
    <>
      <ResponsiveSearchBar />
      <UsageButton paragraph={'🧾 ' + lang('Edit Suggestions')} />
      <NoteListSection
        contents={data}
        onPress={(title, paragraph, section) =>
          navigation.push('EditPage', toNoteParams(title, paragraph, section))
        }
        isLoading={isLoading}
        emptyMessage="There are no notes needed to be written."
      />
    </>
  );
};
