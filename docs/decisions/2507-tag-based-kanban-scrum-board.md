# ADR-2507: 노트 태그 기반 칸반/스크럼 보드 아키텍처

- **Status**: accepted
- **Date**: 2025-10-19
- **Authors**: blacktokki-client team
- **Deciders**: blacktokki-client team

## Context (맥락 및 배경)

`blacktokki-client` 애플리케이션(특히 `apps/notebook`)은 단순 텍스트 노트 작성을 넘어, 노트를 기반으로 작업 및 프로젝트 상황을 한눈에 파악하고 관리할 수 있는 시각적 프로젝트 관리 도구(칸반/스크럼 보드)를 필요로 합니다.

기존 데이터 모델이나 별도의 외부 데이터베이스 구조 변경 없이, 노트의 제목 계층 구조(`부모노트/하위노트`) 및 HTML/마크다운 헤더 수준(`H1`~`H6`)을 태그/컬럼/행 메타데이터로 활용하여 보드 뷰를 동적으로 구성하는 아키텍처를 구현하고자 합니다.

## Decision Drivers (결정 요인)

1. **단일 진실 출처 (Single Source of Truth)**: 별도의 보드 전용 저장소를 유지하지 않고, 마크다운/HTML 노트 본문과 노트 계층 구조가 보드 카드 및 컬럼 데이터의 기본 원천이 되어 데이터 불일치(Drift)를 방지해야 합니다.
2. **유연한 뷰 전환 (Kanban vs Scrum)**: 동일한 노트 데이터 세트에 대해 단순 컬럼 기반의 칸반(Kanban) 뷰와 행/컬럼 2차원 매트릭스 기반의 스크럼(Scrum / Swimlane) 뷰 간 빠른 전환을 지원해야 합니다 (`BOARD_TYPE: 'KANBAN' | 'SCRUM'`).
3. **가변 파싱 깊이 (`BOARD_HEADER_LEVEL`)**: 사용자가 노트 내에서 카드로 인식할 헤더 수준(H2~H6, 기본값 H3)을 자유롭게 조절할 수 있어야 합니다.
4. **로컬 퍼스트 & 플랫폼 호환성**: `auth.isLocal` (OPFS, Local Directory Picker) 환경과 서버 API 환경 모두에서 동일한 파싱/동기화 훅(`useBoardStorage`, `useNoteStorage`)을 통해 동작해야 합니다.

## Considered Options (고려한 대안들)

### Option 1: 별도의 독립 데이터베이스 모델 및 보드 전용 스키마 구축
- **장점**: 보드 전용 CRUD API를 통해 빠른 조회가 가능하고 파싱 오버헤드가 없음.
- **단점**: 마크다운 파일 기반 로컬 저장소(`auth.isLocal`)와의 데이터 동기화가 복잡해지며, 노트 내용과 보드 카드 간 데이터 불일치 위험이 발생함.

### Option 2: 외부 보드 툴 (Trello, GitHub Projects 등) API 연동
- **장점**: 보드 UI 및 상태 관리 엔진을 직접 개발할 필요가 없음.
- **단점**: 오프라인/로컬 퍼스트 원칙에 위배되며 사용자 노트의 오프라인 접근성 및 개인정보 보호 보장이 어려움.

### Option 3 (선택됨): 노트 계층 구조 및 헤더 파싱 기반 가상 보드 뷰 (Tag/Header-based Virtual Board)
- **장점**: 하위 노트들(`parentTitle/subTitle`)을 컬럼으로 매핑하고, 노트 본문 문단(`parseHtmlToParagraphs`) 내 지정된 헤더 수준(`BOARD_HEADER_LEVEL`)을 카드로 동적 렌더링. 드래그 앤 드롭 이동 시 본문 문단을 재구성(`move()`)하여 마크다운 노트를 직접 원자적으로 업데이트하므로 데이터 일관성이 완벽히 유지됨.
- **단점**: 노트 본문 문단 파싱 연산 오버헤드와 드래그 이동 시 본문 문자열 재구성 알고리즘 관리 필요.

## Decision Outcome (결정 결과)

**Option 3**을 선택하여 구현합니다.

1. **보드 메타데이터 관리 (`Content` & `BoardOption`)**:
   - `Content` 중 `type: 'BOARD'` 메타데이터 타입을 통해 보드 옵션(`BOARD_TYPE: 'KANBAN' | 'SCRUM'`, `BOARD_HEADER_LEVEL: number`)을 저장합니다.
   - `useBoardStorage.ts` 훅(`useBoardPages`, `useCreateOrUpdateBoard`)을 통해 보드 설정을 관리합니다.

2. **컬럼 및 매트릭스 매핑 (`RecentBoardSection.tsx`)**:
   - **Kanban 모드**: 하위 노트(`title/columnName`)를 컬럼(Column)으로 매핑하고, 각 노트 내에서 `level === BOARD_HEADER_LEVEL`인 문단을 카드로 렌더링합니다.
   - **Scrum 모드**: 상위 헤더(`level + 1 === BOARD_HEADER_LEVEL`)를 행(Row/Swimlane)으로 매핑하여 2차원 매트릭스로 카드를 배치합니다.

3. **드래그 앤 드롭 본문 재구성 (`move()`)**:
   - 보드 카드를 다른 컬럼/행으로 이동하면 `move()` 함수가 원본 노트의 해당 문단(`_getSourceDescription`)과 대상 노트의 해당 문단(`_getTargetDescription`)을 추출 및 결합하여 `useCreateOrUpdatePage`를 통해 노트를 직접 업데이트합니다.

## Positive/Negative Consequences (긍정적/부정적 결과)

### Positive (긍정적 효과)
- 마크다운 노트 시스템의 유연성을 보존하면서도 프로젝트/태스크 관리 도구(Kanban/Scrum)를 통합 제공할 수 있습니다.
- 로컬 오프라인 모드(`auth.isLocal`)와 온라인 원격 서버 모드 모두에서 일관되게 동작합니다.
- H2~H6 수준 조절 및 Kanban ↔ Scrum 모드 간 실시간 전환이 가능합니다.

### Negative (부정적 효과)
- 대용량 마크다운 문서 파싱 및 카드 이동 시 본문 재구성 알고리즘(`move()`)에 대한 테스트와 모니터링이 필요합니다.
- 드래그 앤 드롭 이동 시 드롭 위치 계산과 애니메이션 레이아웃 관리가 다소 복잡합니다.

## Implementation Plan (구현 계획)

### Affected Paths
- [types.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/types.tsx): `BoardOption` 및 `Content` 타입 정의 (`BOARD_TYPE`, `BOARD_HEADER_LEVEL`)
- [useBoardStorage.ts](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/hooks/useBoardStorage.ts): `useBoardPages`, `useBoardPage`, `useCreateOrUpdateBoard`, `useDeleteBoard` 커스텀 훅
- [Board/index.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/components/Board/index.tsx): 동적 레이아웃 애니메이션 및 Board 렌더링 컴포넌트
- [BoardCard.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/components/Board/BoardCard.tsx): 보드 카드 아이템 컴포넌트
- [RecentBoardSection.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/screens/main/RecentBoardSection.tsx): 노트 및 본문 파싱, Scrum/Kanban 로우·컬럼 데이터 매핑, 카드 이동(`move()`) 알고리즘
- [RecentPageSection.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/screens/main/RecentPageSection.tsx): Kanban/Scrum 아이콘 토글 및 Header level (H2~H6) 설정 UI

### Verification Criteria
- [x] `apps/notebook/src/types.tsx`에 `BoardOption` (`BOARD_TYPE`, `BOARD_HEADER_LEVEL`) 정합성 확인.
- [x] Kanban 보드 모드에서 하위 노트별 컬럼 구성 및 H3 문단 카드 렌더링 동작 확인.
- [x] Scrum 보드 모드로 전환 시 상위 헤더 기반 Swimlane 행 매트릭스 렌더링 동작 확인.
- [x] 카드 드래그 이동 시 `move()` 함수를 통해 원본/대상 노트 본문 업데이트 정상 동작 확인.
- [x] Header Level (H2~H6) 조절 시 문단 레벨 반영 검증.
