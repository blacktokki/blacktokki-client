import { Paragraph, parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import type { BoardOption, Content } from '../../types';

export type BoardCandidate = {
  title: string;
  noteExists: boolean;
  option: BoardOption;
  stats: {
    columnCount: number;
    activeColumnCount: number;
    cardCount: number;
    /** 같은 제목을 합친 이름 있는 행의 수. 카드가 없는 행도 포함한다. */
    rowCount: number;
    sharedRowCount: number;
    scrumPreservesCards: boolean;
  };
};

export type TopLevelBoardCandidate = BoardCandidate & {
  /** 제목 경로 대신 최상위 노트를 직접 컬럼으로 묶은 가상 후보. */
  grouping: 'TOP_LEVEL_NOTES';
  columnNoteTitles: string[];
};

type BoardCandidateCriteria = {
  minActiveColumns: number;
  minCards: number;
  minRows: number;
  minSharedRows: number;
};

/** 두 후보 추론에서 공통으로 사용할 조건·노트 색인·문단 분석 캐시를 구성한다. */
function createBoardCandidateContext(
  notes: readonly Content[],
  boards: readonly Content[],
  criteria: Partial<BoardCandidateCriteria>
) {
  const rules: BoardCandidateCriteria = {
    minActiveColumns: 2,
    minCards: 1,
    minRows: 1,
    minSharedRows: 0,
    ...criteria,
  };
  const noteMap = new Map(
    notes.filter((note) => note.type === 'NOTE').map((note) => [note.title, note])
  );
  const boardTitles = new Set(
    boards.filter((board) => board.type === 'BOARD').map((board) => board.title)
  );
  const paragraphCache = new Map<string, Paragraph[]>();
  const getParagraphs = (note: Content): Paragraph[] => {
    let paragraphs = paragraphCache.get(note.title);
    if (!paragraphs) {
      paragraphs = parseHtmlToParagraphs(note.description ?? '');
      paragraphCache.set(note.title, paragraphs);
    }
    return paragraphs;
  };
  return { rules, noteMap, boardTitles, getParagraphs };
}

/** 같은 헤더 수준에서 카드와 행, 카드가 실제로 배치된 이름 있는 행을 식별한다. */
function analyzeBoardColumn(paragraphs: readonly Paragraph[], level: number) {
  const rows = paragraphs.filter((paragraph) => paragraph.level === level - 1);
  const cards = paragraphs
    .map((paragraph, index) => ({ paragraph, index }))
    .filter(({ paragraph }) => paragraph.level === level);
  const activeRowTitles = new Set(
    rows
      .filter(
        (row) =>
          row.title !== '' &&
          row.path !== '' &&
          cards.some(({ paragraph }) => paragraph.path.startsWith(row.path + ','))
      )
      .map((row) => row.title)
  );
  return {
    rows,
    cards,
    activeRowTitles,
    firstRowIndex: paragraphs.findIndex((paragraph) => paragraph.level === level - 1),
  };
}

/** 컬럼으로 묶을 노트의 카드·행 통계를 분석하고 가장 적합한 보드 설정을 선택한다. */
function analyzeBoardCandidateColumns(
  title: string,
  children: readonly Content[],
  context: ReturnType<typeof createBoardCandidateContext>,
  headerLevels: readonly number[] = [2, 3, 4, 5, 6]
): BoardCandidate | undefined {
  const { rules, noteMap, getParagraphs } = context;
  const columns = [...children]
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
    )
    .map(getParagraphs);
  const levels: BoardCandidate[] = [];

  for (const level of headerLevels) {
    const columnData = columns.map((paragraphs) => analyzeBoardColumn(paragraphs, level));
    const columnRows = columnData.map((column) => column.rows);
    const commonRows = new Map<string, (typeof columnRows)[number][number]>();
    for (const rows of columnRows) {
      for (const row of rows) {
        if (row.title !== '' && !commonRows.has(row.title)) commonRows.set(row.title, row);
      }
    }

    let cardCount = 0;
    let activeColumnCount = 0;
    let scrumPreservesCards = true;
    const rowUsage = new Map<string, number>();

    columnData.forEach(({ cards, firstRowIndex }, columnIndex) => {
      if (cards.length > 0) activeColumnCount++;
      cardCount += cards.length;
      const rows = columnRows[columnIndex];
      const usedRows = new Set<string>();

      for (const { paragraph, index } of cards) {
        const matchingRows = [...commonRows.values()].filter((row) => {
          const parent = rows.find((item) => item.title === row.title) ?? row;
          return parent.path !== '' && paragraph.path.startsWith(parent.path);
        });
        // RecentBoardSection의 빈 행을 포함한 실제 표시 조건을 재현한다.
        const occurrences = matchingRows.length + (index < firstRowIndex ? 1 : 0);
        if (occurrences !== 1) scrumPreservesCards = false;
        matchingRows.forEach((row) => usedRows.add(row.title));
      }
      usedRows.forEach((rowTitle) => rowUsage.set(rowTitle, (rowUsage.get(rowTitle) ?? 0) + 1));
    });

    if (activeColumnCount < rules.minActiveColumns || cardCount < rules.minCards) continue;
    const rowCount = commonRows.size;
    const sharedRowCount = [...rowUsage.values()].filter((count) => count >= 2).length;
    const useScrum =
      scrumPreservesCards && rowCount >= rules.minRows && sharedRowCount >= rules.minSharedRows;

    levels.push({
      title,
      noteExists: noteMap.has(title),
      option: { BOARD_TYPE: useScrum ? 'SCRUM' : 'KANBAN', BOARD_HEADER_LEVEL: level },
      stats: {
        columnCount: columns.length,
        activeColumnCount,
        cardCount,
        rowCount,
        sharedRowCount,
        scrumPreservesCards,
      },
    });
  }

  levels.sort(compareBoardCandidateLevels);
  return levels[0];
}

/** 카드 수·활성 컬럼 수·스크럼 적합성·기본 H3 순으로 헤더 수준을 선택한다. */
function compareBoardCandidateLevels(a: BoardCandidate, b: BoardCandidate): number {
  return (
    b.stats.cardCount - a.stats.cardCount ||
    b.stats.activeColumnCount - a.stats.activeColumnCount ||
    Number(b.option.BOARD_TYPE === 'SCRUM') - Number(a.option.BOARD_TYPE === 'SCRUM') ||
    Number(b.option.BOARD_HEADER_LEVEL === 3) - Number(a.option.BOARD_HEADER_LEVEL === 3) ||
    a.option.BOARD_HEADER_LEVEL - b.option.BOARD_HEADER_LEVEL
  );
}

/** 카드 수·활성 컬럼 수·제목 순으로 후보를 정렬한다. */
function compareBoardCandidates(a: BoardCandidate, b: BoardCandidate): number {
  return (
    b.stats.cardCount - a.stats.cardCount ||
    b.stats.activeColumnCount - a.stats.activeColumnCount ||
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * 같은 노트북의 노트와 보드를 받아 칸반/스크럼 전환 후보를 반환한다.
 *
 * 노트 제목의 경로에서 직계 하위 노트를 열로 묶고, H2~H6 문단을 카드로 평가한다.
 * 기본 후보 조건은 카드가 있는 열 2개 이상과 카드 1개 이상이며, 기존 보드는 제외한다.
 * 부모 경로에 실제 노트가 없어도 후보로 반환하고 `noteExists`로 존재 여부를 표시한다.
 *
 * 스크럼의 행은 카드 수준 바로 위 헤더의 제목으로 구성한다. 이름 없는 행은 제외하고,
 * 같은 제목은 열 간에 합쳐 하나로 센다. 카드가 없는 행도 이름이 있으면 포함한다.
 * 행의 수가 `minRows` 이상이면 스크럼을 추천하며, 기본값은 1이다.
 * `minSharedRows`는 여러 열에 카드가 배치된 공유 행의 최소 수이며, 기본값은 0이다.
 * 행에 분류된 카드의 비율은 추천 조건으로 사용하지 않는다.
 * 현재 보드 렌더링 규칙상 카드가 누락되거나 중복 표시되는 경우에는 칸반을 추천한다.
 *
 * 부모 경로별로 카드 수, 카드가 있는 열 수, 스크럼 적합 여부, 기본 H3 순으로
 * 헤더 수준을 선택한다. 최종 후보는 카드 수와 카드가 있는 열 수의 내림차순으로 정렬한다.
 *
 * @param notes 같은 노트북에 속한 노트 목록.
 * @param boards 같은 노트북에 이미 생성된 보드 목록.
 * @param criteria 최소 열/카드/행/공유 행 수에 대한 기본값 재정의.
 * @returns 부모 경로별 권장 보드 설정과 열/카드/행 통계를 포함한 후보 목록.
 */
export function inferBoardCandidates(
  notes: readonly Content[],
  boards: readonly Content[] = [],
  criteria: Partial<BoardCandidateCriteria> = {}
): BoardCandidate[] {
  const context = createBoardCandidateContext(notes, boards, criteria);
  const { noteMap, boardTitles } = context;
  const childrenByTitle = new Map<string, Content[]>();
  for (const note of noteMap.values()) {
    const slash = note.title.lastIndexOf('/');
    if (slash <= 0 || slash === note.title.length - 1) continue;
    const title = note.title.slice(0, slash);
    const children = childrenByTitle.get(title) ?? [];
    children.push(note);
    childrenByTitle.set(title, children);
  }

  const candidates: BoardCandidate[] = [];
  for (const [title, children] of childrenByTitle) {
    if (boardTitles.has(title)) continue;
    const candidate = analyzeBoardCandidateColumns(title, children, context);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort(compareBoardCandidates);
}

/**
 * 최상위 노트끼리 컬럼으로 묶을 수 있는 가상 보드 후보를 반환한다.
 *
 * 제목에 `/`가 없는 실제 NOTE만 대상으로 H2~H6 카드 수준을 각각 검사한다.
 * 같은 카드 수준에서 카드가 배치된 이름 있는 행을 공유하는 노트들을 연결하여 그룹을 만든다.
 * A와 B가 'DB' 행을, B와 C가 'API' 행을 공유하면 세 노트는 한 그룹이 된다.
 * 이름만 같고 카드가 없는 행이나 서로 다른 헤더 수준의 행은 연결 근거로 쓰지 않는다.
 * 공유 행 수는 각 노트의 실제 카드 부모 행을 기준으로 같은 이름을 합쳐 센다.
 * 기본 조건은 카드가 있는 컬럼 2개 이상, 카드 1개 이상, 공유 행 1개 이상이다.
 * `minSharedRows`는 이 함수에서 후보 포함 조건에도 적용하며, 0이어도 공통 행은 1개 필요하다.
 * 스크럼/칸반 추천, 카드·행 통계와 헤더 수준 선택은 `inferBoardCandidates`와 공통 코드를 쓴다.
 *
 * 가능한 그룹 중 카드 수·활성 컬럼 수·스크럼 적합성·기본 H3 순으로 후보를 선택한다.
 * 선택된 노트는 이후 최상위 후보에서 빼고 나머지 노트의 연결을 다시 검사하므로,
 * 같은 최상위 노트를 여러 가상 후보의 컬럼에 중복 배치하지 않는다.
 * 기존 제목 경로 기반 후보는 별도로 유지하며, 해당 후보의 루트 노트도 최상위 컬럼이 될 수 있다.
 *
 * 가상 제목은 컬럼 노트 이름을 정렬하여 `Board(A, B, ...)` 형식으로 표기한다.
 * 실제 노트·보드·제목 경로와 충돌하면 `Board(A, B, ...) (2)`처럼 번호를 붙인다.
 * `noteExists`는 false이고, `grouping: TOP_LEVEL_NOTES`와 실제 컬럼의 `columnNoteTitles`를 반환한다.
 * 노트 제목과 데이터는 바꾸지 않으며, 이 목록을 기존 후보에 합쳐 참조 패턴 함수에 전달할 수 있다.
 *
 * @param notes 같은 노트북의 노트 목록.
 * @param boards 같은 노트북의 실제 보드 목록.
 * @param criteria 컬럼·카드·행·공유 행의 최소 조건 재정의.
 * @returns 서로 겹치지 않는 최상위 노트 그룹별 보드 설정·컬럼 목록·통계.
 */
export function inferTopLevelBoardCandidates(
  notes: readonly Content[],
  boards: readonly Content[] = [],
  criteria: Partial<BoardCandidateCriteria> = {}
): TopLevelBoardCandidate[] {
  const context = createBoardCandidateContext(notes, boards, { minSharedRows: 1, ...criteria });
  const requiredSharedRows = Math.max(1, context.rules.minSharedRows);
  const remaining = new Map(
    [...context.noteMap].filter(([title]) => title.trim() !== '' && !title.includes('/'))
  );
  const reservedTitles = new Set([...context.noteMap.keys(), ...context.boardTitles]);
  for (const title of context.noteMap.keys()) {
    for (let slash = title.indexOf('/'); slash >= 0; slash = title.indexOf('/', slash + 1)) {
      reservedTitles.add(title.slice(0, slash));
    }
  }
  const candidates: TopLevelBoardCandidate[] = [];
  while (remaining.size >= 2) {
    const possible: TopLevelBoardCandidate[] = [];
    for (let level = 2; level <= 6; level++) {
      const rowMembers = new Map<string, string[]>();
      const columnRows = new Map<string, Set<string>>();
      for (const note of remaining.values()) {
        const { activeRowTitles } = analyzeBoardColumn(context.getParagraphs(note), level);
        if (activeRowTitles.size === 0) continue;
        columnRows.set(note.title, activeRowTitles);
        for (const row of activeRowTitles) {
          const members = rowMembers.get(row) ?? [];
          members.push(note.title);
          rowMembers.set(row, members);
        }
      }
      const pending = new Set(columnRows.keys());
      while (pending.size > 0) {
        const first = pending.values().next().value;
        if (first === undefined) break;
        pending.delete(first);
        const titles = [first];
        for (let index = 0; index < titles.length; index++) {
          for (const row of columnRows.get(titles[index]) ?? []) {
            for (const title of rowMembers.get(row) ?? []) {
              if (pending.delete(title)) titles.push(title);
            }
          }
        }
        const sharedRowTitles = new Set<string>();
        for (const title of titles) {
          for (const row of columnRows.get(title) ?? []) {
            if ((rowMembers.get(row)?.length ?? 0) >= 2) sharedRowTitles.add(row);
          }
        }
        if (sharedRowTitles.size < requiredSharedRows) continue;
        const columns = titles
          .map((title) => remaining.get(title))
          .filter((note): note is Content => note !== undefined);
        const candidate = analyzeBoardCandidateColumns('', columns, context, [level]);
        if (!candidate) continue;
        possible.push({
          ...candidate,
          stats: { ...candidate.stats, sharedRowCount: sharedRowTitles.size },
          grouping: 'TOP_LEVEL_NOTES',
          columnNoteTitles: titles.sort((a, b) => a.localeCompare(b)),
        });
      }
    }
    possible.sort(
      (a, b) =>
        compareBoardCandidateLevels(a, b) ||
        a.columnNoteTitles.join('\0').localeCompare(b.columnNoteTitles.join('\0'))
    );
    const candidate = possible[0];
    if (!candidate) break;
    const baseTitle = `Board(${candidate.columnNoteTitles.join(', ')})`;
    let suffix = 1;
    let title = baseTitle;
    while (reservedTitles.has(title)) title = `${baseTitle} (${++suffix})`;
    reservedTitles.add(title);
    candidates.push({ ...candidate, title, noteExists: false });
    for (const noteTitle of candidate.columnNoteTitles) remaining.delete(noteTitle);
  }
  return candidates.sort(compareBoardCandidates);
}
