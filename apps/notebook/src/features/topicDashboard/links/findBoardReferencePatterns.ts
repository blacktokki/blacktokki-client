import { cleanHtml, toRaw } from '@blacktokki/editor';

import { Paragraph, paragraphByKey } from '../../../components/HeaderSelectBar';
import { urlToNoteLink } from '../../../components/SearchBar';
import { getSplitTitle } from '../../../hooks/useNoteStorage';
import type { BoardOption, Content } from '../../../types';
import { matchUnlinkedKeyword } from '../../problem/useProblem';
import { getBoardCandidateParagraphs } from '../inferBoardCandidates';

type BoardElementKind = 'ROW' | 'COLUMN' | 'CARD';
type NoteElementKind = 'SUBNOTE' | 'PARAGRAPH';
type ReferencePatternKind =
  | `${BoardElementKind}->${BoardElementKind}`
  | `${BoardElementKind}->${NoteElementKind}`
  | `${NoteElementKind}->${BoardElementKind}`;
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

/** 개별 대상은 모호하지만 모든 후보가 같은 보드·종류에 속하는 연결 사실. */
type BoardReferenceTargetScope = Pick<
  BoardReferenceElement,
  'containerType' | 'boardTitle' | 'boardOrigin' | 'kind'
> & {
  resolution: 'BOARD_KIND';
  /** 실제 후보를 보존하며 특정 요소를 선택하거나 가상의 요소 ID를 만들지 않는다. */
  candidateElements: BoardReferenceElement[];
};

type BoardReferenceTarget = BoardReferenceElement | BoardReferenceTargetScope;

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

type ReferenceSourceElement = BoardReferenceElement | NoteReferenceElement;
type ReferenceElement = BoardReferenceTarget | NoteReferenceElement;

type BoardReferenceMatch = {
  linkText: string;
  referenceType: 'LINK' | 'POTENTIAL';
  source: ReferenceSourceElement;
  target: ReferenceElement;
  pattern: ReferencePatternKind;
  /** 실제 출발과 식별 가능한 대상 범위, 링크 텍스트를 명시한 관찰 명제. */
  proposition: string;
};

type ReferenceLinkDecision = {
  source?: ReferenceSourceElement;
  target?: ReferenceElement;
  pattern: ReferencePatternKind | null;
  /** 같은 보드 쌍·조합에서 서로 다른 출발 요소가 2개 이상이어서 집계에 포함되는지 여부. */
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
  /** 잠재적 참조에만 존재하는 제목 후보와 헤더/본문의 평문 내 위치. */
  candidateTargets?: PotentialReferenceTarget[];
  sourcePart?: 'HEADER' | 'BODY';
  textStart?: number;
  textEnd?: number;
};

type PotentialReferenceTarget = {
  noteTitle: string;
  paragraph?: { paragraph: string; section?: string; path: string };
};

type PotentialKeywordIndex = Map<number, Map<string, Map<string, PotentialReferenceTarget[]>>>;

/** Short prefixes restrict full keyword checks to titles that can occur in the source text. */
function indexPotentialKeywords(
  keywords: Map<string, PotentialReferenceTarget[]>
): PotentialKeywordIndex {
  const index: PotentialKeywordIndex = new Map();
  for (const [keyword, targets] of keywords) {
    const length = Math.min(3, keyword.length);
    let prefixes = index.get(length);
    if (!prefixes) {
      prefixes = new Map();
      index.set(length, prefixes);
    }
    const prefix = keyword.slice(0, length);
    const group = prefixes.get(prefix) ?? new Map();
    group.set(keyword, targets);
    prefixes.set(prefix, group);
  }
  return index;
}

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
  /** 표시용 소속 이름. 노트↔보드 옵션에서는 노트 쪽 origin이 NOTE다. */
  sourceBoard: { title: string; origin: BoardOrigin | 'NOTE' };
  targetBoard: { title: string; origin: BoardOrigin | 'NOTE' };
  pattern: ReferencePatternKind;
  /** 개별 대상까지 확정된 고유 출발·대상 요소 쌍의 수. 종류만 확정된 링크는 제외한다. */
  count: number;
  /** 중복을 포함한 실제·잠재적 참조 발생 횟수. matches의 길이와 같다. */
  occurrenceCount: number;
  /** 논리적 ID를 기준으로 중복을 제거한 출발 요소 수. */
  uniqueSourceCount: number;
  /** 개별 대상까지 확정된 요소의 수. 종류만 확정된 링크의 후보를 모두 연결된 것으로 세지 않는다. */
  uniqueTargetCount: number;
  /** 아직 연결하지 않은 대상의 잠재 참조가 있어 추천 목록이 비어 있지 않은지 여부. */
  isRecommendationSupported: boolean;
  /** 미연결 대상을 잠재적으로 참조하는 출발 위치. 정확한 대상은 사용자가 정한다. */
  recommendationSources: ReferenceSourceElement[];
  matches: BoardReferenceMatch[];
  /** 소속 보드의 출발 요소에서 대상 요소로의 연결을 나타내는 한국어 결론. */
  qed: string;
};

type BoardReferencePatternGroup = Omit<
  BoardReferencePattern,
  'qed' | 'isRecommendationSupported' | 'recommendationSources'
>;

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

/** 실제 보드와 주제 보드를 문장의 소속 이름으로 표현한다. */
function describeReferenceContainer(element: BoardReferenceTarget | NoteReferenceElement): string {
  return element.containerType === 'NOTE'
    ? `노트 '${element.ownerNoteTitle}'`
    : `${element.boardOrigin === 'CANDIDATE' ? '주제 보드' : '보드'} '${element.boardTitle}'`;
}

/** 개별 링크의 명제에서 요소의 이름을 명시하며, 행·카드는 실제 컬럼 노트도 함께 표시한다. */
function describeReferenceElement(element: ReferenceSourceElement): string {
  const labels: Record<BoardElementKind | NoteElementKind, string> = {
    SUBNOTE: '하위노트',
    PARAGRAPH: '하위 문단',
    ROW: '행',
    COLUMN: '열',
    CARD: '카드',
  };
  const column =
    element.containerType === 'BOARD' && element.kind !== 'COLUMN'
      ? `의 열 '${element.noteTitle}'에 있는`
      : '의';
  return `${describeReferenceContainer(element)}${column} ${labels[element.kind]} '${
    element.title
  }'`;
}

/** 실제 링크의 대상이 모호하면 확인된 보드·종류까지만 관찰 명제로 표현한다. */
function proposeReferenceMatch(
  linkText: string,
  source: ReferenceSourceElement,
  target: ReferenceElement,
  referenceType: BoardReferenceMatch['referenceType']
): string {
  const link = linkText === '' ? '텍스트가 없는 링크' : `'${linkText}'`;
  const labels: Record<BoardElementKind, string> = { ROW: '행', COLUMN: '열', CARD: '카드' };
  const destination =
    'id' in target
      ? describeReferenceElement(target)
      : `${describeReferenceContainer(target)}의 ${labels[target.kind]} 중 하나(개별 대상 미확정)`;
  return referenceType === 'POTENTIAL'
    ? `${describeReferenceElement(
        source
      )}에 포함된 키워드 ${link}은(는) ${destination}에 연결할 수 있다.`
    : `${describeReferenceElement(source)}에 포함된 ${link}은(는) ${destination}에 연결된다.`;
}

/** 반복 링크 패턴의 방향을 출발 요소에서 대상 요소로의 연결로 표현한다. */
function concludeReferencePattern(group: BoardReferencePatternGroup): string {
  const labels: Record<
    BoardElementKind | NoteElementKind,
    { subject: string; destination: string }
  > = {
    SUBNOTE: { subject: '하위노트은(는)', destination: '하위노트로' },
    PARAGRAPH: { subject: '하위 문단은(는)', destination: '하위 문단으로' },
    ROW: { subject: '행은(는)', destination: '행으로' },
    COLUMN: { subject: '열은(는)', destination: '열로' },
    CARD: { subject: '카드은(는)', destination: '카드로' },
  };
  const { source, target } = group.matches[0];
  const conclusion = group.matches.some((match) => match.referenceType === 'POTENTIAL')
    ? '연결할 수 있다.'
    : '연결된다.';
  return `${describeReferenceContainer(source)}의 ${
    labels[source.kind].subject
  } ${describeReferenceContainer(target)}의 ${labels[target.kind].destination} ${conclusion}`;
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
    return { url, rawUrl, text: anchor.textContent?.trim() ?? '' };
  });
}

/** useProblem과 같은 cleanHtml/toRaw를 사용하며, 제외 영역과 블록의 경계를 먼저 보존한다. */
function getUnlinkedText(html: string): string {
  if (!html) return '';
  const document = new DOMParser().parseFromString(html, 'text/html');
  const visit = (element: Element) => {
    if (
      /^(A|CODE|PRE|SCRIPT|STYLE|TEMPLATE)$/.test(element.tagName.toUpperCase()) ||
      (element.getAttribute('class') ?? '').split(/\s+/).includes('yaml-frontmatter')
    ) {
      element.parentNode?.insertBefore(document.createTextNode('\n'), element);
      if (/^(PRE|SCRIPT|STYLE|TEMPLATE)$/.test(element.tagName.toUpperCase()))
        element.textContent = '';
      return;
    }
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) visit(child as Element);
    }
    if (
      /^(P|DIV|H[1-6]|LI|UL|OL|BR|HR|TD|TH|TR|TABLE|BLOCKQUOTE|SECTION|ARTICLE)$/.test(
        element.tagName.toUpperCase()
      )
    ) {
      element.parentNode?.insertBefore(document.createTextNode('\n'), element);
      element.parentNode?.insertBefore(document.createTextNode('\n'), element.nextSibling);
    }
  };
  visit(document.body);
  return toRaw(cleanHtml(document.body.innerHTML, true, true, false));
}

/** useProblem의 판정을 재사용하며, 자기 노트를 제외하고 겹치는 제목 중 긴 언급만 남긴다. */
function extractPotentialReferenceLinks(
  paragraph: Paragraph,
  noteTitle: string,
  keywordIndex: PotentialKeywordIndex,
  keywordPatterns: Map<string, RegExp>
) {
  const mentions: {
    text: string;
    candidateTargets: PotentialReferenceTarget[];
    sourcePart: 'HEADER' | 'BODY';
    textStart: number;
    textEnd: number;
  }[] = [];
  for (const sourcePart of ['HEADER', 'BODY'] as const) {
    const text = getUnlinkedText(
      sourcePart === 'HEADER' ? paragraph.header : paragraph.description
    );
    const lowerText = text.toLowerCase();
    const groups = new Set<Map<string, PotentialReferenceTarget[]>>();
    for (const [length, prefixes] of keywordIndex) {
      for (let offset = 0; offset <= lowerText.length - length; offset++) {
        const group = prefixes.get(lowerText.slice(offset, offset + length));
        if (group) groups.add(group);
      }
    }
    for (const group of groups) {
      for (const [keyword, targets] of group) {
        if (!lowerText.includes(keyword)) continue;
        const candidateTargets = targets.filter((target) => target.noteTitle !== noteTitle);
        if (!candidateTargets.length) continue;
        let offset = 0;
        while (offset < text.length) {
          const match = matchUnlinkedKeyword(text.slice(offset), keyword, keywordPatterns);
          if (!match) break;
          const textEnd = offset + (match.index ?? 0) + match[0].length;
          const textStart = textEnd - keyword.length;
          mentions.push({
            text: text.slice(textStart, textEnd),
            candidateTargets,
            sourcePart,
            textStart,
            textEnd,
          });
          offset = textEnd;
        }
      }
    }
  }
  return mentions
    .filter(
      (mention) =>
        !mentions.some(
          (other) =>
            other.sourcePart === mention.sourcePart &&
            other.textStart <= mention.textStart &&
            other.textEnd >= mention.textEnd &&
            other.textEnd - other.textStart > mention.textEnd - mention.textStart
        )
    )
    .sort((a, b) =>
      a.sourcePart === b.sourcePart ? a.textStart - b.textStart : a.sourcePart === 'HEADER' ? -1 : 1
    );
}

/**
 * 같은 노트북의 실제 보드와 주제 보드 사이에서 행/열/카드 조합 9가지의 반복 링크 패턴을 찾는다.
 * 같은 제목의 실제 보드가 있으면 그 설정을 우선하며, `inferBoardCandidates`와
 * `inferTopLevelBoardCandidates`의 결과를 합쳐 전달할 수 있다.
 * `columnNoteTitles`가 있으면 제목 경로 대신 지정된 실제 노트를 컬럼으로 사용한다.
 *
 * 기본값은 보드→보드만 탐지한다. includeNoteBoardPatterns를 켜면 보드↔노트의
 * 하위노트/하위 문단 조합도 같은 실제 LINK 반복 기준으로 탐지한다. 노트→노트는 제외한다.
 * 양쪽이 보드 요소로 판정되면 보드→보드 하나만 `patterns`와 해당 링크 분류 목록에 남긴다.
 * 제외 사유는 보드 소속과 지원 범위를 먼저 확인한다. 보드 루트와 그 직계 열 사이를 포함하여
 * 같은 보드 내부 참조는 대상 노트·문단을 찾지 못해도 `SAME_BOARD`로 분리한다.
 * 소속은 실제 열을 우선하고, 제목 경로 기반 보드는 누락된 직계 열도 제목으로 식별한다.
 * 명시적 columnNoteTitles 후보에는 제목 경로로 열을 추가하지 않는다.
 * 기본값에서 보드 역할이 없는 출발은 UNSUPPORTED_PATTERN이다. 옵션을 켜면 노트 역할을 사용하되,
 * 실제 보드의 숨겨진 카드·열 소속 문단은 노트 역할로 다시 도출하지 않는다.
 * 보드 요소에서 출발한 링크는 대상이 식별되면 지원 조합을 확인하고, 찾지 못하면 `UNRESOLVED_TARGET`이다.
 *
 * 같은 출발·대상 소속 쌍의 같은 조합에서 실제 링크의 논리적 출발 요소 ID가 2개 이상인 패턴만 반환한다.
 * 여러 출발 요소가 같은 대상 하나를 참조해도 반복 패턴이며, 한 출발 요소의 링크만 있으면
 * 대상이 여러 개여도 유효 판정에만 남기고 `isRepeatedPattern: false`로 표시한다.
 * 서로 다른 주소나 카드 하위 문단이 같은 카드로 해석되거나 여러 열의 같은 제목 행이
 * 하나의 공유 행이면 같은 요소다. 출발·대상의 논리적 ID 쌍으로 중복 연결을 제거한다.
 * 패턴의 count와 uniqueTargetCount에는 개별 대상까지 확정된 연결·요소만 센다.
 * occurrenceCount와 matches에는 종류만 확정된 링크와 중복을 포함한 실제 발생을 모두 보존한다.
 * uniqueSourceCount는 종류만 확정된 링크도 포함한 고유 출발 요소 수다.
 * 추천 요소가 있는 패턴을 우선하고, 고유 출발 요소 수로 정렬한다. 한 출발 요소의
 * 연결을 여러 대상에 추가해도 추천 근거와 정렬 우선순위가 늘어나지 않는다.
 * 링크 분류 그룹의 count는 실제 발생 횟수를 유지한다.
 * 개별 요소 ID와 주소는 집계 키에 포함하지 않는다. A의 카드 a1→B의 카드 b1과
 * A의 카드 a2→B의 카드 b2는 A→B의 CARD->CARD 하나로 합치며, count는 2다.
 * A→B와 B→A는 별개이고 같은 보드 내부 참조는 `SAME_BOARD`로 제외한다. 후보도 동일하다.
 *
 * 추천 조건은 성립한 패턴에 잠재 참조가 있고, 그 출발·대상 쌍에 실제 LINK가 없는지 여부다.
 * 이미 다른 대상에 연결된 출발 요소도 새로운 대상을 언급하면 recommendationSources에 담는다.
 * 종류만 확정된 잠재 참조는 동일한 후보 범위의 LINK가 있거나 모든 후보에 실제 연결이 있으면 제외한다.
 * 종류만 확정된 LINK는 각 후보가 모두 연결된 사실로 확장하지 않는다.
 * 잠재 참조가 없는 요소는 추천하지 않는다.
 * isRecommendationSupported는 추천 목록이 비어 있지 않은지 표시한다.
 * 추천은 출발 요소에서 대상 보드의 해당 종류로
 * 연결할 가능성을 제시하는 것이며, 정확한 대상 요소나 링크 생성은 사용자가 직접 처리한다.
 * 추천 요소는 잠재 참조가 실제 발견된 노트·문단 위치를 사용하고 논리적 ID로 중복을 제거한다.
 * 여러 열에 같은 제목의 공유 행이 있어도 다른 열의 대표 위치로 대체하지 않는다.
 * 실제 보드의 숨겨진 카드는 역할 판정에서 제외한다.
 * recommendationSources는 개별 대상이 모호해도 같은 보드·종류로 확인된 잠재 참조를 포함한다.
 * 보드·종류도 확인할 수 없는 해석 실패는 제외 진단에 보존하며 반례로 단정하지 않는다.
 * 잠재 참조의 수는 패턴 성립을 강화하지 않으며, 별도 임계식이나 가중치를 사용하지 않는다.
 *
 * `qed`는 보드 쌍과 요소 종류를 담은 한국어 결론이며, 각 `matches`의 `proposition`은
 * 실제 출발·대상 요소 이름과 링크 텍스트를 명시하여 그 결론을 뒷받침하는 개별 명제다.
 * 행·카드는 실제 컬럼 노트 이름도 표시하며, 인용에는 작은따옴표를 쓴다.
 * 예: 주제 보드 '개발 지식'의 카드은(는) 주제 보드 'DB'의 카드로 연결된다.
 * 예: 주제 보드 '개발 지식'의 열 '개발 지식/DB'에 있는 카드 'MySQL 정리'에 포함된
 * '설치'은(는) 주제 보드 'DB'의 열 'DB/MySQL'에 있는 카드 '설치'에 연결된다.
 * proposition과 qed의 주격 조사는 '은(는)'으로 통일하며, 빈 링크 텍스트는 '텍스트가 없는 링크'로 표현한다.
 *
 * 후보의 컬럼으로 지정된 하위노트 자체는 COLUMN, 선택한 헤더 수준의 문단은 CARD로 판정한다.
 * 스크럼의 바로 위 수준 문단은 ROW이고, 카드 하위 문단은 해당 CARD에, 나머지 문단은 COLUMN에 속한다.
 * 칸반에는 ROW 역할이 없다. 출발·대상을 같은 기준으로 판정하며 링크는 가장 가까운 요소에 귀속한다.
 * 실제 보드의 숨겨지는 카드는 보드 역할을 제외하지만, 후보는 전환 전 구조이므로 카드와 그 하위 문단을
 * 보드 요소로 유지한다. 같은 주소가 실제로 여러 번 작성되어 있으면 각각 별도의 링크 발생으로 센다.
 *
 * 대상은 내부 노트 링크의 제목, 문단/해시, section으로 확인한다. 열 노트 자체의 링크는 COLUMN이다.
 * 문단이 모호해도 모든 후보의 보드·종류가 같으면 resolution: BOARD_KIND와 candidateElements로
 * 보존한다. 후보 중 역할을 알 수 없는 문단이나 다른 종류가 있으면 특정 대상을 추측하지 않는다.
 * 보드 제목에 문단이 지정된 링크도 같은 기준을 적용한다.
 * 보드 루트가 최상위 후보의 컬럼이기도 하면 그 노트의 문단을 우선하고,
 * 문단이 없을 때 하위 컬럼을 찾는다. 최상위 후보의 컬럼이 아닌 루트 본문은 보드 요소가 아니다.
 * 상대 href 및 제목 없는 #문단/?paragraph=문단은 원본 노트를 기준으로 해석한다.
 *
 * 반환값의 `linkClassifications` 객체는 실제·잠재적 참조의 유효·제외 분류 네 목록을 담는다.
 * 하위 `linkClassifications`는 제외 사유가 없는 지원 조합의 실제 판정을 담고, 제외 발생은
 * `excludedLinkClassifications`에서 실제 발견된 사유별로 분리한다. 제외가 없으면 빈 객체다.
 * 각 목록은 `linkText`, `sourceNoteTitle`, `sourceParagraph`, `targetNoteTitle` 네 값이 모두 같은
 * 링크를 한 그룹으로 묶는다. sourceParagraph는 문단명·section·path를 비교하며 기본 본문은 생략한다.
 * 같은 네 값이어도 제외 사유가 다르면 별개이고 유효/제외 발생은 각각의 목록에 보존한다.
 * 내부 링크의 targetNoteTitle은 노트·문단을 찾지 못해도 보존하며, 주소는 응답 전체에서 제외한다.
 * 그룹 count는 실제 발생 횟수이고 occurrences에는 개별 판정을 보존한다. 링크 텍스트가 없으면 빈 문자열이다.
 * 각 발생의 classifications에는 유효한 지원 조합 판정 또는 pattern: null과 제외 사유를 담는다.
 * INVALID_LINK, NOT_INTERNAL_NOTE_LINK, SOURCE_NOT_ELEMENT를 확인한 뒤 SAME_BOARD,
 * 출발 역할의 UNSUPPORTED_PATTERN, UNRESOLVED_TARGET 순으로 판정한다.
 * 옵션 미사용 시 보드↔노트는 UNSUPPORTED_PATTERN이며, 노트→노트는 항상 제외한다.
 * 존재하는 노트의 역할만 도출하고, 제목 경로에만 있는 부모 노트는 소속으로 추론하지 않는다.
 *
 * 헤더·본문의 다른 노트/헤더 제목 언급은 useProblem의 키워드 규칙으로 수집한다.
 * 기존 링크 영역은 중복 탐지하지 않으며, 잠재적 참조도 기존 소속·반복·추천 집계에 포함한다.
 * patterns에는 서로 다른 출발 요소의 실제 LINK가 최소 2개 있는 패턴만 담는다.
 * 같은 요소의 링크 중복과 다른 요소의 제목 언급만으로 반복 조건을 충족하지 않는다.
 * 조건 미달 패턴은 분류의 occurrences에 보존하며 isRepeatedPattern은 false다.
 * 네 필드로 묶은 potentialLinkClassifications와 사유별 excludedPotentialLinkClassifications에
 * 별도로 담고, 반복 미달도 occurrences에 보존한다. matches.referenceType으로 실제 링크와 구분한다.
 * candidateTargets와 sourcePart/textStart/textEnd는 연결 후보와 평문 내 위치를 나타낸다.
 * 여러 후보가 같은 보드·종류이면 BOARD_KIND로 보존하며, 다른 경우에는 후보별 잠재적 발생으로 분리한다.
 * 분리된 발생에도 기존 네 필드 그룹과 소속·지원 조합·고유 출발 요소 집계 기준을 적용한다.
 * 같은 보드 소속이면 SAME_BOARD가 우선이다. 잠재적 근거의 proposition/qed는 '연결할 수 있다'로 표현한다.
 * 탐지 결과만 반환하며 링크 생성이나 노트 수정은 수행하지 않는다.
 *
 * @param notes 같은 노트북의 노트 목록.
 * @param boards 같은 노트북의 실제 보드 목록.
 * @param candidates 기존 제목 경로 후보와 최상위 노트 그룹 후보를 합친 전환 후보 목록.
 * @param options includeNoteBoardPatterns: 주제 대시보드에서 노트↔보드 규칙도 표시할 때 사용한다.
 * @returns 보드 간 반복 패턴의 근거·추천 출발 요소, 유효 링크 그룹과 사유별 제외 링크 그룹.
 */
export function findBoardReferencePatterns(
  notes: readonly Content[],
  boards: readonly Content[],
  candidates: readonly {
    title: string;
    option: BoardOption;
    columnNoteTitles?: readonly string[];
  }[],
  options: { includeNoteBoardPatterns?: boolean } = {}
): {
  patterns: BoardReferencePattern[];
  linkClassifications: {
    linkClassifications: ReferenceLinkClassification[];
    excludedLinkClassifications: ExcludedLinkClassifications;
    potentialLinkClassifications: ReferenceLinkClassification[];
    excludedPotentialLinkClassifications: ExcludedLinkClassifications;
  };
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
  const getParagraphs = getBoardCandidateParagraphs;
  for (const note of noteMap.values()) {
    const [parent, title] = getSplitTitle(note.title);
    if (!parent || !title) continue;
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
    const [parent, title] = getSplitTitle(note.title);
    let subnote: NoteReferenceElement | undefined;
    if (parent && title) {
      subnote = {
        id: JSON.stringify([parent, 'SUBNOTE', note.title]),
        containerType: 'NOTE',
        ownerNoteTitle: parent,
        ownerNoteExists: noteMap.has(parent),
        kind: 'SUBNOTE',
        title,
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

  /** 한 요소를 선택할 수 없더라도 모든 후보가 동의하는 보드·종류는 연결 근거로 보존한다. */
  const resolveBoardMatches = (
    matches: Map<string, BoardReferenceElement>,
    hasUnownedParagraph: boolean
  ): BoardReferenceTarget | undefined => {
    if (hasUnownedParagraph || matches.size === 0) return undefined;
    const candidateElements = [...matches.values()];
    const [first] = candidateElements;
    if (candidateElements.length === 1) return first;
    if (
      !candidateElements.every(
        (element) => element.boardTitle === first.boardTitle && element.kind === first.kind
      )
    ) {
      return undefined;
    }
    return {
      containerType: 'BOARD',
      boardTitle: first.boardTitle,
      boardOrigin: first.boardOrigin,
      kind: first.kind,
      resolution: 'BOARD_KIND',
      candidateElements,
    };
  };

  const resolveBoardTarget = (
    target: NonNullable<ReturnType<typeof urlToNoteLink>> & { path?: string }
  ): BoardReferenceTarget | undefined => {
    const column = columnsByNote.get(target.title);
    if (!target.paragraph) return column?.element;
    const matches = new Map<string, BoardReferenceElement>();
    let hasUnownedParagraph = false;
    // 잠재적 참조는 실제 헤더 경로를 알고 있으므로 동명 헤더의 다른 종류와 섞지 않는다.
    const matchesParagraph = (paragraph: Paragraph) =>
      target.path !== undefined
        ? paragraph.path === target.path && paragraph.title === target.paragraph
        : paragraphByKey(paragraph, target);
    if (column) {
      let paragraphFound = false;
      column.paragraphs.forEach((paragraph, index) => {
        if (!matchesParagraph(paragraph)) return;
        paragraphFound = true;
        const owner = column.owners[index];
        if (owner) matches.set(owner.id, owner);
        else hasUnownedParagraph = true;
      });
      if (paragraphFound) return resolveBoardMatches(matches, hasUnownedParagraph);
    }
    for (const candidate of columnsByBoard.get(target.title) ?? []) {
      candidate.paragraphs.forEach((paragraph, index) => {
        if (!matchesParagraph(paragraph)) return;
        const owner = candidate.owners[index];
        if (owner) matches.set(owner.id, owner);
        else hasUnownedParagraph = true;
      });
    }
    return resolveBoardMatches(matches, hasUnownedParagraph);
  };

  const resolveNoteTargets = (
    target: NonNullable<ReturnType<typeof urlToNoteLink>> & { path?: string }
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
      if (
        paragraph.level === 0 ||
        (target.path !== undefined
          ? paragraph.path !== target.path || paragraph.title !== target.paragraph
          : !paragraphByKey(paragraph, target))
      )
        return;
      const owner = document.paragraphOwners[index];
      if (owner) matches.set(owner.id, owner);
    });
    const targets = matches.size === 1 ? [...matches.values()] : [];
    if (matches.size > 0 && document.subnote) targets.push(document.subnote);
    return targets;
  };

  /** 보드 소속은 제외 판정에만 사용하며, 루트나 누락된 열을 행·열·카드 근거로 만들지 않는다. */
  const resolveBoardMembership = (noteTitle: string): string | undefined => {
    const column = columnsByNote.get(noteTitle);
    if (column) return column.board.title;
    if (columnsByBoard.has(noteTitle)) return noteTitle;
    const [parent, title] = getSplitTitle(noteTitle);
    if (!parent || !title) return undefined;
    return columnsByBoard.has(parent) && definitions.get(parent)?.columnNoteTitles === undefined
      ? parent
      : undefined;
  };

  const keywords = new Map<string, PotentialReferenceTarget[]>();
  const addKeyword = (title: string, target: PotentialReferenceTarget) => {
    const keyword = title.trim().toLowerCase();
    if (keyword) keywords.set(keyword, [...(keywords.get(keyword) ?? []), target]);
  };
  for (const document of documents) {
    addKeyword(document.noteTitle, { noteTitle: document.noteTitle });
    for (const paragraph of document.paragraphs) {
      if (paragraph.level > 0)
        addKeyword(paragraph.title, {
          noteTitle: document.noteTitle,
          paragraph: {
            paragraph: paragraph.title,
            section: paragraph.autoSection,
            path: paragraph.path,
          },
        });
    }
  }

  const groups = new Map<string, BoardReferencePatternGroup>();
  const keywordIndex = indexPotentialKeywords(keywords);
  const keywordPatterns = new Map<string, RegExp>();
  const linkOccurrences: ReferenceLinkOccurrence[] = [];
  const classifiedGroups = new Map<ReferenceLinkDecision, BoardReferencePatternGroup>();
  for (const document of documents) {
    document.paragraphs.forEach((paragraph, index) => {
      const boardSource = document.boardColumn?.owners[index];
      const sourceBoardTitle =
        boardSource?.boardTitle ?? resolveBoardMembership(document.noteTitle);
      const paragraphSource = document.paragraphOwners[index];
      const sources: ReferenceSourceElement[] = [
        ...(boardSource ? [boardSource] : []),
        ...(paragraph.level === 0 && document.subnote
          ? [document.subnote, paragraphSource]
          : [paragraphSource, ...(document.subnote ? [document.subnote] : [])]),
      ];
      const html = (paragraph.header ?? '') + paragraph.description;
      const links = [
        ...extractReferenceLinks(html, document.noteTitle),
        ...extractPotentialReferenceLinks(
          paragraph,
          document.noteTitle,
          keywordIndex,
          keywordPatterns
        ),
      ];
      for (const link of links) {
        const referenceType = 'candidateTargets' in link ? 'POTENTIAL' : 'LINK';
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
        if ('candidateTargets' in link) {
          const { candidateTargets, sourcePart, textStart, textEnd } = link;
          Object.assign(occurrence, { candidateTargets, sourcePart, textStart, textEnd });
        }
        linkOccurrences.push(occurrence);
        let targets: ReferenceElement[] = [];
        let targetBoardTitle: string | undefined;
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
          const potentialTargets = occurrence.candidateTargets?.map(
            (candidate): NonNullable<ReturnType<typeof urlToNoteLink>> =>
              candidate.paragraph
                ? { title: candidate.noteTitle, ...candidate.paragraph }
                : { title: candidate.noteTitle }
          );
          const url = 'url' in link ? new URL(link.url, location.href).href : '';
          const noteLink =
            potentialTargets?.[0] ??
            urlToNoteLink(
              'rawUrl' in link && /^[^?#]*\.(md|markdown)(?:[?#]|$)/i.test(link.rawUrl)
                ? link.rawUrl
                : url,
              document.noteTitle
            );
          if (!noteLink) {
            exclude('NOT_INTERNAL_NOTE_LINK');
            continue;
          }
          occurrence.targetNoteTitle = noteLink.title;
          let boardTarget = resolveBoardTarget(noteLink);
          // 보드 별칭이 다른 보드의 실제 열이기도 할 수 있으므로 해석된 요소의 소속을 우선한다.
          targetBoardTitle = boardTarget?.boardTitle ?? resolveBoardMembership(noteLink.title);
          targets = [...(boardTarget ? [boardTarget] : []), ...resolveNoteTargets(noteLink)];
          if (potentialTargets && potentialTargets.length > 1) {
            const boardTargets = potentialTargets.map(resolveBoardTarget);
            const elements = boardTargets.flatMap((target) =>
              target ? ('id' in target ? [target] : target.candidateElements) : []
            );
            boardTarget = resolveBoardMatches(
              new Map(elements.map((element) => [element.id, element])),
              boardTargets.some((target) => !target)
            );
            const memberships = potentialTargets.map(
              (target, index) =>
                boardTargets[index]?.boardTitle ?? resolveBoardMembership(target.title)
            );
            targetBoardTitle = memberships.every((title) => title === memberships[0])
              ? memberships[0]
              : undefined;
            const noteTargets = [
              ...new Map(
                potentialTargets.flatMap(resolveNoteTargets).map((target) => [target.id, target])
              ).values(),
            ];
            targets = [...(boardTarget ? [boardTarget] : []), ...noteTargets];
            if (
              'candidateTargets' in link &&
              link.candidateTargets.length > 1 &&
              !boardTarget &&
              noteTargets.length !== 1 &&
              !(sourceBoardTitle !== undefined && sourceBoardTitle === targetBoardTitle)
            ) {
              // 합쳐서 판정할 수 없는 언급을 후보별 입력으로 바꿔 같은 분류 루프에서 처리한다.
              links.push(
                ...link.candidateTargets.map((candidate) => ({
                  ...link,
                  candidateTargets: [candidate],
                }))
              );
              linkOccurrences.pop();
              continue;
            }
            if (!potentialTargets.every((target) => target.title === noteLink.title)) {
              delete occurrence.targetNoteTitle;
            }
          }
        } catch {
          exclude('INVALID_LINK');
          continue;
        }
        if (sources.length === 0) {
          exclude('SOURCE_NOT_ELEMENT');
          continue;
        }
        if (sourceBoardTitle !== undefined && sourceBoardTitle === targetBoardTitle) {
          exclude('SAME_BOARD');
          continue;
        }
        if (!boardSource && (!options.includeNoteBoardPatterns || document.boardColumn)) {
          exclude('UNSUPPORTED_PATTERN');
          continue;
        }
        if (targets.length === 0) {
          exclude('UNRESOLVED_TARGET');
          continue;
        }
        const countedKeys = new Set<string>();
        for (const source of sources) {
          for (const target of targets) {
            // 보드 요소가 있으면 노트 역할을 중복 도출하지 않는다. 숨겨진 보드 문단도 노트로 우회하지 않는다.
            if (boardSource && source.containerType !== 'BOARD') continue;
            if (
              targets.some((element) => element.containerType === 'BOARD') &&
              target.containerType !== 'BOARD'
            )
              continue;
            if (source.containerType === 'NOTE' && target.containerType === 'NOTE') continue;
            if (
              (source.containerType === 'NOTE' && !source.ownerNoteExists) ||
              (target.containerType === 'NOTE' && !target.ownerNoteExists)
            )
              continue;
            if (target.containerType === 'NOTE' && columnsByNote.has(target.noteTitle)) continue;
            if (
              !options.includeNoteBoardPatterns &&
              (source.containerType !== 'BOARD' || target.containerType !== 'BOARD')
            )
              continue;
            const pattern = `${source.kind}->${target.kind}` as ReferencePatternKind;
            const sourceTitle =
              source.containerType === 'BOARD' ? source.boardTitle : source.ownerNoteTitle;
            const targetTitle =
              target.containerType === 'BOARD' ? target.boardTitle : target.ownerNoteTitle;
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
                sourceBoard: {
                  title: sourceTitle,
                  origin: source.containerType === 'BOARD' ? source.boardOrigin : 'NOTE',
                },
                targetBoard: {
                  title: targetTitle,
                  origin: target.containerType === 'BOARD' ? target.boardOrigin : 'NOTE',
                },
                pattern,
                count: 0,
                occurrenceCount: 0,
                uniqueSourceCount: 0,
                uniqueTargetCount: 0,
                matches: [],
              };
              groups.set(key, group);
            }
            group.matches.push({
              linkText: link.text,
              referenceType,
              source,
              target,
              pattern,
              proposition: proposeReferenceMatch(link.text, source, target, referenceType),
            });
            group.occurrenceCount++;
            classifiedGroups.set(classification, group);
          }
        }
        if (occurrence.classifications.length === 0) {
          exclude('UNSUPPORTED_PATTERN');
        }
      }
    });
  }
  const repeatedGroups = new Set<BoardReferencePatternGroup>();
  for (const group of groups.values()) {
    const sourceIds = new Set<string>();
    const connectedSourceIds = new Set<string>();
    const targetIds = new Set<string>();
    const connectionIds = new Set<string>();
    for (const { source, target, referenceType } of group.matches) {
      sourceIds.add(source.id);
      if (referenceType === 'LINK') connectedSourceIds.add(source.id);
      if ('id' in target) {
        targetIds.add(target.id);
        connectionIds.add(JSON.stringify([source.id, target.id]));
      }
    }
    group.count = connectionIds.size;
    group.uniqueSourceCount = sourceIds.size;
    group.uniqueTargetCount = targetIds.size;
    if (connectedSourceIds.size >= 2) repeatedGroups.add(group);
  }
  for (const [classification, group] of classifiedGroups) {
    classification.isRepeatedPattern = repeatedGroups.has(group);
  }
  const linkGroups = new Map<string, ReferenceLinkClassification>();
  const excludedLinkGroups = new Map<
    NonNullable<ReferenceLinkDecision['exclusionReason']>,
    Map<string, ReferenceLinkClassification>
  >();
  const potentialLinkGroups = new Map<string, ReferenceLinkClassification>();
  const excludedPotentialLinkGroups: typeof excludedLinkGroups = new Map();
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
    let destinationGroups = occurrence.candidateTargets ? potentialLinkGroups : linkGroups;
    const excludedGroups = occurrence.candidateTargets
      ? excludedPotentialLinkGroups
      : excludedLinkGroups;
    if (occurrence.exclusionReason !== undefined) {
      let reasonGroups = excludedGroups.get(occurrence.exclusionReason);
      if (!reasonGroups) {
        reasonGroups = new Map<string, ReferenceLinkClassification>();
        excludedGroups.set(occurrence.exclusionReason, reasonGroups);
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
    .map((group): BoardReferencePattern => {
      const connectionKey = (source: ReferenceSourceElement, target: ReferenceElement) =>
        JSON.stringify([
          source.id,
          'id' in target
            ? [target.id]
            : target.candidateElements.map((element) => element.id).sort(),
        ]);
      const connectedReferences = new Set(
        group.matches
          .filter((match) => match.referenceType === 'LINK')
          .map(({ source, target }) => connectionKey(source, target))
      );
      const sources = new Map<string, ReferenceSourceElement>();
      for (const { source, target, referenceType } of group.matches) {
        if (referenceType !== 'POTENTIAL') continue;
        if (
          connectedReferences.has(connectionKey(source, target)) ||
          (!('id' in target) &&
            target.candidateElements.every((element) =>
              connectedReferences.has(connectionKey(source, element))
            ))
        ) {
          continue;
        }
        if (!sources.has(source.id)) sources.set(source.id, source);
      }
      const recommendationSources = [...sources.values()];
      return {
        ...group,
        isRecommendationSupported: recommendationSources.length > 0,
        recommendationSources,
        qed: concludeReferencePattern(group),
      };
    })
    .sort(
      (a, b) =>
        Number(b.isRecommendationSupported) - Number(a.isRecommendationSupported) ||
        b.uniqueSourceCount - a.uniqueSourceCount ||
        a.sourceBoard.title.localeCompare(b.sourceBoard.title) ||
        a.targetBoard.title.localeCompare(b.targetBoard.title) ||
        a.pattern.localeCompare(b.pattern)
    );
  return {
    patterns,
    linkClassifications: {
      linkClassifications: [...linkGroups.values()],
      excludedLinkClassifications,
      potentialLinkClassifications: [...potentialLinkGroups.values()],
      excludedPotentialLinkClassifications: Object.fromEntries(
        [...excludedPotentialLinkGroups].map(([reason, groups]) => [reason, [...groups.values()]])
      ),
    },
  };
}
