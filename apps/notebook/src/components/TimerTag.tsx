import { CommonButton } from '@blacktokki/core';
import { toRaw } from '@blacktokki/editor';
import dayjs from 'dayjs';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { NodeData } from './HeaderSelectBar';

type DatePattern = {
  pattern: string;
  format?: (s: string, e: string) => string;
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
    {
      regex: /\b(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\b/g,
      parse: (match) => ({
        // YYYY-MM-DD/YYYY-MM-DD
        pattern: 'YYYY-MM-DD',
        format: (s, e) => `${s}/${e}`,
        text: match[0],
        dateStart: match[1],
        dateEnd: match[2],
        index: match.index,
      }),
    },
    {
      regex: /\b(\d{4}-\d{2}-\d{2})\b/g,
      parse: (match) => ({
        pattern: 'YYYY-MM-DD',
        text: match[0],
        dateStart: match[1],
        dateEnd: match[1],
        index: match.index,
      }),
    },
    {
      regex: /\b\d{4}-\d{2}(?!-)\b/g,
      parse: (match) => {
        const split = match[0].split('-');
        const year = parseInt(split[0], 10);
        const month = parseInt(split[1], 10);
        const lastDay = new Date(year, month, 0).getDate();
        return {
          pattern: 'YYYY-MM',
          text: match[0],
          dateStart: `${year}-${String(month).padStart(2, '0')}-01`,
          dateEnd: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
          index: match.index,
        };
      },
    },
    {
      regex: /\b(?<!\d)(\d{2})\/(\d{2})(?!\d)\b/g,
      parse: (match) => {
        const mm = parseInt(match[1], 10);
        const dd = parseInt(match[2], 10);
        return {
          pattern: 'MM/DD',
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
        (v2, i) => ({
          path: section.path,
          isHeader: i === 0,
          original: v2,
          matches: extractDates(v2),
        })
      );
      return { title, section: section.title, dateMatches };
    })
    .filter((v) => v.dateMatches.filter((v2) => v2.matches.length > 0).length > 0);
};

export const matchDateRange = (
  dateMatches: { matches: DatePattern[]; original: string; path: string; isHeader: boolean }[],
  dateNum: number
) => {
  return dateMatches.filter((dateMatch) =>
    dateMatch.matches.find(
      (match) =>
        new Date(match.dateStart).getTime() <= dateNum &&
        dateNum <= new Date(match.dateEnd).getTime()
    )
  );
};

export const today = () => dayjs().format('YYYY-MM-DD');

export type TimerData = DatePattern & { original: string; replace: (a: string) => void };

const TimerTag = (props: {
  data: TimerData;
  buttons: (data: TimerData) => { title: string; onPress: () => void }[];
  now: dayjs.Dayjs;
  isExpand: boolean;
  toggleExpand: () => void;
}) => {
  const start = dayjs(props.data.dateStart);
  const end = dayjs(props.data.dateEnd).add(1, 'day');
  const ratio = start.diff(props.now) / start.diff(end);
  return (
    <TouchableOpacity onPress={() => props.toggleExpand()}>
      <View
        style={{ backgroundColor: 'lightgray', borderRadius: 20, overflow: 'hidden', margin: 4 }}
      >
        <View
          style={{
            backgroundColor: 'darkgray',
            position: 'absolute',
            width: `${ratio * 100}%`,
            height: '100%',
          }}
        />
        {props.isExpand ? (
          <View style={{ paddingVertical: 4, paddingHorizontal: 4, maxWidth: 270 }}>
            <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
              <Text>⌚</Text>
              <Text selectable={false}>{props.data.text}</Text>
            </View>
            <Text>{props.data.original}</Text>
            <View style={{ width: '100%', alignItems: 'center' }}>
              {props.buttons(props.data).map((v) => (
                <CommonButton
                  key={v.title}
                  title={v.title}
                  onPress={() => v.onPress()}
                  style={{ width: '100%', backgroundColor: '#8888', margin: 4, maxWidth: 150 }}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={{ paddingVertical: 4, paddingHorizontal: 4, flexDirection: 'row' }}>
            <View style={{ paddingHorizontal: 4 }}>
              <Text selectable={false}>{props.data.text}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};
export default TimerTag;
