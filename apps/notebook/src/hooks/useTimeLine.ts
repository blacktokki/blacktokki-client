import { useMemo } from 'react';

import { parseHtmlToParagraphs } from '../components/HeaderSelectBar';
import { matchDateRange, paragraphsToDatePatterns, today } from '../components/TimerTag';
import { useNotePages } from './useNoteStorage';

export default (date?: string) => {
  const dateNum = new Date(date || today()).getTime();

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
