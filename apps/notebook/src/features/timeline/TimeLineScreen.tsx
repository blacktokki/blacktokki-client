import { useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View } from 'react-native';

import DateHeaderSection from './DateHeaderSection';
import { today } from './TimerTag';
import useTimeLine from './useTimeLine';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import UsageButton from '../../components/UsageButton';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NoteListSection } from '../../screens/main/NoteListSection';
import { NavigationParamList } from '../../types';

export const TimeLineScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles } = useNotebookTheme();
  const [date, setDate] = useState(today());
  const { data, preData, isLoading } = useTimeLine(date);
  const markedDateRange = preData.flatMap((v) => v.dateMatches.flatMap((v2) => v2.matches));
  const { lang } = useLangContext();
  return (
    <>
      <ResponsiveSearchBar />
      <UsageButton paragraph={'📆 ' + lang('Timeline')} />
      <View style={[{ ...commonStyles.container, flex: undefined, paddingBottom: 0 }]}>
        <DateHeaderSection date={date} setDate={setDate} markedDateRange={markedDateRange} />
      </View>
      <NoteListSection
        contents={data}
        onPress={(title, paragraph, section) =>
          navigation.push('NotePage', toNoteParams(title, paragraph, section))
        }
        isLoading={isLoading}
        emptyMessage="There are no notes."
      />
    </>
  );
};
