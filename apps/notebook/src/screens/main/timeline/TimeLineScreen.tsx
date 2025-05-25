import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View } from 'react-native';

import { SearchBar } from '../../../components/SearchBar';
import { today } from '../../../components/TimerTag';
import useTimeLine from '../../../hooks/useTimeLine';
import { createCommonStyles } from '../../../styles';
import { NavigationParamList } from '../../../types';
import { NoteListSection } from '../NoteListSection';
import DateHeaderSection from './DateHeaderSection';

export const TimeLineScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const _window = useResizeContext();
  const [date, setDate] = useState(today());
  const { data, preData, isLoading } = useTimeLine(date);
  const markedDateRange = preData.flatMap((v) => v.dateMatches.flatMap((v2) => v2.matches));
  return (
    <>
      {_window === 'portrait' && <SearchBar />}
      <View style={[{ ...commonStyles.container, flex: undefined, paddingBottom: 0 }]}>
        <DateHeaderSection date={date} setDate={setDate} markedDateRange={markedDateRange} />
      </View>
      <NoteListSection
        contents={data}
        onPress={(title, paragraph) => navigation.push('NotePage', { title, paragraph })}
        isLoading={isLoading}
        emptyMessage="노트가 없습니다."
      />
    </>
  );
};
