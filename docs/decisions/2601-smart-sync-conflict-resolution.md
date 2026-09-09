---
status: accepted
date: 2026-09-06
decision-makers: "@blacktokki"
---

# 2601. 로컬 계정-내 계정 스마트 동기화 및 3-way 해시 기반 동시 편집(충돌) 해결 아키텍처

## Context and Problem Statement

`blacktokki-notebook`은 오프라인 우선 로컬 계정과 온라인 내 계정을 모두 지원하는 크로스플랫폼 지식 관리 도구입니다([ADR-2503](2503-offline-first-local-account.md)). 사용자는 로컬 환경과 원격 계정 간에 노트북 단위로 노트(`.md`)와 보드(`.json`) 데이터를 양방향 동기화할 수 있습니다.

그러나 로컬과 원격 양쪽에서 동일한 노트가 각각 독립적으로 수정된 경우(동시 편집 / Concurrent Edit), 단순 최종 수정 시각(Last-Modified-Wins)만으로 자동 덮어쓰기를 수행하면 사용자가 작성한 중요한 기록이 통보 없이 조용히 영구 소실되는 심각한 데이터 유실 위험이 발생합니다.

또한 모든 동기화 작업을 매번 사용자가 수동으로 동기화 화면에 진입하여 처리하도록 강제하면 사용성이 저하되므로, **충돌이 없는 항목(단방향 수정 및 신규 생성)은 백그라운드에서 안전하게 자동 동기화하면서도, 동시 편집된 충돌 항목은 보존하여 사용자가 직접 선택 및 해결할 수 있는 신뢰성 높은 동기화 아키텍처**를 수립할 필요가 있습니다.

## Decision

`SyncAnchor` 3-way 해시 기준점 기반 충돌 탐지 + 카드별 양자택일 UI + 미충돌 항목 백그라운드 자동 동기화 방식을 채택합니다.
1. **3-Way 기준점 관리 및 해시 정규화 (`useNotebookSync.ts`)**:
   - 개행 문자 및 공백을 정규화한 후 32-bit FNV 해시를 생성합니다.
   - 마지막 동기화 시점의 항목별 해시를 `AsyncStorage`(`@blacktokki:notebook:sync_anchor:${userId}:${notebookTitle}`)에 영속화합니다.
   - 판정 규칙: `로컬 !== anchor.hash` 이고 `원격 !== anchor.hash`인 경우 `status: 'CONFLICT'`, `isConflict: true`로 판정합니다 (anchor가 없는 초기 상태에서 내용이 다를 때도 충돌로 안전하게 간주).
2. **충돌 선택 UI 및 공통 컴포넌트 격리 (`SyncNotebookScreen.tsx`)**:
   - 기존 `MoveChangedPreview`에 침투적 prop 확장을 하지 않고 순수성을 유지하며, 충돌 노트가 존재할 때 상단에 독립된 충돌 카드 섹션을 렌더링합니다.
   - 사용자가 `[로컬 계정 반영]` 또는 `[내 계정 반영]`을 양자택일하면 하단 diff 프리뷰가 실시간 연동되어 즉시 전환됩니다.
3. **미충돌 노트 자동 동기화 및 무한 루프 차단 (`useNotebookSync.ts`)**:
   - `options.autoSyncNonConflicted` 활성화 시 충돌이 아닌 항목만 백그라운드 자동 동기화하며, `isAutoSyncingRef` 플래그 및 동기화 완료 후 앵커 해시 갱신을 통해 중복 실행 및 무한 루프를 원천 차단합니다.

Non-goals:
- 이번 범위에서는 충돌 일괄 해결(Batch Resolve) 및 양쪽 보존(사본 파일 생성)은 지원하지 않습니다.
- 마크다운 문법 파괴 및 보드 JSON 손상 위험이 큰 Git 스타일 인라인 텍스트 자동 병합(Auto-Merge)은 채택하지 않습니다.
- 보드(`.json`) 데이터는 시각적 diff 미리보기에는 노출하지 않으며 동기화 실행 시 자동 반영을 유지합니다.

## Consequences

* Good: 시계 오차나 단순 타임스탬프 불일치로 인한 오판 없이 동시 수정 충돌을 정확하게 감지하여 데이터 유실을 방지합니다.
* Good: 충돌 발생 시 사용자가 시각적 Diff를 보며 각 카드별로 원하는 버전을 직관적으로 선택할 수 있습니다.
* Good: `MoveChangedPreview` 공통 컴포넌트에 전용 prop을 추가하지 않고 충돌 카드를 화면 내에 독립 배치하여 컴포넌트 순수성과 재사용성을 보존합니다.
* Good: 미충돌 항목에 대한 백그라운드 자동 동기화로 일상적인 편집 시 수동 동기화의 번거로움을 해소합니다.
* Bad: 동기화 완료 시점마다 항목별 해시 저장을 위한 `AsyncStorage` I/O 오버헤드가 추가됩니다 (노트 수백 개 규모에서는 수 ms 내외로 영향 미미).
* Bad: 충돌이 발생한 노트는 자동 해결되지 않고 사용자가 동기화 화면에 직접 진입하여 해결해야 합니다.
* Neutral: 일괄 해결이나 사본 생성 없이 카드별 단일 양자택일 방식을 취하여 UI 복잡도를 낮추고 직관성을 유지합니다.

## Implementation Plan

* **Affected paths**:
  - `apps/notebook/src/features/sync/types.ts`
  - `apps/notebook/src/features/sync/useNotebookSync.ts`
  - `apps/notebook/src/features/sync/SyncNotebookScreen.tsx`
  - `apps/notebook/src/lang/ko.json`
  - `apps/notebook/public/사용 방법.md`, `dist/사용 방법.md`
  - `apps/notebook/public/Usage.md`, `dist/Usage.md`
* **Dependencies**: 없음 (기존 AsyncStorage, React Query 활용)
* **Patterns to follow**:
  - 개행 문자(`\r\n` ➔ `\n`) 및 공백 정규화 후 해시 계산 (`hashContent`)
  - `@blacktokki:notebook:sync_anchor:${userId}:${notebookTitle}` 키로 앵커 해시 영속화
  - 미충돌 항목 백그라운드 동기화 시 `isAutoSyncingRef` 플래그로 중복 실행 및 무한 루프 방지
  - 충돌 카드 선택과 하단 미리보기 diff 실시간 연동
* **Patterns to avoid**:
  - 다른 화면(`MovePageScreen`)과 공유되는 `MoveChangedPreview` 등의 공통 컴포넌트에 특정 화면 전용 prop 주입 금지
  - 충돌된 노트를 사용자 확인 없이 임의의 타임스탬프 기준으로 자동 덮어쓰기 금지
  - 단일 애플리케이션(`apps/notebook`) 수정 시 루트 `yarn build` 실행 금지 (`AGENTS.md` 규칙)

### Verification

- [x] TypeScript 컴파일 검사 통과 (`node node_modules/typescript/bin/tsc --project apps/notebook/tsconfig.json --noEmit`)
- [x] ESLint 린트 검사 통과 (`npx eslint apps/notebook/src/features/sync --fix`)
- [x] 양쪽 동시 수정 시 `status: 'CONFLICT'`로 정상 분류되고 배지에 반영된다
- [x] 동기화 화면에서 충돌 노트 카드 상단에 양자택일 선택 버튼과 `(최신)` 배지가 표시된다
- [x] 버튼 선택에 따라 하단 미리보기 diff의 방향 및 텍스트가 즉각 연동되어 변경된다
- [x] `미충돌 노트 자동 동기화` 옵션 활성화 시 충돌 항목을 제외한 항목만 안전하게 자동 동기화되고 무한 루프가 발생하지 않는다
- [x] 사용자 가이드(`사용 방법.md`, `Usage.md`)에 충돌 해결 및 미충돌 자동 동기화 설명이 올바르게 반영되었다

## Alternatives Considered

* 최종 수정 시각 기준 자동 덮어쓰기 (Last-Modified-Wins): 구현은 매우 단순하나 시스템 시계 오차나 동시 편집 시 이전 작업 내용이 통보 없이 영구 유실되므로 기각.
* Git 스타일 인라인 3-way 텍스트 자동 병합 (Auto Merge with Conflict Markers): 서로 다른 문단 수정 시 자동 병합이 가능하나, 마크다운 문법 파괴 및 보드 JSON 손상 위험이 크고 모바일 환경에서 복잡한 충돌 마커 파싱 UI를 다루기 어려워 기각.

## More Information

* 관련 ADR:
  - [ADR-2503: 로컬 계정 지원 및 오프라인 우선(Offline-First) 하이브리드 인증](2503-offline-first-local-account.md)
  - [ADR-2504: 모듈성 확보를 위한 플러그인/확장기능(Extension) 아키텍처](2504-plugin-extension-architecture.md)
  - [ADR-2507: 노트 태그 기반 칸반/스크럼 보드 아키텍처](2507-tag-based-kanban-scrum-board.md)
