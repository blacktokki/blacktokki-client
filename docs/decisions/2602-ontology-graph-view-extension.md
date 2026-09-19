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

보드·주제(Class), 카드·노트·문단(Instance), 참조 및 소속 계층 메타모델과 2D 포스 시뮬레이션을 결합한 `features/ontology` 확장 기능 아키텍처를 채택합니다.

1. **VOWL-inspired 메타모델 정의**:
   - **Class (클래스)**: 도메인 보드(`Content.type === 'BOARD'`)를 개념/범주 단위로 매핑 (VOWL 표준 파란색 원형 노드: `#AACCFF` / `#5588CC`)
   - **Instance (인스턴스)**:
     - **Card (카드)**: 특정 헤더 수준(`BOARD_HEADER_LEVEL`) 문단 카드를 보드 소속 개체로 매핑 (초록색 원형 노드: `#48C78E` / `#27AE60`)
     - **Singleton (싱글턴)**: 보드에 속하지 않은 독립 일반 노트(`Content.type === 'NOTE'`)를 클래스 분리 없이 단독으로 존재하는 유일 개체로 매핑 (파란색 이중 링 원형 노드: `#70A1FF` / `#3060C0`)
   - **Datatype / Literal (속성값 / 리터럴)**:
     - 타이머 태그(`schedule`) 속성값을 노란색 직사각형 노드(`<Rect>`)로 캔버스에 투영 (`#FFEA80` / `#D4AC0D`)
     - 상단 HUD에 **속성(VOWL) 토글 칩**을 제공하여 그래프 과밀 방지 및 선택적 속성 노드 전개 지원
   - **Property & Relation (VOWL 프로퍼티 박스 엣지)**:
     - **Object Property**: 본문 내 `_NOTELINK` 하이퍼링크(`references`), 상하위 노트·문단 계층(`partOf`), 클래스 소속(`instanceOf`), 클래스 상속(`subClassOf`)의 정중앙에 **직사각형 프로퍼티 라벨 박스** 렌더링
     - **Datatype Property**: 인스턴스(원)에서 리터럴(직사각형)로 이어지는 `hasSchedule` 방향성 라벨 엣지 연결
   - **Axiom (공리 검증 및 추론 엔진)**:
     - **참조 무결성 공리 (Referential Integrity)**: `useProblem`과 연동하여 존재하지 않는 문서/문단을 가리키는 깨진 링크 및 부모 링크 결함 검출
     - **고립 개체 공리 (Isolated Entity)**: `useProblem`과 연동하여 역링크, 부모, 보드가 전혀 없는 고립 노트 검출
     - **클래스 추론**: `subClassOf`의 전이성과 상위 클래스에 대한 `instanceOf` 상속을 논리 추론으로 계산
     - **탐색 추천**: 제목 키워드와 노트 마지막 제목의 일치를 논리 추론과 분리된 휴리스틱 추천으로 계산
     - 온톨로지 진입 버튼(`OntologyButton`) 및 캔버스 상단에 **공리 검증 수 배지** 제공
2. **크로스플랫폼 2D 포스 지향 시뮬레이션 (`forceLayout.ts`)**:
   - 순수 엔티티 노드(Class, Card, Singleton) 중심의 쿨롱 척력, 훅 스프링 인력, 중심 중력 시뮬레이션 구현
3. **인터랙션 및 N-hop 포커스 뷰 (`OntologyScreen.tsx` & `OntologyPreviewSheet.tsx`)**:
   - 캔버스 팬/줌 및 노드 탭 선택 시 하단 프리뷰 시트 노출
   - 데이터 속성 표(상태, 로우, 일정) 및 접이식 하위 섹션(Sections) 목차 칩 제공 (클릭 시 해당 문단으로 앵커 이동)
   - 선택된 노드를 중심으로 N-hop(1-hop, 2-hop, 전체) 연결망만 하이라이트하고 비연관 노드는 투명도 처리하여 시각적 인지 부하 감소
4. **빈 내용 노트 자동 필터링**:
   - 텍스트나 미디어가 없는 빈 노트(`description` 공백/빈 태그)는 그래프에서 제외하여 노이즈를 방지합니다. 단, 도메인 클래스를 정의하는 보드(`Content.type === 'BOARD'`)는 본문 내용이 없어도 클래스 노드로 유지합니다.
5. **플러그인 레지스트리 통합 (`features/index.tsx`)**:
   - ADR 2504 규격에 맞춰 `features['ontology']`로 등록하고, 드로어와 홈 화면에 `OntologyButton` 제공

Non-goals:

- SPARQL 등의 고비용 시맨틱 쿼리 엔진이나 무거운 OWL/RDF 직렬화는 도입하지 않습니다.
- 사용자가 노트 본문에 강제적인 속성 키-값 문법을 작성하도록 요구하지 않습니다.

## Consequences

- Good: 기존에 작성된 마크다운 노트와 보드 데이터를 그대로 활용하여 별도의 데이터 마이그레이션 없이 즉시 지식 그래프를 시각화합니다.
- Good: 보드를 클래스로, 카드를 인스턴스로, 일반 노트를 싱글턴으로 명확히 구분하여 지식 체계의 구조적 분류와 유기적 의존망을 동시에 파악할 수 있습니다.
- Good: Web 및 모바일 환경에서 추가 라이브러리 의존성 없이 가볍고 부드러운 SVG 렌더링 및 팬/줌 인터랙션을 보장합니다.
- Good: N-hop 슬라이더 필터를 통해 노드가 수백 개로 늘어나더라도 선택 노드 주변의 연관 관계에 즉시 집중할 수 있습니다.
- Bad: 노트와 카드의 수가 수천 개 이상으로 극단적으로 커질 경우 2D SVG 노드 수가 많아져 렌더링 프레임 저하가 발생할 수 있습니다. (추후 WebGL/Canvas 가상화 고려 필요)

## Implementation Plan

- **Affected paths**:
  - `apps/notebook/src/features/ontology/types.ts`
  - `apps/notebook/src/features/ontology/relations.ts`
  - `apps/notebook/src/features/ontology/axioms.ts`
  - `apps/notebook/src/features/ontology/forceLayout.ts`
  - `apps/notebook/src/features/ontology/canvasRenderer.ts`
  - `apps/notebook/src/features/ontology/OntologyCanvasView.tsx`
  - `apps/notebook/src/features/ontology/useOntologyData.ts`
  - `apps/notebook/src/features/ontology/virtualNotes.ts`
  - `apps/notebook/src/features/ontology/VirtualNoteModal.tsx`
  - `apps/notebook/src/features/ontology/OntologyTopicScreen.tsx`
  - `apps/notebook/src/features/ontology/titleKeywordClasses.ts`
  - `apps/notebook/src/features/ontology/rdf.ts`
  - `apps/notebook/src/features/ontology/exportRdf.ts`
  - `apps/notebook/src/features/ontology/OntologyGraphView.tsx`
  - `apps/notebook/src/features/ontology/OntologyPreviewSheet.tsx`
  - `apps/notebook/src/features/ontology/OntologyScreen.tsx`
  - `apps/notebook/src/features/ontology/OntologyButton.tsx`
  - `apps/notebook/src/features/ontology/OntologyNavToolbar.tsx`
  - `apps/notebook/src/features/ontology/__tests__/ontology-*.test.cjs`
  - `apps/notebook/src/features/index.tsx`
  - `apps/notebook/src/lang/ko.json`
  - `apps/notebook/public/사용 방법.md`
  - `apps/notebook/public/Usage.md`
- **Dependencies**: `react-native-svg` (모바일/기본 벡터 요소), HTML5 2D Canvas API (웹 캔버스 가속)
- **Patterns to follow**:
  - ADR 2504 확장 기능 등록 규격 준수
  - ADR 2507 보드 카드 파싱 구조와 일관된 데이터 모델링 유지
  - 실제 입력 출처가 없는 관계 추론은 추가하지 않고, 휴리스틱 탐색 추천은 RDF 사실 트리플로 구체화하지 않음
  - 동명의 실제 물리 노트가 있는 주제는 물리 노트를 우선하며 가상노트 합성 대상에서 자동 배제

### Verification

- [x] `node ./node_modules/typescript/lib/tsc.js --noEmit -p apps/notebook/tsconfig.json` 타입 검사 통과
- [x] ESLint 및 Prettier 포맷 검사 통과 (온톨로지 소스 0 errors, 0 warnings)
- [x] `features['ontology']` 등록 및 다국어 번역 정합성 확인
- [x] 주제 클래스 구성원 변경 전후의 클래스 ID 동일성 통합 테스트 통과
- [x] 이름 일치 추천과 논리 추론의 타입·UI·RDF provenance 분리 테스트 통과
- [x] RDF 1.1 Turtle 파서 검증 및 동적 클래스-고정 스키마 정렬 테스트 통과
- [x] 주제 클래스 생성 임계 조건(하위 인스턴스 3개 이상 / 3개 이상 노트 공통 등장 / 직계 하위 클래스와 직접 출처 노트 합 3개 또는 서브클래스 2개) 단위 테스트 100% 통과
- [x] 가상노트 적격성 판별(`isTopicVirtualNoteEligible`, `getTopicVirtualNoteEligibleSet`) 및 마크다운 지식 합성(`synthesizeTopicVirtualNote`) 단위 테스트 통과
- [x] N-hop(1-hop, 2-hop, 전체) 연관 엣지 가시성 및 계층적 선 강조(`drawEdges`) 단위 테스트 통과
- [x] 온톨로지 전체 단위 테스트 83개 전원 통과 (`yarn workspace @blacktokki/notebook test:ontology` 또는 샌드박스에서는 테스트 파일별 직접 실행)

## Alternatives Considered

- 롬/옵시디언 방식의 단순 링크 그래프: 클래스-인스턴스 개념이 없어 보드(프로젝트/도서 등) 단위의 도메인 군집 인지가 어려워 기각.
- 전통적인 시맨틱 웹 트리플 모델: 사용자가 본문에 `Key::Value` 형태의 전용 문법을 입력해야 하는 작성 허들이 높아 일반 노트 작성 경험을 해치므로 기각.

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
  - 노트북 내에 정규화된 이름(대소문자 무시 및 리프 제목 포함)이 일치하는 물리적 노트가 이미 존재하는 경우 일반 물리 노트 네비게이션이 우선하므로 가상노트 생성 대상에서 즉시 제외합니다.
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
- `주제: {키워드}`는 직계 하위 클래스 수와 직접 소속 구성원의 **서로 다른 출처 노트 수** 합이 3 이상이거나 직계 하위 클래스 수가 2 이상일 때 생성합니다. 같은 노트에서 나온 여러 문단·카드는 출처 노트 1개로 집계합니다.
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
- 가상노트 본문에는 공유 지식 인스턴스 수와 공유 출처 노트 수의 합이 3 이상인 다른 최상위 주제만 연관 주제로 표시합니다. 명시적 `references` 수는 이 임계값에 포함하지 않고 통과한 항목의 보조 근거로만 표시합니다. 동일한 연관 주제 수를 주제 목록 요약과 가상노트 모달 상단 통계에도 표시합니다. 동명의 실제 노트가 있으면 일반 노트 링크를, 없으면 가상노트 전환 링크를 생성합니다. 이는 가상노트 탐색 링크일 뿐 RDF 사실 관계를 만들지 않으며, 삭제된 “직접 연관 지식” 및 “주제 하위 분류별 지식” 본문 절도 복원하지 않습니다. 상세 본문 합성이 사라짐에 따라 전용 `htmlToCleanMarkdown` 변환기도 제거합니다.
- 회귀 검증은 온톨로지 테스트 88개, Notebook TypeScript `--noEmit`, 온톨로지·문제 검증 소스 ESLint로 수행합니다.

* 선행 ADR:
  - [2504-plugin-extension-architecture.md](2504-plugin-extension-architecture.md)
  - [2507-tag-based-kanban-scrum-board.md](2507-tag-based-kanban-scrum-board.md)
