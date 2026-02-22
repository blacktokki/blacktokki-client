import { useAuthContext } from '@blacktokki/account';
import { cleanHtml, findLists, toRaw } from '@blacktokki/editor';
import { useEffect, useRef, useState } from 'react';

import {
  base64Decode,
  paragraphByKey,
  paragraphDescription,
  parseHtmlToParagraphs,
} from '../../components/HeaderSelectBar';
import { getLinks, titleFormat } from '../../components/SearchBar';
import { useBoardPages } from '../../hooks/useBoardStorage';
import { KeywordContent } from '../../hooks/useKeywordStorage';
import { getSplitTitle, useNotePages } from '../../hooks/useNoteStorage';
import { Content } from '../../types';

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

const trim = (text: string) => text.replaceAll('\n', '').replaceAll('&nbsp;', '').trim();

const matchUnlinkedKeyword = (text: string, keyword: string) => {
  const escpaedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`(?:^|[\\s\\p{P}])${escpaedKeyword}(?=$|[\\s\\p{P}])`, 'iu'));
};

type ProblemItem = [string, string | undefined, string]; // title, path, subtitle
type ProblemSource = {
  id: number;
  title: string;
  updated: string;
  raw: string;
  links: (KeywordContent & { type: '_NOTELINK' })[];
  parentTitle: string | undefined;
};
type ProblemMatrixSource = {
  updated: string;
  isReverseLink: boolean;
  isSubNote: boolean;
};

let problemCacheUserId: number | undefined;
let problemCache: Record<
  string,
  {
    record: ProblemItem[];
    source: ProblemSource;
    matrix: Record<string, { record: ProblemItem[]; matrixSource: ProblemMatrixSource }>;
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
      (v) => v.level !== 0 && trim(paragraphDescription(paragraphs, v.path, false)).length === 0
    )
    .forEach((v) =>
      record.push([page.title, v.level === 0 ? undefined : v.path, 'Empty paragraph'])
    );
  lists
    .filter(
      (v) =>
        v.lists.filter((v2) => v2.items.filter((v2) => trim(v2).length === 0).length > 0).length > 0
    )
    .forEach((v2) => record.push([page.title, v2.level === 0 ? undefined : v2.path, 'Empty list']));

  // duplicate contents
  paragraphs
    .filter(
      (v) =>
        v !== paragraphs.findLast((v2) => v2.title === v.title && v2.autoSection === v.autoSection)
    )
    .forEach((v) =>
      record.push([
        page.title,
        undefined,
        `Duplicate paragraphs(${v.autoSection ? '(' + v.autoSection + ') ' : ''}${v.title})`,
      ])
    );
  paragraphs
    .map((v) => {
      const sentences = cleanHtml(v.description, true, true, true)
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
        record.push([page.title, v.level === 0 ? undefined : v.path, `Duplicate contents(${v2})`])
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
  const raw = toRaw(cleanHtml(page.description || '', true, true, false));
  problemCache[page.title] = {
    record,
    source: { id: page.id, title: page.title, updated: page.updated, links, parentTitle, raw },
    matrix: {},
  };
  return problemCache[page.title];
};

const getDataMatrix = (
  source: ProblemSource,
  target: { title: string; updated: string; description?: string }
) => {
  if (source.title === target.title) {
    return [];
  }
  const existData = problemCache[source.title];
  const existTarget = existData.matrix[target.title];
  if (
    existData?.source.updated === source.updated &&
    existTarget?.matrixSource.updated === target.updated
  ) {
    return existTarget.record;
  }
  const record: ProblemItem[] = [];
  const links = source.links.filter((link) => link.title === target.title);
  let isSubNote = false;
  let isReverseLink = false;

  if (target.description) {
    const description = target.description;
    const _target = problemCache[target.title].source;
    //unknown paragraph
    links
      .filter(
        (link) =>
          link.paragraph !== undefined &&
          parseHtmlToParagraphs(description).find(
            (v2) => v2.title === link.paragraph && paragraphByKey(v2, link)
          ) === undefined
      )
      .forEach((link) => {
        record.push([link.origin, undefined, `Unknown paragraph link(${titleFormat(link)})`]);
      });
    //unlinked keyword
    const sourceName = source.title;
    if (
      _target.parentTitle !== source.title &&
      _target.links.find((v) => v.name.toLowerCase() === sourceName.toLowerCase()) === undefined
    ) {
      const match = matchUnlinkedKeyword(_target.raw, sourceName);
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
              v.paragraph === link.paragraph &&
              (link.section === undefined || v.section === link.section)
          ) === undefined
      )
      .forEach((link) => {
        const match = matchUnlinkedKeyword(_target.raw, link.name);
        if (match) {
          record.push([
            target.title,
            undefined,
            `Unlinked note keyword: ${match[0]} => ${titleFormat(link)}(${link.origin})`,
          ]);
        }
      });
    isSubNote = target.title.startsWith(source.title + '/');
    isReverseLink = _target?.links.some((l) => l.title === source.title) || false;
  } else {
    //unknown note
    links.forEach((link) => {
      record.push([link.origin, undefined, `Unknown note link(${titleFormat(link)})`]);
    });

    //empty parent note
    if (source.parentTitle === target.title) {
      record.push([source.parentTitle, undefined, `Empty parent note(${source.title})`]);
    }
  }

  existData.matrix[target.title] = {
    record,
    matrixSource: {
      updated: target.updated,
      isReverseLink,
      isSubNote,
    },
  };
  return record;
};

const getDataAggregate = (source: ProblemSource, boardCount: number): ProblemItem[] => {
  const aggregateRecords: ProblemItem[] = [];
  const matrixEntries = Object.values(problemCache[source.title].matrix);
  const parentNoteCount = source.parentTitle ? 1 : 0;

  let reverseLinkCount = 0;
  // let subNoteCount = 0;

  matrixEntries.forEach(({ matrixSource }) => {
    if (matrixSource.isReverseLink) reverseLinkCount++;
    // if (matrixSource.isSubNote) subNoteCount++;
  });

  // (연관 보드 수 + 역 노트링크 수 + 상위 노트) == 0
  if (source.raw.length > 0 && boardCount + reverseLinkCount + parentNoteCount === 0) {
    aggregateRecords.push([
      source.title,
      undefined,
      'Isolated note', // +
      // `\n(boards: ${boardCount}, reverse links: ${reverseLinkCount}, parent note: ${parentNoteCount})`,
    ]);
  }

  return aggregateRecords;
};

const getData = (userId: number | undefined, pages: Content[], boards: Content[]) => {
  const records: {
    title: string;
    path: string | undefined;
    paragraph: string | undefined;
    subtitles: string[];
  }[] = [];
  if (userId !== problemCacheUserId) {
    problemCache = {};
    problemCacheUserId = userId;
  }
  const titleSet = new Set(pages.map((v) => v.title));
  pages
    .map(getDataLinear)
    .flatMap(({ record, source }) => {
      const unknownPages = source.links
        .filter((v) => !titleSet.has(v.title))
        .map((v) => ({ title: v.title, updated: '' }));
      if (source.parentTitle && !titleSet.has(source.parentTitle)) {
        unknownPages.push({ title: source.parentTitle, updated: '' });
      }
      const boardCount = boards.filter((b) => b.option.BOARD_NOTE_IDS?.includes(source.id)).length;
      return [
        ...[...pages, ...unknownPages].flatMap((target) => getDataMatrix(source, target)),
        ...getDataAggregate(source, boardCount),
        ...record,
      ];
    })
    .forEach(([title, path, subtitle]) => {
      const i = records.findIndex((v) => v.title === title && v.path === path);
      if (i >= 0) {
        records[i].subtitles.push(subtitle);
      } else {
        const paragraph = path
          ?.split(',')
          .map((v) => base64Decode(v))
          .reverse()[0];
        records.push({ title, path, paragraph, subtitles: [subtitle] });
      }
    });
  return records;
};

export default (delay?: number) => {
  const { auth } = useAuthContext();
  const { data: pages = [], isLoading } = useNotePages();
  const { data: boards = [], isLoading: isBoardLoading } = useBoardPages();
  const [data, setData] = useState<{ title: string; paragraph?: string; subtitles: string[] }[]>();
  const timeoutRef = useRef<NodeJS.Timeout>();
  useEffect(() => {
    timeoutRef.current && clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setData(getData(auth.user?.id, pages, boards));
      timeoutRef.current = undefined;
    }, delay || 500);
  }, [pages, auth.user]);
  return { data: data || [], isLoading: isLoading || isBoardLoading || data === undefined };
};
