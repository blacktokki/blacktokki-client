import { Paragraph, paragraphByKey, parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { urlToNoteLink } from '../../components/SearchBar';
import type { BoardOption, Content } from '../../types';

type BoardElementKind = 'ROW' | 'COLUMN' | 'CARD';
type NoteElementKind = 'SUBNOTE' | 'PARAGRAPH';
type ReferencePatternKind = `${BoardElementKind}->${BoardElementKind}`;
type BoardOrigin = 'BOARD' | 'CANDIDATE';
type BoardDefinition = {
  title: string;
  option: BoardOption;
  origin: BoardOrigin;
  /** 경로로 묶이지 않는 최상위 후보의 실제 컬럼 노트 제목. */
  columnNoteTitles?: readonly string[];
};

type BoardReferenceElement = {
  id: string;
  containerType: 'BOARD';
  boardTitle: string;
  boardOrigin: BoardOrigin;
  kind: BoardElementKind;
  title: string;
  noteTitle: string;
  paragraph?: string;
  section?: string;
  path?: string;
};

type NoteReferenceElement = {
  id: string;
  containerType: 'NOTE';
  ownerNoteTitle: string;
  ownerNoteExists: boolean;
  kind: NoteElementKind;
  title: string;
  noteTitle: string;
  paragraph?: string;
  section?: string;
  path?: string;
};

type ReferenceElement = BoardReferenceElement | NoteReferenceElement;

type BoardReferenceMatch = {
  linkText: string;
  source: BoardReferenceElement;
  target: BoardReferenceElement;
  pattern: ReferencePatternKind;
  /** 실제 출발·대상 요소와 링크 텍스트를 명시하여 패턴의 qed를 뒷받침하는 개별 명제. */
  proposition: string;
};

type ReferenceLinkDecision = {
  source?: ReferenceElement;
  target?: ReferenceElement;
  pattern: ReferencePatternKind | null;
  /** 같은 쌍·조합의 링크가 2개 이상이고 대상 요소도 2개 이상이어서 집계에 포함되는지 여부. */
  isRepeatedPattern: boolean;
  exclusionReason?:
    | 'INVALID_LINK'
    | 'NOT_INTERNAL_NOTE_LINK'
    | 'SOURCE_NOT_ELEMENT'
    | 'UNRESOLVED_TARGET'
    | 'UNSUPPORTED_PATTERN'
    | 'SAME_BOARD';
};

type ReferenceLinkOccurrence = ReferenceLinkDecision & {
  linkText: string;
  sourceNoteTitle: string;
  sourceParagraph?: { paragraph: string; section?: string; path: string };
  /** 내부 링크에 지정된 대상 노트 제목. 대상 요소를 찾지 못해도 제목은 보존한다. */
  targetNoteTitle?: string;
  /** 같은 링크 발생의 보드→보드 판정 또는 제외 사유. */
  classifications: ReferenceLinkDecision[];
};

type ReferenceLinkClassification = Pick<
  ReferenceLinkOccurrence,
  'linkText' | 'sourceNoteTitle' | 'sourceParagraph' | 'targetNoteTitle'
> & {
  /** 네 그룹 기준이 모두 같은 실제 링크의 발생 횟수. */
  count: number;
  occurrences: ReferenceLinkOccurrence[];
};

type ExcludedLinkClassifications = Partial<
  Record<NonNullable<ReferenceLinkDecision['exclusionReason']>, ReferenceLinkClassification[]>
>;

type BoardReferencePattern = {
  sourceBoard: { title: string; origin: BoardOrigin };
  targetBoard: { title: string; origin: BoardOrigin };
  pattern: ReferencePatternKind;
  /** 이 보드 쌍과 요소 종류 조합에서 발견된 링크 발생 횟수. */
  count: number;
  matches: BoardReferenceMatch[];
  /** 소속 보드의 출발 요소에서 대상 요소로의 연결을 나타내는 한국어 결론. */
  qed: string;
};

type BoardReferencePatternGroup = Omit<BoardReferencePattern, 'qed'>;

type BoardColumn = {
  board: BoardDefinition;
  element: BoardReferenceElement;
  noteTitle: string;
  paragraphs: Paragraph[];
  owners: (BoardReferenceElement | undefined)[];
};

type ReferenceDocument = {
  noteTitle: string;
  paragraphs: Paragraph[];
  paragraphOwners: NoteReferenceElement[];
  subnote?: NoteReferenceElement;
  boardColumn?: BoardColumn;
};

/** 실제 보드와 보드 후보를 문장의 소속 이름으로 표현한다. */
function describeReferenceContainer(element: BoardReferenceElement): string {
  return `${element.boardOrigin === 'CANDIDATE' ? '보드 후보' : '보드'} '${element.boardTitle}'`;
}

/** 개별 링크의 명제에서 요소의 이름을 명시하며, 행·카드는 실제 컬럼 노트도 함께 표시한다. */
function describeReferenceElement(element: BoardReferenceElement): string {
  const labels: Record<BoardElementKind, string> = {
    ROW: '행',
    COLUMN: '열',
    CARD: '카드',
  };
  const column = element.kind !== 'COLUMN' ? `의 열 '${element.noteTitle}'에 있는` : '의';
  return `${describeReferenceContainer(element)}${column} ${labels[element.kind]} '${
    element.title
  }'`;
}

/** 실제 링크 하나가 어떤 출발 요소에서 어떤 대상 요소로 연결되는지 한국어 명제로 표현한다. */
function proposeReferenceMatch(
  linkText: string,
  source: BoardReferenceElement,
  target: BoardReferenceElement
): string {
  const link = linkText === '' ? '텍스트가 없는 링크' : `'${linkText}'`;
  return `${describeReferenceElement(source)}에 포함된 ${link}은(는) ${describeReferenceElement(
    target
  )}에 연결된다.`;
}

/** 반복 링크 패턴의 방향을 출발 요소에서 대상 요소로의 연결로 표현한다. */
function concludeReferencePattern(group: BoardReferencePatternGroup): string {
  const labels: Record<BoardElementKind, { subject: string; destination: string }> = {
    ROW: { subject: '행은(는)', destination: '행으로' },
    COLUMN: { subject: '열은(는)', destination: '열로' },
    CARD: { subject: '카드은(는)', destination: '카드로' },
  };
  const { source, target } = group.matches[0];
  return `${describeReferenceContainer(source)}의 ${
    labels[source.kind].subject
  } ${describeReferenceContainer(target)}의 ${labels[target.kind].destination} 연결된다.`;
}

/** 상대 링크와 문단 앵커를 링크가 저장된 원본 노트의 URL 기준으로 해석한다. */
function extractReferenceLinks(html: string, noteTitle: string) {
  if (typeof DOMParser === 'undefined') return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  const baseUrl = new URL(location.href);
  baseUrl.search = '';
  baseUrl.hash = '';
  baseUrl.searchParams.set('title', noteTitle);
  return Array.from(document.querySelectorAll('a')).map((anchor) => {
    const rawUrl = (anchor.getAttribute('href') ?? '').trim();
    let url = rawUrl;
    if (rawUrl) {
      try {
        const resolved = new URL(rawUrl, baseUrl);
        if (
          rawUrl.startsWith('?') &&
          !resolved.searchParams.has('title') &&
          (resolved.hash || resolved.searchParams.get('paragraph'))
        ) {
          resolved.searchParams.set('title', noteTitle);
        }
        url = resolved.href;
      } catch {
        // 잘못된 원본 주소도 반환하여 INVALID_LINK 판정에 남긴다.
      }
    }
    return { url, text: anchor.textContent?.trim() ?? '' };
  });
}

/**
 * 같은 노트북의 실제 보드와 보드 후보 사이에서 행/열/카드 조합 9가지의 반복 링크 패턴을 찾는다.
 * 같은 제목의 실제 보드가 있으면 그 설정을 우선하며, `inferBoardCandidates`와
 * `inferTopLevelBoardCandidates`의 결과를 합쳐 전달할 수 있다.
 * `columnNoteTitles`가 있으면 제목 경로 대신 지정된 실제 노트를 컬럼으로 사용한다.
 *
 * 보드→노트 및 노트→보드의 하위노트/소속 문단 조합 12가지는 탐지 대상에서 제외한다.
 * 노트가 실제 보드·후보와 같은 제목이어도 노트 역할을 유효한 패턴으로 추가하지 않는다.
 * 양쪽이 보드 요소로 판정되면 보드→보드 하나만 `patterns`와 `linkClassifications`에 남긴다.
 * 보드 역할이 없는 일반 노트·루트 본문 등으로 향하거나 그곳에서 출발하는 내부 링크는
 * 대상이 식별되면 `UNSUPPORTED_PATTERN`으로 분리한다. 노트 역할은 이 제외 판정의 설명에만 사용한다.
 *
 * 같은 출발·대상 보드 쌍의 같은 조합에서 링크가 2개 이상 발견되고,
 * `matches`의 논리적 대상 요소 ID도 2개 이상인 패턴만 반환한다.
 * 같은 대상만 반복 참조하는 링크도 유효 판정에 남기되 `isRepeatedPattern: false`로 표시한다.
 * 서로 다른 주소나 카드 하위 문단이 같은 카드로 해석되거나 여러 열의 같은 제목 행이
 * 하나의 공유 행이면 같은 대상이다. 다른 대상이 추가되면 기존 중복 참조도 모두 보존한다.
 * 개별 요소 ID와 주소는 집계 키에 포함하지 않는다. A의 카드 a1→B의 카드 b1과
 * A의 카드 a2→B의 카드 b2는 A→B의 CARD->CARD 하나로 합치며, count는 2다.
 * A→B와 B→A는 별개이고 같은 보드 내부 참조는 `SAME_BOARD`로 제외한다. 후보도 동일하다.
 *
 * `qed`는 보드 쌍과 요소 종류를 담은 한국어 결론이며, 각 `matches`의 `proposition`은
 * 실제 출발·대상 요소 이름과 링크 텍스트를 명시하여 그 결론을 뒷받침하는 개별 명제다.
 * 행·카드는 실제 컬럼 노트 이름도 표시하며, 인용에는 작은따옴표를 쓴다.
 * 예: 보드 후보 '개발 지식'의 카드은(는) 보드 후보 'DB'의 카드로 연결된다.
 * 예: 보드 후보 '개발 지식'의 열 '개발 지식/DB'에 있는 카드 'MySQL 정리'에 포함된
 * '설치'은(는) 보드 후보 'DB'의 열 'DB/MySQL'에 있는 카드 '설치'에 연결된다.
 * proposition과 qed의 주격 조사는 '은(는)'으로 통일하며, 빈 링크 텍스트는 '텍스트가 없는 링크'로 표현한다.
 *
 * 후보의 컬럼으로 지정된 하위노트 자체는 COLUMN, 선택한 헤더 수준의 문단은 CARD로 판정한다.
 * 스크럼의 바로 위 수준 문단은 ROW이고, 카드 하위 문단은 해당 CARD에, 나머지 문단은 COLUMN에 속한다.
 * 칸반에는 ROW 역할이 없다. 출발·대상을 같은 기준으로 판정하며 링크는 가장 가까운 요소에 귀속한다.
 * 실제 보드의 숨겨지는 카드는 보드 역할을 제외하지만, 후보는 전환 전 구조이므로 카드와 그 하위 문단을
 * 보드 요소로 유지한다. 같은 주소가 실제로 여러 번 작성되어 있으면 각각 별도의 링크 발생으로 센다.
 *
 * 대상은 내부 노트 링크의 제목, 문단/해시, section으로 확인한다. 열 노트 자체의 링크는 COLUMN이다.
 * 문단이 모호하면 특정 카드를 추측하지 않는다. 보드 제목에 문단이 지정된 링크도 행/카드가
 * 하나로 식별되면 인식한다. 보드 루트가 최상위 후보의 컬럼이기도 하면 그 노트의 문단을 우선하고,
 * 문단이 없을 때 하위 컬럼을 찾는다. 최상위 후보의 컬럼이 아닌 루트 본문은 보드 요소가 아니다.
 * 상대 href 및 제목 없는 #문단/?paragraph=문단은 원본 노트를 기준으로 해석한다.
 *
 * `linkClassifications`는 제외 사유가 없는 보드→보드 판정을 담고, 제외 발생은
 * `excludedLinkClassifications`에서 실제 발견된 사유별로 분리한다. 제외가 없으면 빈 객체다.
 * 각 목록은 `linkText`, `sourceNoteTitle`, `sourceParagraph`, `targetNoteTitle` 네 값이 모두 같은
 * 링크를 한 그룹으로 묶는다. sourceParagraph는 문단명·section·path를 비교하며 기본 본문은 생략한다.
 * 같은 네 값이어도 제외 사유가 다르면 별개이고 유효/제외 발생은 각각의 목록에 보존한다.
 * 내부 링크의 targetNoteTitle은 노트·문단을 찾지 못해도 보존하며, 주소는 응답 전체에서 제외한다.
 * 그룹 count는 실제 발생 횟수이고 occurrences에는 개별 판정을 보존한다. 링크 텍스트가 없으면 빈 문자열이다.
 * 각 발생의 classifications에는 유효한 보드→보드 판정 또는 pattern: null과 제외 사유를 담는다.
 * INVALID_LINK, NOT_INTERNAL_NOTE_LINK, SOURCE_NOT_ELEMENT, UNRESOLVED_TARGET,
 * UNSUPPORTED_PATTERN(보드↔노트/노트→노트), SAME_BOARD를 구분하고 식별된 출발·대상 정보도 보존한다.
 *
 * @param notes 같은 노트북의 노트 목록.
 * @param boards 같은 노트북의 실제 보드 목록.
 * @param candidates 기존 제목 경로 후보와 최상위 노트 그룹 후보를 합친 전환 후보 목록.
 * @returns 보드 간 반복 패턴의 존재 여부·개수·근거, 유효 링크 그룹과 사유별 제외 링크 그룹.
 */
export function findBoardReferencePatterns(
  notes: readonly Content[],
  boards: readonly Content[],
  candidates: readonly {
    title: string;
    option: BoardOption;
    columnNoteTitles?: readonly string[];
  }[]
): {
  hasRepeatedPatterns: boolean;
  patternCount: number;
  patterns: BoardReferencePattern[];
  linkClassifications: ReferenceLinkClassification[];
  excludedLinkClassifications: ExcludedLinkClassifications;
} {
  const definitions = new Map<string, BoardDefinition>();
  for (const candidate of candidates) {
    definitions.set(candidate.title, { ...candidate, origin: 'CANDIDATE' });
  }
  for (const board of boards) {
    if (board.type !== 'BOARD') continue;
    definitions.delete(board.title);
    if (board.option && 'BOARD_HEADER_LEVEL' in board.option) {
      definitions.set(board.title, { title: board.title, option: board.option, origin: 'BOARD' });
    }
  }

  const notesByParent = new Map<string, Content[]>();
  const noteMap = new Map(
    notes.filter((note) => note.type === 'NOTE').map((note) => [note.title, note])
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
  for (const note of noteMap.values()) {
    const slash = note.title.lastIndexOf('/');
    if (slash <= 0 || slash === note.title.length - 1) continue;
    const parent = note.title.slice(0, slash);
    const children = notesByParent.get(parent) ?? [];
    children.push(note);
    notesByParent.set(parent, children);
  }

  const columnsByNote = new Map<string, BoardColumn>();
  const columnsByBoard = new Map<string, BoardColumn[]>();
  for (const board of definitions.values()) {
    const level = board.option.BOARD_HEADER_LEVEL;
    if (!Number.isInteger(level) || level < 1 || level > 6) continue;
    const useScrum = board.option.BOARD_TYPE === 'SCRUM';
    const columnNotes = board.columnNoteTitles
      ? [...new Set(board.columnNoteTitles)]
          .map((title) => noteMap.get(title))
          .filter((note): note is Content => note !== undefined)
      : notesByParent.get(board.title) ?? [];
    const data = [...columnNotes]
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
      )
      .map((note) => {
        const paragraphs = getParagraphs(note);
        return { note, paragraphs, rows: paragraphs.filter((p) => p.level === level - 1) };
      });
    const commonRows = new Map<string, Paragraph>();
    if (useScrum) {
      for (const column of data) {
        for (const row of column.rows) {
          if (row.title !== '' && !commonRows.has(row.title)) commonRows.set(row.title, row);
        }
      }
    }

    const boardColumns: BoardColumn[] = [];
    for (const { note, paragraphs, rows } of data) {
      const createElement = (
        kind: BoardElementKind,
        paragraph?: Paragraph,
        index?: number
      ): BoardReferenceElement => ({
        id: JSON.stringify([
          board.title,
          kind,
          kind === 'ROW' ? paragraph?.title : note.title,
          kind === 'CARD' ? index : undefined,
        ]),
        containerType: 'BOARD',
        boardTitle: board.title,
        boardOrigin: board.origin,
        kind,
        title:
          paragraph?.title ??
          (note.title.startsWith(board.title + '/')
            ? note.title.slice(board.title.length + 1)
            : note.title),
        noteTitle: note.title,
        ...(paragraph
          ? { paragraph: paragraph.title, section: paragraph.autoSection, path: paragraph.path }
          : {}),
      });
      const element = createElement('COLUMN');
      const firstRowIndex = paragraphs.findIndex((p) => p.level === level - 1);
      let card: BoardReferenceElement | undefined;
      let row: BoardReferenceElement | undefined;
      let hiddenCard = false;
      const owners = paragraphs.map((paragraph, index) => {
        if (paragraph.level > 0) {
          if (paragraph.level <= level) {
            card = undefined;
            hiddenCard = false;
          }
          if (paragraph.level <= level - 1) row = undefined;
          if (useScrum && paragraph.level === level - 1 && paragraph.title !== '') {
            row = createElement('ROW', paragraph);
          }
          if (paragraph.level === level) {
            const visible =
              !useScrum ||
              index < firstRowIndex ||
              [...commonRows.values()].some((r) => {
                const parent = rows.find((p) => p.title === r.title) ?? r;
                return parent.path !== '' && paragraph.path.startsWith(parent.path);
              });
            hiddenCard = board.origin === 'BOARD' && !visible;
            if (!hiddenCard) card = createElement('CARD', paragraph, index);
          }
        }
        return hiddenCard ? undefined : card ?? row ?? element;
      });
      const column = { board, element, noteTitle: note.title, paragraphs, owners };
      boardColumns.push(column);
      columnsByNote.set(note.title, column);
    }
    columnsByBoard.set(board.title, boardColumns);
  }

  const documents: ReferenceDocument[] = [];
  const noteDocuments = new Map<string, ReferenceDocument>();
  for (const note of noteMap.values()) {
    const paragraphs = getParagraphs(note);
    const slash = note.title.lastIndexOf('/');
    const parent =
      slash > 0 && slash < note.title.length - 1 ? note.title.slice(0, slash) : undefined;
    let subnote: NoteReferenceElement | undefined;
    if (parent) {
      subnote = {
        id: JSON.stringify([parent, 'SUBNOTE', note.title]),
        containerType: 'NOTE',
        ownerNoteTitle: parent,
        ownerNoteExists: noteMap.has(parent),
        kind: 'SUBNOTE',
        title: note.title.slice(parent.length + 1),
        noteTitle: note.title,
      };
    }
    const paragraphOwners = paragraphs.map(
      (paragraph, index): NoteReferenceElement => ({
        id: JSON.stringify([note.title, 'PARAGRAPH', index]),
        containerType: 'NOTE',
        ownerNoteTitle: note.title,
        ownerNoteExists: true,
        kind: 'PARAGRAPH',
        title: paragraph.level === 0 ? note.title : paragraph.title,
        noteTitle: note.title,
        paragraph: paragraph.title,
        section: paragraph.autoSection,
        path: paragraph.path,
      })
    );
    const document = {
      noteTitle: note.title,
      paragraphs,
      paragraphOwners,
      subnote,
      boardColumn: columnsByNote.get(note.title),
    };
    documents.push(document);
    noteDocuments.set(note.title, document);
  }

  const resolveBoardTarget = (
    target: NonNullable<ReturnType<typeof urlToNoteLink>>
  ): BoardReferenceElement | undefined => {
    const column = columnsByNote.get(target.title);
    if (!target.paragraph) return column?.element;
    const matches = new Map<string, BoardReferenceElement>();
    if (column) {
      let paragraphFound = false;
      column.paragraphs.forEach((paragraph, index) => {
        if (!paragraphByKey(paragraph, target)) return;
        paragraphFound = true;
        const owner = column.owners[index];
        if (owner) matches.set(owner.id, owner);
      });
      if (paragraphFound) return matches.size === 1 ? matches.values().next().value : undefined;
    }
    for (const candidate of columnsByBoard.get(target.title) ?? []) {
      candidate.paragraphs.forEach((paragraph, index) => {
        if (!paragraphByKey(paragraph, target)) return;
        const owner = candidate.owners[index];
        if (owner && owner.kind !== 'COLUMN') matches.set(owner.id, owner);
      });
    }
    return matches.size === 1 ? matches.values().next().value : undefined;
  };

  const resolveNoteTargets = (
    target: NonNullable<ReturnType<typeof urlToNoteLink>>
  ): NoteReferenceElement[] => {
    const document = noteDocuments.get(target.title);
    if (!document) return [];
    if (!target.paragraph) {
      return document.subnote
        ? [document.subnote, document.paragraphOwners[0]]
        : [document.paragraphOwners[0]];
    }
    const matches = new Map<string, NoteReferenceElement>();
    document.paragraphs.forEach((paragraph, index) => {
      if (paragraph.level === 0 || !paragraphByKey(paragraph, target)) return;
      const owner = document.paragraphOwners[index];
      if (owner) matches.set(owner.id, owner);
    });
    const targets = matches.size === 1 ? [...matches.values()] : [];
    if (matches.size > 0 && document.subnote) targets.push(document.subnote);
    return targets;
  };

  const groups = new Map<string, BoardReferencePatternGroup>();
  const linkOccurrences: ReferenceLinkOccurrence[] = [];
  const classifiedGroups = new Map<ReferenceLinkDecision, BoardReferencePatternGroup>();
  for (const document of documents) {
    document.paragraphs.forEach((paragraph, index) => {
      const boardSource = document.boardColumn?.owners[index];
      const paragraphSource = document.paragraphOwners[index];
      const sources: ReferenceElement[] = [
        ...(boardSource ? [boardSource] : []),
        ...(paragraph.level === 0 && document.subnote
          ? [document.subnote, paragraphSource]
          : [paragraphSource, ...(document.subnote ? [document.subnote] : [])]),
      ];
      for (const link of extractReferenceLinks(
        (paragraph.header ?? '') + paragraph.description,
        document.noteTitle
      )) {
        const occurrence: ReferenceLinkOccurrence = {
          linkText: link.text,
          sourceNoteTitle: document.noteTitle,
          ...(paragraph.level > 0
            ? {
                sourceParagraph: {
                  paragraph: paragraph.title,
                  section: paragraph.autoSection,
                  path: paragraph.path,
                },
              }
            : {}),
          pattern: null,
          isRepeatedPattern: false,
          classifications: [],
        };
        linkOccurrences.push(occurrence);
        let targets: ReferenceElement[] = [];
        const exclude = (reason: ReferenceLinkDecision['exclusionReason']) => {
          occurrence.classifications.push({
            source: sources[0],
            target: targets[0],
            pattern: null,
            isRepeatedPattern: false,
            exclusionReason: reason,
          });
        };
        try {
          const noteLink = urlToNoteLink(link.url);
          if (!noteLink) {
            exclude('NOT_INTERNAL_NOTE_LINK');
            continue;
          }
          occurrence.targetNoteTitle = noteLink.title;
          const boardTarget = resolveBoardTarget(noteLink);
          targets = [...(boardTarget ? [boardTarget] : []), ...resolveNoteTargets(noteLink)];
        } catch {
          exclude('INVALID_LINK');
          continue;
        }
        if (sources.length === 0) {
          exclude('SOURCE_NOT_ELEMENT');
          continue;
        }
        if (targets.length === 0) {
          exclude('UNRESOLVED_TARGET');
          continue;
        }
        const countedKeys = new Set<string>();
        let hasSelfReference = false;
        for (const source of sources) {
          for (const target of targets) {
            if (source.containerType !== 'BOARD' || target.containerType !== 'BOARD') continue;
            const pattern: ReferencePatternKind = `${source.kind}->${target.kind}`;
            const sourceTitle = source.boardTitle;
            const targetTitle = target.boardTitle;
            if (sourceTitle === targetTitle) {
              hasSelfReference = true;
              continue;
            }
            const key = JSON.stringify([
              source.containerType,
              sourceTitle,
              target.containerType,
              targetTitle,
              pattern,
            ]);
            if (countedKeys.has(key)) continue;
            countedKeys.add(key);
            const classification: ReferenceLinkDecision = {
              source,
              target,
              pattern,
              isRepeatedPattern: false,
            };
            occurrence.classifications.push(classification);
            let group = groups.get(key);
            if (!group) {
              group = {
                sourceBoard: { title: sourceTitle, origin: source.boardOrigin },
                targetBoard: { title: targetTitle, origin: target.boardOrigin },
                pattern,
                count: 0,
                matches: [],
              };
              groups.set(key, group);
            }
            group.matches.push({
              linkText: link.text,
              source,
              target,
              pattern,
              proposition: proposeReferenceMatch(link.text, source, target),
            });
            group.count++;
            classifiedGroups.set(classification, group);
          }
        }
        if (occurrence.classifications.length === 0) {
          exclude(hasSelfReference ? 'SAME_BOARD' : 'UNSUPPORTED_PATTERN');
        }
      }
    });
  }
  const repeatedGroups = new Set(
    [...groups.values()].filter(
      (group) =>
        group.count >= 2 && new Set(group.matches.map((match) => match.target.id)).size >= 2
    )
  );
  for (const [classification, group] of classifiedGroups) {
    classification.isRepeatedPattern = repeatedGroups.has(group);
  }
  const linkGroups = new Map<string, ReferenceLinkClassification>();
  const excludedLinkGroups = new Map<
    NonNullable<ReferenceLinkDecision['exclusionReason']>,
    Map<string, ReferenceLinkClassification>
  >();
  for (const occurrence of linkOccurrences) {
    Object.assign(occurrence, occurrence.classifications[0]);
    const { linkText, sourceNoteTitle, sourceParagraph, targetNoteTitle } = occurrence;
    const key = JSON.stringify([
      linkText,
      sourceNoteTitle,
      sourceParagraph
        ? [sourceParagraph.paragraph, sourceParagraph.section ?? null, sourceParagraph.path]
        : null,
      targetNoteTitle ?? null,
    ]);
    let destinationGroups = linkGroups;
    if (occurrence.exclusionReason !== undefined) {
      let reasonGroups = excludedLinkGroups.get(occurrence.exclusionReason);
      if (!reasonGroups) {
        reasonGroups = new Map<string, ReferenceLinkClassification>();
        excludedLinkGroups.set(occurrence.exclusionReason, reasonGroups);
      }
      destinationGroups = reasonGroups;
    }
    let group = destinationGroups.get(key);
    if (!group) {
      group = {
        linkText,
        sourceNoteTitle,
        ...(sourceParagraph ? { sourceParagraph } : {}),
        ...(targetNoteTitle !== undefined ? { targetNoteTitle } : {}),
        count: 0,
        occurrences: [],
      };
      destinationGroups.set(key, group);
    }
    group.count++;
    group.occurrences.push(occurrence);
  }
  const excludedLinkClassifications: ExcludedLinkClassifications = {};
  for (const [reason, reasonGroups] of excludedLinkGroups) {
    excludedLinkClassifications[reason] = [...reasonGroups.values()];
  }
  const patterns = [...repeatedGroups]
    .map((group) => ({ ...group, qed: concludeReferencePattern(group) }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.sourceBoard.title.localeCompare(b.sourceBoard.title) ||
        a.targetBoard.title.localeCompare(b.targetBoard.title) ||
        a.pattern.localeCompare(b.pattern)
    );
  return {
    hasRepeatedPatterns: patterns.length > 0,
    patternCount: patterns.length,
    patterns,
    linkClassifications: [...linkGroups.values()],
    excludedLinkClassifications,
  };
}
