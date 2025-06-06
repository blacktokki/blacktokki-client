import { toRaw } from '@blacktokki/editor';
import { useEffect, useRef, useState } from 'react';

import { Paragraph, parseHtmlToParagraphs } from '../components/HeaderSelectBar';
import { getLinks, titleFormat } from '../components/SearchBar';
import { cleanHtml } from '../components/TimerTag';
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
    const sentenceCount = (text.match(/[.!?\n]+/g) || []).length || 1;
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
    const sentences = text.split(/[.?!\n]/).filter((s) => s.trim().length > 0);
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
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const results: { type: 'ul' | 'ol'; items: string[] }[] = [];

  const listTags = ['ul', 'ol'] as const;

  listTags.forEach((tag) => {
    const lists = Array.from(doc.querySelectorAll(tag));

    lists.forEach((list) => {
      const items: string[] = [];

      const liElements = list.querySelectorAll('li');
      liElements.forEach((li) => {
        // li 요소 내 중첩 리스트는 제거하고 텍스트만 추출
        const cloned = li.cloneNode(true) as HTMLElement;

        // 중첩된 리스트 제거
        cloned.querySelectorAll('ul, ol').forEach((nested) => nested.remove());

        items.push(cloned.textContent?.trim() || '');
      });

      results.push({ type: tag, items });
    });
  });

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
        .filter((v) => v.path === path || v.path.startsWith(path + ' > '))
        .map((v) => (rootTitle || v.path !== path ? v.header : '') + v.description)
        .join('')
    : '';
};

const trim = (text: string) => text.replaceAll('\n', '').replaceAll('&nbsp;', '').trim();

type ProblemItem = [string, string | undefined, string]; // title, paragraph, subtitle
type ProblemSource = {
  title: string;
  updated: string;
  raw: string;
  links: { name: string; title: string; paragraph?: string; origin: string }[];
  parentTitle: string | undefined;
};

const problemCache: Record<
  string,
  {
    record: ProblemItem[];
    source: ProblemSource;
    matrix: Record<string, { updated: string; record: ProblemItem[] }>;
  }
> = {};

const getDataLinear = (page: Content) => {
  const existData = problemCache[page.title];
  if (existData?.source.updated === page.updated) {
    return problemCache[page.title];
  }
  const record: ProblemItem[] = [];
  // empty contents
  const paragraphs = parseHtmlToParagraphs(page.description || '');
  const lists = paragraphs
    .map((v) => ({ ...v, lists: findLists(v.description) }))
    .filter((v) => v.lists.length > 0);
  paragraphs
    .filter(
      (v) => v.level !== 0 && trim(paragraphDescription(paragraphs, v.title, false)).length === 0
    )
    .forEach((v) =>
      record.push([page.title, v.level === 0 ? undefined : v.title, 'Empty paragraph'])
    );
  lists
    .filter(
      (v) =>
        v.lists.filter((v2) => v2.items.filter((v2) => trim(v2).length === 0).length > 0).length > 0
    )
    .forEach((v2) =>
      record.push([page.title, v2.level === 0 ? undefined : v2.title, 'Empty list'])
    );

  // duplicate contents
  paragraphs
    .filter((v) => v !== paragraphs.findLast((v2) => v2.path === v.path))
    .forEach((v) => record.push([page.title, undefined, `Duplicate paragraphs(${v})`]));
  paragraphs
    .map((v) => {
      const sentences = cleanHtml(v.description, false, true)
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
        record.push([page.title, v.level === 0 ? undefined : v.title, `Duplicate contents(${v2})`])
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
  if (readability.level > 3.0) {
    record.push([
      page.title,
      undefined,
      `Too high readability score: ${readability.level.toFixed(4)} > 3.0`,
    ]);
  }
  const links = getLinks([page], true).filter((v) => v.type === '_NOTELINK');
  const splitTitle = getSplitTitle(page.title);
  const parentTitle = page.description && splitTitle.length === 2 ? splitTitle[0] : undefined;
  const raw = toRaw(cleanHtml(page.description || '', true, false));
  problemCache[page.title] = {
    record,
    source: { title: page.title, updated: page.updated, links, parentTitle, raw },
    matrix: {},
  };
  return problemCache[page.title];
};

const getDataMatrix = (source: ProblemSource, target: Content) => {
  if (source.title === target.title) {
    return [];
  }
  const existData = problemCache[source.title];
  const existTarget = existData.matrix[target.title];
  if (existData?.source.updated === source.updated && existTarget?.updated === target.updated) {
    return existTarget.record;
  }
  const record: ProblemItem[] = [];
  const links = source.links.filter((link) => link.title === target.title);

  if (target.description) {
    const description = target.description;
    const _target = problemCache[target.title].source;
    //unknown paragraph
    links
      .filter(
        (link) =>
          link.paragraph !== undefined &&
          parseHtmlToParagraphs(description).find((v2) => v2.title === link.paragraph) === undefined
      )
      .forEach((link) => {
        record.push([link.title, link.paragraph, `Unknown paragraph link(${link.origin})`]);
      });
    //unlinked keyword
    const sourceName = source.title;
    if (
      _target.parentTitle !== source.title &&
      _target.links.find((v) => v.name.toLowerCase() === sourceName.toLowerCase()) === undefined
    ) {
      const match = _target.raw.match(new RegExp(`\\b${sourceName}\\b`, 'i'));
      if (match) {
        record.push([target.title, undefined, `Unlinked note keyword: ${match[0]}`]);
      }
    }
    source.links
      .filter(
        (link) =>
          _target.parentTitle !== link.title &&
          link.title.toLowerCase() !== link.name.toLowerCase() && // alias link only
          link.title !== target.title && // not self link
          _target.links.find(
            (v) =>
              v.name.toLowerCase() === link.name.toLowerCase() &&
              v.title === link.title &&
              v.paragraph === link.paragraph
          ) === undefined
      )
      .forEach((link) => {
        const match = _target.raw.match(new RegExp(`\\b${link.name}\\b`, 'i'));
        if (match) {
          record.push([
            target.title,
            undefined,
            `Unlinked note keyword: ${match[0]} => ${titleFormat(link)}(${link.origin})`,
          ]);
        }
      });
  } else {
    //unknown note
    links.forEach((link) => {
      record.push([link.title, link.paragraph, `Unknown note link(${link.origin})`]);
    });

    //empty parent note
    if (source.parentTitle === target.title) {
      record.push([source.parentTitle, undefined, `Empty parent note(${source.title})`]);
    }
  }
  existData.matrix[target.title] = { record, updated: target.updated };

  return record;
};

const getData = (pages: Content[]) => {
  const records: { title: string; paragraph: string | undefined; subtitles: string[] }[] = [];
  pages
    .map(getDataLinear)
    .flatMap(({ record, source }) => {
      return [...pages.flatMap((target) => getDataMatrix(source, target)), ...record];
    })
    .forEach(([title, paragraph, subtitle]) => {
      const i = records.findIndex((v) => v.title === title && v.paragraph === paragraph);
      if (i >= 0) {
        records[i].subtitles.push(subtitle);
      } else {
        records.push({ title, paragraph, subtitles: [subtitle] });
      }
    });
  return records;
};

export default (delay?: number) => {
  const { data: pages = [], isLoading } = useNotePages();
  const [data, setData] = useState<{ title: string; paragraph?: string; subtitles: string[] }[]>();
  const timeoutRef = useRef<NodeJS.Timeout>();
  useEffect(() => {
    timeoutRef.current && clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setData(getData(pages));
      timeoutRef.current = undefined;
    }, delay || 500);
  }, [pages]);
  return { data: data || [], isLoading: isLoading || data === undefined };
};
