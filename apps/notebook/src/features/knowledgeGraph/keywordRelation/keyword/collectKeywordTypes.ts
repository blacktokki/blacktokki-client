/**
 * @file 키워드 처리 2단계: 항목별 키워드 수가 같은 열거와 반복 개체 유형 수집.
 *
 * 공개 진입점은 `collectKeywordTypes` 하나이다. 열거 채택·부분열거 마이닝·유형 명명은
 * 이 파일의 비공개 구현이며, 결과를 3단계 `collectKeywordRelations`에 전달한다.
 */
import {
  checkRelationCancelled,
  yieldRelationWork,
  relationEnumerationContext,
  relationEnumerationItemKey,
  createRelationKeywordMatcher,
  normalizeRelationText,
  relationKeywordEntityKey,
  relationKeywordKey,
} from './keywordUtils';
import type {
  KeywordExtraction,
  KeywordTypeCollection,
  CollectedEntityTypes,
  RelationKeywordCompositionResult,
} from './keywordUtils';
import type {
  RelationEntityType,
  RelationEnumerationCandidate,
  RelationEnumerationPattern,
  RelationKeywordEnumeration,
  AssociationOptions,
} from '../types';

/**
 * 키워드 추출 결과를 바탕으로 열거와 개체 유형 및 상하위 관계를 수집한다.
 *
 * 개발자 로그의 **키워드 개수 일치 열거 수집 → 수집된 개체 유형**에 해당한다.
 * 이 단계는 원본 개체나 연관관계 후보를 새로 만들지 않는다.
 *
 * @param input `extractKeywords`의 반환값. 원본 개체·복합/구성 분석·원시 열거가 같은 입력에
 *   속해야 하며 메모리의 분석 범위도 같아야 한다.
 * @param options 취소 신호와 유형 수집 완료 콜백.
 * @param options.signal 반복 처리 경계에서 확인할 중단 신호.
 * @param options.onEntityTypes 열거·유형을 포함한 완성 개체 추출 결과의 알림. 로그는 호출자가 출력한다.
 * @returns `notes`, 유형이 보강된 `extraction`, 동일한 `composition`과 `memory`.
 *   원시 열거 `contents`는 다음 단계로 전달하지 않는다.
 * @throws 중단 시 `AbortError`. 콜백 오류도 전파하며 이미 갱신한 메모리는 롤백하지 않는다.
 *
 * @remarks
 * **열거를 수집하는 구조**
 * - 같은 상위 경로의 형제 문서 제목: 상위 경로를 뺀 마지막 제목끼리 비교한다.
 * - 한 문서의 같은 H1~H6 레벨 제목: 상위 헤더가 달라도 레벨이 같으면 한 묶음이다.
 * - 한 문서의 같은 리스트에서 동일 부모를 공유하는 항목: 최상위 리스트도 포함하며
 *   자식 리스트의 문구는 부모 항목에 합치지 않는다.
 * - 한 표의 각 열: 실제·복원 헤더 행을 제외한 셀들이다.
 * - 한 표의 각 본문 행: 헤더 열로 취급하는 첫 번째 열을 제외한 셀들이다.
 *
 * **항목별 키워드 수와 해체 판정**
 * - 항목이 2개 이상이고 각 항목의 서로 다른 키워드 수가 모두 같은 양수여야 한다.
 *   동일 키의 반복은 한 번만 세고 빈 항목을 삭제하여 조건을 맞추지 않는다.
 * - 원본 매칭과 포함 키워드 해체 결과를 독립적으로 검사한다. 해체 시 복합 키를 모든
 *   포함 키로 치환하고 원래 복합 키는 함께 세지 않는다. 구성 키 자체의 등장도 감지하며
 *   구성 키가 복합 키이면 그 포함 키를 사용한다. 결과 키는 항목 안에서 다시 중복 제거한다.
 * - 원본이 실패해도 해체 결과가 조건을 만족하면 채택한다. 두 결과가 모두 유효하고 다르면
 *   둘 다 남기며 같으면 원본만 남긴다. 두 해석은 같은 `sourceIndex`를 공유하므로
 *   유형의 지지 열거 수를 두 번 늘리지 않는다. 원본 개체·관계 후보의 이름은 치환하지 않는다.
 *
 * **반복 부분열거와 계층**
 * - 항목은 정규화한 키 조합으로 비교한다. 항목 순서·키워드 순서·주변 문구는 무시하고
 *   여러 키를 가진 항목도 하나의 집합 항목으로 유지한다. 같은 열거의 중복 항목은 지지 수와
 *   부분열거 길이를 늘리지 않는다. 항목당 키워드 수가 같은 열거끼리만 비교한다.
 * - 서로 다른 원본 열거 3개 이상에서 반복되면 항목 2개 이상, 정확히 2개에서 반복되면
 *   항목 3개 이상인 부분열거를 유형으로 채택한다.
 * - 같은 지지 출처 집합에서는 가장 큰 공통 항목 집합을 유지한다. 더 작은 집합이 더 많은
 *   출처에서 지지되면 별도 유형으로 남기는 닫힌 빈발 항목 집합 방식이다.
 * - 같은 항목별 키워드 수 안에서 진부분집합을 상위, 이를 포함한 더 긴 집합을 하위로 삼는다.
 *   모든 진부분집합 쌍을 연결하므로 다중 상위와 추이 관계도 포함한다.
 *   예: `[A,B,C]`, `[A,B,C,D]`, `[A,B,E]`는 `[A,B]` 3회와 `[A,B,C]` 2회를 수집한다.
 *   상하위 참조는 결과 배열의 `parentIndices`·`childIndices`이며 원문 위치 번호와 다르다.
 *
 * **개체 유형 이름**
 * - 출처 상위 이름의 공통 조각, 모든 항목의 어느 키에나 나타나는 공통 부분, 상위 종류를
 *   조합한다. 종류는 맨 앞의 `<종류>`이고 설명은 ` · `로 잇는다.
 *   예: `<리스트> 프로젝트 개발 도구 · react`. 종류만 있으면 꺾쇠 없이 종류를 표시한다.
 * - 공백·유니코드·대소문자를 정규화하고 자동 위치·순번과 숫자·기호만인 조각은 제외한다.
 *   부분 문자열 위치는 달라도 되며 한 글자 조각은 모든 대상에서 독립 항목일 때만 사용한다.
 * - 공통 조각 하나를 우선한다. 없으면 정확히 두 조각이 전체를 포괄할 때 `A / B`로 표시하며
 *   세 조각 이상이 필요하면 후보를 버린다. 상위 종류도 최대 두 종류까지 조합한다.
 * - 출처 이름·종류 중 하나라도 이름을 제공하면 키워드는 전체 공통 부분만 사용한다.
 *   둘 다 실패했을 때만 키워드에도 두 조각 OR를 허용한다. 중복·포함된 설명 조각은 합친다.
 * - 이름을 얻지 못하면 모든 항목의 키를 정렬해 그대로 사용한다. 단일 키 항목은 `이메일 · 전화`,
 *   복수 키 항목은 `(alpha + beta) · (delta + gamma)`처럼 경계를 보존한다.
 *   항목 수나 길이를 자르지 않는다. 같은 이름의 유형은 결과 번호에 따른 `#번호`로 구분한다.
 *
 * **결과·로그·메모리 계약**
 * - 새 유형 결과는 입력 추출 객체를 복사해 만들므로 1단계 결과 스냅샷을 변경하지 않는다.
 *   열거·유형이 모두 있는 완성 캐시는 같은 객체로 재사용한다.
 * - 메모리의 추출 캐시가 입력 객체를 가리키면 보강 결과로 교체한다. 성공 알림 후 파싱 노트의
 *   원시 열거 참조를 해제하지만 입력 `contents` 스냅샷은 남아 같은 입력으로 재시도할 수 있다.
 * - 로그의 `열거목록`·`개체유형목록`은 `항목별키워드수`로 그룹화한다. `키워드`에는
 *   정규화 키만 쓰고 별도 `키워드키`를 만들지 않는다. `부분열거`는 `[["alpha"],["beta"]]`
 *   또는 `[["alpha","beta"],["gamma","delta"]]`처럼 항목별 배열을 직접 표시한다.
 * - 출처 요약은 `상위이름`·`상위종류`로 통일한다. 공통 위치를 노트·경로·리스트·표 좌표로
 *   중복 표시하지 않고, 공통 출처와 다른 항목만 자체 출처 요약을 덧붙인다.
 *   해체 결과는 `포함키워드해체: true`, 반복 출처는 `원본열거번호`, 유형 계층은 결과 번호로 표시한다.
 * - 영구 저장·점수 평가는 호출자의 책임이다. 결과 유형은 개체 추출 캐시와 함께 저장된다.
 */
export async function collectKeywordTypes(
  input: KeywordExtraction,
  options: Pick<
    AssociationOptions,
    'signal' | 'onEntityTypes' | 'onInferenceProgress' | 'translate'
  > = {}
): Promise<KeywordTypeCollection> {
  const { notes, memory } = input;
  const original = input.extraction;
  const started = Date.now();
  let ratio = 0;
  const report = (processed: number, total: number, value: number) => {
    checkRelationCancelled(options.signal);
    ratio = Math.max(ratio, value);
    options.onInferenceProgress?.({
      model: 'statistics',
      phase: 'association',
      unit: 'pattern',
      stage: 'types',
      processed,
      total,
      ratio,
      elapsedMs: Date.now() - started,
      status: ratio === 1 ? 'completed' : 'running',
    });
    checkRelationCancelled(options.signal);
  };
  report(0, 0, 0);
  checkRelationCancelled(options.signal);
  const enumerations =
    original.enumerations ||
    (original.entityTypes
      ? []
      : await collectRelationEnumerations(
          notes,
          input.contents,
          createRelationKeywordMatcher(original.entities),
          original.entities,
          input.composition,
          () => checkRelationCancelled(options.signal),
          (processed, total) => report(processed, total, total ? (0.4 * processed) / total : 0.4)
        ));
  let entityTypes = original.entityTypes;
  if (!entityTypes && !options.onInferenceProgress)
    entityTypes = collectRelationEntityTypes(enumerations, options.translate);
  if (!entityTypes) {
    const work = relationEntityTypeSteps(enumerations, options.translate);
    let step = work.next();
    let processed = 0;
    let yielded = Date.now();
    if (!step.done) report(processed, 0, 0.4 + 0.6 * step.value);
    while (!step.done) {
      processed++;
      if (Date.now() - yielded >= 8) {
        report(processed, 0, 0.4 + 0.6 * step.value);
        await yieldRelationWork(options.signal);
        checkRelationCancelled(options.signal);
        yielded = Date.now();
      }
      step = work.next();
    }
    entityTypes = step.value;
  }
  const extraction: CollectedEntityTypes =
    original.enumerations && original.entityTypes
      ? (original as CollectedEntityTypes)
      : {
          ...original,
          enumerations,
          entityTypes,
        };
  report(enumerations.length, enumerations.length, 1);
  if (memory.entityExtraction?.result === original) memory.entityExtraction.result = extraction;
  options.onEntityTypes?.(extraction);
  checkRelationCancelled(options.signal);
  for (const parsed of memory.notes.values()) parsed.enumerations = [];
  return { notes, extraction, composition: input.composition, memory };
}

/**
 * 항목별 키워드 수가 같은 열거에서 닫힌 빈발 항목 집합을 찾는다.
 *
 * @param enumerations 원본·해체 해석을 포함한 채택 열거.
 * @param minimumOccurrences 필요한 서로 다른 출처 수. `sourceIndex`가 없으면 입력 항목을 독립 출처로 센다.
 * @returns 같은 지지 출처 집합에서 다른 결과에 진포함되지 않는 공통 부분열거.
 *   동일 출처의 여러 해석은 지지 수를 한 번만 늘리며 각 출처의 일치 항목과 원래 배열 번호를 보존한다.
 */
function findRelationEnumerationPatterns(
  enumerations: RelationKeywordEnumeration[] = [],
  minimumOccurrences = 3
): RelationEnumerationPattern[] {
  const work = relationEnumerationPatternSteps(enumerations, minimumOccurrences);
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

function* relationEnumerationPatternSteps(
  enumerations: RelationKeywordEnumeration[],
  minimumOccurrences: number
): Generator<number, RelationEnumerationPattern[]> {
  const sourceKeys = enumerations.map((enumeration, index) =>
    enumeration.sourceIndex === undefined
      ? `enumeration:${index}`
      : `source:${enumeration.sourceIndex}`
  );
  const sourceCount = (indices: Iterable<number>) =>
    new Set([...indices].map((index) => sourceKeys[index])).size;
  const groups = new Map<
    number,
    {
      indices: number[];
      items: Map<
        string,
        {
          keywords: RelationKeywordEnumeration['items'][number]['keywords'];
          support: Set<number>;
        }
      >;
    }
  >();
  for (const [enumerationIndex, enumeration] of enumerations.entries()) {
    let group = groups.get(enumeration.keywordCount);
    if (!group) groups.set(enumeration.keywordCount, (group = { indices: [], items: new Map() }));
    group.indices.push(enumerationIndex);
    for (const item of enumeration.items) {
      const key = relationEnumerationItemKey(item);
      let entry = group.items.get(key);
      if (!entry) group.items.set(key, (entry = { keywords: item.keywords, support: new Set() }));
      entry.support.add(enumerationIndex);
    }
    yield (enumerationIndex + 1) / Math.max(1, enumerations.length) / 3;
  }
  const result: RelationEnumerationPattern[] = [];
  let completedGroups = 0;
  for (const [keywordCount, group] of groups) {
    const groupIndex = completedGroups++;
    if (sourceCount(group.indices) < minimumOccurrences) continue;
    const frequent = [...group.items].filter(
      ([, item]) => sourceCount(item.support) >= minimumOccurrences
    );
    if (frequent.length < 2) continue;
    const supports = [group.indices];
    const seen = new Set([JSON.stringify(group.indices)]);
    for (const [supportIndex, support] of supports.entries()) {
      const common: typeof frequent = [];
      for (const item of frequent) {
        const next = support.filter((index) => item[1].support.has(index));
        if (next.length === support.length) common.push(item);
        else if (sourceCount(next) >= minimumOccurrences) {
          const key = JSON.stringify(next);
          if (!seen.has(key)) {
            seen.add(key);
            supports.push(next);
          }
        }
        yield (1 + (groupIndex + (supportIndex + 1) / supports.length) / groups.size) / 3;
      }
      if (common.length < 2) continue;
      const keys = new Set(common.map(([key]) => key));
      const distinctSources = new Map<string, number>();
      for (const index of support)
        if (!distinctSources.has(sourceKeys[index])) distinctSources.set(sourceKeys[index], index);
      result.push({
        keywordCount,
        items: common.map(([, item]) => ({ keywords: item.keywords })),
        occurrences: [...distinctSources.values()].map((enumerationIndex) => ({
          ...enumerations[enumerationIndex],
          enumerationIndex,
          items: enumerations[enumerationIndex].items.filter((item) =>
            keys.has(relationEnumerationItemKey(item))
          ),
        })),
      });
    }
    yield (1 + completedGroups / groups.size) / 3;
  }
  const closures = new Map<string, { pattern: RelationEnumerationPattern; items: Set<string> }[]>();
  for (const [index, pattern] of result.entries()) {
    const key = JSON.stringify([
      pattern.keywordCount,
      pattern.occurrences.map((occurrence) => sourceKeys[occurrence.enumerationIndex]).sort(),
    ]);
    const group = closures.get(key) || [];
    group.push({ pattern, items: new Set(pattern.items.map(relationEnumerationItemKey)) });
    closures.set(key, group);
    yield 2 / 3 + (index + 1) / Math.max(1, result.length) / 6;
  }
  const redundant = new Set<RelationEnumerationPattern>();
  let checked = 0;
  for (const group of closures.values())
    for (const entry of group) {
      if (
        group.some(
          (other) =>
            other.items.size > entry.items.size &&
            [...entry.items].every((key) => other.items.has(key))
        )
      )
        redundant.add(entry.pattern);
      yield 5 / 6 + ++checked / Math.max(1, result.length) / 6;
    }
  return result.filter((pattern) => !redundant.has(pattern));
}

/**
 * 구조 후보의 원본·포함 키 해체 해석을 각각 검사해 항목별 키워드 수가 같은 열거만 남긴다.
 *
 * @param notes 형제 문서 제목을 구성할 전체 문서 목록.
 * @param contents 1단계에서 파싱한 원시 열거 스냅샷.
 * @param match 이미 채택한 원본 개체의 매칭 함수.
 * @param entities 표시명 복원을 위한 원본 개체 목록.
 * @param composition 1단계에서 계산한 복합·구성 정보. 같은 키 목록을 다시 분석하지 않는다.
 * @param check 취소 확인 함수.
 * @returns 항목이 2개 이상이며 키워드 수가 동일한 양수인 열거. 같은 구조 후보의 두 해석은
 *   `sourceIndex`를 공유하고 해체 해석에만 `decomposed: true`를 설정한다.
 */
async function collectRelationEnumerations(
  notes: { title: string }[],
  contents: Iterable<{ enumerations: RelationEnumerationCandidate[] }>,
  match: (text: string) => { key: string; text: string }[],
  entities: { key?: string; text: string }[],
  { compounds, constituents }: RelationKeywordCompositionResult,
  check: () => void,
  onProgress?: (processed: number, total: number) => void
): Promise<RelationKeywordEnumeration[]> {
  const names = new Map(entities.map((entity) => [relationKeywordEntityKey(entity), entity.text]));
  const matchConstituent = createRelationKeywordMatcher(
    constituents
      .filter((keyword) => !names.has(keyword.key))
      .map(({ key }) => ({ key, text: key, type: null }))
      .sort((a, b) => b.text.length - a.text.length)
  );
  const decompositions = new Map(
    compounds.map((compound) => [
      compound.key,
      compound.keywords.map((key) => ({ key, text: names.get(key) || key })),
    ])
  );
  const titles = new Map<string, RelationEnumerationCandidate>();
  for (const note of notes) {
    const parts = normalizeRelationText(note.title).split('/');
    const text = parts.pop()!;
    const parentPath = parts.join('/');
    let group = titles.get(parentPath);
    if (!group) titles.set(parentPath, (group = { kind: 'note-title', parentPath, items: [] }));
    group.items.push({ noteTitle: note.title, sectionPath: [], text, index: group.items.length });
  }
  const result: RelationKeywordEnumeration[] = [];
  let sourceIndex = -1;
  let yielded = Date.now();
  const candidates = [
    ...titles.values(),
    ...[...contents].flatMap((content) => content.enumerations),
  ];
  const total = candidates.reduce((sum, candidate) => sum + candidate.items.length + 1, 0);
  let processed = 0;
  onProgress?.(0, total);
  for (const candidate of candidates) {
    sourceIndex++;
    processed++;
    check();
    if (Date.now() - yielded >= 8) {
      onProgress?.(processed, total);
      await yieldRelationWork();
      yielded = Date.now();
      check();
    }
    if (candidate.items.length < 2) {
      processed += candidate.items.length;
      continue;
    }
    const items: RelationKeywordEnumeration['items'] = [];
    const decomposedItems: RelationKeywordEnumeration['items'] = [];
    for (const item of candidate.items) {
      const keywords = [
        ...new Map(match(item.text).map(({ key, text }) => [key, { key, text }])).values(),
      ];
      items.push({ ...item, keywords });
      if (decompositions.size)
        decomposedItems.push({
          ...item,
          keywords: [
            ...new Map(
              [...keywords, ...matchConstituent(item.text)]
                .flatMap((keyword) => decompositions.get(keyword.key) || [keyword])
                .map((keyword) => [keyword.key, keyword])
            ).values(),
          ],
        });
      if (Date.now() - yielded >= 8) {
        onProgress?.(processed, total);
        await yieldRelationWork();
        yielded = Date.now();
        check();
      }
      processed++;
    }
    const variants = [{ items, decomposed: false }];
    if (
      decomposedItems.length &&
      items.some(
        (item, index) =>
          relationEnumerationItemKey(item) !== relationEnumerationItemKey(decomposedItems[index])
      )
    )
      variants.push({ items: decomposedItems, decomposed: true });
    for (const variant of variants) {
      const keywordCount = variant.items[0].keywords.length;
      if (!keywordCount || variant.items.some((item) => item.keywords.length !== keywordCount))
        continue;
      result.push({
        ...candidate,
        keywordCount,
        items: variant.items,
        sourceIndex,
        ...(variant.decomposed ? { decomposed: true } : {}),
      });
    }
  }
  onProgress?.(processed, total);
  check();
  return result;
}
/**
 * 지정 위치에서 모든 그룹이 지지하는 최장 부분 문자열 길이를 이진 탐색한다.
 *
 * @param characters 기준 문자열의 유니코드 문자 배열.
 * @param start 탐색 시작 위치.
 * @param groups 각 그룹에서 하나 이상의 이름이 부분 문자열을 포함해야 하는 비교 집합.
 * @returns 모든 그룹에 존재하는 가장 긴 접두 부분의 문자 수.
 */
function matchingPrefixLength(characters: string[], start: number, groups: string[][]) {
  let low = 0;
  let high = characters.length - start;
  while (low < high) {
    const length = Math.ceil((low + high) / 2);
    const candidate = characters.slice(start, start + length).join('');
    if (groups.every((group) => group.some((value) => value.includes(candidate)))) low = length;
    else high = length - 1;
  }
  return low;
}

/**
 * 유형 이름의 설명 조각에서 경계 구분자와 의미 없는 후보를 제거한다.
 *
 * @param value 공통 부분 문자열 후보.
 * @param groups 후보를 지지하는 이름 그룹.
 * @returns 글자를 포함한 유효 조각. 한 글자는 모든 그룹에 독립 항목으로 있어야 하며 실패하면 빈 문자열.
 */
function meaningfulNamePart(value: string, groups: string[][]): string {
  const part = value.replace(/^[\s/|:;,_\-()[\]{}]+|[\s/|:;,_\-()[\]{}]+$/gu, '');
  if (!/\p{L}/u.test(part)) return '';
  if ([...part].length < 2 && !groups.every((group) => group.includes(part))) return '';
  return part;
}

/**
 * 모든 항목 그룹의 어느 키에나 나타나는 최대 공통 부분 문자열을 구한다.
 *
 * @param groups 항목마다 하나 이상의 키를 담은 배열. 키의 위치·나열 순서는 무관하다.
 * @returns 의미 있는 공통 조각 중 다른 공통 조각에 포함되지 않는 조각 목록.
 */
function commonNameParts(groups: string[][]): string[] {
  const words = groups.map((group) => group.map(relationKeywordKey).filter(Boolean));
  if (!words.length || words.some((group) => !group.length)) return [];
  const parts = new Set<string>();
  for (const word of words[0]) {
    const characters = [...word];
    for (let start = 0; start < characters.length; start++) {
      const length = matchingPrefixLength(characters, start, words);
      const part = meaningfulNamePart(characters.slice(start, start + length).join(''), words);
      if (part) parts.add(part);
    }
  }
  return [...parts].filter(
    (part) => ![...parts].some((other) => other !== part && other.includes(part))
  );
}

/**
 * 공통 설명 하나를 우선하고, 불가능할 때 두 조각의 OR로 전체 출처를 설명한다.
 *
 * @param groups 각 출처 또는 열거 항목의 설명 후보 문자열.
 * @returns 공통 조각들 또는 전체를 덮는 OR 조각 하나. 각 OR 조각에만 속하는 그룹이 있어야 하며
 *   균형·전체 길이·이름 순서로 결정하며 두 조각은 `/`로 구분한다.
 */
function nameParts(groups: string[][]): string[] {
  const common = commonNameParts(groups);
  if (common.length) return common;
  const words = groups.map((group) => group.map(relationKeywordKey).filter(Boolean));
  if (!words.length || words.some((group) => !group.length)) return [];
  const candidates = new Map<string, { part: string; support: Set<number> }>();
  for (const word of words[0]) {
    const characters = [...word];
    for (let start = 0; start < characters.length; start++) {
      // A fragment's coverage changes only at a group's longest matching prefix.
      const lengths = new Set(
        words.map((group) => matchingPrefixLength(characters, start, [group]))
      );
      for (const length of lengths) {
        const raw = characters.slice(start, start + length).join('');
        const support = words.flatMap((group, index) =>
          group.some((value) => value.includes(raw)) ? [index] : []
        );
        const part = meaningfulNamePart(
          raw,
          support.map((index) => words[index])
        );
        if (!part) continue;
        const matching = words.flatMap((group, index) =>
          group.some((value) => value.includes(part)) ? [index] : []
        );
        if (matching.length === words.length) continue;
        const key = matching.join(',');
        const previous = candidates.get(key);
        if (
          !previous ||
          part.length > previous.part.length ||
          (part.length === previous.part.length && part < previous.part)
        )
          candidates.set(key, { part, support: new Set(matching) });
      }
    }
  }
  let best: { name: string; balance: number; length: number } | undefined;
  for (const candidate of candidates.values()) {
    const uncovered = words.filter((_, index) => !candidate.support.has(index));
    for (const other of commonNameParts(uncovered)) {
      const otherSupport = words.map((group) => group.some((value) => value.includes(other)));
      const exclusive = [...candidate.support].filter((index) => !otherSupport[index]).length;
      if (!exclusive) continue;
      const balance = Math.min(exclusive, uncovered.length);
      const alternatives = [candidate.part, other].sort();
      const name = alternatives.join(' / ');
      const length = candidate.part.length + other.length;
      if (
        !best ||
        balance > best.balance ||
        (balance === best.balance &&
          (length > best.length || (length === best.length && name < best.name)))
      )
        best = { name, balance, length };
    }
  }
  return best ? [best.name] : [];
}

/**
 * 출처 설명·공통 키워드·상위 종류를 조합해 유형의 표시 이름을 만든다.
 *
 * @param pattern 발견 출처와 항목 경계가 유지된 부분열거.
 * @returns 상위 종류를 맨 앞에 둔 이름. 출처 명명이 실패할 때만 키워드 OR를 시도하고,
 *   끝까지 실패하면 항목과 키를 정렬한 전체 원문 키 조합을 반환한다.
 */
function relationEntityTypeName(
  pattern: RelationEnumerationPattern,
  translate?: (value: string) => string
): string {
  const contexts = pattern.occurrences.map((occurrence) =>
    relationEnumerationContext(occurrence, translate)
  );
  const sourceParts = nameParts(
    contexts.map((context) => context.sourceName.split(/[\s/|,:;()[\]{}<>]+/u).filter(Boolean))
  );
  const kinds = [...new Set(contexts.map((context) => context.kind))];
  const kind = kinds.length <= 2 ? kinds.sort().join(' / ') : '';
  const keywordGroups = pattern.items.map((item) => item.keywords.map((word) => word.key));
  const keywordParts =
    !sourceParts.length && !kind ? nameParts(keywordGroups) : commonNameParts(keywordGroups);
  const parts = [...new Set([sourceParts.join(' '), ...keywordParts, kind])].filter(Boolean);
  const retained = parts.filter(
    (part) => !parts.some((other) => other !== part && other.includes(part))
  );
  const kindLabel = retained.includes(kind) ? kind : '';
  const name = retained.filter((part) => part !== kind).join(' · ');
  if (name) return kindLabel ? `<${kindLabel}> ${name}` : name;
  if (kindLabel) return kindLabel;
  return pattern.items
    .map((item) => {
      const keys = [...new Set(item.keywords.map((word) => word.key))].sort();
      return keys.length > 1 ? `(${keys.join(' + ')})` : keys.join('');
    })
    .sort()
    .join(' · ');
}

/**
 * 지지 횟수와 항목 수 조건을 적용하고 모든 진부분집합 유형 쌍을 연결한다.
 *
 * @param enumerations 원본 출처 식별자가 보존된 채택 열거.
 * @returns 이름·부모/자식 배열 인덱스를 포함한 유형. 항목별 키워드 수와 항목 수로 정렬하고
 *   동명 유형에 번호를 덧붙인다. 지지 3회는 2항목부터, 지지 2회는 3항목부터 채택한다.
 */
function collectRelationEntityTypes(
  enumerations: RelationKeywordEnumeration[] = [],
  translate?: (value: string) => string
): RelationEntityType[] {
  const work = relationEntityTypeSteps(
    enumerations,
    translate,
    findRelationEnumerationPatterns(enumerations, 2)
  );
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

function* relationEntityTypeSteps(
  enumerations: RelationKeywordEnumeration[],
  translate?: (value: string) => string,
  prepared?: RelationEnumerationPattern[]
): Generator<number, RelationEntityType[]> {
  if (!prepared) {
    const work = relationEnumerationPatternSteps(enumerations, 2);
    let step = work.next();
    while (!step.done) {
      yield step.value * 0.6;
      step = work.next();
    }
    prepared = step.value;
  }
  const patterns = prepared
    .filter(
      (pattern) =>
        pattern.occurrences.length >= 3 ||
        (pattern.occurrences.length === 2 && pattern.items.length >= 3)
    )
    .sort((a, b) => a.keywordCount - b.keywordCount || a.items.length - b.items.length);
  const types: RelationEntityType[] = [];
  for (const [index, pattern] of patterns.entries()) {
    types.push({
      ...pattern,
      name: relationEntityTypeName(pattern, translate),
      parentIndices: [],
      childIndices: [],
    });
    yield 0.6 + (0.2 * (index + 1)) / patterns.length;
  }
  const nameCounts = new Map<string, number>();
  for (const type of types) nameCounts.set(type.name, (nameCounts.get(type.name) || 0) + 1);
  for (const [index, type] of types.entries())
    if (nameCounts.get(type.name)! > 1) type.name += ` #${index + 1}`;
  const sets = types.map((type) => new Set(type.items.map(relationEnumerationItemKey)));
  for (let parent = 0; parent < types.length; parent++) {
    for (let child = parent + 1; child < types.length; child++) {
      yield 0.8 + (0.2 * (parent + (child - parent) / (types.length - parent))) / types.length;
      if (types[parent].keywordCount !== types[child].keywordCount) break;
      if (sets[parent].size >= sets[child].size) continue;
      if (![...sets[parent]].every((key) => sets[child].has(key))) continue;
      types[parent].childIndices.push(child);
      types[child].parentIndices.push(parent);
    }
    yield 0.8 + (0.2 * (parent + 1)) / types.length;
  }
  return types;
}
