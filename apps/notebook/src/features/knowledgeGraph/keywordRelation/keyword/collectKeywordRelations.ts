/**
 * @file 키워드 처리 3단계: 구조 문맥별로 평가 전 연관관계 후보와 원시 집계를 수집.
 *
 * 공개 진입점은 `collectKeywordRelations` 하나이다. 후보 수집 뒤의 평가·저장·검색·화면
 * 표시는 다른 모듈이 담당하며, 아래 연동 규약은 수집 결과의 소비 방법을 설명한다.
 */
import {
  associationContextLabels,
  checkRelationCancelled,
  yieldRelationWork,
  createRelationKeywordMatcher,
  relationKeywordEntityKey,
  relationKeywordKey,
} from './keywordUtils';
import type { KeywordTypeCollection } from './keywordUtils';
import type {
  RelationTextBlock,
  InductiveRelationCandidate,
  RelationInputPattern,
  RelationObservation,
  RelationEntityType,
  AssociationContextKind,
  AssociationInferenceProgress,
  AssociationOptions,
  RelationAssociationPreparation,
} from '../types';

const noteBasename = (title: string) => title.split('/').at(-1) || title;

/**
 * 개체 유형 수집 결과로부터 방향 없는 연관관계 후보 묶음을 만든다.
 *
 * 개발자 로그의 **연관관계 후보 묶음** 단계이다. 반환값은 평가 전 자료이며,
 * 호출자는 이를 `evaluateKeywordAssociations`로 평가하거나 후보 캐시에 저장할 수 있다.
 *
 * @param input `collectKeywordTypes`의 반환값. 원본 개체·완성 유형·복합/구성 정보와
 *   파싱 블록 메모리가 같은 분석 입력에 속해야 한다.
 * @param options 취소 신호, 후보 수집 완료 및 수집 진행 콜백.
 * @param options.signal 문서·문맥·유형 조합 처리 사이에서 확인할 중단 신호.
 * @param options.onPatterns 후보 묶음의 입력 패턴 배열 알림. 모든 후보를 만든 후 한 번 호출한다.
 * @param options.onInferenceProgress `model: statistics`, `stage: collection` 진행 알림.
 *   이 단계의 이름에 inference가 있더라도 모델 추론은 실행하지 않는다.
 * @returns `result`의 개체·후보·근거와 `families`의 문맥 수·개체별 출현 수·쌍별 공출현 수.
 *   후보의 `measurements`는 빈 배열이며 연관성·일반화 점수는 아직 없다.
 * @throws 중단 시 `AbortError`. 콜백 오류도 그대로 전파한다.
 *
 * @remarks
 * **동등한 구조 문맥과 제외 규칙**
 * - 6종 문맥을 구분한다: 같은 문장, 같은 리스트 항목, 노트 소유자와 속성값,
 *   같은 표 행의 서로 다른 열, 헤더를 제외한 같은 표 셀, 같은 속성값 내부.
 * - 부모·자식 리스트나 제목·본문이라는 이유만으로 연결하지 않는다. 다른 표 행이나
 *   형제 리스트 항목을 순서대로 대응시키거나 같은 길이 열거를 임의로 연결하지 않는다.
 *   한 문장에 개체가 3개 이상 있어도 모든 적격 개체쌍을 수집한다.
 * - 유형 조합 확장 전에 수집된 개체 유형을 하나라도 공유하는 쌍을 제외한다.
 *   공통 상위·하위 유형도 포함한다. 비어 있지 않은 이름 패턴이 정규화 후 같은 쌍도 제외한다.
 *   양쪽 모두 패턴이 없으면 이 조건으로 제외하지 않는다.
 * - 복합–포함, 합성–구성처럼 포함 관계가 이미 성립한 쌍은 등장 순서와 무관하게 제외한다.
 *   위 규칙은 모든 문맥에 동일하게 적용하며, 규칙 변경 시 호출자는 기존 캐시 호환성을 갱신해야 한다.
 *
 * **원시 통계와 후보 묶음**
 * - `family`는 문맥 유형과 정규화 역할명으로 구분한다. 속성·속성값은 속성명별,
 *   표 행은 열 이름 조합별, 표 셀은 열 이름별로 통계를 분리한다.
 * - 키워드가 하나뿐인 문맥도 전체 문맥 수와 개별 출현 수에 포함한다. 이를 버리면
 *   흔한 키워드의 우연한 공출현을 과대평가하므로 단독 출현을 반드시 보존한다.
 * - 같은 노트·문단 경로·원문은 하나의 실제 근거로 식별한다. 유형 확장 복사본이나
 *   같은 위치의 반복은 근거 수를 늘리지 않지만 다른 노트·문단의 같은 문구는 별도 근거이다.
 * - 양끝 중 적어도 하나는 이름 패턴이나 수집된 유형을 가져야 한다. 다른 쪽은 고정 키워드여도 된다.
 *   소속된 상위·하위 유형을 모두 조합하되 각 자리의 수집 유형은 하나만 둔다.
 * - 방향을 정규화한 같은 유형/패턴/고정 키 조합을 합치고 실제 개체쌍이 2개 이상이거나
 *   실제 근거가 2개 이상인 묶음만 유지한다. `recurring`은 서로 다른 쌍과 노트가 모두 2개 이상일 때다.
 * - `{{E1: type=작업}} — {{E2: type=도구}}` 형태의 패턴을 로그에 사용한다. `수집후보수`는
 *   이 단계 배열 길이이며 화면에서 중복을 정리한 최종 고유 패턴 수와 다르다. 진행 상황은
 *   화면 콜백으로 알리고 평가 진행 로그를 콘솔에 계속 출력하지 않는다.
 *
 * **후속 평가 계약: 이 함수 밖에서 실행**
 * - 평가는 같은 family의 문맥 수·양끝 출현 수·쌍 공출현 수로 리프트·NPMI·특이성을 계산하고
 *   반복성과 문맥 가중치를 적용한다. 필드·표 행은 명시적 역할의 구조적 지지를 반영한다.
 * - 원시 연관성 점수는 0~1, 화면은 0~100이며 확률이 아닌 정렬용 값이다. 일반화 점수는
 *   서로 다른 쌍과 노트에서의 재현성을 따로 반영하고 개체쌍 하나이면 0이다.
 *   일반화 0이어도 여러 근거를 가진 개별 관계를 제거하지 않는다. 사용·지원 같은 의미나 방향은 단정하지 않는다.
 *
 * **캐시 연동 계약: relationAnalysis와 캐시 모듈의 책임**
 * - 준비 완료는 이 함수를 호출하기 전이다. 원문 식별값·규칙 버전·작은 완료 메타데이터를
 *   먼저 비교하고 생성/갱신이 필요할 때 사용자 실행을 기다린다. 명시적인 초 제한은 두지 않는다.
 * - 유효한 캐시는 별도 사용 버튼 없이 자동 복원하며 이 세 수집 단계를 건너뛴다.
 *   메모리에 평가 결과가 있으면 평가도 재사용하고, 영구 캐시만 있으면 저장된 원시 집계로 다시 평가한다.
 * - metadata는 빠른 호환성 확인, patterns는 패턴 해시·평가 전 집계와 현재 원문을 참조하는
 *   위치 정보이다. 제목·원문·근거를 복사하지 않고 같은 원문의 위치에서 메모리로 복원한다.
 *   저장 범위는 계정·노트북·개인 모드이며 구조 버전·원문 해시·무결성을 검증한다.
 *   점수·평가 measurements를 저장하지 않고 이전 원문 포함 캐시는 삭제하며 벡터는 유지한다.
 * - 후보가 없는 구형 패턴 캐시·손상·원문/규칙 불일치는 갱신을 안내하며 복원 도중 수집을
 *   조용히 재실행하지 않는다. 갱신은 평가 성공 후에만 기존 저장 패턴을 교체한다.
 *   실패·중단은 기존 저장 데이터를 유지하며 저장 오류는 화면 안내에 전달한다.
 * - 평가 결과·검색 그래프 스냅샷은 세션 메모리에만 남는다. 로컬 저장소
 *   `@blacktokki:notebook:keyword_relation`은 검색용 해시 식별자·모델별 벡터·완료 그래프/
 *   입력 버전·문서 순서의 벡터 식별자도 보관하며 계정·노트북·개인 모드로 구분한다.
 *   입력/모델과 전체 벡터가 맞으면 임베딩용 그래프 재구성·텍스트 해시·모델 로딩을 생략한다.
 *   현재 원문에서 검색/인용 색인은 구성하고 변경 검색 입력만 재임베딩한다.
 *   같은 저장소의 구형 벡터는 완료 정보를 보강해 재사용하며 이전 분석/검색 저장소는 이관하지 않는다.
 *   여러 개체·유형·관계가 참조하는 긴 원문은 검색 문서마다 복제하지 않고 공유한다.
 *   의미 검색 임베딩은 앞 384자를 사용하고 문자열 검색·출처 인용은 전체 원문을 사용한다.
 *   외부 링크는 저장된 URL·문맥을 사용하며 외부 페이지를 내려받지 않는다.
 * - 검색은 연관성 반영 후 최종 그래프를 임베딩한다. 공용 진행률은 평가 50%·검색 임베딩 50%이며
 *   평가 전 수집 건수는 단계별 처리량으로만 표시한다. 단계마다 달라지는 분모를 전체 진행률로
 *   사용하지 않으며, 임베딩 진행은 현재 분석 실행과 일치하는 최종 그래프 작업만 반영한다.
 *   화면 이동 중에도 실행하되 중단·확장 해제·계정/노트북/개인 모드 전환 시 취소한다.
 *   이 수집 함수 자체는 저장소 쓰기·모델 다운로드·임베딩·NLI 실행을 하지 않는다.
 *
 * **후속 화면 집계 계약: 수집 조건과 별개**
 * - `relationPresentation`은 필터 후 중복 근거를 정리하고 최종 그룹을 만든다. 유형·패턴의
 *   서로 다른 상대 개체(개체 탭) 또는 개체쌍(관계 목록)이 1개이면 키워드 그룹으로 전환한다.
 *   더 일반적인 유형 조합으로 남기는 중복 쌍의 근거·평가 내역은 유지 그룹에 합친다.
 * - 집계 기준은 문맥 유형과 속성명/표 열 역할이며 출처 문서가 같다는 이유만으로 합치지 않는다.
 *   대시보드 고유 패턴 수와 필터 건수는 이 표시 기준을 사용하고, 전체 로그는 화면 필터 적용 전이다.
 * - 그룹 점수는 현재 페이지가 아닌 필터를 통과한 전체의 출처 문맥별 평균이다. 원본 점수 0.5
 *   이상, 근거 2개 이상인 하위 요소가 2개 이상, 단일 근거 하위 요소가 1개 이하라는 3조건 중
 *   2개 이상이면 화면의 근거 충족 필터를 통과한다. 근거 수는 노트·경로·원문으로 중복 제거한다.
 * - 표시 트리는 개체쌍 → 연결 유형 → 집계 기준 → 근거이며 양 탭이 같은 컴포넌트를 사용한다.
 *   최상위 그룹은 10개, 개별 상대/개체쌍과 집계 기준은 20개, 근거는 5개씩 페이지를 나눈다.
 *   유형·패턴 제목은 `{{ }}`로 감싸고 고정 키워드는 원래 이름을 표시한다.
 */
export async function collectKeywordRelations(
  input: KeywordTypeCollection,
  options: Pick<AssociationOptions, 'signal' | 'onPatterns' | 'onInferenceProgress'> = {}
): Promise<RelationAssociationPreparation> {
  const { memory, extraction } = input;
  checkRelationCancelled(options.signal);
  const match = createRelationKeywordMatcher(extraction.entities);
  const inventory = new Map(
    extraction.entities.map((entity) => [relationKeywordEntityKey(entity), entity])
  );
  const memberships = relationPatternEntityTypes(extraction.entityTypes);
  const { composition } = input;
  const compositionPairs = new Set(
    composition.compounds.flatMap(({ key, keywords }) =>
      keywords.map((keyword) => pairKey(key, keyword))
    )
  );
  const contexts: Context[] = [];
  const started = Date.now();
  const report = (
    stage: 'contexts' | 'collection' | 'grouping',
    processed: number,
    total: number,
    status: AssociationInferenceProgress['status'] = 'running',
    ratio = total ? processed / total : status === 'completed' ? 1 : 0
  ) => {
    checkRelationCancelled(options.signal);
    options.onInferenceProgress?.({
      model: 'statistics',
      phase: 'association',
      unit: stage === 'contexts' ? 'note' : stage === 'grouping' ? 'pattern' : 'context',
      stage,
      total,
      processed,
      ratio,
      elapsedMs: Date.now() - started,
      status,
    });
    checkRelationCancelled(options.signal);
  };
  let completed = 0;
  let contextYielded = Date.now();
  report('contexts', 0, memory.notes.size);
  for (const parsed of [...memory.notes.values()].sort((a, b) => a.title.localeCompare(b.title))) {
    contexts.push(
      ...(await noteContexts(parsed.title, parsed.blocks, match, inventory, (ratio) =>
        report(
          'contexts',
          completed,
          memory.notes.size,
          'running',
          (completed + ratio) / memory.notes.size
        )
      ))
    );
    completed++;
    if (Date.now() - contextYielded >= 8) {
      report('contexts', completed, memory.notes.size);
      await pause();
      contextYielded = Date.now();
    }
  }
  report('contexts', completed, memory.notes.size, 'completed');
  const families = new Map<string, AssociationFamily>();
  type Group = {
    kind: AssociationContextKind;
    family: string;
    roles: string[];
    observations: Map<string, RelationObservation>;
  };
  const groups = new Map<string, Group>();
  let contextRatio = 0;
  let collecting = true;
  let groupingRatio = 0;
  let yielded = Date.now();
  const yieldWork = async () => {
    if (Date.now() - yielded >= 8) {
      if (collecting) report('collection', completed, contexts.length, 'running', contextRatio);
      else report('grouping', completed, groups.size, 'running', groupingRatio);
      await pause();
      checkRelationCancelled(options.signal);
      yielded = Date.now();
    }
  };
  completed = 0;
  report('collection', 0, contexts.length);
  for (const context of contexts) {
    let family = families.get(context.family);
    if (!family)
      families.set(
        context.family,
        (family = { contexts: new Set(), marginals: new Map(), pairs: new Map() })
      );
    family.contexts.add(context.evidenceId);
    for (const key of new Set(context.groups.flat())) {
      const present = family.marginals.get(key) || new Set<string>();
      present.add(context.evidenceId);
      family.marginals.set(key, present);
    }
    const pairCount = context.groups.reduce(
      (sum, group, index) =>
        sum +
        (context.groups.length === 1
          ? (group.length * (group.length - 1)) / 2
          : group.length *
            context.groups.slice(index + 1).reduce((sum, other) => sum + other.length, 0)),
      0
    );
    let processedPairs = 0;
    for (const [a, b] of contextPairs(context)) {
      contextRatio = (completed + ++processedPairs / Math.max(1, pairCount)) / contexts.length;
      const key = pairKey(a, b);
      const source = inventory.get(a)!;
      const target = inventory.get(b)!;
      const sourcePattern = source.type && relationKeywordKey(source.type);
      const sourceEntityTypes = memberships.get(a);
      const targetEntityTypes = memberships.get(b);
      // Shared types, shared name patterns and composition take precedence over co-occurrence.
      if (
        compositionPairs.has(key) ||
        sourceEntityTypes?.some((type) => targetEntityTypes?.includes(type)) ||
        (sourcePattern && sourcePattern === relationKeywordKey(target.type || ''))
      ) {
        await yieldWork();
        continue;
      }
      const evidence = family.pairs.get(key) || new Set<string>();
      evidence.add(context.evidenceId);
      family.pairs.set(key, evidence);
      const variants = relationPatternRoleVariants({
        source: source.text,
        target: target.text,
        sourceType: source.type,
        targetType: target.type,
        sourceEntityTypes,
        targetEntityTypes,
      });
      for (const variant of variants) {
        if (!isRelationPatternEligible(variant)) continue;
        const observation = orderRoles({
          ...variant,
          noteTitle: context.noteTitle,
          section: context.section,
          sectionPath: context.sectionPath,
          evidenceId: context.evidenceId,
          evidence: context.text,
          template: '{{E1}} — {{E2}}',
          direction: 'undirected',
          origin:
            context.kind === 'table-row' || context.kind === 'table-cell'
              ? 'table'
              : context.kind === 'field' || context.kind === 'field-value'
              ? 'field'
              : 'sentence',
        });
        const groupKey = JSON.stringify([context.family, relationPatternRoleKey(observation)]);
        let group = groups.get(groupKey);
        if (!group)
          groups.set(
            groupKey,
            (group = {
              kind: context.kind,
              family: context.family,
              roles: context.roles,
              observations: new Map(),
            })
          );
        group.observations.set(JSON.stringify([context.evidenceId, pairKey(a, b)]), observation);
        await yieldWork();
      }
      await yieldWork();
    }
    completed++;
  }
  report('collection', completed, contexts.length, 'completed');
  collecting = false;
  const candidates: InductiveRelationCandidate[] = [];
  const inputs: RelationInputPattern[] = [];
  const uniqueEvidence = new Set<string>();
  const uniquePairs = new Set<string>();
  completed = 0;
  const total = groups.size;
  report('grouping', 0, total);
  for (const [id, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const observations = [...group.observations.values()];
    const pairs = new Set<string>();
    const evidence = new Set<string>();
    const notes = new Set<string>();
    for (const [index, row] of observations.entries()) {
      pairs.add(pairKey(relationKeywordKey(row.source), relationKeywordKey(row.target)));
      evidence.add(row.evidenceId!);
      notes.add(row.noteTitle);
      groupingRatio = (completed + (index + 1) / (observations.length + 1)) / total;
      await yieldWork();
    }
    if (pairs.size > 1 || evidence.size > 1) {
      const noteSupport = notes.size;
      const first = observations[0];
      const patternTemplate = relationPatternTemplate(first);
      const candidateId = `association:${id}`;
      candidates.push({
        id: candidateId,
        associationContext: group.kind,
        associationFamily: group.family,
        associationRoles: group.roles,
        label: associationContextLabels[group.kind],
        template: first.template,
        patternTemplate,
        variants: [patternTemplate],
        noteSupport,
        pairSupport: pairs.size,
        recurring: pairs.size > 1 && noteSupport > 1,
        observations,
        measurements: [],
      });
      inputs.push({
        ...first,
        associationContext: group.kind,
        associationFamily: group.family,
        label: associationContextLabels[group.kind],
        template: patternTemplate,
        slotTemplate: first.template,
        observationCount: observations.length,
        noteSupport,
        pairSupport: pairs.size,
      });
      for (const row of observations) {
        uniqueEvidence.add(row.evidenceId!);
        const key = pairKey(relationKeywordKey(row.source), relationKeywordKey(row.target));
        uniquePairs.add(key);
        await yieldWork();
      }
    }
    completed++;
    groupingRatio = completed / total;
    await yieldWork();
  }
  options.onPatterns?.(inputs);
  report('grouping', total, total, 'completed');
  return {
    families: new Map(
      [...families].map(([key, family]) => [
        key,
        {
          contextCount: family.contexts.size,
          marginals: new Map([...family.marginals].map(([key, contexts]) => [key, contexts.size])),
          pairs: new Map([...family.pairs].map(([key, contexts]) => [key, contexts.size])),
        },
      ])
    ),
    result: {
      method: 'association',
      noteCount: extraction.noteCount,
      entityCount: inventory.size,
      observationCount: uniqueEvidence.size,
      candidates,
      inputPatterns: inputs,
      entityExtraction: extraction,
      warnings: [],
      discoveryStats: memory.stats,
      associationStats: {
        contextCount: contexts.length,
        pairCount: uniquePairs.size,
        evidenceCount: uniqueEvidence.size,
      },
    },
  };
}

/**
 * 한 역할의 소속 유형을 한 개씩 분리해 조합할 후보를 만든다.
 *
 * @param types 상위·하위 유형을 포함한 소속 이름.
 * @returns 빈 이름·중복을 제거하고 정렬한 단일 유형 배열들. 유형이 없으면 `[undefined]`.
 */
type PatternRoles = {
  source?: string;
  target?: string;
  sourceType: string | null;
  targetType: string | null;
  sourceEntityTypes?: [string];
  targetEntityTypes?: [string];
};

/** Describe generalized roles and preserve the fixed keyword of an undescribed role. */
function relationPatternTemplate(
  pattern: PatternRoles & { template: string; slotTemplate?: string }
): string {
  if ((pattern.sourceEntityTypes?.length || 0) > 1 || (pattern.targetEntityTypes?.length || 0) > 1)
    throw new Error('Expand relationship type combinations before constructing a pattern.');
  return (pattern.slotTemplate ?? pattern.template).replace(/\{\{E([12])\}\}/g, (_, slot) => {
    const namePattern = slot === '1' ? pattern.sourceType : pattern.targetType;
    const types = slot === '1' ? pattern.sourceEntityTypes : pattern.targetEntityTypes;
    const keyword = slot === '1' ? pattern.source : pattern.target;
    const descriptors = [
      ...(namePattern ? [`pattern=${namePattern}`] : []),
      ...(types?.length ? [`type=${types[0]}`] : []),
    ];
    return `{{E${slot}: ${descriptors.join('; ') || (keyword ? `keyword=${keyword}` : 'ENTITY')}}}`;
  });
}

function roleTypeVariants(types: string[] = []): ([string] | undefined)[] {
  const names = [...new Set(types.filter((name) => name.trim()))].sort();
  return names.length ? names.map((name): [string] => [name]) : [undefined];
}

/**
 * 양끝 소속 유형의 모든 조합을 만들되 각 자리에는 수집 유형 하나만 둔다.
 *
 * @param pattern 양쪽 소속 유형과 나머지 원본 역할 필드.
 * @returns 유형별 직교 조합. 소속이 없는 쪽은 필드를 생략하며 이름 패턴 등 다른 정보는 보존한다.
 */
function relationPatternRoleVariants<
  T extends { sourceEntityTypes?: string[]; targetEntityTypes?: string[] }
>(pattern: T) {
  const { sourceEntityTypes, targetEntityTypes, ...base } = pattern;
  const targets = roleTypeVariants(targetEntityTypes);
  return roleTypeVariants(sourceEntityTypes).flatMap((source) =>
    targets.map((target) => ({
      ...base,
      ...(source ? { sourceEntityTypes: source } : {}),
      ...(target ? { targetEntityTypes: target } : {}),
    }))
  );
}

const hasDescriptor = (pattern: string | null, types?: string[]) =>
  Boolean(pattern?.trim() || types?.some((name) => name.trim()));

/**
 * 최소 한쪽 역할을 일반화할 수 있는지 검사한다.
 *
 * @param pattern 양쪽 이름 패턴·유형·키워드.
 * @returns 어느 한쪽에 비어 있지 않은 패턴 또는 유형이 있으면 참.
 *   반대쪽은 고정 키워드를 허용하지만 양쪽 모두 고정 키워드인 최초 후보는 채택하지 않는다.
 */
function isRelationPatternEligible(pattern: PatternRoles): boolean {
  return (
    hasDescriptor(pattern.sourceType, pattern.sourceEntityTypes) ||
    hasDescriptor(pattern.targetType, pattern.targetEntityTypes)
  );
}

/**
 * 원본 키워드마다 직접 수집된 모든 유형 소속을 인덱싱한다.
 *
 * @param types 상위·하위 관계와 항목을 포함한 완성 유형.
 * @returns 키워드 키 → 중복 없는 정렬 유형명 목록. 상위와 하위 소속을 하나로 축약하지 않는다.
 */
function relationPatternEntityTypes(types: RelationEntityType[] = []) {
  const memberships = new Map<string, Set<number>>();
  for (const [index, type] of types.entries())
    for (const item of type.items)
      for (const keyword of item.keywords) {
        let indices = memberships.get(keyword.key);
        if (!indices) memberships.set(keyword.key, (indices = new Set()));
        indices.add(index);
      }
  return new Map(
    [...memberships].map(([key, indices]) => [
      key,
      [...new Set([...indices].map((index) => types[index].name))].sort(),
    ])
  );
}

/**
 * 유형·이름 패턴·고정 키워드가 다른 역할 묶음을 구별하는 키를 만든다.
 *
 * @param pattern 방향 정규화된 두 역할.
 * @returns 정규화 패턴·정렬 소속 유형·설명자가 없는 자리의 고정 키를 직렬화한 비교 키.
 *   설명자가 있는 자리에서는 개별 키워드를 키에 넣지 않아 서로 다른 구성원을 묶을 수 있다.
 */
function relationPatternRoleKey(pattern: PatternRoles): string {
  return JSON.stringify([
    pattern.sourceType && relationKeywordKey(pattern.sourceType),
    pattern.targetType && relationKeywordKey(pattern.targetType),
    [...new Set((pattern.sourceEntityTypes || []).map(relationKeywordKey))].sort(),
    [...new Set((pattern.targetEntityTypes || []).map(relationKeywordKey))].sort(),
    !hasDescriptor(pattern.sourceType, pattern.sourceEntityTypes) && pattern.source
      ? relationKeywordKey(pattern.source)
      : null,
    !hasDescriptor(pattern.targetType, pattern.targetEntityTypes) && pattern.target
      ? relationKeywordKey(pattern.target)
      : null,
  ]);
}
type AssociationFamily = {
  contexts: Set<string>;
  marginals: Map<string, Set<string>>;
  pairs: Map<string, Set<string>>;
};

type Context = {
  kind: AssociationContextKind;
  family: string;
  roles: string[];
  evidenceId: string;
  noteTitle: string;
  section: string;
  sectionPath: string[];
  text: string;
  /** 단일 그룹은 내부 공출현, 복수 그룹은 서로 다른 구조 역할 사이의 연결이다. */
  groups: string[][];
};
const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
const pause = () => yieldRelationWork();

/**
 * 한 문서의 파싱 블록을 6종 연관성 문맥으로 변환한다.
 *
 * 표 행은 서로 다른 열 역할끼리만 연결하고 셀 내부는 별도 문맥으로 남긴다.
 * 속성은 노트 소유자와 값의 연결 및 값 내부 연결을 구별한다. 여러 링크로 나눠진 속성값도
 * `fieldValue` 원문 단위로 다시 모으고, 리스트는 같은 항목의 직접 텍스트만 합친다.
 *
 * @param noteTitle 문서 경로. 소유자는 마지막 제목이 채택된 개체일 때만 사용한다.
 * @param blocks 헤더를 제외한 의미 입력 블록.
 * @param match 원본 개체 매칭 함수.
 * @param inventory 채택된 원본 개체의 조회 인덱스. 소유자의 존재만 확인하며 별도 키 집합을 복제하지 않는다.
 * @returns family·근거 식별자로 중복을 정리한 문맥. 키워드 1개짜리도 주변 출현 통계를 위해 유지한다.
 */
async function noteContexts(
  noteTitle: string,
  blocks: RelationTextBlock[],
  match: ReturnType<typeof createRelationKeywordMatcher>,
  inventory: Pick<ReadonlyMap<string, unknown>, 'has'>,
  onProgress: (ratio: number) => void
): Promise<Context[]> {
  let yielded = Date.now();
  const advance = async (ratio: number) => {
    if (Date.now() - yielded >= 8) {
      onProgress(ratio);
      await pause();
      yielded = Date.now();
    }
  };
  const result = new Map<string, Context>();
  const keys = (text: string) => [...new Set(match(text).map((item) => item.key))].sort();
  const owner = relationKeywordKey(noteBasename(noteTitle));
  const ownerKeys = inventory.has(owner) ? [owner] : [];
  const add = (
    kind: AssociationContextKind,
    block: Pick<RelationTextBlock, 'section' | 'sectionPath'>,
    text: string,
    groups: string[][],
    roles: string[] = []
  ) => {
    if (!groups.some((group) => group.length)) return;
    const family = JSON.stringify([kind, ...roles.map(relationKeywordKey).sort()]);
    const evidenceId = JSON.stringify([noteTitle, block.sectionPath, text]);
    result.set(JSON.stringify([family, evidenceId]), {
      kind,
      family,
      roles,
      evidenceId,
      noteTitle,
      ...block,
      text,
      groups,
    });
  };
  const tables = new Map<string, RelationTextBlock[]>();
  const items = new Map<number, RelationTextBlock[]>();
  for (const [index, block] of blocks.entries()) {
    await advance(index / blocks.length / 3);
    if (block.column !== undefined) {
      add(
        'table-cell',
        block,
        `${block.column}: ${block.text}`,
        [keys(block.text)],
        [block.column]
      );
      const key = JSON.stringify([block.table, block.row]);
      const cells = tables.get(key) || [];
      cells.push(block);
      tables.set(key, cells);
      continue;
    }
    if (block.listItem) {
      const parts = items.get(block.listItem.item) || [];
      parts.push(block);
      items.set(block.listItem.item, parts);
    }
    if (block.field) {
      const value = block.fieldValue ?? block.text;
      add('field-value', block, `${block.field}: ${value}`, [keys(value)], [block.field]);
      add(
        'field',
        block,
        `${noteBasename(noteTitle)}\n${block.field}: ${block.text}`,
        [ownerKeys, keys(block.text)],
        [block.field]
      );
    } else if (!block.listItem) {
      add('sentence', block, block.text, [keys(block.text)]);
    }
  }
  const tablePairs = [...tables.values()].reduce(
    (sum, cells) => sum + (cells.length * (cells.length - 1)) / 2,
    0
  );
  let processedPairs = 0;
  for (const cells of tables.values()) {
    cells.sort((a, b) => a.columnIndex! - b.columnIndex!);
    const text = cells.map((cell) => `${cell.column}: ${cell.text}`).join('; ');
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length; b++) {
        await advance((1 + ++processedPairs / Math.max(1, tablePairs)) / 3);
        add(
          'table-row',
          cells[0],
          text,
          [keys(cells[a].text), keys(cells[b].text)],
          [cells[a].column!, cells[b].column!]
        );
      }
    }
  }
  const itemText = (parts: RelationTextBlock[]) =>
    [...new Set(parts.map((part) => part.sourceText || part.text))].join('\n');
  let processedItems = 0;
  for (const parts of items.values()) {
    await advance((2 + ++processedItems / items.size) / 3);
    const text = itemText(parts);
    add('list-item', parts[0], text, [keys(text)]);
  }
  return [...result.values()];
}

/**
 * 문맥의 구조 역할을 지키며 방향 없는 서로 다른 키워드 쌍을 생성한다.
 *
 * @param context 그룹이 하나이면 내부 공출현, 여럿이면 서로 다른 역할 그룹 간 연결인 문맥.
 * @yields 정렬된 키 두 개. 자기 연결·역순 중복·역할 간 반복은 한 번만 생성한다.
 */
function* contextPairs(context: Context): Generator<[string, string]> {
  const seen = new Set<string>();
  const groups = context.groups;
  for (let a = 0; a < groups.length; a++) {
    const left = groups[a];
    for (let b = groups.length === 1 ? a : a + 1; b < groups.length; b++) {
      const right = groups[b];
      for (let i = 0; i < left.length; i++) {
        for (let j = a === b ? i + 1 : 0; j < right.length; j++) {
          if (left[i] === right[j]) continue;
          const key = pairKey(left[i], right[j]);
          if (seen.has(key)) continue;
          seen.add(key);
          yield [left[i], right[j]].sort() as [string, string];
        }
      }
    }
  }
}

/**
 * 방향 없는 관계의 역할 순서를 유형·패턴·키워드 기준으로 정규화한다.
 *
 * @param input 원본 출처·근거를 가진 관찰값.
 * @returns 정렬이 맞으면 원본 객체, 반대이면 양쪽 개체와 설명자를 함께 바꾼 복사본.
 *   키워드는 동률 정리에만 사용하므로 같은 설명자의 다른 구성원은 같은 패턴으로 모인다.
 */
function orderRoles(input: RelationObservation): RelationObservation {
  const descriptor = (source: boolean) =>
    JSON.stringify([
      source ? input.sourceEntityTypes : input.targetEntityTypes,
      source ? input.sourceType : input.targetType,
      source ? input.source : input.target,
    ]);
  // The keyword breaks ties only; shared type/pattern descriptors still group different members.
  if (descriptor(true).localeCompare(descriptor(false)) <= 0) return input;
  return {
    ...input,
    source: input.target,
    target: input.source,
    sourceType: input.targetType,
    targetType: input.sourceType,
    sourceEntityTypes: input.targetEntityTypes,
    targetEntityTypes: input.sourceEntityTypes,
  };
}
