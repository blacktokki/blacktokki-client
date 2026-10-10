import { Paragraph, paragraphDescription } from '../../../components/HeaderSelectBar';
import type { BoardOption, Content } from '../../../types';
import {
  inferBoardCandidates,
  inferTopLevelBoardCandidates,
  BoardCandidate,
  TopLevelBoardCandidate,
  getBoardCandidateParagraphs,
} from '../inferBoardCandidates';
import type { TopicDashboardBoard, TopicDashboardCardItem, TopicDashboardBoardRow } from '../types';

/**
 * 특정 보드 후보를 기반으로 컬럼, 행, 카드 목록을 구성하여 TopicDashboardBoard를 생성한다.
 */
export function buildTopicDashboardBoard(
  candidate: BoardCandidate | TopLevelBoardCandidate,
  notes: readonly Content[],
  customOption?: BoardOption
): TopicDashboardBoard {
  const isTopLevel = 'grouping' in candidate && candidate.grouping === 'TOP_LEVEL_NOTES';
  const option = customOption ?? candidate.option;
  const headerLevel = option.BOARD_HEADER_LEVEL ?? 3;
  const useScrum = option.BOARD_TYPE === 'SCRUM';

  const noteMap = new Map(notes.filter((n) => n.type === 'NOTE').map((n) => [n.title, n]));

  let columnNotes: Content[] = [];
  if (isTopLevel) {
    columnNotes = (candidate as TopLevelBoardCandidate).columnNoteTitles
      .map((t) => noteMap.get(t))
      .filter((n): n is Content => n !== undefined);
  } else {
    columnNotes = [...noteMap.values()]
      .filter(
        (n) =>
          n.title.startsWith(candidate.title + '/') &&
          n.title.slice(candidate.title.length + 1).split('/').length === 1
      )
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
      );
  }

  const preDataAll = columnNotes.map((page) => {
    const paragraphs = getBoardCandidateParagraphs(page);
    return {
      page,
      paragraphs,
      rows: paragraphs.filter((v) => v.level + 1 === headerLevel),
    };
  });

  const commonRows: Paragraph[] = [{ title: '', path: '', header: '', level: 0 } as Paragraph];
  if (useScrum) {
    preDataAll.forEach((v) =>
      v.rows.forEach((r) => {
        if (r.title !== '' && !commonRows.some((r2) => r2.title === r.title)) {
          commonRows.push(r);
        }
      })
    );
  }

  const allCards: TopicDashboardCardItem[] = [];

  const rows: TopicDashboardBoardRow[] = commonRows.map((row) => {
    const columns = preDataAll.map((c) => {
      const { page, paragraphs, rows: colRows } = c;
      const relName = isTopLevel ? page.title : page.title.slice(candidate.title.length + 1);
      const parent = useScrum ? colRows.find((v) => v.title === row.title) || row : undefined;
      const firstRowIndex = useScrum
        ? paragraphs.findIndex((v) => v.level + 1 === headerLevel)
        : paragraphs.length;

      const items: TopicDashboardCardItem[] = paragraphs
        .filter(
          (v, i) =>
            v.level === headerLevel &&
            (row.title !== '' ? parent?.path && v.path.startsWith(parent.path) : i < firstRowIndex)
        )
        .map((v) => {
          const item: TopicDashboardCardItem = {
            id: `${page.title}#${v.path}`,
            title: v.title,
            description: paragraphDescription(paragraphs, v.path, false).trim(),
            boardTitle: candidate.title,
            noteTitle: page.title,
            columnName: relName,
            rowName: row.title,
            paragraph: { ...v, origin: page.title } as Paragraph & { origin: string },
          };
          allCards.push(item);
          return item;
        });

      return {
        name: relName,
        noteTitle: page.title,
        parentParagraph: parent,
        items,
      };
    });

    return {
      name: row.title,
      columns,
    };
  });

  return {
    candidate,
    title: candidate.title,
    option,
    isTopLevel,
    columnNotes,
    rows,
    cards: allCards,
    stats: {
      columnCount: columnNotes.length,
      cardCount: allCards.length,
      rowCount: commonRows.length,
    },
  };
}

export const buildTopicBoard = buildTopicDashboardBoard;

/**
 * 모든 보드 후보(경로 기반 및 최상위 노트 기반)를 추론하고 각 후보를 TopicDashboardBoard로 변환한다.
 */
export function extractTopicDashboards(
  notes: readonly Content[],
  boards: readonly Content[] = []
): TopicDashboardBoard[] {
  const pathCandidates = inferBoardCandidates(notes, boards);
  const topLevelCandidates = inferTopLevelBoardCandidates(notes, boards);
  const allCandidates = [...pathCandidates, ...topLevelCandidates];

  return allCandidates.map((candidate) => buildTopicDashboardBoard(candidate, notes));
}

export const extractTopicBoards = extractTopicDashboards;
