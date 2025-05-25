import { toRaw } from '@blacktokki/editor';
import { useMemo } from 'react';

import { parseHtmlToParagraphs } from '../components/HeaderSelectBar';
import { getNoteLinks } from '../components/SearchBar';
import { cleanAndMergeTDs } from '../components/TimerTag';
import { getSplitTitle, paragraphDescription } from '../screens/main/notepage/NotePageScreen';
import { useNotePages } from './useNoteStorage';

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

export default () => {
  const { data: pages = [], isLoading } = useNotePages();
  const data = useMemo(() => {
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
  }, [pages]);
  return { data, isLoading };
};
