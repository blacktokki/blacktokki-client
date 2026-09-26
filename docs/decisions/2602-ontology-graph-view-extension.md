---
status: accepted
date: 2026-09-17
decision-makers: '@blacktokki'
---

# 2602. 온톨로지 뷰(Ontology View) 확장 기능 아키텍처

## Context and Problem Statement

`blacktokki-client` 애플리케이션(`apps/notebook`)은 마크다운 기반 노트 작성과 ADR 2507 기반의 태그/문단 칸반/스크럼 보드 기능을 지원합니다.
노트와 보드의 수가 늘어남에 따라, 사용자 지식 베이스 내 엔티티 간의 계층 구조와 의미론적 연결을 직관적으로 탐색하고 조망할 수 있는 시각적 도구의 필요성이 대두되었습니다.

단순한 하이퍼링크 시각화를 넘어, 기존의 보드(Board) 및 카드(Card) 데이터 모델을 의미론적 클래스-인스턴스 체계로 승격하고 일반 노트를 유일 개체로 통합 매핑하는 경량 온톨로지 그래프 아키텍처를 설계하고자 합니다.

## Decision

`features/ontology`는 현재 모드에서 불러온 노트·보드를 읽어 클래스, 인스턴스, 명시 관계 및 근거가 있는 추론 관계를 구성합니다. 아래 내용과 마지막 날짜별 정정 절이 현재 구현 기준입니다. `More Information`의 이전 날짜별 절은 결정의 변경 이력으로 보존합니다.

1. **메타모델과 의미 경계**
   - 기본 `Note`·`External Link` 클래스, 보드별 `Board` 클래스, `Topic: {keyword}` 주제 클래스를 사용합니다. 일반 노트·보드 노트·보드 문단·카드·일반/연결 문단·일반/연결 외부 링크는 개별 인스턴스입니다. 보드 문단은 보드 클래스에도 직접 소속됩니다.
   - 주제는 노트의 마지막 경로 제목, 카드·문단 헤더, 외부 링크 이름의 공통 키워드가 서로 다른 출처 노트 3개 이상에 나타날 때 생성합니다. 숫자만 있는 키워드는 제외하고, URL 형식의 외부 링크 표시 이름에서는 전체 호스트 이름을 한 키워드로 취급합니다.
   - 두 주제의 출처 노트 집합에 진부분집합 관계가 있고 한 부모 주제에 이런 하위 주제가 2개 이상이면 해당 주제 사이에 명시적 `SUBCLASS_OF`를 연결합니다. `INSTANCE_OF`와 `SUBCLASS_OF`는 각각 개체 분류와 실제 클래스 포함 관계이며, 전이적 클래스 상속 및 상위 클래스의 인스턴스 소속만 논리 추론합니다. `partOf`의 전이 관계나 제목 일치 탐색 추천은 생성하지 않습니다.
   - 구조 관계(`notePartOf`, `cardPartOf`, `paragraphPartOf`, `connectedPartOf`), 내부 참조, 외부 링크 연결을 구분합니다. 문단·카드 링크는 문단 대상을 노트보다 우선하며, 카드 헤더는 카드 인스턴스 하나로만 표현합니다. 노트의 정식 데이터 속성은 명시적 YAML frontmatter 키만 사용합니다.
2. **그래프와 검증**
   - HTML5 2D Canvas(`OntologyCanvasView.tsx`, `canvasRenderer.ts`)와 포스 시뮬레이션으로 그래프를 그립니다. 노트 또는 보드 클래스에서 관계 단계가 가까운 노드를 안쪽에 놓고 국소 주제 군집을 유지합니다. 간접 추론·일반 문단·일반 외부 링크·속성(VOWL) 표시 토글과 쉬운 명칭/RDF·OWL 레이블 전환을 제공합니다.
   - 선택 노드의 기본 연관 범위는 `1`, `2`, `전체`입니다. 다른 클래스의 하위가 아닌 보드 클래스에만 `3`을 추가하며 최상위 주제에는 제공하지 않습니다. 참조 무결성과 고립 개체를 애플리케이션 규칙으로 검사하지만, 결과를 전체 OWL 정합성 증명으로 표시하지 않습니다.
   - 본문이 없는 노트는 기본적으로 제외하되, 내용 있는 노트가 직접 참조하거나 직접 상위 노트로 사용하는 기존 빈 노트는 골격 인스턴스로 유지합니다. 보드 설정 설명은 실제 노트 본문으로 해석하지 않습니다.
3. **주제 탐색과 가상노트**
   - 모든 적격 주제는 같은 이름의 실제 노트가 있어도 가상노트 모달을 열 수 있습니다. 실제 노트의 일치는 대소문자를 무시한 **전체 제목**으로 판별하며 `/` 경로의 마지막 이름만 같아서는 일치하지 않습니다. 모달에는 주제 색인, 링크·문단·카드·출처 노트 및 연관 주제 집계를 표시합니다.
   - 서로 다른 공통 출처 노트가 3개 이상인 주제를 연관 주제로 집계합니다. 직접 `SUBCLASS_OF` 관계에 따라 상위 주제·하위 주제·그 외 연관 주제를 나누며, 참조 수는 임계값이 아니라 보조 근거입니다. 실제 노트가 있는 연관 주제에만 `📝`를 붙입니다. 모달 내 주제 링크는 같은 모달의 본문을 교체합니다.
   - 주제 목록은 **링크 + 문단 + 카드 + 출처 노트 수**의 합을 내림차순으로, 동점이면 제목순으로 정렬합니다. 직접 하위 주제가 있으면 `연관 주제 n (하위 주제 n)`으로 표시합니다. 모든 목록 항목은 가상노트 모달을 열고, 모달에서 실제 노트로 이동했다가 뒤로 돌아오면 보던 주제의 모달을 복원합니다.
4. **상호운용과 통합**
   - 그래프 화면에서 현재 모드의 데이터를 RDF 1.1 Turtle로 내보냅니다. 클래스·인스턴스·관계·속성·추론 근거와 애플리케이션 검증 스냅샷에 `rdf:type`, `rdfs:subClassOf`, Dublin Core, PROV-O, 일부 OWL·SHACL 어휘 및 필요한 `bt:` 속성을 사용합니다. 결합 그래프의 OWL 2 DL 적합성이나 독립 SHACL 재계산을 주장하지 않습니다.
   - ADR 2504 확장 등록 규격에 따라 `features['ontology']`로 연결하고 한국어 `사용 방법.md`와 영어 `Usage.md`를 함께 유지합니다.

Non-goals:

- 앱 안에 SPARQL 쿼리 엔진이나 사용자 수동 OWL/RDF 편집기를 넣지 않습니다.
- 노트 본문에 전용 속성 문법을 강제하거나 RDF 내보내기를 전체 OWL 2 DL 정합성 증명으로 취급하지 않습니다.

## Consequences

- Good: 기존 노트와 보드의 저장 형식을 마이그레이션하지 않고 클래스 분류, 구조 관계, 주제 탐색을 제공합니다.
- Good: 그래프의 의미 관계와 RDF 내보내기의 표준 술어를 구분해 외부 교환이 가능하며, 추론에는 원본 근거를 보존합니다.
- Good: Canvas 렌더링과 주제 목록의 일괄 역색인으로 큰 그래프의 DOM·반복 계산 부담을 줄입니다.
- Tradeoff: 제목·출처 노트에 기반한 자동 주제는 편집에 따라 바뀔 수 있으므로 임계값, 중복 제거, 클래스 ID 안정성을 회귀 테스트로 검증해야 합니다.
- Tradeoff: 문단·카드의 구조 기반 IRI는 제목 이동이나 계층 변경 시 달라질 수 있습니다. 장기 누적 RDF 저장소와 연결한다면 저장 계층의 영속 ID가 필요합니다.

## Implementation Plan

- **Affected paths**:
  - `apps/notebook/src/features/ontology/types.ts`, `apps/notebook/src/features/ontology/useOntologyData.ts`
  - `apps/notebook/src/features/ontology/utils/titleKeywordClasses.ts`, `apps/notebook/src/features/ontology/utils/virtualNotes.ts`, `apps/notebook/src/features/ontology/utils/relations.ts`, `apps/notebook/src/features/ontology/utils/axioms.ts`
  - `apps/notebook/src/features/ontology/utils/rdf.ts`, `apps/notebook/src/features/ontology/utils/exportRdf.ts`, `apps/notebook/src/features/ontology/utils/forceLayout.ts`, `apps/notebook/src/features/ontology/utils/canvasRenderer.ts`
  - `apps/notebook/src/features/ontology/components/OntologyCanvasView.tsx`, `apps/notebook/src/features/ontology/components/OntologyPreviewSheet.tsx`, `apps/notebook/src/features/ontology/components/OntologyGraphView.tsx`, `apps/notebook/src/features/ontology/components/OntologyNavToolbar.tsx`
  - `apps/notebook/src/features/ontology/screens/OntologyScreen.tsx`, `apps/notebook/src/features/ontology/screens/OntologyTopicScreen.tsx`
  - `apps/notebook/src/modals/OntologyVirtualNoteModal.tsx`
  - `apps/notebook/src/features/ontology/__tests__/ontology-*.test.cjs`, `apps/notebook/src/features/index.tsx`, `apps/notebook/src/lang/ko.json`
  - `apps/notebook/public/사용 방법.md`, `apps/notebook/public/Usage.md`
- **Dependencies and configuration**: 기존 React Native·Expo, HTML5 Canvas 및 RDF 직렬화 의존성을 사용합니다. 이 결정에 추가 환경 변수나 저장소 데이터 마이그레이션은 없습니다.
- **Patterns to follow**: `useOntologyData.ts`에서 명시 그래프를 구성하고 `utils/virtualNotes.ts`에서 출처 노트별 통계와 주제 목록 정렬을 계산합니다. `OntologyVirtualNoteModal.tsx`는 실제 노트로 이동할 때 모달을 숨기고 출발 화면의 `focus`에서 같은 주제를 다시 엽니다. `utils/rdf.ts`는 화면 레이블과 별도로 표준 술어와 앱 전용 술어를 직렬화합니다.
- **Patterns to avoid**: 클래스-노트 대응을 `subClassOf`로 표현하지 않고, `partOf`를 자동 전이 추론하지 않으며, 같은 이름의 실제 노트가 있다는 이유로 가상노트를 숨기지 않습니다.
- **Documentation boundary**: `사용 방법.md`와 `Usage.md`에는 사용 흐름, 보기 옵션, 결과 해석만 간결하게 설명합니다. 노드 생성·중복 제거·관계·추론·RDF 어휘의 상세 규칙은 이 ADR과 소스·회귀 테스트에서 유지합니다.

### Verification

- [x] `node --test apps/notebook/src/features/ontology/__tests__/*.test.cjs` 온톨로지 회귀 테스트 통과
- [x] `node node_modules/typescript/bin/tsc --noEmit --project apps/notebook/tsconfig.json` 타입 검사 통과
- [x] `node_modules/.bin/eslint apps/notebook/src/features/ontology --ext .ts,.tsx` 및 `OntologyVirtualNoteModal.tsx` 린트 통과
- [x] `git diff --check`로 문서와 소스 변경의 공백 오류 없음 확인
- [ ] 브라우저에서 가상노트 본문 링크·실제 노트 버튼으로 이동한 뒤 뒤로 돌아와 같은 주제 모달이 복원되는지 직접 확인

## Alternatives Considered

- 단순 하이퍼링크 그래프: 보드·주제의 클래스 분류 및 카드·문단 구조를 나타내지 못하므로 선택하지 않았습니다.
- 노트 작성 단계에서 수동 OWL/RDF 문법을 강제하는 방식: 작성 부담이 높아 자동 그래프 구성과 별도 표준 RDF 내보내기를 선택했습니다.
- 모든 노드를 SVG 요소로 렌더링하는 방식: 노드·엣지가 늘어날 때 DOM 부담이 커져 Canvas 렌더링으로 전환했습니다.

## More Information

### 2026-09-17: 추론 관계 세분화

- `INFERRED_DEPENDS`를 `INFERRED_DEPENDS_ON`, `INFERRED_INSTANCE_OF`, `INFERRED_SUBCLASS_OF`, `INFERRED_PART_OF`로 분리하여 추론 결과의 관계 의미를 보존합니다.
- `InferredOntologyEdge.inferences`에 적용 규칙(`TRANSITIVE_DEPENDENCY`, `INSTANCE_INHERITANCE`, `SUBCLASS_TRANSITIVITY`, `SAME_NAME_TRANSFER`)과 원본 근거 엣지 ID(`premiseEdgeIds`)를 기록합니다. 상속 탐색은 조상별 하나의 도달 경로를 기록하고, 동일 결과를 생성한 추가 규칙·근거는 중복 없이 합칩니다.
- 중복 판정은 출발 노드·관계 종류·도착 노드 단위이며, 같은 종류의 직접 관계가 있을 때만 추론 엣지를 생략합니다. 기존 `DEPENDENCY`, `PARENT_CHILD` 별칭도 정규화합니다.
- 이름 일치에 의한 기존 관계 전이는 휴리스틱이며 OWL 개체 동일성으로 취급하지 않습니다. RDF 내보내기 및 추론 범위 확대는 이번 변경에 포함하지 않습니다.
- `relations.ts`에서 추론 타입 판별·원래 관계 변환·라벨을 공유하고, 그래프와 레이아웃에 모든 추론 타입을 반영합니다.
- 회귀 검증: `yarn workspace @blacktokki/notebook test:ontology` (`scripts/ontology-inference.test.cjs`).

### 2026-09-17: RDF 1.1 Turtle 내보내기

- 현재 온톨로지 스냅샷을 별도 서버나 RDF 라이브러리 없이 UTF-8 Turtle(`text/turtle`, `.ttl`)로 직렬화합니다. 이는 RDF/SPARQL 저장소 도입이라는 기존 Non-goal을 변경하지 않습니다.
- 클래스는 `owl:Class`, 인스턴스는 `owl:NamedIndividual`, `INSTANCE_OF`는 `rdf:type`, `SUBCLASS_OF`는 `rdfs:subClassOf`로 매핑합니다. `DEPENDS_ON`, `PART_OF`, 이름 포함과 데이터 속성은 `bt:` 어휘를 사용합니다.
- 이름 일치 휴리스틱인 `SAME_AS`는 강한 OWL 동일성을 주장하지 않도록 `bt:sameNameAs`로 내보냅니다. 시각화용 리터럴 노드는 RDF 주어로 만들지 않고 데이터 속성의 리터럴 객체로 변환합니다.
- 모든 관계를 `rdf:Statement`로 함께 표현하고, 추론 관계는 `bt:InferredRelation`과 규칙·근거 엣지를 기록하여 `INFERRED_*` 세분화의 의미와 출처를 보존합니다.
- 웹은 Blob 다운로드, 네이티브는 Expo 파일 캐시와 시스템 공유 화면을 사용합니다. 직렬화 로직은 `rdf.ts`, 플랫폼 파일 처리는 `exportRdf.ts`에 분리합니다.
- 회귀 검증: `yarn workspace @blacktokki/notebook test:ontology` (`scripts/ontology-rdf.test.cjs`).

### 2026-09-17: RDF 식별자와 표준 어휘 정리

- 애플리케이션 배포 주소 기반 HTTP 네임스페이스를 제거합니다. 노트북 리소스는 `urn:blacktokki:notebook:<scope>:...`, 정확한 표준 대응이 없는 확장 어휘는 `urn:blacktokki:ontology:...` IRI를 사용합니다.
- 의존 관계는 `dcterms:requires`, 포함 관계는 `dcterms:isPartOf`, 하위 섹션은 `dcterms:hasPart`, 내부 식별자는 `dcterms:identifier`로 표현합니다.
- 추론 출처는 PROV-O의 `prov:wasGeneratedBy`와 `prov:used`로 연결합니다. RDF/RDFS/OWL, Dublin Core, PROV-O의 공식 네임스페이스 IRI는 표준 어휘 식별자이므로 유지합니다.

### 2026-09-18: 온톨로지 의미와 검증 모델 정정

- 화면 표기법은 국제 표준이라는 표현을 사용하지 않고 **VOWL-inspired** 시각화로 설명합니다. RDF 내보내기는 배포 주소와 분리된 `urn:blacktokki:notebook:` 리소스 IRI, 표준 RDF/RDFS/OWL·Dublin Core·PROV-O·SHACL 어휘, `urn:blacktokki:ontology:` 확장 어휘를 사용합니다.
- `_NOTELINK`는 일반 참조인 `REFERENCES`로 모델링하고 RDF에서는 `dcterms:references`로 내보냅니다. `DEPENDS_ON`은 명시적인 의존 관계에만 사용하며, 순환 검증과 전이 추론도 의존 관계에만 적용합니다.
- 의존성 추론은 2-hop을 넘는 전체 전이 폐쇄를 계산합니다. 같은 최단 거리의 근거 경로가 여러 개면 각 경로의 원본 엣지 ID를 모두 보존합니다.
- 이름 일치로 기존 관계를 전이하던 `SAME_NAME_TRANSFER`를 폐기합니다. `TITLE_KEYWORD` 클래스의 키워드와 노트 제목이 일치하면 해당 클래스의 인스턴스에서 노트 인스턴스로 `INFERRED_RELATED_NOTE`를 만들고, `CLASS_NAME_NOTE_MATCH` 규칙과 클래스·노트·`instanceOf` 근거를 기록합니다. 이 관계는 동일성이나 기존 관계의 대체를 주장하지 않습니다.
- 사용자 온톨로지 속성에서 `status`와 `row`를 제거하고 `schedule`과 `sections`를 유지합니다. `updated`는 RDF의 `dcterms:modified`로 내보내는 기술 메타데이터이며, 보드 상태와 로우는 분류 구조를 나타내는 클래스이므로 클래스 노드로는 유지합니다.
- 노드 식별자는 배열 순서나 사용자·제목에 의존하지 않도록 콘텐츠 ID, 문단 경로 해시, 토픽 구성원 해시로 생성합니다. RDF 스코프도 노트북 ID 또는 고정 로컬 스코프를 사용하여 같은 데이터의 재내보내기 시 IRI를 안정적으로 유지합니다.
- 오류는 정합성을 깨뜨리고 경고는 별도로 표시합니다. RDF에는 `sh:ValidationReport`와 `sh:ValidationResult`를 내보내고, SHACL 심각도·근거 shape·constraint component 및 애플리케이션의 오류/경고 상태를 함께 기록합니다.
- 확장 클래스와 속성을 RDF 스키마 트리플로 선언하고, 모든 관계를 `rdf:Statement`로 재구체화하여 주장 관계와 추론 관계의 근거를 추적할 수 있게 합니다.
- 회귀 검증: `yarn workspace @blacktokki/notebook test:ontology`, TypeScript `--noEmit`, 온톨로지 소스 ESLint 검사.

### 2026-09-18: 제목 키워드 분류로 전환

- `BOARD_ROW` 클래스와 임의의 노드 사이에 만들던 `INCLUDES_NAME` 관계를 폐기합니다. RDF 확장 어휘와 그래프 범례에서도 `includesName`을 제거합니다.
- 노트 제목은 전체 범위에서, 헤더 제목은 같은 헤더 레벨 안에서 정규화된 전체 제목 또는 공통 키워드가 2개 이상의 인스턴스에 나타날 때 `TITLE_KEYWORD` 클래스로 묶습니다. 동일한 구성원 집합에서 전체 제목과 개별 키워드가 중복되면 전체 제목 클래스 하나를 우선합니다.
- 제목 키워드 클래스의 구성원은 `instanceOf`로 연결합니다. 제목이 있는 일반 헤더를 문단 인스턴스로 생성하여 제목 키워드 클래스에 소속될 수 있게 합니다.
- 그래프 범례와 노드 프리뷰에서 노트 개체를 `인스턴스 (노트)`로 표시합니다.
- 보드 카드는 하위 헤더에서 생성된 같은 레벨의 `TITLE_KEYWORD` 클래스에 소속될 수 있습니다. 상위 헤더는 일반 제목 키워드 상속에 사용하지 않고, 가장 가까운 부모 헤더 제목마다 `카드유형: {부모 헤더 제목}` 형식의 `TITLE_KEYWORD` 클래스를 만들어 카드 인스턴스를 직접 연결합니다.
- 공통 키워드는 정규화된 전체 제목 포함과 단어·조사 제거 어간의 일치로 판정하며, 복합어의 부분 문자열이나 연속 단어를 새 키워드로 합성하지 않습니다.
- 참조 관계가 있거나 제목 키워드 클래스에 소속된 문단은 `CONNECTED_PARAGRAPH` 인스턴스 종류와 주황색으로 구분합니다. 실제 `REFERENCES` 관계의 출발·도착 문단은 `LINKED_PARAGRAPH` 클래스(`링크로 연결된 문단`)에 분류합니다. 제목 키워드 클래스 소속만으로 연결된 문단은 해당 제목 키워드 클래스에만 분류하며, 일반 문단 인스턴스만 숨길 수 있는 표시 토글을 제공합니다.
- 링크 관계는 링크가 들어 있는 문단 또는 카드를 출발 노드로 사용하고, 링크가 대상 문단을 지정하면 노트보다 해당 문단을 먼저 연결합니다.
- 노트 제목 키워드는 `/`로 구분된 상위 노트 경로를 제외한 마지막 제목만 비교합니다.
- 모든 일반·연결 문단 인스턴스는 가장 가까운 부모 문단 또는 소속 노트와 계층형 `partOf` 관계를 갖습니다. 내용이 있는 보드 열 문단을 수용해야 하는 빈 보드 노트는 구조적 부모로 유지합니다.
- 카드유형 클래스를 만든 부모 헤더는 같은 원인으로 `H{레벨} 제목` 클래스를 추가하지 않도록 일반 헤더 제목 키워드 후보에서 제외합니다.
- 제목 키워드 클래스에 소속된 문단은 `CONNECTED_PARAGRAPH`로 표시하되 상위 문단에는 연결 상태를 전파하지 않습니다. 연결된 문단에 상위 문단이 있으면 기존 계층형 `partOf`를 유지하면서 소속 노트로 향하는 점선 `connectedPartOf`를 추가하며, RDF에서는 두 관계 모두 `dcterms:isPartOf`로 표현합니다.
- 그래프 범례는 노드 항목을 첫째 행, 현재 표시 중인 관계와 술어별 개수를 둘째 행에 배치하며 노트 인스턴스를 카드 인스턴스보다 먼저 표시합니다. 카드 인스턴스는 초록색, 노트 인스턴스는 파란색으로 구분합니다.
- 카드유형과 노트 제목을 제외한 일반 헤더 기반 제목 키워드 클래스는 구성 인스턴스의 소속 노트가 서로 다른 2개 이상일 때만 생성합니다.
- 노트 제목·카드유형·헤더 범위를 합친 `주제: {키워드}` 상위 클래스를 생성합니다. 동일 키워드의 세부 클래스가 먼저 존재하면 해당 세부 클래스에서 상위 클래스로 `subClassOf`를 연결하고, 세부 클래스가 담당하지 않는 인스턴스만 상위 클래스에 직접 연결합니다.
- 회색 노트 계층 관계는 `notePartOf`, 노란색 문단 계층 관계는 `paragraphPartOf`, 연결 문단의 주황색 노트 직결 관계는 `connectedPartOf`로 구분해 그래프와 범례에 각각 표시합니다. 세 관계는 RDF에서 모두 `dcterms:isPartOf`로 표현합니다.
- `클래스만` 보기 토글을 추가하고 `클래스만` → `문단` → `속성(VOWL)` 순으로 배치합니다. 인스턴스 상세정보에는 직접 `instanceOf`로 연결된 클래스만 표시합니다. 클래스 상세정보에는 직접 `subClassOf`로 연결된 부모 클래스와 자신을 직접 상속 중인 하위 클래스를 각각 표시하고, 배지를 선택하면 해당 클래스 상세정보로 전환합니다. 노트 인스턴스의 목차와 제목 키워드 클래스의 이동 버튼은 숨깁니다.
- 하단 범례와 상세정보에 겹치던 간격·크기 조절 HUD는 넓은 화면에서 우측 상단에 여백 없이 정렬하고, 좁은 화면에서는 상단 보기 토글 아래로 옮깁니다. `노트`와 `링크로 연결된 문단`은 파란색 기본 클래스, 보드 카드와 보드 상태는 초록색 보드 클래스, 제목 키워드 기반 클래스는 자홍색 주제 클래스로 구분합니다.
- 노트 제목·문단 내용의 공통 키워드와 벡터 유사도로 생성하던 `PARAGRAPH_TOPIC` 지식 클래스는 생성하지 않습니다.
- 전역 반발력·캔버스 크기·간격 배율은 유지하고, `subClassOf` 부모가 없는 최상위 주제 클래스를 군집 중심으로 계산합니다. 같은 주제 계층의 하위 클래스와 직접 분류된 인스턴스에만 국소 충돌 거리 축소와 중심 인력을 적용합니다.
- 보드 상태 서브클래스의 표시 이름은 `{보드 이름}: {상태 이름}` 형식을 사용합니다.
- 빈 본문 독립 노트는 노트 인스턴스로 생성되지 않으므로 주제 키워드 클래스의 후보 계산에도 포함하지 않습니다. 비어 있더라도 내용이 있는 보드 열 문단의 구조적 부모로 유지되는 보드 노트는 노트 제목 기반 주제 후보에 포함합니다.
- 보드 설정 레코드의 `description`은 노트 본문으로 해석하지 않습니다. 동명 노트 인스턴스의 문단은 실제 NOTE 레코드에서만 생성하고, 내용이 있는 보드 컬럼은 별도 노트 인스턴스로 만들어 컬럼 문단의 `paragraphPartOf` 대상이 실제 소속 노트가 되도록 합니다.

### 2026-09-18: 안정 식별자와 논리 추론·탐색 추천 분리

- 이 절은 앞선 `DEPENDS_ON` 전이 추론, 구성원 해시 기반 주제 ID, `INFERRED_RELATED_NOTE` 결정을 대체합니다.
- 제목 키워드 클래스 ID는 구성원 ID를 포함하지 않고 정규화된 키워드와 `NOTE`·헤더 레벨·일반 주제 범위로 생성합니다. 같은 키워드 클래스의 구성원이 바뀌어도 그래프 ID와 RDF IRI를 유지합니다.
- 실제 입력을 생성하는 기능이 없는 `DEPENDS_ON`, `INFERRED_DEPENDS_ON`, 의존 순환 검증과 전이 폐쇄를 제거합니다. `_NOTELINK`는 계속 `REFERENCES`/`dcterms:references`로만 표현합니다.
- `CLASS_NAME_NOTE_MATCH`는 논리 추론에서 제외하고 `RECOMMENDED_RELATED_NOTE` 탐색 추천으로 분리합니다. 노트 제목 비교에는 주제 분류와 동일하게 `/` 경로의 마지막 제목만 사용합니다.
- 화면은 보라색 논리 추론 토글과 라임색 탐색 추천 토글을 독립적으로 제공합니다. RDF는 전자를 `bt:InferredRelation`·`bt:InferenceRule`, 후자를 `bt:RecommendedRelation`·`bt:RecommendationRule`로 구분하고 각 근거를 별도 PROV-O 활동으로 기록합니다. 추천은 `rdf:Statement`로 재구체화하되 제안된 `relatedNote` 트리플 자체는 사실로 단정하지 않습니다.
- RDF의 동적 `NOTE`·`LINKED_PARAGRAPH` 클래스는 고정 `bt:Note`·`bt:ConnectedParagraph`와 `owl:equivalentClass`로 연결합니다. 보드 클래스는 `bt:Card`, 제목 키워드 클래스는 `bt:Topic`의 하위 클래스로 연결하고 `bt:classCategory`로 기본·보드·주제 분류를 내보냅니다.
- `useOntologyData` 통합 테스트는 주제 구성원 변경 시 ID 안정성, 의존 관계 미생성, 상위 경로를 제외한 노트 추천을 실제 훅 조립 결과에서 검증합니다.
- 숫자만 포함된 키워드는 세부·상위 주제 클래스 및 카드유형 클래스 생성에서 제외합니다. `주제: {키워드}` 상위 클래스는 직계 `subClassOf` 하위 클래스 수와 직접 `instanceOf` 인스턴스 수의 합이 2개 이상일 때만 생성합니다.
- 보드 이름이 노트 제목 키워드 조건을 만족하면 해당 보드의 `NOTE` 인스턴스를 분류하고 `BOARD_CARD` 클래스는 분류하지 않습니다. 이 경계를 `useOntologyData` 통합 테스트로 검증합니다.

### 2026-09-19: HTML5 Canvas 기반 고성능 렌더링 엔진 전환

- SVG 기반 렌더링 방식에서 발생하던 DOM 노드 과밀 및 인터랙션 프레임 저하(초기 ADR "Consequences: Bad" 사항)를 해결하기 위해 `canvasRenderer.ts`와 `OntologyCanvasView.tsx`를 도입하여 HTML5 2D Canvas 하드웨어 가속 렌더링으로 전면 전환합니다.
- 기기 해상도에 맞춘 디바이스 픽셀 비율(DPR) 보정, 뷰포트 컬링(Viewport Culling), 실시간 2D 아핀 변환(Pan/Zoom)을 적용하여 수백 개 이상의 노드와 수천 개의 엣지가 존재하는 복잡한 지식 네트워크에서도 60fps 인터랙션을 유지합니다.
- 노드 및 엣지 선택, 호버, 탭 인터랙션을 위한 화면 좌표-월드 좌표 역변환 및 히트 테스트(Hit Testing) 알고리즘을 캔버스 렌더러 내부에 순수 기하 연산으로 캡슐화합니다.
- 포스 지향 시뮬레이션(`forceLayout.ts`)에서 주제 클래스 노드가 캔버스 외곽으로 편중되고 문단 인스턴스가 중심에 과밀되는 현상을 방지하기 위해, 주제 클래스와 인스턴스 노드 간의 척력/인력 가중치를 튜닝하여 캔버스 전역에 걸친 균등 배치(Balanced Layout)를 달성합니다.

### 2026-09-19: 가상노트(Topic Virtual Note) 및 주제 탐색 화면 아키텍처

- 동명의 실제 물리적 노트(`Content.type === 'NOTE'`)가 존재하지 않는 최상위 상위 주제 클래스(Generic Topic Superclass) 또는 단독 특화 주제 클래스(Standalone Topic Class)를 대상으로 실시간 마크다운 종합 가상노트 생성 아키텍처(`virtualNotes.ts`)를 도입합니다.
- **적격성 판별 (`isTopicVirtualNoteEligible`, `getTopicVirtualNoteEligibleSet`)**:
  - `classCategory === 'TOPIC'`인 클래스 중, `subClassOf` 부모가 없는 최상위 클래스이거나 다른 클래스의 하위가 아닌 단독 주제 클래스여야 합니다.
  - 노트북 내에 정규화된 전체 이름이 일치하는 물리적 노트가 이미 존재하는 경우에만 일반 물리 노트 네비게이션을 우선하고 가상노트 생성 대상에서 제외합니다. 대소문자는 무시하지만 `/` 경로의 리프 제목만 같으면 다른 노트로 취급하므로, `주제: AA`와 `BB/AA`만 존재할 때는 `AA` 가상노트를 생성할 수 있습니다.
  - 대규모 그래프 탐색 성능을 보장하기 위해 $O(N+E)$ 단일 순회 기반의 `getTopicVirtualNoteEligibleSet` 최적화 알고리즘을 제공합니다.
- **지식 실시간 합성 (`synthesizeTopicVirtualNote`)**:
  - 해당 주제 클래스를 상속하는 하위 클래스 목록(`subClassOf`), 직접 소속된 문단(`instanceOf`), 카드 인스턴스들의 본문 및 연결 맥락을 계층적 구조의 정제된 마크다운 문서로 동적 조합합니다.
  - HTML 엔티티 정제 및 마크다운 포맷팅 유틸리티(`htmlToCleanMarkdown`)를 통해 군더더기 없는 마크다운을 산출합니다.
- **UI/UX 통합**:
  - 캔버스 상에서 가상노트 적격 클래스 노드 둘레에 점선 외곽 링(🪐 행성 링)을 시각적으로 렌더링합니다.
  - 프리뷰 시트(`OntologyPreviewSheet.tsx`)에 `[🪐 가상노트 열기]` 액션 버튼을 노출하며, 탭 시 가상노트 모달(`VirtualNoteModal.tsx`)을 오픈합니다.
  - 가상노트 모달 내에서 합성된 지식을 즉시 열람하고, 클립보드에 복사하거나 **`[실제 일반 노트로 저장]`** 버튼을 통해 영구 보관할 수 있는 정식 물리 노트(`NOTE`)로 원클릭 저장(Materialization)할 수 있습니다. 영구 저장된 즉시 동명의 물리 노트가 존재하게 되므로, 이후 탭 시에는 해당 정식 노트 페이지로 자동 라우팅됩니다.
- **주제 전용 탐색 화면 (`OntologyTopicScreen.tsx`)**:
  - 온톨로지 네비게이션 툴바(`OntologyNavToolbar.tsx`)에서 그래프 뷰와 주제 목록 뷰를 상호 전환할 수 있는 분할 뷰 모드를 제공합니다.
  - `NoteListSection` 컴포넌트를 재사용하여 상위 주제 클래스 및 단독 주제 클래스들을 연결 관계 수(관계 밀도) 내림차순 및 제목 가나다순으로 정렬하여 표시합니다.
  - 목록의 각 주제 항목 클릭 시 물리 노트가 존재하면 `NotePage`로, 미존재 시 `VirtualNoteModal`로 즉시 연결하여 지식 탐색 효율을 극대화합니다.

### 2026-09-19: 주제 클래스 생성 임계값(Threshold) 상향 조정

- 기존의 "2개 이상" 기준에서 발생하던 의미론적 결합도가 낮은 우발적 키워드로 인한 불필요한 클래스 양산 및 그래프 시각 노이즈를 억제하기 위해, 생성 임계 조건을 다음과 같이 엄격화합니다:
  - **`주제: {키워드}` (Generic Topic Superclass)**: 직계 하위 클래스(`subClassOf`) 수와 직접 소속 인스턴스가 유래한 서로 다른 출처 노트 수의 합이 3개 이상이거나, 직계 하위 클래스 수가 2개 이상일 때만 생성 (`directSupportCount >= 3 || subclassCount >= 2`).
  - **`노트 제목: {키워드}`**: 하위 인스턴스 합이 3개 이상일 때만 생성 (`occurrenceIds.size >= 3 && memberNodeIds.length >= 3`).
  - **`H{N} 제목: {키워드}`**: 같은 헤딩 레벨(H1~H6)에서 서로 다른 3개 이상의 노트에 걸쳐 공통 등장할 때만 생성 (`noteIds.size >= 3 && memberNodeIds.length >= 3`).
- 본 변경에 맞춰 단위 테스트 스위트(`ontology-title-keyword.test.cjs`, `ontology-use-data.test.cjs`) 및 공식 사용자 가이드 문서(`사용 방법.md`, `Usage.md`)를 일원화하여 최신 상태로 동기화합니다.

### 2026-09-19: N-hop 연관 범위 계층적 선 강조(Edge Highlight) 최적화

- 노드 선택 후 하단 프리뷰 시트에서 연관 범위(N-hop Range)를 `2` 또는 `전체(All)`로 확장했을 때, 1-hop 엣지만 강조되고 다단 건너 연결된 엣지가 흐려지던 문제를 해결합니다.
- 기본 N-hop 선택지는 `1`, `2`, `전체`로 유지하되, 다른 클래스의 서브클래스가 아닌 최상위 주제 클래스와 보드 카드 클래스에는 `3`을 추가합니다. `3-hop`을 선택한 뒤 이를 지원하지 않는 노드로 이동하면 선택 범위를 `2-hop`으로 제한합니다.
- `canvasRenderer.ts`의 `drawEdges`에서 `focusedNodeIds`를 기반으로 연결선의 양 끝점이 포커스 집합 내에 존재하는지(`isWithinFocus = focusedNodeIds.has(edge.source) && focusedNodeIds.has(edge.target)`)를 판정합니다.
- **3단계 계층적 엣지 시각화**:
  1. **직계 1-hop 연결 엣지 (`isConnectedToActive`)**: 최상위 강조 (`opacity: 0.95`, `strokeWidth: 2.2`), 방향성 화살표 및 중앙 관계 라벨 박스 노출.
  2. **N-hop 연관 엣지 (`isWithinFocus`)**: 선명한 선 강조 (`opacity: 0.85`, `strokeWidth: 1.8`), 방향성 화살표 강조 (라벨은 시각 과밀 방지를 위해 생략).
  3. **비연관 엣지**: 배경 투명화 흐림 처리 (`opacity: 0.04`, `strokeWidth: 0.7`).

### 2026-09-19: 테마별 시각 스타일 및 노드 선택 물리 안정화

- **주제 클래스 컬러 팔레트 정밀화**:
  - 라이트 모드: 저채도의 부드러운 밝은 자홍색 채움(`rgba(245, 230, 240, 0.9)`), 외곽선(`#C060A0`).
  - 다크 모드: 저채도의 차분한 어두운 자홍색 채움(`rgba(55, 25, 45, 0.9)`), 외곽선(`#C060A0`).
  - 테마별 텍스트 및 라벨 가독성을 극대화하면서도 VOWL 표준 컬러와의 조화를 보장합니다.
- **노드 선택 시 물리 애니메이션 리셋 방지**:
  - 노드를 탭하여 선택하거나 선택을 해제할 때 포스 시뮬레이션 엔진의 노드 위치가 재계산되어 흔들리는 물리적 떨림 현상을 차단하기 위해, 선택 상태 변경 시 기존 물리 시뮬레이션 상태와 노드 좌표를 그대로 보존하는 앵커링 메커니즘을 적용합니다.
- **공리 검증 경고 네비게이션 견고화**:
  - 검증 패널 내 경고 및 오류 항목 탭 시 발생할 수 있는 식별자 불일치 예외를 방어하고, 해당 대상 노드로 부드럽게 뷰포트를 이동하며 프리뷰 시트를 즉시 연동하도록 개선합니다.

### 2026-09-19: 온톨로지 의미 정합성 보강

- 물리적 노트 판별은 `INSTANCE`이면서 `instanceKind === 'NOTE'`인 노드로 한정합니다. 동명의 카드나 문단은 가상노트 생성을 차단하지 않습니다.
- `paragraph` 메타데이터를 가진 카드도 문단으로 재해석하지 않고 카드 의미와 집계를 유지합니다.
- 노트 계층의 `notePartOf`는 모든 노트 인덱싱이 끝난 뒤 두 번째 순회에서 생성하여 저장소/API 결과 순서와 무관하게 부모를 연결합니다.
- 문단 링크는 `section`/`autoSection`을 대상 식별에 사용합니다. 명시된 문단을 찾지 못하면 노트 수준 참조로 낮춰 잘못 단정하지 않고 미해결 링크 검증에 남깁니다.
- 동적 `LINKED_PARAGRAPH` 클래스는 고정 `bt:ConnectedParagraph`와 동치라고 단정하지 않고 그 하위 클래스로 내보냅니다. 제목 키워드의 실제 일치 표기인 `matchLabel`은 `bt:matchedLabel` 주석 속성으로 보존합니다.
- 애플리케이션 검증 결과는 표준 `sh:NodeShape`와 `sh:SPARQLConstraint`로 기술하며, 결과마다 단일 `sh:focusNode`를 생성합니다. 애플리케이션 전용 `bt:validationIssue` 연결은 결과와 실제 포커스 자원을 잇는 보조 표식으로 사용합니다.
- 회귀 검증은 온톨로지 테스트 80개, 온톨로지 소스 ESLint, `node ./node_modules/typescript/lib/tsc.js --noEmit -p apps/notebook/tsconfig.json`으로 수행합니다.

### 2026-09-20: 현재 의미 경계와 RDF 상호운용 정정

- 이 절은 앞선 “직접 연관 지식” 본문 합성, 탐색 추천 UI·RDF, 제목 키워드 클래스의 `bt:Topic` 하위 클래스 매핑 결정을 현재 구현 기준으로 대체합니다. 가상노트의 직접 소속 인스턴스는 색인과 통계에는 반영할 수 있지만, 삭제된 “직접 연관 지식” 본문 절은 다시 생성하지 않습니다.
- 현재 그래프에는 `recommendedEdges`, 추천 토글, `bt:RecommendedRelation`이 없습니다. 화면과 RDF에는 명시 관계 및 근거가 있는 논리 추론만 노출하며, 이름 일치 추천을 사실이나 별도 추천 관계로 만들지 않습니다.
- `주제: {키워드}`는 독립적인 직계 하위 클래스 근거 수와 직접 소속 구성원의 **서로 다른 출처 노트 수** 합이 3 이상이거나 독립적인 직계 하위 클래스 근거 수가 2 이상일 때 생성합니다. 같은 노트에서 나온 여러 문단·카드는 출처 노트 1개로 집계합니다. 구성 인스턴스 집합과 출처 노트 집합이 모두 같은 세부 클래스들은 그래프에서 별도 클래스로 보존하되 생성 임계값에서는 독립 근거 1개로 계산합니다.
- RDF에서 제목 키워드 동적 클래스는 메타클래스 `bt:TopicClass`의 인스턴스이며 동시에 `bt:KnowledgeItem`의 하위 클래스입니다. 동적 클래스를 `bt:Topic`의 하위 클래스로 두어 모든 구성원을 `bt:Topic`으로 추론하게 하는 모델은 사용하지 않습니다.
- 각 RDF 자원의 `dcterms:title`은 컨테이너 노트 제목이 아니라 노드 자신의 이름입니다. 카드와 문단 노드에 헤더 레벨·경로·자동 섹션을 직접 기록하고, 같은 헤더를 별도 `bt:Section` 자원으로 중복 생성하지 않으며, `dcterms:isPartOf`로 노트 → 상위 문단 → 카드 → 하위 문단 계층을 보존합니다.
- 문단 링크의 `targetSection`은 문단명(`paragraph`)이 아니라 섹션 판별자(`section`)를 보존합니다. 빈 상위 노트 경고의 포커스는 존재하지 않는 부모가 아니라 실제로 존재하는 하위 노트입니다.
- RDF의 `sh:ValidationReport`는 `bt:validationMode "application-snapshot"`으로 표시합니다. 포함된 shape는 내보낸 애플리케이션 검증 표식을 재현하며 노트북 제약을 독립적으로 다시 계산하는 SHACL 엔진이라고 주장하지 않습니다.
- 구현 범위는 `useOntologyData.ts`, `rdf.ts`, `useProblem.ts`, 온톨로지 회귀 테스트, 한국어·영어 사용자 가이드입니다. 현재 검증 기준은 온톨로지 테스트 83개, 온톨로지 소스 ESLint, Notebook TypeScript `--noEmit`이며 앞선 테스트 개수 표기는 당시 기록으로만 봅니다.

### 2026-09-20: 주제 완전성·빈 노트·연관 주제 탐색 정정

- 현재 구성원 집합이 같다는 이유만으로 서로 다른 키워드 클래스를 하나로 축약하지 않습니다. 모든 구성원의 전체 제목이 정확히 같은 경우에만 전체 제목 클래스를 토큰 클래스보다 우선하며, 그 외에는 키워드별 클래스를 각각 보존합니다.
- 가상노트와 주제 목록의 출처 노트는 주제 생성 임계값과 동일하게 인스턴스의 실제 `noteTitle`만 서로 다르게 집계합니다. 카드의 `boardTitle`은 출처 노트 수에 중복 가산하지 않습니다.
- 내용이 없더라도 실제로 존재하며 비어 있지 않은 노트에서 참조되거나 상위 노트로 필요한 노트는 골격 `NOTE` 인스턴스로 유지합니다. 골격 노트는 주제 후보에서 제외하며, 노트 단위 링크는 유효하고 존재하지 않는 문단을 지정한 링크만 참조 무결성 경고로 처리합니다. 이 구분은 공용 `useProblem`을 수정하지 않고 온톨로지 검증 어댑터에서만 수행합니다. 아무 구조적 역할이 없는 빈 독립 노트는 계속 제외합니다.
- RDF 내보내기는 `dcterms:conformsTo`와 `bt:semanticProfile`로 RDF 1.1 애플리케이션 스냅샷 프로필을 명시합니다. RDFS 추론 및 일부 OWL·SHACL·Dublin Core·PROV-O 어휘를 함께 사용하며 결합 그래프의 OWL 2 DL 적합성을 주장하지 않습니다. 중복된 `bt:TopicClass rdfs:subClassOf rdfs:Class` 선언은 제거합니다.
- 사용자 화면과 가이드는 검증 범위를 “애플리케이션 검증”으로 한정합니다. 현재 규칙 통과는 전체 OWL 정합성 증명이 아니며 RDF의 SHACL 결과도 독립 재계산이 아닌 스냅샷입니다.
- 추천 모델은 호환 지원하지 않습니다. `RELATED_NOTE` 관계 타입, `bt:relatedNote` 스키마, 렌더링 색상, 번역 및 이를 요구하던 테스트를 제거합니다.
- 가상노트 본문에는 공유 지식 인스턴스 수와 공유 출처 노트 수의 합이 3 이상인 다른 최상위 주제만 연관 주제로 표시합니다. 명시적 `references` 수는 이 임계값에 포함하지 않고 통과한 항목의 보조 근거로만 표시합니다. 동일한 연관 주제 수와 실제 일치 링크 발생 수를 주제 목록 요약과 가상노트 모달 상단 통계에 표시합니다. 주제 색인은 관련 인스턴스를 `문단`과 `보드 카드`로 구분하고, 일치한 내부·외부 링크를 `링크` 하위 목록에 원래 표시 이름과 URL로 나열합니다. 링크만으로 소속된 출발 노드와 문단은 `문단` 및 공유 지식에서 제외하고 출처 노트 집합에만 한 번 반영하여, 하나의 링크가 공유 지식과 공유 출처 노트에 이중 기여하지 않게 합니다. 연관 주제 링크는 동명의 실제 노트가 있으면 `📝`, 가상노트로 전환하면 `🪐`를 표시합니다. 이는 가상노트 탐색 링크일 뿐 RDF 사실 관계를 만들지 않으며, 삭제된 “직접 연관 지식” 및 “주제 하위 분류별 지식” 본문 절도 복원하지 않습니다. 상세 본문 합성이 사라짐에 따라 전용 `htmlToCleanMarkdown` 변환기도 제거합니다.
- 내부 노트 링크와 외부 링크의 표시 이름을 정규화해 `링크: {링크 이름 또는 키워드}` 주제 클래스를 만들고, 해당 링크를 포함한 출발 노트·문단을 직접 인스턴스로 연결합니다. 정규화한 전체 이름의 일치, 공통 키워드, 다른 링크 이름에 포함되는 짧은 링크 이름을 집계하며, 도출된 이름이나 키워드가 서로 다른 3개 이상의 노트에 걸쳐 공통 등장할 때만 링크 클래스를 생성합니다. 링크 이름 전체 또는 추출 키워드가 일치하는 `주제: {키워드}`가 생성되면 그 직계 하위 클래스로 연결하고, 부모 주제가 없으면 링크 클래스를 독립된 최상위 단독 주제로 그래프와 RDF에 구체화합니다. 링크 클래스가 생성되지 않은 링크 이름 근거도 일반 상위 `주제` 후보에서 제거하지 않으며, 상위 주제가 자체 생성 조건을 충족하면 출발 노트·문단을 그 주제에 직접 `instanceOf`로 연결합니다. 외부 링크는 이름 기반 클래스 소속에는 포함하지만 대상 노트 노드가 없으므로 `references` 관계를 생성하지 않습니다.
- 링크 표시 이름이 HTTP(S), 프로토콜 상대 URL 또는 도메인으로 시작하는 실제 URL 패턴이면 호스트 이름 전체를 단일 키워드로 정규화합니다. 서브도메인은 유지하고 프로토콜·포트·경로·쿼리는 제거하며, 호스트 내부의 점 구분 문자열을 별도 링크·상위 주제 키워드로 만들지 않습니다.
- 헤더 내부에 작성된 링크는 동일한 헤더 문단을 `H{N} 제목` 클래스와 `링크` 클래스 양쪽의 인스턴스로 연결합니다. 두 클래스는 구조 관점과 링크 관점을 각각 보존하지만, 구성 인스턴스와 출처 노트 집합이 같다면 상위 `주제`의 생성 임계값에서는 독립 하위 클래스 근거 1개로만 계산합니다. 가상노트 및 주제 목록의 지식·출처 통계도 기존과 같이 노드와 출처 노트 ID로 중복 제거합니다.
- 제목·링크 이름의 포함 관계는 후보 쌍을 전수 비교하지 않고 다중 패턴 문자열 매칭으로 계산합니다. 링크 근거를 상위 주제 후보에 추가해도 후보 수의 제곱에 비례하는 진입 지연이 발생하지 않도록 하며, 6,000개 링크·상위 주제 후보 회귀 성능을 함께 검증합니다. 주제 목록도 각 행마다 전체 연관 주제를 다시 계산하지 않고 공유 인스턴스·출처 노트 역색인을 한 번 구성해 일괄 집계합니다.
- 그래프 하단 범례는 제목 버튼으로 접고 펼칠 수 있으며, 접힌 상태에서는 좌측 하단의 작은 컨트롤만 유지하여 그래프 가시 영역을 확보합니다. 토글은 접근성 `expanded` 상태와 한국어 레이블을 제공합니다.
- 회귀 검증은 온톨로지 테스트 100개, Notebook TypeScript `--noEmit`, 온톨로지·문제 검증 소스 ESLint로 수행합니다.

### 2026-09-21: 카드 클래스 대응 관계와 카드 문단 단일 표현

- `rdfs:subClassOf`는 모든 하위 클래스 인스턴스가 상위 클래스 인스턴스인 실제 클래스 포함 관계에만 사용합니다. 보드 상태 클래스는 보드 카드 클래스를 상속하고, 카드 유형 클래스는 RDF에서 `bt:Card`를 상속합니다.
- 보드 카드·보드 상태 클래스와 실제 대응 노트는 비추론 주석 관계 `bt:representedByNote`로 연결하고, 카드 유형 클래스와 생성 근거 부모 헤더 문단은 `bt:definedByParagraph`로 연결합니다. 두 속성은 각각 `rdfs:seeAlso`, `rdfs:isDefinedBy`의 하위 `owl:AnnotationProperty`로 내보냅니다.
- 보드 설정의 카드 헤더 레벨과 일치하는 문단은 `CARD` 인스턴스로만 생성합니다. 링크 또는 제목 분류가 추가되어도 같은 헤더의 `PARAGRAPH`·`CONNECTED_PARAGRAPH` 인스턴스를 만들지 않으며, 카드보다 낮은 단계의 문단은 기존 계층대로 카드에 `paragraphPartOf`로 연결합니다.

### 2026-09-21: 미사용 코드 정리와 온톨로지 타당성 재검토

- 현재 캔버스 렌더링 경로에서 참조되지 않는 구형 SVG 컴포넌트 `OntologyNodeItem`·`OntologyEdgeItem`을 삭제하고, 내부 엔트리포인트에서 사용하지 않는 중복 named/default export를 정리합니다.
- 실제 추론기는 `INSTANCE_INHERITANCE`와 `SUBCLASS_TRANSITIVITY`만 생성하므로 선언만 남아 있던 `INFERRED_PART_OF`와 더 이상 입력·생성되지 않는 `PARENT_CHILD` 호환 별칭을 제거합니다. `partOf`는 문서 구조를 보존하는 명시 관계이며 전이 폐쇄를 만들지 않습니다.
- 현재 모델은 RDF 1.1 교환용 애플리케이션 온톨로지로는 타당합니다. 클래스 소속과 상속을 각각 `rdf:type`·`rdfs:subClassOf`로 구분하고, 클래스와 근거 리소스의 대응은 비논리 주석 속성으로 분리하며, 추론 관계에 규칙과 원본 엣지를 기록합니다.
- `TopicClass`를 이용한 클래스/개체 메타모델링은 OWL 2의 독립된 관점으로 해석할 수 있지만, 결합 그래프 전체를 OWL 2 DL 전역 제한에 대해 검증하지는 않습니다. 또한 SHACL 부분은 애플리케이션 검증 스냅샷이므로 독립 SHACL 검증 결과로 간주하지 않으며, 이 제한은 RDF 의미 프로필과 사용자 가이드에 명시합니다.
- 화면에서 구분하는 `notePartOf`·`cardPartOf`·`paragraphPartOf`·`connectedPartOf`가 RDF에서는 모두 `dcterms:isPartOf`로 합쳐져 세부 의미가 손실됩니다. 외부 질의·상호운용이 필요해지면 네 관계를 `dcterms:isPartOf`의 하위 속성으로 선언해 내보내는 작업을 우선합니다.
- 문단·카드 IRI는 현재 문서 경로와 구조 ID의 영향을 받아 제목 이동이나 계층 재편 시 바뀔 수 있습니다. 장기간 누적하는 RDF 저장소와 연결할 때는 저장 계층의 영속 ID를 우선 식별자로 사용합니다.
- 현재 `isConsistent`는 참조 무결성·고립 개체에 대한 애플리케이션 검사 결과이며, 클래스 모순·카디널리티·disjointness를 판정하는 OWL 정합성 검사가 아닙니다. 독립 검증이 필요하면 데이터 그래프와 별도 shapes graph를 대상으로 실제 SHACL 프로세서를 실행합니다.
- 회귀 검증은 온톨로지 테스트 107개, Notebook TypeScript `--noEmit`, 온톨로지 소스 ESLint, 엔트리포인트 기준 모듈 도달성 검사로 수행합니다.

### 2026-09-23: 단일 주제 계층과 가상노트 탐색 현행화

- 이 절은 앞선 `주제` 상위/세부 클래스 분리, 별도 `링크` 주제·`카드유형` 클래스, 탐색 추천, 가상노트를 실제 노트 존재 시 자동 배제하는 동작, 주제 클래스 `3-hop`, `🪐` 가상 주제 아이콘 및 관계 수 기준 주제 목록 정렬 설명을 현재 구현 기준으로 대체합니다. 날짜별 이전 절은 변경 이력입니다.
- 노트 마지막 경로 제목, 카드·문단 헤더, 외부 링크 표시 이름의 공통 키워드를 하나의 주제 클래스 후보로 모읍니다. 서로 다른 출처 노트 3개 이상과 숫자가 아닌 키워드 조건을 적용하며, URL 형태의 표시 이름은 전체 호스트 이름을 단일 키워드로 취급합니다. 별도 `링크: {키워드}` 및 `카드유형: {부모 헤더 제목}` 클래스는 생성하지 않습니다.
- 각 주제의 출처 노트 집합을 비교하여 `B ⊂ A`인 하위 주제 `B`가 둘 이상인 `A`에 명시적 `SUBCLASS_OF`를 연결합니다. 출처 노트가 3개 이상 겹치는 주제만 연관 주제로 집계하고, 직접 클래스 관계에 따라 상위·하위·그 외 연관 주제로 표시합니다. 공통 인스턴스 수를 더한 “공유 지식” 기준이나 명시적 참조 수는 연관 주제 생성 임계값에 넣지 않습니다.
- 주제 목록은 링크·문단·카드·출처 노트 수의 합을 내림차순으로 정렬하고 동점은 제목순으로 처리합니다. 직접 하위 주제가 있으면 기존 연관 주제 수 뒤에 `(하위 주제 n)`을 추가합니다. 실제 노트 여부로 목록 항목의 진입점을 바꾸지 않고 모두 가상노트 모달을 엽니다.
- 같은 이름의 실제 노트가 있더라도 가상노트를 열 수 있습니다. 가상노트 내 다른 주제를 선택하면 동일 모달의 본문을 교체하며 이전 주제로 다시 이동해도 새 본문을 표시합니다. 모달에는 내부 뒤로가기 버튼을 두지 않습니다. 본문 내부 노트 링크 또는 하단 실제 노트 이동·저장 동작으로 `NotePage`를 열면 모달을 숨기고, 출발 화면으로 뒤로 돌아올 때 해당 주제 모달을 복원합니다. 실제 노트가 있는 연관 주제에만 `📝`를 붙입니다.
- 최상위 주제의 `3-hop`은 제공하지 않고 다른 클래스의 하위가 아닌 보드 클래스에서만 제공합니다. 현재 화면과 RDF에는 추천 모델을 생성하지 않습니다. 한국어 `사용 방법.md`와 영어 `Usage.md`를 함께 갱신합니다.

### 2026-09-23: 사용자 가이드 간소화 후 유지할 모델 세부사항

- 같은 보드에서 이름이 같은 보드 문단은 출처가 여럿이어도 `BOARD_PARAGRAPH` 인스턴스 하나로 합칩니다. `paragraphOccurrences`에 각 출처를 보존하고 상세정보에 소속 노트를 중복 없이 표시합니다. 카드 헤더는 `CARD` 인스턴스 하나로만 만들며 같은 문단을 `PARAGRAPH`·`CONNECTED_PARAGRAPH`로 중복 생성하지 않습니다. 카드보다 아래 레벨의 문단은 카드에 계층적으로 귀속합니다.
- 외부 링크는 이름과 URL이 같은 경우 한 인스턴스를 공유합니다. 외부 참조와 기본 링크 클래스 소속 이외에 주제 분류 등 다른 관계가 있으면 같은 인스턴스를 `CONNECTED_EXTERNAL_LINK`로 표시합니다. 일반 `EXTERNAL_LINK`만 기본 화면에서 숨기고 토글로 표시합니다. 문단은 참조나 주제 분류가 있을 때 `CONNECTED_PARAGRAPH`로 구분하며, 상위 문단이 있어도 소속 노트와의 `connectedPartOf` 관계를 추가합니다. 별도의 링크로 연결된 문단 클래스는 생성하지 않습니다.
- 노트의 정식 속성은 YAML frontmatter에 명시된 키만 사용합니다. 수정일, 본문에서 발견한 일정, 목차를 자동 속성으로 주입하지 않습니다. 시각화할 때 데이터타입 관계와 리터럴 사각형을 추가하며 `속성(VOWL)` 토글로 표시합니다.
- 그래프의 표시 토글은 현재 `간접 추론`, 일반 `문단`, `일반 외부 링크`, `속성(VOWL)`입니다. 과거 절의 `클래스만` 토글은 현재 구현에 없습니다. 노드·관계 레이블은 쉬운 명칭 또는 RDF/OWL 용어로 함께 바꾸며, 이는 그래프 관계나 RDF 직렬화 결과를 변경하지 않습니다. 범례는 현재 표시된 노드·관계 유형과 개수를 구분해 표시합니다.
- RDF에서는 주제 동적 클래스를 `bt:TopicClass`의 인스턴스이자 `bt:KnowledgeItem`의 하위 클래스로, 보드 문단을 보드 클래스와 `bt:BoardParagraph`의 인스턴스로 내보냅니다. `bt:BoardParagraph`는 `bt:Paragraph`의 하위 클래스이며 보드 클래스는 `bt:KnowledgeItem`의 하위 클래스입니다. 보드 클래스와 실제 대응 노트는 비추론 주석 관계 `bt:representedByNote`로 연결합니다. 외부 링크는 별도 인스턴스로 내보내고 연결된 링크는 `bt:ConnectedExternalLink`로 구분합니다. URL은 `rdfs:seeAlso`, 외부 참조 속성은 `dcterms:references`의 하위 속성으로 표현합니다.

### 2026-09-26: 대규모 그래프(600개 노드, 1500개 연결) 성능 최적화

- **N-hop 이웃 탐색 고속화**: `useOntologyData.ts`에서 그래프 엣지를 기반으로 양방향 인접 리스트(`edgeAdjacencyMap`)를 `useMemo`로 사전 구성하고, `getNeighbors`가 인접 리스트를 통한 BFS 탐색을 수행하도록 개선하여 복잡도를 $O(\text{depth} \times V \times E)$에서 $O(V + E)$로 단축합니다.
- **포스 시뮬레이션 핫루프 최적화**: `forceLayout.ts`의 `stepForceSimulation`에서 노드 좌표 및 속도를 로컬 변수로 호이스팅하고, 반발 임계거리(`maxRepulseDistSq`) 내 노드 쌍에 대해서만 TypedArray(`pairMinDist`) 읽기를 수행하도록 지연 인출을 적용하며, 반복적인 거리 나눗셈을 역수 곱셈으로 치환하여 130스텝 연산 속도를 25% 이상 개선합니다.
- **Canvas 2D 렌더러 드로우 콜 및 컨텍스트 스택 절감**: `canvasRenderer.ts`의 `drawEdges`와 `drawNodes`에서 매 아이템마다 호출되던 `ctx.save()` / `ctx.restore()`(프레임당 4,200회)를 전역 1회 호출로 통합하고, 동일 스타일의 엣지들을 연속 경로로 묶어 `ctx.stroke()` 드로우 콜 수를 대폭 절감합니다.
- **애니메이션 루프 및 뷰 컴포넌트 오버헤드 제거**: `OntologyCanvasView.tsx`에서 매 RAF 프레임마다 반복되던 600회 `nodeMap.set()` 호출을 제거하고, `focusedNodeIds`, `violatingNodeIds`, `virtualNoteEligibles` 프로퍼티에 `Set<string>`을 직접 지원하여 컴포넌트 간 Set <-> Array 상호 변환 오버헤드를 차단합니다. 또한 기존 노드 좌표를 보존하는 웜 리스타트를 적용해 보기 옵션 전환 시 즉각 수렴합니다.
- **공리 추론 및 문단 계층 비교 최적화**: `axioms.ts`의 `getAncestorClasses`에 메모이제이션 캐시를 적용하여 중복 상속 조상 BFS 탐색을 방지하고, `paragraphClassification.ts`의 `buildParagraphPartOfAssignments`에서 문서 ID 단위로 후보를 그룹화하여 문서 간 불필요한 계층 비교를 배제합니다.
- **회귀 검증**: 600개 노드, 1500개 엣지 대규모 지식 네트워크 대상 500ms 이내 수렴 및 좌표 바운딩 검증 테스트 스위트(`ontology-large-graph.test.cjs`) 통과.

### 2026-09-26: 보드 클래스 노드 3-hop 제공 제거 및 N-hop 선택지 단순화

- 보드 클래스 노드(`BOARD_CARD`)에 한해 예외적으로 제공하던 `3-hop` 연관 범위를 제거하고, 모든 노드의 N-hop 범위를 일관되게 `1`, `2`, `전체(All)`로 통일합니다.
- `nhop.ts`의 `supportsThreeHopRange`를 항상 `false`로 처리하고 `getNhopDepthOptions`가 기본 선택지(`[1, 2, 99]`)만을 반환하도록 하여, 3-hop 범위 선택 및 비일관적 UI 분기를 해소합니다.
- 한국어 `사용 방법.md`와 영어 `Usage.md` 가이드를 함께 갱신합니다.

### 2026-09-26: '지식 그래프' 및 '주제 노트' 독립 확장 기능 분리

- **배경 및 목적**: 온톨로지 확장 기능 내부에서 그래프 시각화 및 관계 분석에 집중하는 사용자와, 공통 주제 색인 및 실시간 종합 가상노트(Topic Virtual Note) 활용에 집중하는 사용자의 요구를 분리 충족하기 위해, 기존 단일 `ontology` 확장 기능을 `knowledgeGraph`(지식 그래프)와 `topicNotes`(주제 노트) 두 개의 독립 확장 기능으로 분리합니다.
- **코드 및 패키지 구조**:
  - 공통 기반 코드(엔티티 모델, 데이터 수집 `useOntologyData`, 포스 레이아웃, 캔버스 렌더러, RDF 추출, 가상노트 종합 유틸리티)는 모두 `features/knowledgeGraph/` 내에 배치하여 단방향 의존성(`features/topicNotes` -> `features/knowledgeGraph`)을 확립합니다.
  - `features/knowledgeGraph/`: 지식 그래프 화면(`KnowledgeGraphScreen`), Drawer/Discovery 진입 버튼(`KnowledgeGraphButton`, 검증 오류/경고 배지), 연관 탐색 프리뷰 시트, VOWL 속성 및 캔버스 뷰를 담당합니다.
  - `features/topicNotes/`: 주제 노트 화면(`TopicNotesScreen`), Drawer/Discovery 진입 버튼(`TopicNotesButton`, 배지 미표시 경량 버튼), NotePage 상단 주제 태그 섹션(`SubjectTagSection`)을 담당합니다.
- **연동 및 툴바 정책**:
  - '지식 그래프' 단독 활성화 시에도 그래프 프리뷰 시트의 `[가상노트 열기]` 모달은 공통 모달(`modals/OntologyVirtualNoteModal.tsx`)을 통해 정상 제공됩니다.
  - 두 확장 기능 간 스크린 전환 버튼은 일체 배제하여 완전 독립된 기능 화면으로 유지하며, 상단 툴바(`KnowledgeGraphNavToolbar`)는 각 화면의 기능 가이드 바로가기(`[사용 방법 >]`)와 지식 그래프의 RDF 내보내기 기능만 제공합니다.
- **하위 호환성 및 마이그레이션**:
  - 기존 설정 마이그레이션 없이 신규 키 `knowledgeGraph`, `topicNotes`로 분리 등록합니다(방안 B).
  - 기존 경로 및 컴포넌트 임포트 호환성을 위해 `features/knowledgeGraph/screens/OntologyScreen.tsx`, `OntologyTopicScreen.tsx`, `OntologyButton.tsx`, `SubjectTagSection.tsx` 등에 re-export 브릿지를 유지합니다.
- **가이드 현행화**: 한국어 `사용 방법.md`와 영어 `Usage.md` 가이드에 각각 `### 🕸️ 지식 그래프` / `### 🕸️ Knowledge Graph`와 `### 📑 주제 노트` / `### 📑 Topic Notes` 독립 항목으로 분리 반영하고, 상단 툴바의 `[사용 방법 >]` 링크와 완벽히 일치하도록 구성합니다.

### 2026-09-27: 테스트 파일 명칭 및 잔여 온톨로지 코드 정리

- 테스트 코드 파일명을 `ontology-*.test.cjs`에서 `knowledge-graph-*.test.cjs` (총 14개)로 전면 변경하여 '지식 그래프' 및 '주제 노트' 분리 아키텍처에 맞게 일원화합니다.
- 각 테스트 파일 내 임시 디렉토리 접두사(`mkdtempSync`) 역시 `knowledge-graph-*`로 일괄 변경합니다.
- `apps/notebook` 전체에서 사용자 노출 한국어 문자열 '온톨로지' 및 미사용 레거시 브릿지 파일들을 정리하고 회귀 테스트 스위트 120개 전체 통과를 유지합니다.

* 선행 ADR:
  - [2504-plugin-extension-architecture.md](2504-plugin-extension-architecture.md)
  - [2507-tag-based-kanban-scrum-board.md](2507-tag-based-kanban-scrum-board.md)

