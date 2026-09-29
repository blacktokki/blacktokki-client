---
status: accepted
date: 2026-09-29
decision-makers: '@blacktokki'
---

# 2603. 지식 그래프의 RDF/OWL과 주제 노트 소유 경계를 분리한다

## Context and Problem Statement

[ADR 2602](2602-knowledge-graph-view-extension.md)는 노트·보드의 구조와 관계를 그래프로 탐색하는 `knowledgeGraph` 확장을 정했습니다. 이후 RDF/OWL 내보내기와 표시, 자동 주제 클래스, 가상노트가 같은 확장의 소스·테스트에 함께 들어가 기능 소유자와 의존 방향을 구분하기 어려워졌습니다. 기존 그래프 모델과 사용자 데이터를 유지하면서 RDF/OWL과 주제 노트를 각각 독립적으로 변경할 수 있어야 합니다.

## Decision

1. **확장과 의존 방향**
   - `features/knowledgeGraph`는 기본 노드·관계, 애플리케이션 검증, 캔버스와 그래프 화면을 제공합니다. `features/knowledgeGraph/owlrdf`는 RDF/OWL 직렬화·내보내기·용어 표시, YAML 속성의 리터럴·datatype 관계, 클래스 상속에 따른 간접 추론을 소유합니다. `features/topicNotes`는 주제 클래스 생성, 주제 목록·태그, 가상노트 화면·모달을 소유합니다.
   - 확장 간 소스 의존 방향은 `topicNotes` → `knowledgeGraph` 한 방향입니다. `knowledgeGraph`는 `topicNotes`를 임포트하지 않습니다. 일반 관계 판별·노드 분류·관계 요약은 `knowledgeGraph/utils/relations.ts`에 유지하고, RDF 술어 및 RDF/OWL 표시 변환만 `owlrdf/relations.ts`에 둡니다.
   - `features['knowledgeGraph']`와 `features['topicNotes']`는 별도 설정 키와 진입점을 사용합니다. 그래프 진입 화면은 항상 `KnowledgeGraphScreen`이며, `topicNotes` 모듈은 화면을 대체하지 않고 부팅 시 그래프 화면 확장 훅을 자체 등록합니다. `features/index.tsx`는 주제 기능 주입을 조립하지 않습니다. 화면은 기존 `useExtension()`의 `info`에서 활성 상태를 읽어 훅에 전달하고, 훅은 활성 여부와 무관하게 같은 순서로 호출합니다. 별도 활성화 훅이나 기존 설정의 자동 마이그레이션은 도입하지 않습니다.
2. **데이터 조립**
   - `knowledgeGraph/useKnowledgeGraphData.ts`는 현재 모드의 노트·보드에서 기본 그래프와 카드 하위 제목 원본을 구성합니다. 주제 클래스나 datatype 노드를 만들지 않습니다. 공통 클래스 종류·분류 타입은 확장 가능한 문자열 계약으로 두고, `TOPIC`·`TITLE_KEYWORD`와 주제 매칭 레이블의 구체 타입은 `topicNotes/types.ts`에 둡니다.
   - `owlrdf/datatypeGraph.ts`는 YAML frontmatter가 있는 `NOTE` 인스턴스에서만 리터럴 노드와 `DATATYPE_PROPERTY` 관계를 만듭니다. `owlrdf/inference.ts`는 명시된 `INSTANCE_OF`·`SUBCLASS_OF` 관계에서 근거가 있는 간접 관계만 계산하고, `owlrdf/useOwlRdfGraphData.ts`가 기본 그래프에 두 결과를 더합니다. `topicNotes/useTopicGraphData.ts`는 주제 클래스·소속·계층 관계를 추가한 뒤 `owlrdf/inference.ts`로 간접 관계를 다시 계산하고 이웃 탐색 결과를 갱신합니다. 애플리케이션 검증 결과는 기본 그래프의 결과를 유지합니다.
   - 주제 후보는 노트 마지막 경로 제목, 카드·문단 제목, 외부 링크 호스트 이름에서 수집합니다. 서로 다른 출처 노트 세 개 이상이 지지하는 키워드만 클래스로 만들며, 출처 노트 집합의 진부분집합 관계로 주제 계층을 구성합니다. 가상노트는 같은 이름의 실제 노트가 있어도 열 수 있고, 출처 노트·링크·문단·카드 및 연관 주제를 종합합니다.
3. **화면과 RDF**
   - `knowledgeGraph/useKnowledgeGraphScreenExtension.ts`는 화면 확장 훅 등록과 호출 계약을 제공하고, `topicNotes/useTopicKnowledgeGraphExtension.ts`가 주제 데이터, 강조 노드, 군집 클래스, 가상노트 동작과 명칭을 주입합니다. 비활성 상태에서는 기본 그래프를 그대로 반환합니다. 화면 교체 없이 활성 상태가 바뀌면 그래프 범위를 갱신해 선택 상태와 레이아웃을 초기화합니다. 기본 그래프의 사용자 흐름은 ADR 2602의 노드 탐색·검증 방식을 유지합니다.
   - 그래프 화면의 속성 토글은 datatype 노드·관계를 표시하며, 레이블 토글은 쉬운 명칭과 RDF/OWL 용어를 전환합니다. `owlrdf/InferenceControl.tsx`는 간접 추론 표시 토글과 관계가 없을 때의 알림을 소유하고, `owlrdf/relations.ts`는 추론·datatype 관계의 캔버스 및 범례 색상을 정합니다. 레이블 선택은 RDF 직렬화 결과를 바꾸지 않습니다. RDF 1.1 Turtle 내보내기는 명시 관계, 선택된 추론 근거 및 애플리케이션 검증 스냅샷을 직렬화합니다. 이를 OWL 2 DL 전역 정합성 검사나 독립 SHACL 검증으로 표시하지 않습니다.
   - 포스 레이아웃은 전달받은 클래스 ID에 대해서만 군집을 만들고, 캔버스는 전달받은 강조 ID와 리터럴 노드 형태를 그립니다. 주제 ID 목록은 `topicNotes`가 선택하므로 레이아웃·캔버스의 공통 코드에 주제 확장 임포트를 두지 않습니다.

## Consequences

- Good: 기본 그래프, RDF/OWL, 주제 노트의 소스와 테스트 위치가 일치하고 확장 간 역방향 임포트를 막을 수 있습니다.
- Good: 그래프 화면과 레이아웃을 공통으로 사용하면서 주제 노트의 활성 여부에 따라 주제 기능을 조립할 수 있습니다.
- Good: 네비게이션에는 `KnowledgeGraphScreen` 하나만 등록되고 주제 확장 활성화 시에도 화면 상태와 훅 호출 순서가 예측 가능합니다.
- Tradeoff: `knowledgeGraph`와 `topicNotes`가 같은 그래프를 사용할 때 RDF datatype 조립 뒤 주제 노드와 간접 관계를 다시 계산하므로 훅 간 데이터 계약과 테스트 경로를 함께 유지해야 합니다.
- Tradeoff: 화면 확장 훅은 화면이 처음 렌더링되기 전에 등록해야 하며, 비활성 상태에서도 훅 자체는 호출됩니다. 비활성 상태의 주제 그래프 계산은 건너뜁니다.
- Tradeoff: 이전 단일 확장 설정은 새 `topicNotes` 키를 자동으로 활성화하지 않습니다. 사용자는 주제 노트 확장을 별도로 활성화해야 합니다.

## Implementation Plan

- **Affected paths**: `apps/notebook/src/features/knowledgeGraph/{KnowledgeGraphScreen.tsx,types.ts,useKnowledgeGraphData.ts,useKnowledgeGraphScreenExtension.ts,utils/relations.ts,components/}`, `apps/notebook/src/features/knowledgeGraph/owlrdf/`, `apps/notebook/src/features/topicNotes/`, `apps/notebook/src/features/index.tsx`, `apps/notebook/package.json`, `apps/notebook/public/{Usage.md,사용 방법.md}`, `apps/notebook/src/lang/ko.json`.
- **Patterns to follow**: 기본 그래프 → `useOwlRdfGraphData` → 활성 시 `useTopicGraphDataFromBase` 순서로 조립합니다. `features/index.tsx`는 `KnowledgeGraphScreen`만 그래프 화면으로 등록합니다. 정적으로 로드되는 `topicNotes/TopicNotesScreen.tsx`가 자기 확장 훅을 등록하며, 확장 상태는 기존 `useExtension()` 결과를 훅에 전달합니다. 일반 관계 함수는 `utils/relations.ts`, 간접 관계 생성·판별은 `owlrdf/inference.ts`, RDF 술어·레이블 변환은 `owlrdf/relations.ts`를 사용합니다.
- **Tests**: 기본 그래프 테스트는 `knowledgeGraph/__tests__/`, RDF/OWL 테스트는 `knowledgeGraph/owlrdf/`, 주제 노드·가상노트 테스트는 `topicNotes/__tests__/`에 둡니다. 혼합 테스트는 소유 기능별로 분리하고 `test:knowledgeGraph`가 세 경로를 모두 실행합니다.
- **Dependencies and migration**: 새 패키지나 환경 변수는 추가하지 않습니다. 기존 노트·보드 저장 형식을 바꾸지 않고 확장 설정 자동 마이그레이션도 하지 않습니다.
- **Non-goals**: 앱 내 SPARQL 편집기, 수동 RDF 문법 입력, OWL 2 DL 정합성 증명, `topicNotes`에서 `knowledgeGraph`로의 역방향 의존을 도입하지 않습니다.

## Verification

- [x] `yarn workspace @blacktokki/notebook test:knowledgeGraph`에서 기본 그래프·RDF/OWL·주제 노트 테스트 131개 통과
- [x] 그래프 화면 등록이 `KnowledgeGraphScreen` 하나인지 확인하고, 확장 훅의 활성·비활성 전환 및 기존 검증 결과 보존을 테스트
- [x] `node node_modules/typescript/bin/tsc --noEmit --project apps/notebook/tsconfig.json` 통과
- [x] `node_modules/.bin/eslint apps/notebook/src/features/knowledgeGraph apps/notebook/src/features/topicNotes --ext .ts,.tsx` 통과
- [x] `knowledgeGraph`의 `topicNotes` 임포트, 공통 타입의 `TOPIC`·`TITLE_KEYWORD`, 기본 데이터 훅의 datatype 생성, `useIsExtensionActive` 참조가 없는지 확인
- [x] `git diff --check` 통과
- [ ] 브라우저에서 두 확장 활성화, 주제 노트 단독 활성화, 지식 그래프 단독 활성화 시 각 진입 화면과 모달 복원을 직접 확인

## Alternatives Considered

- 하나의 `knowledgeGraph` 확장에 모든 소스와 테스트를 유지하면 공통 데이터 재사용은 쉽지만 RDF/OWL과 주제 노트를 독립적으로 활성화하고 변경할 수 없습니다.
- 공통 그래프에 주제 훅을 직접 임포트하면 화면 조립은 짧아지지만 `knowledgeGraph`가 `topicNotes`에 의존하게 됩니다. 별도 주제 화면에서 props로 주입하면 화면을 교체해야 하므로, `knowledgeGraph`가 확장 훅 계약을 제공하고 `topicNotes`가 이를 등록하는 방식을 선택했습니다.
- 새 확장 활성화 훅을 추가하면 호출부는 짧아지지만 기존 `useExtension()`과 동일한 설정 조회·로딩 정책을 중복합니다. 기존 훅의 결과를 사용합니다.

## Related Decisions

- [2504-plugin-extension-architecture.md](2504-plugin-extension-architecture.md)
- [2602-knowledge-graph-view-extension.md](2602-knowledge-graph-view-extension.md)
