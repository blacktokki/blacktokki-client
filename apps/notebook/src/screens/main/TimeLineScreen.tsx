import {
  CommonButton,
  useColorScheme,
  useModalsContext,
  useResizeContext,
  Text,
} from '@blacktokki/core';
import { toRaw } from '@blacktokki/editor';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';

import { NodeData, parseHtmlToSections } from '../../components/HeaderSelectBar';
import { SearchBar } from '../../components/SearchBar';
import { useNotePages } from '../../hooks/useNoteStorage';
import DatePickerModal, { MarkedDateRange } from '../../modals/DatePikcerModal';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';
import { NoteListSection } from './NoteListSection';

type DateHeaderSectionProps = {
  date: string;
  setDate: (date: string) => void;
  markedDateRange: MarkedDateRange[];
  monthly?: boolean;
};

const today = () => dayjs().format('YYYY-MM-DD');

function DateHeaderSection({ date, setDate, monthly, markedDateRange }: DateHeaderSectionProps) {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { setModal } = useModalsContext();
  const window = useResizeContext();

  return (
    <View style={[commonStyles.card, { flexDirection: 'row', justifyContent: 'center' }]}>
      <CommonButton
        title="<<"
        onPress={() =>
          setDate(
            dayjs(date)
              .add(-1, monthly ? 'year' : 'month')
              .format('YYYY-MM-DD')
          )
        }
        style={{ paddingVertical: 8, backgroundColor: 'transparent' }}
      />
      <CommonButton
        title="<"
        onPress={() =>
          setDate(
            dayjs(date)
              .add(-1, monthly ? 'month' : 'day')
              .format('YYYY-MM-DD')
          )
        }
        style={{ paddingVertical: 8, backgroundColor: 'transparent' }}
      />
      <View style={{ flexDirection: 'row', backgroundColor: 'transparent' }}>
        <TouchableOpacity
          style={[
            {
              flex: 1,
              borderWidth: 1,
              borderRadius: 8,
              height: 30,
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderColor: 'rgba(27,31,36,0.15)',
              minWidth: window === 'landscape' ? 210 : 150,
              minHeight: 37,
              paddingTop: 0,
            },
          ]}
          onPress={() =>
            setModal(DatePickerModal, {
              datetime: date,
              markedDateStrings: markedDateRange,
              callback: (datetime?: string) => setDate(datetime || date),
            })
          }
        >
          <Text style={{ textAlign: 'center', fontWeight: '700', fontSize: 28 }}>
            {monthly && date ? date.substring(0, 7) : date}
          </Text>
        </TouchableOpacity>
        {/* {date !== today() && <CommonButton title='x' onPress={()=>setDate(today())}/>} */}
      </View>
      <CommonButton
        title=">"
        onPress={() =>
          setDate(
            dayjs(date)
              .add(1, monthly ? 'month' : 'day')
              .format('YYYY-MM-DD')
          )
        }
        style={{ paddingVertical: 8, backgroundColor: 'transparent' }}
      />
      <CommonButton
        title=">>"
        onPress={() =>
          setDate(
            dayjs(date)
              .add(1, monthly ? 'year' : 'month')
              .format('YYYY-MM-DD')
          )
        }
        style={{ paddingVertical: 8, backgroundColor: 'transparent' }}
      />
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const addMonth = (dateStr: string): string => {
  const [year, month] = dateStr
    .split('-')
    .filter((v, i) => i < 2)
    .map((v) => parseInt(v, 10));
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${month + 1}`;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const addDays = (dateStr: string, days: number): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

type DatePattern = {
  text: string;
  dateStart: string;
  dateEnd: string;
  index: number;
};

function extractDates(input: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  // 정규식 패턴들
  const patterns: {
    regex: RegExp;
    parse: (match: RegExpExecArray) => DatePattern;
  }[] = [
    // YYYY-MM-DD/YYYY-MM-DD
    {
      regex: /\b(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\b/g,
      parse: (match) => ({
        text: match[0],
        dateStart: match[1],
        dateEnd: match[2],
        index: match.index,
      }),
    },
    // YYYY-MM-DD
    {
      regex: /\b(\d{4}-\d{2}-\d{2})\b/g,
      parse: (match) => ({
        text: match[0],
        dateStart: match[1],
        dateEnd: match[1],
        index: match.index,
      }),
    },
    // YYYY-MM
    {
      regex: /\b\d{4}-\d{2}(?!-)\b/g,
      parse: (match) => {
        const split = match[0].split('-');
        const year = parseInt(split[0], 10);
        const month = parseInt(split[1], 10);
        const lastDay = new Date(year, month, 0).getDate();
        return {
          text: match[0],
          dateStart: `${year}-${String(month).padStart(2, '0')}-01`,
          dateEnd: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
          index: match.index,
        };
      },
    },
    // MM/DD
    {
      regex: /\b(?<!\d)(\d{2})\/(\d{2})(?!\d)\b/g,
      parse: (match) => {
        const mm = parseInt(match[1], 10);
        const dd = parseInt(match[2], 10);
        return {
          text: match[0],
          dateStart: `${currentYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
          dateEnd: `${currentYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
          index: match.index,
        };
      },
    },
  ];

  const results: DatePattern[] = [];

  const usedRanges: [number, number][] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      const start = match.index;
      const end = regex.lastIndex;
      // 이미 처리된 범위에 속하면 skip
      if (results.some((result) => start < result.index + result.text.length && end > result.index))
        continue;
      results.push(pattern.parse(match));
      usedRanges.push([start, end]);
    }
  }

  return results;
}

export const sectionsToDatePatterns = (title: string, sections: NodeData[]) => {
  return sections
    .map((section) => {
      const dateMatches = [toRaw(section.header), ...toRaw(section.description).split('\n')].map(
        (v2) => ({ original: v2, matches: extractDates(v2) })
      );
      return { title, section: section.title, dateMatches };
    })
    .filter((v) => v.dateMatches.length > 0);
};

export const TimeLineScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const _window = useResizeContext();
  const [date, setDate] = useState(today());
  const dateNum = new Date(date).getTime();

  const { data: notes = [], isLoading } = useNotePages();
  const preData = useMemo(
    () =>
      notes.flatMap((v) =>
        sectionsToDatePatterns(v.title, parseHtmlToSections(v?.description || ''))
      ),
    [notes]
  );
  const data = preData
    .map((v) => {
      return {
        ...v,
        subtitles: v.dateMatches
          .filter((dateMatch) =>
            dateMatch.matches.find(
              (match) =>
                new Date(match.dateStart).getTime() <= dateNum &&
                dateNum <= new Date(match.dateEnd).getTime()
            )
          )
          .map((dateMatch) => dateMatch.original),
      };
    })
    .filter((v2) => v2.subtitles.length > 0);
  const markedDateRange = preData.flatMap((v) => v.dateMatches.flatMap((v2) => v2.matches));
  return (
    <>
      {_window === 'portrait' && <SearchBar />}
      <View style={[{ ...commonStyles.container, flex: undefined, paddingBottom: 0 }]}>
        <DateHeaderSection date={date} setDate={setDate} markedDateRange={markedDateRange} />
      </View>
      <NoteListSection
        contents={data}
        onPress={(title, section) => navigation.push('NotePage', { title, section })}
        isLoading={isLoading}
        emptyMessage="노트가 없습니다."
      />
    </>
  );
};
