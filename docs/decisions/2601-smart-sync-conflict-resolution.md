---
status: accepted
date: 2026-09-06
decision-makers: blacktokki-client team
---

# 2602. 로컬 계정-내 계정 스마트 동기화 및 3-way 해시 기반 동시 편집(충돌) 해결 아키텍처

## Context and Problem Statement

`blacktokki-notebook`은 오프라인 우선 로컬 계정과 온라인 내 계정을 모두 지원하는 크로스플랫폼 지식 관리 도구입니다([ADR-2503](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-notebooks/blacktokki-client/docs/decisions/2503-offline-first-local-account.md)). 사용자는 로컬 환경과 원격 계정 간에 노트북 단위로 노트(`.md`)와 보드(`.json`) 데이터를 양방향 동기화할 수 있습니다.

그러나 로컬과 원격 양쪽에서 동일한 노트가 각각 독립적으로 수정된 경우(동시 편집 / Concurrent Edit), 단순 최종 수정 시각(Last-Modified-Wins)만으로 자동 덮어쓰기를 수행하면 사용자가 작성한 중요한 기록이 통보 없이 조용히 영구 소실되는 심각한 데이터 유실 위험이 발생합니다.

또한 모든 동기화 작업을 매번 사용자가 수동으로 동기화 화면에 진입하여 처리하도록 강제하면 사용성이 저하되므로, **충돌이 없는 항목(단방향 수정 및 신규 생성)은 백그라운드에서 안전하게 자동 동기화하면서도, 동시 편집된 충돌 항목은 보존하여 사용자가 직접 선택 및 해결할 수 있는 신뢰성 높은 동기화 아키텍처**를 수립할 필요가 있습니다.

## Decision Drivers

* **데이터 무결성 및 유실 방지 (Data Safety)**: 동시 편집이 발생한 노트는 절대로 자동 덮어쓰기로 유실되지 않아야 하며, 충돌 상태로 보존되어 사용자에게 명확히 알려야 함.
* **정확한 동시 편집 탐지 (3-Way Hash Comparison)**: 네트워크 단절이나 기기 간 시스템 시계 오차(Clock Skew)에 의존하지 않고, 마지막 동기화 기준점(`SyncAnchor`) 해시와의 3-way 비교를 통해 실질적인 충돌을 정확히 판별해야 함.
* **공통 UI 컴포넌트 순수성 유지 (Component Reusability)**: 기존 `MovePageScreen`의 `MoveChangedPreview`, `ChangedBlock` 등 공통 컴포넌트에 과도한 파라미터나 복잡한 렌더러 추상화를 주입하지 않고 본래의 순수성을 보존해야 함.
* **점진적 해결과 직관적 피드백**: 일괄 덮어쓰기 대신 충돌이 발생한 카드별로 사용자가 `[로컬 계정 반영]`과 `[내 계정 반영]` 중 하나를 양자택일하고, 선택에 따른 시각적 Diff 프리뷰를 즉각 확인할 수 있어야 함.
* **자동화와 무한 루프 방지**: 미충돌 항목 자동 동기화 옵션 활성화 시, 백그라운드 동기화 성공 후 쿼리 캐시 갱신으로 인한 무한 트리거 루프가 원천 차단되어야 함.

## Considered Options

* **옵션 1**: `SyncAnchor` 3-way 해시 기준점 기반 충돌 탐지 + 카드별 개별 선택 UI + 미충돌 항목 한정 백그라운드 자동 동기화 (**선택됨**)
* **옵션 2**: 최종 수정 시각 기준 자동 덮어쓰기 (Last-Modified-Wins)
* **옵션 3**: Git 스타일 인라인 3-way 텍스트 자동 병합 (Auto Merge with Conflict Markers)

## Decision Outcome

Chosen option: **"옵션 1: SyncAnchor 3-way 해시 기준점 기반 충돌 탐지 + 카드별 개별 선택 UI + 미충돌 항목 한정 백그라운드 자동 동기화"**

마지막 동기화 시점의 항목별 해시를 `AsyncStorage`(`@blacktokki:notebook:sync_anchor:${userId}:${notebookTitle}`)에 영속화하고, 다음 동기화 비교 시 로컬 해시, 원격 해시, 기준점 해시를 3-way 비교하여 양쪽 모두 변경된 경우 `status: 'CONFLICT'`로 판정합니다.

충돌이 발생한 노트는 `SyncNotebookScreen`에서 별도의 충돌 전용 선택 카드로 렌더링되어 사용자가 `[로컬 계정 반영]` 또는 `[내 계정 반영]`을 명시적으로 선택하도록 하며, `autoSyncNonConflicted` 옵션을 통해 충돌이 없는 항목만 백그라운드에서 안전하게 자동 동기화되도록 처리합니다.

### Consequences

* **Good (긍정적)**:
  * 시계 오차나 단순 타임스탬프 불일치로 인한 오판 없이 실질적인 동시 수정 충돌을 정확하게 감지하여 데이터 유실 방지.
  * 충돌 항목에 대해 사용자가 시각적 Diff를 보면서 각 카드별로 원하는 버전을 직관적으로 선택 가능.
  * `MoveChangedPreview`에 복잡한 전용 prop을 추가하지 않고, 충돌 카드를 화면 컴포넌트 내에 독립 배치하여 공통 컴포넌트 결합도를 낮추고 안정성 유지.
  * 미충돌 노트 자동 동기화로 일상적인 편집 시 수동 동기화의 번거로움 해소.
* **Bad (부정적)**:
  * 항목별 해시 저장을 위한 `AsyncStorage` I/O 오버헤드가 동기화 완료 시점에 추가됨 (단, 노트 수량이 수백 개 수준이므로 수 밀리초 내외로 무시 가능).
  * 충돌 발생 시 자동 해결이 되지 않고 사용자가 동기화 화면에 직접 방문하여 해결해야 함.
* **Neutral (중립적)**:
  * 이번 범위에서는 충돌 일괄 해결(Batch Resolve) 및 양쪽 보존(사본 생성)은 지원하지 않으며, 단일 선택 방식으로 단순화 유지.
  * 보드(`.json`)는 사용자 요구사항에 따라 시각적 diff 미리보기에는 미노출하되 동기화 실행 시 자동 반영 유지.

## Implementation Plan

### Affected Paths

* `apps/notebook/src/features/sync/types.ts`
* `apps/notebook/src/features/sync/useNotebookSync.ts`
* `apps/notebook/src/features/sync/SyncNotebookScreen.tsx`
* `apps/notebook/src/lang/ko.json`
* `apps/notebook/public/사용 방법.md`, `dist/사용 방법.md`
* `apps/notebook/public/Usage.md`, `dist/Usage.md`

### Implementation Details

1. **3-Way 기준점 관리 및 해시 정규화 (`useNotebookSync.ts`)**:
   - `hashContent(text)`: 개행 문자(`\r\n` ➔ `\n`) 및 공백을 정규화한 뒤 32-bit FNV 계열 해시 생성.
   - `getSyncAnchorKey(userId, notebookTitle)`: `@blacktokki:notebook:sync_anchor:${userId}:${notebookTitle}` 키로 분리 관리.
   - 동기화 완료(`executeSync`) 성공 시 동기화된 모든 노트 및 보드의 최신 해시를 `saveSyncAnchor`로 갱신.
   - 판정 규칙:
     - `로컬 !== anchor.hash` && `원격 !== anchor.hash` ➔ **`status: 'CONFLICT'`, `isConflict: true`**
     - `anchor`가 없는 초기 상태에서 내용이 상이한 경우 ➔ 안전을 위해 **`status: 'CONFLICT'`** 간주.
     - 한쪽만 변경된 경우 ➔ **`status: 'MODIFIED'`** (기존 단방향 동기화 유지).

2. **충돌 선택 UI 및 공통 컴포넌트 보존 (`SyncNotebookScreen.tsx`)**:
   - `MoveChangedPreview`에 `renderItem` 등의 침투적 확장을 가하지 않고 원본 2개 prop(`items`, `emptyMessage`) 구조를 유지.
   - 충돌 노트가 존재할 때만 `MoveChangedPreview` 상단에 독립된 충돌 카드 섹션 렌더링.
   - 충돌 카드 내에서 `[ (●) 💻 로컬 계정 반영 ]` 및 `[ ( ) ☁️ 내 계정 반영 ]` 버튼 제공 및 더 최근 수정된 쪽에 `(최신)` 힌트 제공.
   - 사용자가 버튼을 누르면 하단 `MoveChangedPreview`의 소스/타겟 및 diff 프리뷰가 실시간으로 연동되어 즉시 전환됨.

3. **미충돌 노트 한정 자동 동기화 및 루프 방지 (`useNotebookSync.ts`)**:
   - `options.autoSyncNonConflicted`가 `true`일 때, 충돌이 아닌 항목(`!item.isConflict && item.status !== 'CONFLICT'`)만 필터링하여 백그라운드 자동 동기화 실행.
   - `isAutoSyncingRef` 플래그 및 `executeSync.isLoading` 상태 검증을 통해 중복 실행 및 무한 루프 차단.
   - 동기화 성공 시 비충돌 항목의 해시가 `SyncAnchor`에 기록되고 내용이 일치해지므로, 다음 diff 계산 시 목록에서 제외되어 루프가 자연 종료됨.
   - `options.autoCheckOnSave` 활성화 시 React Query 캐시 이벤트(`pageContents`, `boardContents`의 `queryUpdated` / `observerResultsUpdated`)를 감지하여 diff 쿼리를 자동 무효화.

### Patterns to Avoid

* ❌ `MoveChangedPreview`나 `ChangedBlock` 등 다른 화면(`MovePageScreen`)과 공유되는 공통 컴포넌트에 특정 화면 전용 로직이나 복잡한 prop 주입 금지.
* ❌ 충돌된 노트를 사용자 확인 없이 임의의 타임스탬프 기준으로 자동 덮어쓰기 금지.
* ❌ 단일 애플리케이션(`apps/notebook`) 수정 시 루트 `yarn build` 실행 금지 (`AGENTS.md` 규칙).

### Verification

- [x] TypeScript 컴파일 검사 통과 (`node node_modules/typescript/bin/tsc --project apps/notebook/tsconfig.json --noEmit`).
- [x] ESLint 린트 검사 통과 (`npx eslint apps/notebook/src/features/sync --fix`).
- [x] 양쪽 동시 수정 시 `status: 'CONFLICT'`로 정상 분류되고 배지에 반영된다.
- [x] 동기화 화면에서 충돌 노트 카드 상단에 양자택일 선택 버튼과 `(최신)` 배지가 표시된다.
- [x] 버튼 선택에 따라 하단 미리보기 diff의 방향 및 텍스트가 즉각 연동되어 변경된다.
- [x] `미충돌 노트 자동 동기화` 옵션 활성화 시 충돌 항목을 제외한 항목만 안전하게 자동 동기화되고 무한 루프가 발생하지 않는다.
- [x] 사용자 가이드(`사용 방법.md`, `Usage.md`)에 충돌 해결 및 미충돌 자동 동기화 설명이 올바르게 반영되었다.

## Pros and Cons of the Options

### 옵션 1: `SyncAnchor` 3-way 해시 기준점 기반 충돌 탐지 + 카드별 양자택일 UI + 미충돌 자동 동기화

* **Good**: 오프라인-온라인 환경에서 데이터 유실 위험 원천 차단, 직관적인 시각적 diff 및 개별 선택권 보장, 공통 컴포넌트 순수성 보존, 비충돌 항목 백그라운드 자동화 지원.
* **Bad**: `AsyncStorage`에 기준점 해시를 저장 및 관리하는 로직 필요, 충돌 발생 시 사용자의 명시적 수동 선택 요구.

### 옵션 2: 최종 수정 시각 기준 자동 덮어쓰기 (Last-Modified-Wins)

* **Good**: 구현이 매우 단순하며 사용자 개입 불필요.
* **Bad**: 시스템 시계 오차나 동시 편집 시 이전 작업 내용이 통보 없이 영구 삭제되는 치명적인 데이터 유실 발생.

### 옵션 3: Git 스타일 인라인 3-way 자동 병합 (Auto-Merge)

* **Good**: 동일 문서 내에서 서로 다른 문단을 수정한 경우 사용자의 개입 없이 자동으로 병합 가능.
* **Bad**: 마크다운 문법 파괴, 보드 JSON 손상, 복잡한 인라인 충돌 마커 파싱 UI 필요, 모바일 환경에서 사용성 급격 저하.

## More Information

* 관련 ADR:
  * [ADR-2503: 로컬 계정 지원 및 오프라인 우선(Offline-First) 하이브리드 인증](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-notebooks/blacktokki-client/docs/decisions/2503-offline-first-local-account.md)
  * [ADR-2504: 모듈성 확보를 위한 플러그인/확장기능(Extension) 아키텍처](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-notebooks/blacktokki-client/docs/decisions/2504-plugin-extension-architecture.md)
  * [ADR-2507: 노트 태그 기반 칸반/스크럼 보드 아키텍처](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-notebooks/blacktokki-client/docs/decisions/2507-tag-based-kanban-scrum-board.md)
