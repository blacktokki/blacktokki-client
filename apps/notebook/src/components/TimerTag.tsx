import { CommonButton, useLangContext } from '@blacktokki/core';
import { toRaw } from '@blacktokki/editor';
import dayjs from 'dayjs';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { Paragraph } from './HeaderSelectBar';

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
      regex: /\b(\d{2})\/(\d{2})\s*~\s*(\d{2})\/(\d{2})\b/g,
      parse: (match) => {
        const mm = parseInt(match[1], 10);
        const dd = parseInt(match[2], 10);
        const mm2 = parseInt(match[3], 10);
        const dd2 = parseInt(match[4], 10);
        return {
          // MM/DD ~ MM/DD
          pattern: 'MM/DD',
          format: (s, e) => `${s} ~ ${e}`,
          text: match[0],
          dateStart: `${currentYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
          dateEnd: `${currentYear}-${String(mm2).padStart(2, '0')}-${String(dd2).padStart(2, '0')}`,
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
export function cleanHtml(html: string, cleanAnchors: boolean, mergeTds: boolean): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. <code> 태그 내부 비우기
  const codeTags = doc.querySelectorAll('code');
  codeTags.forEach((code) => {
    code.textContent = '';
  });
  // 2. <a> 태그 내부 비우기
  const aTags = doc.querySelectorAll('a');
  aTags.forEach((a) => {
    a.textContent = '';
  });
  if (mergeTds) {
    // 3. 각 <tr> 안의 <td> 병합
    const trList = doc.querySelectorAll('tr');
    trList.forEach((tr) => {
      const tdList = tr.querySelectorAll('td');
      if (tdList.length > 1) {
        const mergedText = Array.from(tdList)
          .map((td) => td.textContent?.trim() || '')
          .join(' ');

        // 첫 td에 병합된 텍스트 설정
        const newTd = document.createElement('td');
        newTd.textContent = mergedText;

        // 기존 td 모두 제거 후 병합 td 삽입
        tr.innerHTML = '';
        tr.appendChild(newTd);
      }
    });
  }
  return doc.body.innerHTML;
}

export const paragraphsToDatePatterns = (title: string, paragraphs: Paragraph[]) => {
  return paragraphs
    .map((paragraph) => {
      const dateMatches = [
        toRaw(paragraph.header),
        ...toRaw(cleanHtml(paragraph.description, false, true)).split('\n'),
      ].map((v2, i) => ({
        path: paragraph.path,
        isHeader: i === 0,
        original: v2,
        matches: extractDates(v2),
      }));
      return { title, paragraph: paragraph.title, section: paragraph.autoSection, dateMatches };
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
  const diffTotal = start.diff(end);
  const ratio = diffTotal === 0 ? 1 : start.diff(props.now) / diffTotal;
  const { lang } = useLangContext();
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
                  title={lang(v.title)}
                  onPress={() => {
                    v.onPress();
                    props.toggleExpand();
                  }}
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
