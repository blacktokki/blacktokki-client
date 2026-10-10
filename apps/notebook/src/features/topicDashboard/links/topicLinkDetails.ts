import { findBoardReferencePatterns } from './findBoardReferencePatterns';
import { getSplitTitle } from '../../../hooks/useNoteStorage';
import { getBoardCandidateParagraphs } from '../inferBoardCandidates';

export type TopicLinkResult = ReturnType<typeof findBoardReferencePatterns>;
export type TopicLinkPattern = TopicLinkResult['patterns'][number];
export type TopicLinkMatch = TopicLinkPattern['matches'][number];
export type TopicLinkElement = TopicLinkMatch['source'];
export type TopicConnectionSelection = {
  title: string;
  kind?: TopicLinkElement['kind'];
};
export type TopicLinkOccurrence =
  TopicLinkResult['linkClassifications']['potentialLinkClassifications'][number]['occurrences'][number];

export const elementLabels = {
  ROW: '분류',
  COLUMN: '컬럼',
  CARD: '카드',
  SUBNOTE: '하위노트',
  PARAGRAPH: '하위 문단',
} as const;

/**
 * 세 목록의 표시 건수 합계를 분모로, 실제 링크와 제안의 0.5배를 분자로 계산한다.
 * 여러 규칙은 건수를 합산하여 카드 부제목과 묶인 연결선에서 같은 계산 기준을 사용한다.
 */
export function getTopicConnectionRatio(
  details: readonly Pick<
    ReturnType<typeof buildTopicLinkDetails>[number],
    'links' | 'proposals' | 'remainingSources'
  >[]
) {
  let weighted = 0;
  let total = 0;
  for (const { links, proposals, remainingSources } of details) {
    weighted += links.length + proposals.length * 0.5;
    total += links.length + proposals.length + remainingSources.length;
  }
  return total > 0 ? weighted / total : 0;
}

export function elementLabel(element: TopicLinkElement): string {
  return `${element.noteTitle}${element.kind === 'COLUMN' ? '' : ` > ${element.title}`}`;
}

const targetKey = (target: TopicLinkMatch['target']) =>
  JSON.stringify(
    'id' in target ? [target.id] : target.candidateElements.map((element) => element.id).sort()
  );

/** 같은 후보 범위의 연결과 개별 연결을 구분하여 이미 연결된 대상만 제안에서 제외한다. */
function isConnected(match: TopicLinkMatch, actual: TopicLinkMatch[]): boolean {
  const connected = actual.filter((link) => link.source.id === match.source.id);
  return (
    connected.some((link) => targetKey(link.target) === targetKey(match.target)) ||
    (!('id' in match.target) &&
      match.target.candidateElements.every((element) =>
        connected.some((link) => 'id' in link.target && link.target.id === element.id)
      ))
  );
}

/**
 * 추천이 없는 요소도 표시하기 위한 출발 요소 목록이다. 패턴 판정을 새로 수행하지 않는다.
 * findBoardReferencePatterns와 같은 논리적 ID와 열 소속 우선순위를 사용하고,
 * 실제 스크럼에서 숨겨지는 카드는 제외하되 전환 후보의 카드는 보존한다.
 */
function collectSourceElements(
  notes: Parameters<typeof findBoardReferencePatterns>[0],
  boards: Parameters<typeof findBoardReferencePatterns>[1],
  candidates: Parameters<typeof findBoardReferencePatterns>[2]
): TopicLinkElement[] {
  type BoardElement = Extract<TopicLinkElement, { containerType: 'BOARD' }>;
  type Definition = (typeof candidates)[number] & { origin: BoardElement['boardOrigin'] };
  const definitions = new Map<string, Definition>();
  for (const candidate of candidates)
    definitions.set(candidate.title, { ...candidate, origin: 'CANDIDATE' });
  for (const board of boards) {
    if (board.type !== 'BOARD' || !board.option || !('BOARD_HEADER_LEVEL' in board.option))
      continue;
    definitions.delete(board.title);
    definitions.set(board.title, { title: board.title, option: board.option, origin: 'BOARD' });
  }
  const noteMap = new Map(
    notes.filter((note) => note.type === 'NOTE').map((note) => [note.title, note])
  );
  const columns = new Map<string, BoardElement[]>();
  for (const board of definitions.values()) {
    const level = board.option.BOARD_HEADER_LEVEL;
    if (!Number.isInteger(level) || level < 1 || level > 6) continue;
    const data = (
      board.columnNoteTitles
        ? [...new Set(board.columnNoteTitles)].flatMap((title) => noteMap.get(title) ?? [])
        : [...noteMap.values()].filter((note) => getSplitTitle(note.title)[0] === board.title)
    )
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
      )
      .map((note) => {
        const paragraphs = getBoardCandidateParagraphs(note);
        return { note, paragraphs, rows: paragraphs.filter((p) => p.level === level - 1) };
      });
    const commonRows = new Map<string, (typeof data)[number]['rows'][number]>();
    for (const { rows } of data) {
      for (const row of rows) {
        if (row.title && !commonRows.has(row.title)) commonRows.set(row.title, row);
      }
    }
    for (const { note, paragraphs, rows } of data) {
      const elements: BoardElement[] = [];
      const add = (kind: BoardElement['kind'], index?: number) => {
        const paragraph = index === undefined ? undefined : paragraphs[index];
        elements.push({
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
      };
      add('COLUMN');
      const scrum = board.option.BOARD_TYPE === 'SCRUM';
      const firstRow = paragraphs.findIndex((p) => p.level === level - 1);
      paragraphs.forEach((paragraph, index) => {
        if (scrum && paragraph.level === level - 1 && paragraph.title) add('ROW', index);
        if (paragraph.level !== level) return;
        const visible =
          !scrum ||
          index < firstRow ||
          [...commonRows.values()].some((row) => {
            const parent = rows.find((p) => p.title === row.title) ?? row;
            return parent.path !== '' && paragraph.path.startsWith(parent.path);
          });
        if (board.origin === 'CANDIDATE' || visible) add('CARD', index);
      });
      columns.set(note.title, elements);
    }
  }
  const noteElements: TopicLinkElement[] = [];
  for (const note of noteMap.values()) {
    if (columns.has(note.title)) continue;
    const [parent, title] = getSplitTitle(note.title);
    if (parent && title && noteMap.has(parent))
      noteElements.push({
        id: JSON.stringify([parent, 'SUBNOTE', note.title]),
        containerType: 'NOTE',
        ownerNoteTitle: parent,
        ownerNoteExists: true,
        kind: 'SUBNOTE',
        title,
        noteTitle: note.title,
      });
    getBoardCandidateParagraphs(note).forEach((paragraph, index) =>
      noteElements.push({
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
  }
  return [...[...columns.values()].flat(), ...noteElements];
}

/**
 * 추론 결과를 표시용 목록으로 나눈다. 추천 문단은 소속 카드의 대표 문단 대신 실제 발생 위치를 사용한다.
 * 실제·잠재 링크의 반복 발생은 같은 편집 제안으로 묶는다.
 * 나머지 출발 요소에는 이 규칙의 실제 링크도 편집 제안도 없는 요소만 포함한다.
 * 연결 대상을 확정하거나 원문을 변경하지 않으며, 편집과 링크 생성은 기존 노트 편집기에서 처리한다.
 */
export function buildTopicLinkDetails(
  result: TopicLinkResult,
  notes: Parameters<typeof findBoardReferencePatterns>[0],
  boards: Parameters<typeof findBoardReferencePatterns>[1],
  candidates: Parameters<typeof findBoardReferencePatterns>[2]
) {
  const sources = collectSourceElements(notes, boards, candidates);
  const occurrences = result.linkClassifications.potentialLinkClassifications.flatMap(
    (group) => group.occurrences
  );
  return result.patterns.map((pattern) => {
    const actual = pattern.matches.filter((match) => match.referenceType === 'LINK');
    const detectedSourceIds = new Set(actual.map((match) => match.source.id));
    const links = new Map<string, { match: TopicLinkMatch; count: number }>();
    for (const match of actual) {
      const key = JSON.stringify([
        match.source.id,
        match.source.noteTitle,
        match.source.path,
        targetKey(match.target),
        match.linkText,
      ]);
      const entry = links.get(key);
      if (entry) entry.count++;
      else links.set(key, { match, count: 1 });
    }
    const recommended = new Set(pattern.recommendationSources.map((source) => source.id));
    const proposals = new Map<
      string,
      {
        match: TopicLinkMatch;
        occurrence: TopicLinkOccurrence;
        targets: TopicLinkElement[];
        count: number;
      }
    >();
    for (const occurrence of occurrences) {
      const match = pattern.matches.find(
        (item) =>
          item.referenceType === 'POTENTIAL' &&
          item.linkText === occurrence.linkText &&
          occurrence.classifications.some(
            (decision) => decision.source === item.source && decision.target === item.target
          )
      );
      if (!match || !recommended.has(match.source.id) || isConnected(match, actual)) continue;
      const key = JSON.stringify([
        match.source.id,
        occurrence.sourceNoteTitle,
        occurrence.sourceParagraph?.path,
        occurrence.sourcePart,
        match.linkText,
        targetKey(match.target),
      ]);
      const entry = proposals.get(key);
      if (entry) entry.count++;
      else {
        const elements = 'id' in match.target ? [match.target] : match.target.candidateElements;
        const targets = elements.filter((target) => !isConnected({ ...match, target }, actual));
        proposals.set(key, { match, occurrence, targets, count: 1 });
      }
    }
    const remaining = new Map<string, TopicLinkElement>();
    for (const source of sources) {
      if (
        source.containerType === pattern.matches[0].source.containerType &&
        (source.containerType === 'BOARD' ? source.boardTitle : source.ownerNoteTitle) ===
          pattern.sourceBoard.title &&
        source.kind === pattern.matches[0].source.kind &&
        !recommended.has(source.id) &&
        !detectedSourceIds.has(source.id) &&
        !remaining.has(source.id)
      )
        remaining.set(source.id, source);
    }
    return {
      pattern,
      links: [...links.values()],
      proposals: [...proposals.values()],
      remainingSources: [...remaining.values()],
    };
  });
}

/** 상위 카드는 전체 유형, 하위 노드는 해당 유형을 선택한다. 다른 보드·노트의 선택은 유지한다. */
export function toggleTopicConnectionSelection(
  selections: TopicConnectionSelection[],
  selection: TopicConnectionSelection
) {
  const selected = selections.some(
    (item) => item.title === selection.title && item.kind === selection.kind
  );
  const remaining = selections.filter(
    (item) =>
      item.title !== selection.title ||
      (selection.kind !== undefined && item.kind !== undefined && item.kind !== selection.kind)
  );
  return selected ? remaining : [...remaining, selection];
}

/** 보드·노트 이름과 선택한 요소 유형이 일치하는 출발 또는 대상을 확인한다. */
export function isTopicConnectionSelected(
  selections: TopicConnectionSelection[],
  endpoint: TopicConnectionSelection
) {
  return selections.some(
    (selection) =>
      selection.title === endpoint.title &&
      (selection.kind === undefined || selection.kind === endpoint.kind)
  );
}

/** 선택한 보드·노트 및 요소 유형이 출발 또는 대상인 규칙을 함께 표시한다. */
export function filterTopicConnections(
  details: ReturnType<typeof buildTopicLinkDetails>,
  selections: TopicConnectionSelection[]
) {
  return details.filter(({ pattern }) => {
    const { source, target } = pattern.matches[0];
    return (
      !selections.length ||
      isTopicConnectionSelected(selections, {
        title: pattern.sourceBoard.title,
        kind: source.kind,
      }) ||
      isTopicConnectionSelected(selections, {
        title: pattern.targetBoard.title,
        kind: target.kind,
      })
    );
  });
}
