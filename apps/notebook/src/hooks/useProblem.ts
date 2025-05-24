import { useMemo } from 'react';

import { parseHtmlToSections } from '../components/HeaderSelectBar';
import { getNoteLinks } from '../components/SearchBar';
import { getSplitTitle, sectionDescription } from '../screens/main/notepage/NotePageScreen';
import { useNotePages } from './useNoteStorage';

function findEmptyLists(html: string): string[] {
  const regex = /<(ol|ul)\b[^>]*>([\s\n\r]*)<\/\1>/gi;
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    matches.push(match[0]); // 전체 태그를 반환
  }

  return matches;
}

export default () => {
  const { data: pages = [], isLoading } = useNotePages();
  const data = useMemo(() => {
    const records: Record<
      string,
      {
        subtitles: string[];
        sections: Record<string, string[]>;
      }
    > = {};
    const push = (title: string, section: string | undefined, subtitle: string) => {
      if (records[title] === undefined) {
        records[title] = { subtitles: [], sections: {} };
      }
      const record = records[title];
      if (section !== undefined) {
        if (record.sections[section] === undefined) {
          record.sections[section] = [];
        }
        record.sections[section].push(subtitle);
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
            link.section === undefined ||
            parseHtmlToSections(linkPage.description).find((v2) => v2.title === link.section)
          ) {
            return;
          }
        }
        push(
          link.title,
          link.section,
          (link.section === undefined ? 'Unknown note link' : 'Unknown section link') +
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
      const paragraph = parseHtmlToSections(page.description || '');
      const emptyParagraph = paragraph.filter(
        (v2) => v2.level !== 0 && sectionDescription(paragraph, v2.title, false).trim() === ''
      );
      const emptyList = paragraph.filter((v2) => findEmptyLists(v2.description).length > 0);
      emptyParagraph.forEach((v2) =>
        push(page.title, v2.level === 0 ? undefined : v2.title, 'Empty section')
      );
      emptyList.forEach((v2) =>
        push(page.title, v2.level === 0 ? undefined : v2.title, 'Empty list')
      );
    });

    return Object.entries(records).flatMap(([title, record]) => {
      return [
        { title, subtitles: record.subtitles },
        ...Object.entries(record.sections).map(([section, subtitles]) => ({
          title,
          section,
          subtitles,
        })),
      ];
    });
  }, [pages]);
  return { data, isLoading };
};
