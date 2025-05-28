import { toRaw } from '@blacktokki/editor';
import { useEffect, useRef, useState } from 'react';

import { Paragraph, parseHtmlToParagraphs } from '../components/HeaderSelectBar';
import { getNoteLinks } from '../components/SearchBar';
import { cleanAndMergeTDs } from '../components/TimerTag';
import { Content } from '../types';
import { useNotePages } from './useNoteStorage';

const getReadabilityLevel = (() => {
  function getKoreanRatio(text: string): number {
    return (text.match(/[가-힣]/g) || []).length / text.length;
  }

  function countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    const vowels = /[aeiouy]+/g;
    const trailingE = /e\b/;
    const matches = word.match(vowels) || [];
    let syllables = matches.length;
    if (trailingE.test(word) && syllables > 1) syllables--;
    return Math.max(syllables, 1);
  }

  function calculateFleschKincaid(text: string): number {
    const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;
    const wordList = text.trim().split(/\s+/);
    const wordCount = wordList.length;
    const syllableCount = wordList.reduce((sum, word) => sum + countSyllables(word), 0);
    return 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;
  }

  function classifyFleschKincaid(score: number): number {
    if (score < 3.0) return 1;
    if (score < 6.0) return 2;
    if (score < 9.0) return 3;
    if (score < 12.0) return 4;
    return 5;
  }

  function classifyKoreanReadability(text: string): number {
    const sentences = text.split(/[.?!\r\n]/).filter((s) => s.trim().length > 0);
    const words = text.trim().split(/\s+/);
    const wordCount = words.length;
    const sentenceCount = sentences.length || 1;
    const avgWordsPerSentence = wordCount / sentenceCount;

    if (avgWordsPerSentence <= 7) return 1; // 매우 쉬움
    if (avgWordsPerSentence <= 10) return 2;
    if (avgWordsPerSentence <= 13) return 3;
    if (avgWordsPerSentence <= 16) return 4;
    return 5; // 매우 어려움
  }

  function _getReadabilityLevel(text: string) {
    const koRatio = getKoreanRatio(text);
    const enGrade = calculateFleschKincaid(text);
    const enLevel = classifyFleschKincaid(enGrade);
    const koLevel = classifyKoreanReadability(text);
    return { koRatio, enLevel, koLevel, level: koLevel * koRatio + enLevel * (1 - koRatio) };
  }
  return _getReadabilityLevel;
})();

function findLists(html: string): { type: 'ul' | 'ol'; items: string[] }[] {
  const results: { type: 'ul' | 'ol'; items: string[] }[] = [];

  const listRegex = /<(ul|ol)[^>]*?>([\s\S]*?)<\/\1>/gi;
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;

  let listMatch;
  while ((listMatch = listRegex.exec(html)) !== null) {
    const [, type, innerHTML] = listMatch;
    const items: string[] = [];

    let liMatch;
    while ((liMatch = liRegex.exec(innerHTML)) !== null) {
      const itemContent = liMatch[1].trim();
      items.push(itemContent);
    }

    results.push({ type: type as 'ul' | 'ol', items });
  }

  return results;
}

export const getSplitTitle = (title: string) => {
  const splitTitle = title.split('/');
  if (splitTitle.length < 2) {
    return [title];
  }
  return [splitTitle.slice(0, splitTitle.length - 1).join('/'), splitTitle[splitTitle.length - 1]];
};

export const paragraphDescription = (
  paragraphs: Paragraph[],
  paragraph: string,
  rootTitle: boolean
) => {
  const path = paragraphs.find((v) => v.title === paragraph)?.path;
  return path
    ? paragraphs
        .filter((v) => v.path.startsWith(path))
        .map((v) => (rootTitle || v.path !== path ? v.header : '') + v.description)
        .join('')
    : '';
};

const getData = async (pages: Content[]) => {
  const records: Record<
    string,
    {
      subtitles: string[];
      paragraphs: Record<string, string[]>;
    }
  > = {};
  const push = (title: string, paragraph: string | undefined, subtitle: string) => {
    if (records[title] === undefined) {
      records[title] = { subtitles: [], paragraphs: {} };
    }
    const record = records[title];
    if (paragraph !== undefined) {
      if (record.paragraphs[paragraph] === undefined) {
        record.paragraphs[paragraph] = [];
      }
      record.paragraphs[paragraph].push(subtitle);
    } else {
      record.subtitles.push(subtitle);
    }
  };

  pages.forEach((page) => {
    //unknown note
    getNoteLinks([page]).forEach((link) => {
      const linkPage = pages.find((v) => v.title === link.title);
      if (linkPage?.description) {
        if (
          link.paragraph === undefined ||
          parseHtmlToParagraphs(linkPage.description).find((v2) => v2.title === link.paragraph)
        ) {
          return;
        }
      }
      push(
        link.title,
        link.paragraph,
        (link.paragraph === undefined ? 'Unknown note link' : 'Unknown paragraph link') +
          `(${link.origin})`
      );
    });

    //empty parent note
    const splitTitle = getSplitTitle(page.title);
    if (
      page.description &&
      splitTitle.length === 2 &&
      pages.find((v) => v.title === splitTitle[0]) === undefined
    ) {
      push(splitTitle[0], undefined, `Empty parent note(${page.title})`);
    }

    // empty contents
    const paragraphs = parseHtmlToParagraphs(page.description || '');
    const lists = paragraphs
      .map((v) => ({ ...v, lists: findLists(v.description) }))
      .filter((v) => v.lists.length > 0);

    paragraphs
      .filter(
        (v) => v.level !== 0 && paragraphDescription(paragraphs, v.title, false).trim() === ''
      )
      .forEach((v) => push(page.title, v.level === 0 ? undefined : v.title, 'Empty paragraph'));
    lists
      .filter(
        (v) =>
          v.lists.filter(
            (v2) =>
              v2.items.filter((v2) => v2.replaceAll('&nbsp;', '').trim().length === 0).length > 0
          ).length > 0
      )
      .forEach((v2) => push(page.title, v2.level === 0 ? undefined : v2.title, 'Empty list'));

    // duplicate contents
    paragraphs
      .filter((v) => v !== paragraphs.findLast((v2) => v2.path === v.path))
      .forEach((v) => push(page.title, undefined, `Duplicate paragraphs(${v})`));
    paragraphs
      .map((v) => {
        const sentences = cleanAndMergeTDs(v.description)
          .split('\n')
          .map((v2) => toRaw(v2).trim())
          .filter((v) => v.includes(' ') && v.length > 4);
        return {
          ...v,
          duplicates: sentences.filter((v2, i) => i !== sentences.lastIndexOf(v2)),
        };
      })
      .forEach((v) =>
        v.duplicates.forEach((v2) =>
          push(page.title, v.level === 0 ? undefined : v.title, `Duplicate contents(${v2})`)
        )
      );
    // readability
    const readability = page.description
      ? getReadabilityLevel(
          toRaw(
            page.description
              .replaceAll(/<code\b[^>]*>[\s\S]*?<\/code>/gi, '<code></code>')
              .replaceAll(/<br\s*[/]?>/gi, '\r\n')
          )
        )
      : { level: 0 };
    if (readability.level > 3.5) {
      push(
        page.title,
        undefined,
        `Too high readability score: ${readability.level.toFixed(4)} > 3.5`
      );
    }
  });

  return Object.entries(records).flatMap(([title, record]) => {
    return [
      ...(record.subtitles.length > 0 ? [{ title, subtitles: record.subtitles }] : []),
      ...Object.entries(record.paragraphs).map(([paragraph, subtitles]) => ({
        title,
        paragraph,
        subtitles,
      })),
    ];
  });
};

export default () => {
  const { data: pages = [], isLoading } = useNotePages();
  const [data, setData] = useState<{ title: string; paragraph?: string; subtitles: string[] }[]>(
    []
  );
  const timeoutRef = useRef<NodeJS.Timeout>();
  useEffect(() => {
    timeoutRef.current && clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      getData(pages).then(setData);
      timeoutRef.current = undefined;
    }, 500);
  }, [pages]);
  return { data, isLoading };
};
