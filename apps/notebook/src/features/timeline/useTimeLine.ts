import dayjs from 'dayjs';
import { useMemo } from 'react';

import { matchDateRange, paragraphsToDatePatterns, today } from './TimerTag';
import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { useNotePages } from '../../hooks/useNoteStorage';

export default (date?: string) => {
  const targetDate = dayjs(date || today()).startOf('day');
  const dateNum = targetDate.valueOf();

  const { data: notes = [], isLoading } = useNotePages();
  const preData = useMemo(
    () =>
      notes.flatMap((v) =>
        paragraphsToDatePatterns(v.title, parseHtmlToParagraphs(v?.description || ''))
      ),
    [notes]
  );
  const data = preData
    .map((v) => {
      return {
        ...v,
        subtitles: matchDateRange(v.dateMatches, dateNum).map((dateMatch) => dateMatch.original),
      };
    })
    .filter((v2) => v2.subtitles.length > 0);
  return { data, isLoading, preData };
};
