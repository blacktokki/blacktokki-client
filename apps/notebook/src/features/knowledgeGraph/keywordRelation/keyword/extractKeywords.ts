/**
 * @file 키워드 처리 1단계: 원본 개체 추출과 복합·구성 키워드 분석.
 *
 * 이 파일의 공개 진입점은 `extractKeywords` 하나이다. 문서 파싱·후보 정규화·이름 패턴
 * 분류 등 이 단계 전용 구현은 비공개로 유지한다. 다음 단계는 `collectKeywordTypes`이다.
 */
import { toMarkdown, toToken } from '@blacktokki/editor';

import {
  analyzeRelationKeywordComposition,
  checkRelationCancelled,
  yieldRelationWork,
  createRelationDiscoveryMemory,
  createRelationKeywordMatcher,
  normalizeRelationText as normalize,
  relationKeywordKey as keywordKey,
} from './keywordUtils';
import type { KeywordExtraction } from './keywordUtils';
import type {
  RelationContent,
  RelationDocument,
  RelationTextBlock,
  Region,
  ParsedRelationNote,
  RelationDiscoveryMemory,
  RelationEntityProgress,
  RelationEntityResult,
  RelationEntitySentence,
  RelationEntitySources,
  RelationKeywordSource,
  EnumerationItem,
  RelationEnumerationCandidate,
  RelationEnumerationRegion,
  AssociationOptions,
  RelationAnalysisNote,
} from '../types';

type Token = ReturnType<typeof toToken>[number];
const noteBasename = (title: string) => title.split('/').at(-1) || title;

/**
 * 노트에서 키워드 개체를 추출하고 복합·구성 키워드 정보를 계산한다.
 *
 * 개발자 로그의 **키워드 개체 추출 요약**에 복합·구성 키워드 목록을 함께 제공하는 단계이다.
 * 로그 출력은 호출자(`useRelationAnalysis`)가 담당하고, 이 함수는 결과와 콜백만 제공한다.
 *
 * @param notes 현재 분석 범위의 제목·본문. 정규화한 전체 제목이 같으면 마지막 노트를 사용한다.
 * @param options 같은 계정·노트북·개인 모드에서 재사용할 세션 메모리, 취소 신호 및 알림 콜백.
 * @param options.memory 파싱·개체·문장 매칭 캐시. 생략하면 이 호출용 메모리를 만든다.
 *   다른 분석 범위의 메모리를 전달하지 않아야 하며, 호출 후 변경된 상태가 남는다.
 * @param options.signal 중단 신호. 문서 및 반복 처리의 경계에서 확인한다.
 * @param options.onEntityProgress 노트 처리 진행 알림. 캐시 적중 시에도 완료 알림을 보낸다.
 * @param options.onEntities 원본 개체 추출 완료 알림. 복합·구성 분석이 끝난 후 호출한다.
 *   새 추출 결과의 열거·개체 유형은 아직 없으며, 재사용 결과에는 이전 단계의 유형이 있을 수 있다.
 * @returns 중복 제목을 정리한 `notes`, 원본 개체와 출처인 `extraction`, 복합·구성 정보인
 *   `composition`, 갱신한 `memory`, 다음 단계용 원시 열거 스냅샷 `contents`.
 *   `contents`는 아직 키워드 수 일치 조건을 검사하지 않은 구조 후보이다.
 * @throws 중단 시 이름이 `AbortError`인 오류. 파싱·콜백 오류도 그대로 전파하며 메모리를 롤백하지 않는다.
 *
 * @remarks
 * **원본 키워드의 채택과 식별**
 * - 제목(상위 경로 제외), 문단 제목, 링크 표시명, 굵은 글씨, 필드명·값에서 후보를 얻는다.
 *   표 헤더는 내부 링크·굵은 글씨를 포함해 제외하고 열 역할 정보로만 사용한다.
 * - 서로 다른 정규화 노트 경로 3개 이상에서 지지된 이름만 채택한다. 한 노트의 반복은
 *   노트 수를 늘리지 않으며, 표 셀 전체나 현재 노트 제목을 무조건 채택하는 예외는 없다.
 * - `text`는 표시용 이름, `key`는 유니코드·공백 정규화 및 소문자 변환을 거친 비교용 키이다.
 *   이름 패턴인 `type`은 숫자 치환 또는 3개 이상의 서로 다른 이름이 지지하는 접두 구조이며,
 *   다음 단계에서 열거를 바탕으로 만드는 개체 유형(`entityTypes`)과 구별한다.
 * - 링크 출처는 범위 전체에서 `[정규화 표시명 키, 원래 href]`를 한 번만 센다.
 *   같은 링크는 처음 출처만 남고 추출 횟수·지지 노트 수·출처 목록을 늘리지 않는다.
 *   같은 표시명에 주소가 다르거나 링크 외 출처이면 각각 원래 집계 규칙을 적용한다.
 *
 * **복합·구성 키워드 계약**
 * - `composition.compounds`는 정규화 키 내부에 다른 키가 포함되는 문자열 관계이다.
 *   단어 경계는 요구하지 않고 자기 자신은 제외한다. 겹치거나 중첩된 포함 키도 각각 남긴다.
 *   예: `react native`에는 `react`, `native`가 모두 포함된다.
 * - `composition.constituents`는 서로 다른 원본 키 3개 이상에서 지지되고 원본 목록에는 없는
 *   공통 부분 키이다. 같은 이름의 반복이나 파생 키는 지지 수를 늘리지 않는다.
 *   예: `서울역`, `서울시청`, `서울버스`에서 `서울`을 얻는다.
 * - 글자가 포함된 2글자 이상을 기본으로 하며 한 글자는 모든 지지 원본에서 독립 단어일 때만
 *   허용한다. 양끝 구분자를 제거하고 숫자·기호만인 부분은 제외한다. 동일 원본 집합의 후보는
 *   포함 관계에서 가장 긴 부분을 유지하며, 더 많은 원본이 지지하는 짧은 부분은 별도로 남긴다.
 * - 구성 키를 합친 목록으로 포함 관계를 계산하지만 `extraction.entities`에 파생 개체를
 *   삽입하지는 않는다. 화면에서 파생 개체를 표시할 때 소유 원본의 출처를 위치별로 합친다.
 *   대시보드·키워드 탭의 전체 개수는 원본과 구성 키의 합집합이며 화면 필터와 무관하다.
 * - 호출자는 추출 요약 다음에 복합·구성 로그를 출력한다. 로그는 `복합키워드수`,
 *   `키워드`·`포함키워드`, `구성키워드수`, `구성키워드목록`의 `키워드`·`발견횟수`·
 *   `합성키워드목록`을 사용하며 빈 결과도 0과 빈 목록으로 표현한다.
 *
 * **본문 파싱과 재사용**
 * - 문단·리스트·표·명시적 줄바꿈 경계를 보존한다. 필드·설정값·화살표·번호·불릿처럼
 *   레코드 문법이 반복되면 줄마다 분리하고, 일반 문장의 소프트 줄바꿈은 이어 읽는다.
 *   날짜·쉼표·콜론 등 값 내부 문구는 유지하며 HTML도 동일한 구조로 변환한다.
 * - 본문이 같은 문서는 파싱 결과를 재사용한다. 반복 탐색 영역과 복원 헤더는 현재 전체
 *   문서로 다시 검증하여 지지 문서가 사라지면 이전 추론도 취소한다.
 * - 전체 입력이 같으면 완성된 추출 결과를 재사용한다. 사전이 바뀌면 변경 키가 영향을 주는
 *   문서의 문장 매칭만 갱신한다. 삭제 문서는 메모리에서 제거한다.
 * - 영구 저장, 모델 실행, 연관성 점수 계산은 수행하지 않는다. 전체 분석 흐름은
 *   `relationAnalysis`에서 추출 → 유형 수집 → 관계 후보 수집 → 연관성 평가 순서로 구성한다.
 */
export async function extractKeywords(
  notes: RelationAnalysisNote[],
  options: Pick<AssociationOptions, 'memory' | 'signal' | 'onEntityProgress' | 'onEntities'> = {}
): Promise<KeywordExtraction> {
  const memory = options.memory || createRelationDiscoveryMemory();
  const { signal, onEntityProgress: onProgress } = options;
  const unique = [...new Map(notes.map((note) => [normalize(note.title), note])).values()];
  const currentPaths = new Set(unique.map((note) => normalize(note.title)));
  for (const path of memory.notes.keys()) {
    if (!currentPaths.has(path)) {
      memory.notes.delete(path);
      memory.stats.removedNotes++;
    }
  }
  const inventory = new Map<
    string,
    ReturnType<typeof relationKeyword> & { mentionCount: number; notes: Set<string> }
  >();
  const keywords = new Map<string, ReturnType<typeof relationKeyword>>();
  const links = new Set<string>();
  const collectedSources: RelationKeywordSource[] = [];
  const parsedNotes: ParsedRelationNote[] = [];
  const finish = (extraction: RelationEntityResult) => {
    checkRelationCancelled(signal);
    const composition = analyzeRelationKeywordComposition(extraction.entities);
    phaseRatio = 1;
    notify('completed');
    options.onEntities?.(extraction);
    checkRelationCancelled(signal);
    const contents = [...memory.notes.values()].map(({ enumerations }) => ({ enumerations }));
    return { notes: unique, extraction, composition, memory, contents };
  };
  const started = Date.now();
  let inputCount = 0;
  let completedNotes = 0;
  let phaseRatio = 0;
  const notify = (status: RelationEntityProgress['status']) => {
    checkRelationCancelled(signal);
    onProgress?.({
      status,
      ratio: phaseRatio,
      noteCount: unique.length,
      completedNotes,
      inputCount,
      elapsedMs: Date.now() - started,
    });
    checkRelationCancelled(signal);
  };
  notify('running');
  const cached = memory.entityExtraction;
  if (
    cached &&
    cached.notes.size === unique.length &&
    unique.every((note) => {
      const parsed = cached.notes.get(normalize(note.title));
      return parsed?.title === note.title && parsed.description === (note.description || '');
    })
  ) {
    memory.notes = new Map(cached.notes);
    memory.stats.reusedNotes += unique.length;
    inputCount = cached.result.inputCount;
    completedNotes = unique.length;
    return finish(cached.result);
  }
  const corpus = await prepareRelationCorpus(
    unique,
    toMarkdown,
    memory.documents,
    () => checkRelationCancelled(signal),
    (processed, total) => {
      phaseRatio = total ? processed / total / 2 : 0.5;
      notify('running');
    }
  );
  let lastYield = Date.now();
  for (const note of unique) {
    checkRelationCancelled(signal);
    const notePath = normalize(note.title);
    const previous = memory.notes.get(notePath);
    const parsed = parseRelationNote(note, memory, corpus.get(normalize(note.title))!);
    parsedNotes.push(parsed);
    memory.stats[previous === parsed ? 'reusedNotes' : 'changedNotes']++;
    for (const source of parsed.keywordSources) {
      const text = source.keyword;
      let keyword = keywords.get(text);
      if (!keyword) keywords.set(text, (keyword = relationKeyword(text)));
      if (source.kind === 'link') {
        const identity = JSON.stringify([keyword.key, source.href ?? '']);
        if (links.has(identity)) continue;
        links.add(identity);
      }
      inputCount++;
      collectedSources.push(source);
      const name = keyword.key;
      const entity = inventory.get(name) || {
        ...keyword,
        mentionCount: 0,
        notes: new Set<string>(),
      };
      entity.mentionCount++;
      entity.notes.add(notePath);
      inventory.set(name, entity);
    }
    completedNotes++;
    phaseRatio = 0.5 + completedNotes / Math.max(1, unique.length) / 4;
    if (Date.now() - lastYield >= 8 || completedNotes % 25 === 0) {
      notify('running');
      await yieldRelationWork();
      checkRelationCancelled(signal);
      lastYield = Date.now();
    }
  }
  const entities = classifyRelationKeywords(
    [...inventory.values()]
      .filter((entity) => entity.notes.size >= 3)
      .map(({ text, type, key, mentionCount, notes }) => ({
        text,
        type,
        key,
        mentionCount,
        noteCount: notes.size,
      }))
      .sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text))
  );
  const details: Record<string, RelationEntitySources> = Object.create(null);
  const names = new Map(entities.map((entity) => [entity.key, entity.text]));
  for (const entity of entities) details[entity.key] = { sources: [], sentences: [] };
  for (const source of collectedSources)
    details[keywords.get(source.keyword)!.key]?.sources.push(source);
  const result: RelationEntityResult = {
    status: 'completed',
    noteCount: unique.length,
    inputCount,
    mentionCount: entities.reduce((sum, entity) => sum + entity.mentionCount, 0),
    entities,
    details,
  };
  const matchEntities = createEntityMatcher(result);
  const dictionary = new Set(names.keys());
  const dictionaryChanges = new Map<Set<string>, string[]>();
  let matchedNotes = 0;
  for (const parsed of parsedNotes) {
    checkRelationCancelled(signal);
    const previous = parsed.entitySentences;
    let changes = previous && dictionaryChanges.get(previous.dictionary);
    if (previous && !changes) {
      changes = [...new Set([...previous.dictionary, ...dictionary])].filter(
        (id) => previous.dictionary.has(id) !== dictionary.has(id)
      );
      dictionaryChanges.set(previous.dictionary, changes);
    }
    if (!previous || changes!.some((id) => parsed.searchable.includes(id))) {
      const rows: RelationEntitySentence[] = [];
      for (const [index, sentence] of parsed.sentences.entries()) {
        const present = [...new Set(matchEntities(sentence.text).map((mention) => mention.key))];
        if (present.length)
          rows.push({
            noteTitle: parsed.title,
            ...sentence,
            entities: present.map((id) => names.get(id)!),
            entityKeys: present,
          });
        if (Date.now() - lastYield >= 8) {
          phaseRatio =
            0.75 + (matchedNotes + (index + 1) / parsed.sentences.length) / (unique.length + 1) / 4;
          notify('running');
          await yieldRelationWork();
          checkRelationCancelled(signal);
          lastYield = Date.now();
        }
      }
      parsed.entitySentences = { dictionary, rows };
    }
    for (const row of parsed.entitySentences!.rows)
      for (const id of row.entityKeys!) details[id].sentences.push(row);
    parsed.entitySentences!.dictionary = dictionary;
    matchedNotes++;
    phaseRatio = 0.75 + matchedNotes / (unique.length + 1) / 4;
    if (Date.now() - lastYield >= 8) {
      notify('running');
      await yieldRelationWork();
      checkRelationCancelled(signal);
      lastYield = Date.now();
    }
  }
  memory.entityExtraction = {
    notes: new Map(parsedNotes.map((parsed) => [normalize(parsed.title), parsed])),
    result,
  };
  return finish(result);
}

type RelationKeywordIdentity = {
  text: string;
  /** 원본 이름에서 유도한 숫자·공통 접두 패턴. 열거로 수집한 개체 유형과는 다르다. */
  type: string | null;
  key: string;
};

type Keyword = { text: string; type: string | null; key?: string };

/**
 * 표시 이름과 비교 키를 만들고 숫자가 있는 이름의 초기 패턴을 생성한다.
 *
 * @param text 후보 원문. 표시 이름은 공백·유니코드만 정규화해 대소문자를 보존한다.
 * @returns 표시용 `text`, 소문자 비교용 `key`, 숫자열을 `{{NUM}}`으로 바꾼 초기 `type`.
 *   숫자 패턴의 실제 채택 여부는 전체 후보를 모은 뒤 `classifyRelationKeywords`에서 결정한다.
 */
function relationKeyword(text: string): RelationKeywordIdentity {
  const value = normalize(text);
  return {
    text: value,
    type: /[0-9]/.test(value) ? value.replace(/[0-9]+/g, '{{NUM}}') : null,
    key: value.toLowerCase(),
  };
}

type PrefixNode = {
  count: number;
  sample: string[];
  children: Map<string, PrefixNode>;
};
const brackets = /[\p{Ps}\p{Pe}<>＜＞]/u;
const special = /[\p{P}\p{S}]/u;

/**
 * 서로 다른 이름이 지지하는 진접두사를 트라이로 집계한다.
 *
 * @param words 숫자열을 빈 토큰으로 바꾼 이름별 유니코드 문자 배열.
 * @returns 이름 전체를 제외하고 괄호 구분자 직전까지만 기록한 접두사 인덱스.
 *   지지 수는 입력 이름마다 한 번씩 늘어나므로 호출 전에 동일 키를 정리해야 한다.
 */
function prefixIndex(words: string[][]): PrefixNode {
  const root: PrefixNode = { count: 0, sample: [], children: new Map() };
  for (const word of words) {
    let node = root;
    for (let i = 0; i < word.length - 1; i++) {
      if (brackets.test(word[i])) break;
      const character = word[i].toLowerCase();
      let next = node.children.get(character);
      if (!next) {
        next = { count: 0, sample: word, children: new Map() };
        node.children.set(character, next);
      }
      next.count++;
      node = next;
    }
  }
  return root;
}

/**
 * 3개 이상 이름이 공유하며 기호 또는 연속 공백 경계에서 끝나는 가장 긴 접두사를 찾는다.
 *
 * @param root 중복 이름을 제거한 접두사 인덱스.
 * @param word 판정할 이름의 문자 배열.
 * @returns 접두사 길이와 대표 이름의 문자 배열. 지지되거나 완결된 경계가 없으면 길이는 0이다.
 */
function longestPrefix(root: PrefixNode, word: string[]) {
  let node = root;
  let length = 0;
  let sample: string[] = [];
  for (let i = 0; i < word.length - 1; i++) {
    const next = node.children.get(word[i].toLowerCase());
    if (!next || next.count < 3) break;
    node = next;
    if (special.test(word[i]) || (/\s/u.test(word[i]) && length === i)) {
      length = i + 1;
      sample = node.sample;
    }
  }
  return { length, characters: sample.slice(0, length) };
}

/**
 * 채택된 키워드의 이름 패턴을 숫자 반복 또는 공통 접두 구조로 확정한다.
 *
 * 일반 이름은 동일 숫자 치환 패턴을 3개 이상이 공유하면 우선 사용한다. 그렇지 않으면
 * 3개 이상이 지지하는 접두사에 `{{TEXT}}`를 붙이고 접두사 속 숫자는 `{{NUMBER}}`로 표시한다.
 * 동일 키 중복은 패턴 지지 수를 늘리지 않는다.
 *
 * @param entities 출처 수 조건을 이미 통과한 원본 개체 목록.
 * @returns 입력 순서·부가 필드는 유지하고 `type`만 확정한 새 개체 목록.
 */
function classifyRelationKeywords<T extends Keyword>(entities: T[]): T[] {
  const unique = new Map<string, RelationKeywordIdentity>();
  for (const entity of entities) {
    const keyword = relationKeyword(entity.text);
    const previous = unique.get(keyword.key);
    if (!previous || keyword.text < previous.text) unique.set(keyword.key, keyword);
  }
  const keywords = [...unique.values()].sort((a, b) =>
    a.text < b.text ? -1 : a.text > b.text ? 1 : 0
  );
  const numericCounts = new Map<string, number>();
  for (const keyword of keywords)
    if (keyword.type !== null)
      numericCounts.set(keyword.type, (numericCounts.get(keyword.type) || 0) + 1);
  // Digit runs use an empty token, distinct from every literal source character or placeholder.
  const words = keywords.map(({ text }) =>
    text.split(/([0-9]+)/).flatMap((part, index) => (index % 2 ? [''] : [...part]))
  );
  const prefixes = prefixIndex(words);
  const types = new Map<string, string | null>();
  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    if (keyword.type !== null && numericCounts.get(keyword.type)! >= 3) {
      types.set(keyword.key, keyword.type);
      continue;
    }
    const prefix = longestPrefix(prefixes, words[i]);
    types.set(
      keyword.key,
      prefix.length
        ? `${prefix.characters.map((character) => character || '{{NUMBER}}').join('')}{{TEXT}}`
        : null
    );
  }
  return entities.map((entity) => ({
    ...entity,
    type: types.get(keywordKey(entity.text)) ?? null,
  }));
}

/**
 * 문서의 헤더·리스트·표에서 원시 열거를 구성한다.
 *
 * 빈 항목도 남겨 다음 단계의 항목별 키워드 수 검사에서 빠지지 않게 한다.
 * 리스트는 같은 부모를 공유하는 같은 리스트 단위로 묶고, 자식 리스트를 부모 문구에 합치지 않는다.
 * 표 열은 헤더 행을, 표 행은 첫 번째 열을 제외한다. 같은 레벨 헤더는 상위 헤더와 무관하게 묶는다.
 *
 * @param noteTitle 출처를 복원할 전체 노트 제목.
 * @param regions 헤더 복원까지 적용한 문서 영역.
 * @returns 아직 키워드 매칭·수량 판정하지 않은 후보. 형제 문서 제목은 다음 단계에서 추가한다.
 */
function relationDocumentEnumerations(
  noteTitle: string,
  regions: RelationEnumerationRegion[]
): RelationEnumerationCandidate[] {
  const groups = new Map<string, RelationEnumerationCandidate>();
  const listItems = new Map<number, EnumerationItem>();
  const group = (id: string, source: Omit<RelationEnumerationCandidate, 'items'>) => {
    let value = groups.get(id);
    if (!value) groups.set(id, (value = { ...source, items: [] }));
    return value.items;
  };
  for (const region of regions) {
    const item = { noteTitle, sectionPath: region.sectionPath, text: region.text, index: 0 };
    if (region.headingLevel !== undefined) {
      const items = group(`heading:${region.headingLevel}`, {
        kind: 'heading',
        noteTitle,
        level: region.headingLevel,
      });
      items.push({ ...item, index: items.length });
    }
    if (region.listItem) {
      const { list, parent, item: id } = region.listItem;
      const items = group(`list:${list}`, { kind: 'list', noteTitle, list, parentItem: parent });
      let entry = listItems.get(id);
      if (!entry) {
        entry = { ...item, index: items.length };
        listItems.set(id, entry);
        items.push(entry);
      } else if (region.text) entry.text = [entry.text, region.text].filter(Boolean).join('\n');
    }
    if (region.cell && !region.cell.header) {
      const { table, row, column } = region.cell;
      group(`column:${table}:${column}`, { kind: 'table-column', noteTitle, table, column }).push({
        ...item,
        index: row,
      });
      if (column > 0)
        group(`row:${table}:${row}`, { kind: 'table-row', noteTitle, table, row }).push({
          ...item,
          index: column,
        });
    }
  }
  return [...groups.values()];
}

/**
 * 인라인 토큰의 이스케이프·엔티티·중첩 링크를 표시 텍스트로 복원한다.
 *
 * @param tokens 에디터 Markdown 파서의 인라인 토큰.
 * @returns URL 자체를 본문 문구로 해석하지 않은 텍스트.
 */
function tokenText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content;
      if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
      if (token.type === 'html_inline' && /^<br\b/i.test(token.content)) return ' ';
      return '';
    })
    .join('');
}

/**
 * HTML 변환 중 사라질 텍스트 노드의 줄바꿈을 보존한다.
 *
 * @param html 저장된 에디터 HTML.
 * @param toMarkdown 에디터에서 제공하는 HTML → Markdown 변환기.
 * @returns 블록·명시적 줄바꿈과 레코드 줄 경계를 토큰 파서에 전달할 Markdown.
 */
function markdownWithLineBreaks(html: string, toMarkdown: (html: string) => string): string {
  let marker = '\uE000';
  while (html.includes(marker)) marker += '\uE000';
  const source = html
    // A rendered Markdown hard break already has a <br>; its following newline is formatting.
    .replace(/(<br\b[^>]*>)[ \t]*\r?\n/gi, '$1');
  const inlineTag = /^<\/?(?:a|b|strong|i|em|u|s|del|code|span|small|sup|sub|mark)\b/i;
  let previousTag = '';
  let inCell = false;
  const protectedHtml = source.replace(
    /(<(?:[^"'<>]|"[^"]*"|'[^']*')*>)|([^<]+)/g,
    (part, tag, text, offset) => {
      if (tag) {
        previousTag = tag;
        if (/^<\/?(?:td|th)\b/i.test(tag)) inCell = !/^<\//.test(tag);
        // Markdown tables cannot contain literal line breaks inside a cell.
        if (inCell && /^<br\b/i.test(tag)) return marker + 'b';
        return part;
      }
      const inlineGap =
        inlineTag.test(previousTag) && inlineTag.test(source.slice(offset + part.length));
      if (!/\S/.test(text) && !inlineGap) return part;
      return text.replace(
        /\r\n?|\n|\t/g,
        (space: string) => marker + (space === '\t' ? 't' : inCell ? 'b' : 'n')
      );
    }
  );
  return toMarkdown(protectedHtml)
    .replaceAll(marker + 'n', '\n')
    .replaceAll(marker + 't', '\t')
    .replaceAll(marker + 'b', '<br>');
}

/**
 * 반복 레코드 형식을 구분하기 위해 한 줄의 구조 표식을 검사한다.
 *
 * @param tokens 줄을 구성하는 인라인 토큰.
 * @returns 필드·설정·번호 등 줄 단위 레코드로 볼 수 있는지 여부. 도메인 단어 목록은 사용하지 않는다.
 */
function isRecordLine(tokens: Token[]): boolean {
  const raw = tokenText(tokens);
  const text = normalize(raw);
  return (
    namedFields(text).length > 0 ||
    /\S\t+\S|\S\s*(?:=|->|=>|→|\|)\s*\S/u.test(raw) ||
    /^(?:[•‣▪]\s+|\p{No}\s+|\(\d+\)\s+|\[[ xX]\]\s+)/u.test(text)
  );
}

/**
 * 명시적 파일 링크를 현재 분석 범위의 문서 경로로 해석한다.
 *
 * @param href 원본 링크 주소.
 * @param title 상대 경로의 기준인 출처 문서 제목.
 * @param titles 현재 범위의 정규화 문서 경로 집합.
 * @returns 범위 안에 존재하는 파일 링크의 대상. 일반 문서명 언급이나 해석 불가 주소는 `undefined`.
 */
function fileTarget(href: string, title: string, titles: Set<string>): string | undefined {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#')) return;
  let path: string;
  try {
    path = decodeURIComponent(href.split('#')[0].split('?')[0]);
  } catch {
    return;
  }
  const parts = path.startsWith('/') ? [] : title.split('/').slice(0, -1);
  for (const part of path.replace(/\.(md|markdown)$/i, '').split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  const target = normalize(parts.join('/'));
  return titles.has(target) ? target : undefined;
}

/**
 * 저장 본문을 한 번 토큰화해 영역·키워드 출처·구조 문맥을 함께 추출한다.
 *
 * 주석·코드/스크립트/스타일 및 숨긴 메타데이터를 분리하고 HTML과 Markdown을 같은 구조로
 * 처리한다. 헤더 경로, 리스트 부모/항목, 표 좌표와 열 이름, 필드·링크의 원문 위치를 보존한다.
 * 표 헤더는 출처 후보에서 제외하며 필드 값 내부의 콜론을 무조건 새 필드로 나누지 않는다.
 *
 * @param note 제목과 저장 본문을 가진 노트.
 * @param toMarkdown 에디터의 HTML 변환기.
 * @returns 원본 파싱 결과. 범위 전체의 반복 탐색 영역·표 헤더 추론은 이후에 적용한다.
 */
function parseRelationDocument(
  note: RelationAnalysisNote,
  toMarkdown: (html: string) => string
): RelationDocument {
  const description = note.description || '';
  let source = description
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(pre|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const hiddenMetadata =
    /<div\b[^>]*class=["'][^"']*yaml-frontmatter[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
  const hiddenYaml = /data-yaml=["']([^"']*)["']/i.exec(source)?.[1];
  let decodedMetadata = '';
  try {
    decodedMetadata = decodeURIComponent(hiddenYaml || '');
  } catch {}
  source = source.replace(hiddenMetadata, '');
  if (/<[a-z][^>]*>/i.test(source)) source = markdownWithLineBreaks(source, toMarkdown);
  const frontmatter = /^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  const metadata = frontmatter?.[1] || decodedMetadata;
  const metadataUrls = new Set(
    [...metadata.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0])
  );
  const metadataValues = [...metadata.matchAll(/^\s*([^:#\n]+):\s*(.+?)\s*$/gm)]
    .map((match) => ({ field: match[1].trim(), value: match[2].replace(/^(["'])(.*)\1$/, '$2') }))
    .filter(({ value }) => !metadataUrls.has(value));
  const identities = (href: string) => {
    if (!metadataUrls.has(href)) return [];
    try {
      const url = new URL(href);
      const components = decodeURIComponent(url.pathname).split('/');
      url.searchParams.forEach((value) => components.push(value));
      return metadataValues
        .filter(({ value }) => components.includes(value))
        .map(({ field, value }) => JSON.stringify([field, value]));
    } catch {
      return [];
    }
  };
  source = source.slice(frontmatter?.[0].length || 0);
  const tokens = toToken(source);
  const regions: Region[] = [];
  const headings: { level: number; title: string }[] = [];
  let table = -1;
  let row = -1;
  let column = -1;
  let columns: string[] = [];
  const headerRows: string[][] = [];
  const containers: string[] = [];
  const lists: { id: number; parent?: number }[] = [];
  const listItems: NonNullable<RelationEnumerationRegion['listItem']>[] = [];
  let nextList = 0;
  let nextItem = 0;
  let tableRow = -1;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open')
      lists.push({ id: nextList++, parent: listItems.at(-1)?.item });
    if (token.type === 'list_item_open') {
      const list = lists.at(-1)!;
      const listItem = { list: list.id, item: nextItem++, parent: list.parent };
      listItems.push(listItem);
      regions.push({
        text: '',
        sectionPath: headings.map((item) => item.title),
        listItem,
        blocks: [],
        sources: [],
        references: [],
        position: containers.join('/'),
        selfReference: false,
        identities: [],
      });
    }
    if (token.type === 'list_item_close') listItems.pop();
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') lists.pop();
    if (token.type === 'table_open') {
      table++;
      tableRow = -1;
      columns = [];
    }
    if (token.type === 'tr_open') {
      row++;
      tableRow++;
      column = -1;
    }
    if (token.type === 'td_open' || token.type === 'th_open') column++;
    if (token.type === 'thead_close') headerRows.push([...columns]);
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      while (headings.at(-1) && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, title: normalize(tokenText(tokens[index + 1]?.children || [])) });
    }
    if (token.nesting === -1) containers.pop();
    if (token.type === 'inline') {
      const children = token.children || [];
      const text = normalize(tokenText(children));
      const sectionPath = headings.map((item) => item.title);
      const context = {
        section: sectionPath.join(' / '),
        sectionPath,
        ...(listItems.at(-1) ? { listItem: listItems.at(-1) } : {}),
      };
      const previous = tokens[index - 1]?.type;
      const sources: RelationKeywordSource[] = [];
      const add = (
        kind: RelationKeywordSource['kind'],
        keyword: string,
        sourceText = text,
        href?: string
      ) => {
        if (previous === 'th_open') return;
        keyword = normalize(keyword);
        if ([...keyword].length > 1 && /\p{L}/u.test(keyword))
          sources.push({
            noteTitle: note.title,
            ...context,
            kind,
            keyword,
            text: sourceText,
            ...(href ? { href } : {}),
          });
      };
      const references: Region['references'] = [];
      const openings: { type: string; at: number; href?: string }[] = [];
      children.forEach((child, at) => {
        if (child.type === 'link_open' || child.type === 'strong_open')
          openings.push({ type: child.type, at, href: child.attrGet('href') || undefined });
        if (child.type === 'link_close' || child.type === 'strong_close') {
          const open = openings.pop();
          if (!open) return;
          const label = normalize(tokenText(children.slice(open.at + 1, at)));
          add(open.type === 'link_open' ? 'link' : 'bold', label, text, open.href);
          if (open.href) references.push({ text: label, href: open.href });
        }
      });
      const blocks: RelationTextBlock[] = [];
      if (previous === 'heading_open') add('heading', text);
      else if (previous === 'th_open') {
        columns[column] = text;
      } else if (previous === 'td_open') {
        if (text && columns[column])
          blocks.push({
            ...context,
            text,
            column: columns[column],
            columnIndex: column,
            table,
            row,
          });
      } else {
        const lines: { tokens: Token[]; hardBreak: boolean }[] = [{ tokens: [], hardBreak: false }];
        for (const child of children) {
          if (
            child.type === 'softbreak' ||
            child.type === 'hardbreak' ||
            (child.type === 'html_inline' && /^<br\b/i.test(child.content))
          )
            lines.push({ tokens: [], hardBreak: child.type !== 'softbreak' });
          else lines.at(-1)!.tokens.push(child);
        }
        const lineOriented = lines.filter((line) => isRecordLine(line.tokens)).length >= 2;
        let prose: string[] = [];
        const flush = () => {
          for (const sentence of normalize(prose.join(' ')).split(/(?<=[.!?。！？])\s+/))
            if (sentence) blocks.push({ ...context, text: sentence });
          prose = [];
        };
        for (const { tokens: line, hardBreak } of lines) {
          if (hardBreak || lineOriented) flush();
          const value = normalize(tokenText(line));
          // A URI is a reference address, not a predicate between words inside the address.
          if (/^[a-z][a-z\d+.-]*:\/\/\S+$/i.test(value)) {
            flush();
            continue;
          }
          // Parenthetical examples, timestamps and executable syntax are not property keys.
          const field = /^([^:：\n]+)[:：]\s*(.+)$/.exec(value);
          if (field && !field[2].startsWith('//')) {
            const named = namedFields(value);
            if (!named.length) {
              prose.push(value);
              continue;
            }
            flush();
            for (const item of named) {
              add('field-name', item.field, value);
              add('field-value', item.value, value);
              const entries = linkedFieldValues(line, value, item.start, item.value);
              for (const text of entries || [item.value])
                blocks.push({
                  ...context,
                  text,
                  field: item.field,
                  fieldValue: item.value,
                  sourceText: value,
                });
            }
          } else prose.push(value);
        }
        flush();
      }
      regions.push({
        blocks,
        sources,
        text,
        sectionPath,
        headingLevel:
          previous === 'heading_open' ? Number(tokens[index - 1].tag.slice(1)) : undefined,
        listItem: listItems.at(-1),
        cell:
          previous === 'th_open' || previous === 'td_open'
            ? { table, row: tableRow, column, header: previous === 'th_open' }
            : undefined,
        references,
        position: containers.join('/'),
        selfReference:
          references.length === 1 &&
          metadataUrls.has(references[0].href) &&
          text === references[0].text,
        identities: references.length === 1 ? identities(references[0].href) : [],
      });
    }
    if (token.nesting === 1) containers.push(token.type);
  }
  return { description, title: note.title, regions, metadataValues, headerRows };
}

/**
 * 명시적인 속성 경계만 분리하고 값 안의 콜론은 보존한다.
 *
 * @param text 한 영역의 원문.
 * @returns 필드명·값·원문 시작 위치 목록. 이 위치를 링크 값 분리 및 출처 복원에 사용한다.
 */
function namedFields(text: string): { field: string; value: string; start: number }[] {
  const first = /^([^:：\n]+)[:：]\s*(.+)$/.exec(text);
  if (!first || /[()[\]{}<>.!?。！？=]/u.test(first[1]) || !/\p{L}/u.test(first[1])) return [];
  const result: { field: string; value: string; start: number }[] = [];
  let field = first[1].trim();
  let start = first[0].length - first[2].length;
  const boundaries = /\s*[;·]\s*([^:：;·()[\]{}<>.!?=]+)[:：]\s*/gu;
  boundaries.lastIndex = start;
  for (const match of text.matchAll(boundaries)) {
    result.push({ field, value: text.slice(start, match.index).trim(), start });
    field = match[1].trim();
    start = match.index! + match[0].length;
  }
  result.push({ field, value: text.slice(start).trim(), start });
  return result.filter((item) => item.value.length > 0);
}

/**
 * 속성값 전체가 완전한 링크 목록인 경우에만 링크별 값을 분리한다.
 *
 * @param tokens 영역의 인라인 토큰.
 * @param text 영역의 전체 텍스트.
 * @param start 값의 시작 위치.
 * @param value 분리 전 속성값.
 * @returns 원문 위치가 보존된 값 목록. 해석되지 않는 링크도 다른 완전한 항목을 제거하지 않는다.
 */
function linkedFieldValues(tokens: Token[], text: string, start: number, value: string) {
  const entries: { text: string; start: number; end: number }[] = [];
  let open = -1;
  for (let at = 0; at < tokens.length; at++) {
    if (tokens[at].type === 'link_open') open = at;
    if (tokens[at].type !== 'link_close' || open < 0) continue;
    const label = normalize(tokenText(tokens.slice(open + 1, at)));
    // Preserve a trailing normalized space in the prefix so repeated plain text cannot steal
    // the position of a later linked occurrence. Verify spelling after normalization.
    const position = tokenText(tokens.slice(0, open))
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trimStart().length;
    open = -1;
    if (
      !label ||
      position < start ||
      position + label.length > start + value.length ||
      text.slice(position, position + label.length) !== label
    )
      continue;
    entries.push({ text: label, start: position - start, end: position - start + label.length });
  }
  if (!entries.length || text.slice(start, start + value.length) !== value) return;
  let cursor = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const gap = value.slice(cursor, entry.start);
    if (entry.start < cursor || !/^[\s,;/·|]*$/u.test(gap) || (i > 0 && !gap)) return;
    cursor = entry.end;
  }
  if (/^[\s,;/·|]*$/u.test(value.slice(cursor))) return entries.map((entry) => entry.text);
}

/**
 * 순번 열과 완전한 라벨 행이 함께 뒷받침될 때만 유실된 표 헤더를 복원한다.
 *
 * @param regions 현재 문서의 준비용 영역 복사본. 헤더·출처·열 역할 정보를 제자리에서 갱신한다.
 * @param knownHeaders 현재 범위에서 실제 헤더로 확인된 행 목록.
 * @returns 반환값 없음. 복원된 행의 키워드·본문을 제외하고 뒤따르는 데이터 셀의 열 이름을 맞춘다.
 */
function restoreTableHeaders(regions: Region[], knownHeaders: string[][]) {
  const tables = new Map<number, Region[]>();
  for (const region of regions) {
    const table = region.blocks[0]?.table;
    if (table === undefined) continue;
    const group = tables.get(table) || [];
    group.push(region);
    tables.set(table, group);
  }
  for (const group of tables.values()) {
    const blocks = group.flatMap((region) => region.blocks);
    const columns = [...new Map(blocks.map((block) => [block.columnIndex!, block.column!]))];
    const ordinals = columns.map(([, column]) => /^(\D+?)(\d+)$/u.exec(column));
    // Detect an ordinal family from its shared prefix and consecutive numbers, in any language.
    // No exported header name is reserved. Ordinary semantic headers remain untouched.
    if (
      !ordinals.every(
        (match, index) =>
          match && match[1] === ordinals[0]?.[1] && Number(match[2]) === columns[index][0] + 1
      )
    )
      continue;
    const width = new Set(blocks.map((block) => block.columnIndex)).size;
    const rows = new Map<number, RelationTextBlock[]>();
    for (const block of blocks) {
      const row = rows.get(block.row!) || [];
      row.push(block);
      rows.set(block.row!, row);
    }
    // Exported tables may start with sparse section captions before their actual schema.
    // Never search past a complete record: an ordinary later row must not become a header.
    const firstRow = [...rows.values()].find((row) => row.length === width) || [];
    const names = new Map(firstRow.map((block) => [block.columnIndex, block.text]));
    const corroborated = knownHeaders.some(
      (headers) =>
        headers.length > 1 &&
        headers.length <= width &&
        headers.every((header, index) => header && header === names.get(index))
    );
    const restored =
      firstRow.length === width &&
      width > 1 &&
      (firstRow[0].row === blocks[0].row || corroborated) &&
      firstRow.every((block) => /\p{L}/u.test(block.text) && !/[\d@:/\n]/u.test(block.text)) &&
      new Set(firstRow.map((block) => block.text)).size === width &&
      // Short words alone cannot distinguish a header from an ordinary first record.
      blocks.some((block) => block.row !== firstRow[0].row && /[\d@:/\n]/u.test(block.text));
    const headerRows = new Set(
      restored
        ? [...rows]
            .filter(
              ([, row]) =>
                row.length === width &&
                row.every((block) => block.text === names.get(block.columnIndex))
            )
            .map(([index]) => index)
        : []
    );
    for (const region of group) {
      if (headerRows.has(region.blocks[0].row!)) {
        if (region.cell) region.cell = { ...region.cell, header: true };
        region.sources = [];
        region.blocks = [];
      } else
        for (const block of region.blocks) {
          if (restored && block.row! > firstRow[0].row!)
            block.column = names.get(block.columnIndex);
        }
    }
  }
}

/**
 * 현재 문서 집합에서 반복 탐색 영역과 헤더를 검증해 분석용 코퍼스를 준비한다.
 *
 * 문서의 실제 조상 경로·영역 구조로 반복 탐색 역할을 판정하며 구분자 철자나 고정 위치에
 * 의존하지 않는다. 확인되지 않은 영역은 의미 입력으로 남긴다. 탐색 링크 표시명은 후보로
 * 유지하지만 검증된 자기 출처 푸터는 후보에서 제외한다. 추론은 원본 영역 복사본에 적용한다.
 *
 * @param notes 제목 중복을 제거한 노트 목록.
 * @param toMarkdown 본문 변환기.
 * @param documents 호출 범위 전용 원본 파싱 캐시. 삭제 문서를 제거하고 변경 문서만 다시 파싱한다.
 * @param check 반복 경계의 취소 확인 함수.
 * @returns 정규화 제목별 블록·출처·문장·제외 영역·원시 열거를 담은 코퍼스.
 */
async function prepareRelationCorpus(
  notes: RelationAnalysisNote[],
  toMarkdown: (html: string) => string,
  documents = new Map<string, RelationDocument>(),
  check: () => void = () => undefined,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, RelationContent>> {
  const titles = new Set(notes.map((note) => normalize(note.title)));
  for (const title of documents.keys()) if (!titles.has(title)) documents.delete(title);
  const proposals = new Map<Region, string>();
  const support = new Map<string, Set<string>>();
  const metadataOwners = new Map<string, Set<string>>();
  let yielded = Date.now();
  let processed = 0;
  const total = notes.length * 4;
  onProgress?.(0, total);
  for (const note of notes) {
    check();
    const title = normalize(note.title);
    let document = documents.get(title);
    if (
      !document ||
      document.title !== note.title ||
      document.description !== (note.description || '')
    ) {
      document = parseRelationDocument(note, toMarkdown);
      documents.set(title, document);
    }
    for (const item of document.metadataValues) {
      const value = JSON.stringify([item.field, item.value]);
      const owners = metadataOwners.get(value) || new Set<string>();
      owners.add(title);
      metadataOwners.set(value, owners);
    }
    processed++;
    if (Date.now() - yielded >= 8) {
      onProgress?.(processed, total);
      await yieldRelationWork();
      yielded = Date.now();
    }
  }
  const headerRows = [
    ...new Map(
      [...documents.values()]
        .flatMap((document) => document.headerRows || [])
        .map((row) => [JSON.stringify(row), row])
    ).values(),
  ];
  // Recompute inferred roles from cached raw regions. Removing corroborating notes must undo
  // a previous inference rather than leave mutated headers in the document cache.
  const prepared = new Map<string, RelationDocument>();
  for (const [title, document] of documents) {
    check();
    const regions = document.regions.map((region) => ({
      ...region,
      blocks: region.blocks.map((block) => ({ ...block })),
      sources: [...region.sources],
    }));
    restoreTableHeaders(regions, headerRows);
    prepared.set(title, { ...document, regions });
    processed++;
    if (Date.now() - yielded >= 8) {
      onProgress?.(processed, total);
      await yieldRelationWork();
      yielded = Date.now();
    }
  }
  for (const note of notes) {
    check();
    const title = normalize(note.title);
    const document = prepared.get(title)!;
    for (const region of document.regions) {
      if (!region.blocks.length || region.blocks.some((block) => block.column)) continue;
      const targets = region.references.map((ref) => fileTarget(ref.href, note.title, titles));
      let chain =
        targets.length > 0 &&
        targets.every(
          (target, index) =>
            target &&
            title.startsWith(target + '/') &&
            (!index || target.startsWith(targets[index - 1]! + '/'))
        );
      let residual = region.text;
      for (const ref of region.references) residual = residual.replace(ref.text, '');
      if (!region.references.length) {
        // Plain ancestor captions can establish a region role, but never a hyperlink or entity.
        const parts = title.split('/');
        const ancestors = parts
          .slice(0, -1)
          .map((_, index) => parts.slice(0, index + 1).join('/'))
          .filter((ancestor) => titles.has(ancestor));
        let end = 0;
        let count = 0;
        let ambiguous = false;
        const captions = new Set<string>();
        for (const ancestor of ancestors) {
          const caption = noteBasename(ancestor);
          const at = residual.indexOf(caption, end);
          if (at < 0) continue;
          if (captions.has(caption)) {
            ambiguous = true;
            break;
          }
          captions.add(caption);
          end = at + caption.length;
          count++;
        }
        if (count > 1 && !ambiguous) {
          for (const caption of captions) residual = residual.replace(caption, '');
          chain = true;
        }
      }
      const selfReference =
        (region.selfReference &&
          region.identities.some((value) => metadataOwners.get(value)?.size === 1)) ||
        (targets.length === 1 && targets[0] === title && region.text === region.references[0].text);
      if (selfReference) region.selfReference = true;
      if (!selfReference && (!chain || /[\p{L}\p{N}]/u.test(residual))) continue;
      const role = `${selfReference ? 'self-reference' : 'ancestry'}:${region.position}`;
      proposals.set(region, role);
      const notes = support.get(role) || new Set<string>();
      notes.add(title);
      support.set(role, notes);
    }
    processed++;
    if (Date.now() - yielded >= 8) {
      onProgress?.(processed, total);
      await yieldRelationWork();
      yielded = Date.now();
    }
  }
  const result = new Map<string, RelationContent>();
  for (const note of notes) {
    check();
    const document = prepared.get(normalize(note.title))!;
    const blocks: RelationTextBlock[] = [];
    const keywordSources: RelationKeywordSource[] = [
      {
        noteTitle: note.title,
        section: '',
        sectionPath: [],
        kind: 'title',
        keyword: noteBasename(note.title),
        text: noteBasename(note.title),
      },
    ].filter(
      (source) => [...source.keyword].length > 1 && /\p{L}/u.test(source.keyword)
    ) as RelationKeywordSource[];
    const excludedRegions: number[] = [];
    document.regions.forEach((region, index) => {
      const role = proposals.get(region);
      const excluded = role !== undefined && support.get(role)!.size > 1;
      if (excluded) excludedRegions.push(index);
      else blocks.push(...region.blocks);
      if (!excluded || !region.selfReference)
        keywordSources.push(
          ...region.sources.map((source) =>
            source.noteTitle ? source : { ...source, noteTitle: note.title }
          )
        );
    });
    const sentences: RelationContent['sentences'] = [];
    let row: RelationTextBlock[] = [];
    const flush = () => {
      if (row.length)
        sentences.push({
          ...row[0],
          text: row.map((cell) => `${cell.column}: ${cell.text}`).join('; '),
        });
      row = [];
    };
    for (const block of blocks) {
      if (block.column) {
        if (row.length && row[0].row !== block.row) flush();
        row.push(block);
      } else {
        flush();
        sentences.push({
          ...block,
          text: block.field ? `${block.field}: ${block.text}` : block.text,
        });
      }
    }
    flush();
    result.set(normalize(note.title), {
      blocks,
      keywordSources,
      sentences,
      excludedRegions,
      enumerations: relationDocumentEnumerations(note.title, document.regions),
    });
    processed++;
    if (Date.now() - yielded >= 8) {
      onProgress?.(processed, total);
      await yieldRelationWork();
      yielded = Date.now();
      check();
    }
  }
  onProgress?.(processed, total);
  check();
  return result;
}
/**
 * 코퍼스의 한 문서를 키워드 추출용 세션 객체로 저장하거나 재사용한다.
 *
 * @param note 현재 원문.
 * @param memory 현재 분석 범위의 세션 메모리.
 * @param content 범위 전체의 추론을 적용한 현재 문서의 코퍼스.
 * @returns 문장 매칭 캐시를 유지할 파싱 노트. 재사용 시에도 원시 열거 스냅샷은 최신 코퍼스로 갱신한다.
 */
function parseRelationNote(
  note: RelationAnalysisNote,
  memory: RelationDiscoveryMemory,
  content: RelationContent
): ParsedRelationNote {
  const path = normalize(note.title);
  const description = note.description || '';
  const previous = memory.notes.get(path);
  const contentVersion = JSON.stringify(content.excludedRegions);
  if (
    previous?.title === note.title &&
    previous.description === description &&
    previous.contentVersion === contentVersion
  ) {
    previous.enumerations = content.enumerations;
    return previous;
  }
  const { blocks, keywordSources, sentences, enumerations } = content;
  const parsed = {
    title: note.title,
    description,
    contentVersion,
    blocks,
    keywordSources,
    sentences,
    enumerations,
    searchable: keywordKey(
      [noteBasename(note.title), ...sentences.map((sentence) => sentence.text)].join('\n')
    ),
  };
  memory.notes.set(path, parsed);
  return parsed;
}

const entityMatchers = new WeakMap<
  RelationEntityResult,
  ReturnType<typeof createRelationKeywordMatcher>
>();

/**
 * 동일 추출 결과의 키워드 사전과 텍스트 매칭을 재사용한다.
 *
 * @param result 채택된 원본 개체 결과. 사용 중 개체 사전을 변경하지 않아야 한다.
 * @returns 결과 객체를 약한 참조 키로 공유하는 매칭 함수.
 */
function createEntityMatcher(result: RelationEntityResult) {
  let matcher = entityMatchers.get(result);
  if (!matcher)
    entityMatchers.set(result, (matcher = createRelationKeywordMatcher(result.entities)));
  return matcher;
}
