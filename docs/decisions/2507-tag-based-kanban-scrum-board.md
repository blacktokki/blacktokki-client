---
status: accepted
date: 2025-10-19
decision-makers: "@blacktokki"
---

# 2507. 노트 태그 기반 칸반/스크럼 보드 아키텍처

## Context and Problem Statement

`blacktokki-client` 애플리케이션(특히 `apps/notebook`)은 단순 텍스트 노트 작성을 넘어, 노트를 기반으로 작업 및 프로젝트 상황을 한눈에 파악하고 관리할 수 있는 시각적 프로젝트 관리 도구(칸반/스크럼 보드)를 필요로 합니다.

별도의 독립 DB 모델이나 외부 서비스 연동 없이, 노트의 제목 계층 구조(`부모노트/하위노트`) 및 HTML/마크다운 헤더 수준(`H1`~`H6`)을 태그/컬럼/행 메타데이터로 활용하여 보드 뷰를 동적으로 구성하는 아키텍처를 구현하고자 합니다.

## Decision

노트 계층 구조 및 헤더 파싱 기반 가상 보드 뷰(Tag/Header-based Virtual Board) 아키텍처를 채택합니다.
1. **보드 메타데이터 관리 (`Content` & `BoardOption`)**:
   - `Content` 엔터티의 `type: 'BOARD'` 메타데이터 타입을 통해 보드 옵션(`BOARD_TYPE: 'KANBAN' | 'SCRUM'`, `BOARD_HEADER_LEVEL: number`)을 저장 및 관리합니다 (`useBoardStorage.ts`).
2. **컬럼 및 매트릭스 매핑 (`RecentBoardSection.tsx`)**:
   - **Kanban 모드**: 하위 노트(`title/columnName`)를 컬럼(Column)으로 매핑하고, 각 노트 내에서 `level === BOARD_HEADER_LEVEL`인 문단을 카드로 렌더링합니다.
   - **Scrum 모드**: 상위 헤더(`level + 1 === BOARD_HEADER_LEVEL`)를 행(Row/Swimlane)으로 매핑하여 2차원 매트릭스로 카드를 배치합니다.
3. **드래그 앤 드롭 본문 원자적 재구성 (`move()`)**:
   - 보드 카드를 다른 컬럼/행으로 이동하면 `move()` 함수가 원본 노트와 대상 노트의 해당 문단을 추출 및 결합하여 `useCreateOrUpdatePage`를 통해 마크다운 노트를 직접 업데이트합니다.

Non-goals:
- 외부 클라우드 보드 서비스(Trello, Jira)와의 복잡한 실시간 동기화는 지원하지 않습니다.
- 마크다운 본문과 분리된 별도의 보드 전용 독립 데이터베이스를 구축하지 않습니다.

## Consequences

* Good: 마크다운 파일 원본이 단일 진실 출처(Single Source of Truth)로 동작하므로 노트 본문과 보드 카드 간 데이터 불일치(Drift)가 원천 방지됩니다.
* Good: 로컬 오프라인 모드(`auth.isLocal`)와 온라인 원격 서버 모드 모두에서 일관되게 동작합니다.
* Good: 사용자 선호에 따라 H2~H6 헤더 수준 조절 및 Kanban ↔ Scrum 뷰 간 실시간 전환이 가능합니다.
* Bad: 대용량 마크다운 문서 파싱 및 카드 이동 시 본문 재구성 알고리즘(`move()`)에 따른 런타임 계산 부하가 발생할 수 있습니다.
* Bad: 드래그 앤 드롭 인터랙션 시 모바일/웹 크로스플랫폼 레이아웃 애니메이션 관리가 상대적으로 복잡합니다.

## Implementation Plan

* **Affected paths**:
  - `apps/notebook/src/types.tsx` (`BoardOption` 및 `Content` 타입 정의)
  - `apps/notebook/src/hooks/useBoardStorage.ts` (`useBoardPages`, `useCreateOrUpdateBoard` 커스텀 훅)
  - `apps/notebook/src/components/Board/index.tsx` (Board 렌더링 및 레이아웃 컴포넌트)
  - `apps/notebook/src/components/Board/BoardCard.tsx` (보드 카드 아이템 컴포넌트)
  - `apps/notebook/src/screens/main/RecentBoardSection.tsx` (노트 및 본문 파싱, Scrum/Kanban 매핑, 카드 이동 `move()` 알고리즘)
  - `apps/notebook/src/screens/main/RecentPageSection.tsx` (Kanban/Scrum 토글 및 Header level 설정 UI)
* **Dependencies**: 없음 (기존 React Native / Web UI 및 React Query 활용)
* **Patterns to follow**:
  - 하위 노트를 컬럼으로, 문단 헤더(`BOARD_HEADER_LEVEL`)를 카드로 매핑
  - 카드 이동 시 마크다운 노트를 직접 원자적으로 업데이트하여 데이터 일관성 유지
  - `auth.isLocal` 여부와 무관하게 동일한 `useBoardStorage` 인터페이스 사용
* **Patterns to avoid**:
  - 노트 본문과 별개로 카드를 저장하여 데이터 동기화 문제를 유발하는 이중 저장소 설계 금지

### Verification

- [x] `apps/notebook/src/types.tsx`에 `BoardOption` (`BOARD_TYPE`, `BOARD_HEADER_LEVEL`) 정합성 확인
- [x] Kanban 보드 모드에서 하위 노트별 컬럼 구성 및 H3 문단 카드 렌더링 동작 확인
- [x] Scrum 보드 모드로 전환 시 상위 헤더 기반 Swimlane 행 매트릭스 렌더링 동작 확인
- [x] 카드 드래그 이동 시 `move()` 함수를 통해 원본/대상 노트 본문 업데이트 정상 동작 확인
- [x] Header Level (H2~H6) 조절 시 문단 레벨 반영 검증

## Alternatives Considered

* 별도의 독립 데이터베이스 모델 및 보드 전용 스키마 구축: 조회가 빠르나 마크다운 파일 기반 로컬 저장소와의 동기화가 극도로 복잡해지고 데이터 불일치 위험이 발생하여 기각.
* 외부 보드 툴 (Trello, GitHub Projects 등) API 연동: 오프라인/로컬 퍼스트 원칙에 위배되며 개인정보 보호 및 오프라인 접근성 보장이 어려워 기각.

## More Information

* 선행 ADR: [2506-paragraph-editing-history-compression.md](2506-paragraph-editing-history-compression.md) (문단 단위 파싱 기반)
* 관련 소스 코드:
  - [types.tsx](../../apps/notebook/src/types.tsx)
  - [useBoardStorage.ts](../../apps/notebook/src/hooks/useBoardStorage.ts)
  - [RecentBoardSection.tsx](../../apps/notebook/src/screens/main/RecentBoardSection.tsx)
