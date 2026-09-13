---
status: accepted
date: 2025-07-21
decision-makers: "@blacktokki"
---

# 2506. 문단(Paragraph) 단위 데이터 편집 및 히스토리 압축 알고리즘

## Context and Problem Statement

`blacktokki-client` 애플리케이션(특히 `apps/notebook` 및 `@blacktokki/editor`)은 마크다운 및 HTML 문서를 다루는 모노레포 기반 에디터 및 노트 플랫폼입니다.

대용량 노트를 편집할 때 문서 전체를 매번 수정하고 전체 텍스트 히스토리를 무조건 풀 스냅샷(Full Snapshot)으로 저장할 경우 다음과 같은 문제가 발생합니다:
1. 긴 문서에서 특정 절(Section)이나 문단만 수정하고자 할 때 전체 문서 편집 UI는 컨텍스트 파악과 세밀한 조작을 방해함.
2. 편집 변경 사항이 생길 때마다 전체 HTML 문서를 저장/전송하면 로컬 오프라인 저장소(`IndexedDB`, `OPFS`) 및 백엔드 데이터베이스 용량이 급격히 증가함.

이를 해결하기 위해 HTML 헤더 레벨(`H1`~`H6`) 기반으로 문단을 동적으로 분할/병합하여 문단 단위 편집 및 이동을 지원하고, 변경 이력(Archive History) 저장 시 Delta Diff 알고리즘을 활용하여 히스토리를 효율적으로 압축 관리하는 아키텍처가 필요했습니다.

## Decision

HTML DOM 헤더 기반 문단 분할 편집 및 Diff-Match-Patch 히스토리 압축 알고리즘을 채택합니다.
1. **문단 단위 데이터 분할 및 편집 (`parseHtmlToParagraphs`)**:
   - `DOMParser`를 이용해 본문 DOM을 순회하며 `H1`~`H6` 태그를 만날 때마다 문단 객체를 생성하고, 상위 헤더 제목들을 base64 인코딩하여 `path`를 생성합니다.
   - 중복 제목 발생 시 상위 헤더 패스 역추적을 통해 `autoSection` 값을 할당하여 식별성을 확보합니다.
   - 편집 저장 시 대상 문단의 `description`을 교체하고 전체 문서를 원자적으로 재결합합니다 (`EditPageScreen.tsx`).
2. **히스토리 압축 및 복원 알고리즘 (`diffToSnapshot`)**:
   - 최초 또는 주요 시점에는 본문 전체를 `type: 'SNAPSHOT'`으로 저장하고, 연속된 수정 내역은 `type: 'DELTA'`와 참조 `SNAPSHOT_ID`로 기록합니다.
   - `Google diff-match-patch` 라이브러리를 활용하여 `DELTA` 조회 및 Export 시 원본 텍스트로 정확히 복원합니다.

Non-goals: 마크다운 파일과의 호환성을 파괴하는 Notion 스타일의 블록 데이터베이스 전면 전환은 수행하지 않습니다.

## Consequences

* Good: 대용량 문서에서도 특정 문단만 선택해 직관적이고 빠르게 부분 편집할 수 있습니다.
* Good: 헤더 계층 기반 문단 이동(`MovePageScreen`) 및 백링크(`replaceBacklinks`) 자동 업데이트가 원활히 연동됩니다.
* Good: Delta 압축을 통해 이력 저장 용량이 획기적으로 감소하여 로컬 퍼스트(OPFS/IndexedDB) 환경의 성능이 최적화됩니다.
* Good: 단일 마크다운/HTML 호환 텍스트 구조를 유지하므로 파일 내보내기/가져오기 시 데이터 유실이 없습니다.
* Bad: DOM 파싱 및 Delta 복원 연산에 따른 런타임 CPU 연산 비용이 추가됩니다.
* Bad: `diff-match-patch` 델타 적용 과정에서 기준 `SNAPSHOT` 데이터가 손상되면 연결된 `DELTA` 이력 복원이 불가능합니다.

## Implementation Plan

* **Affected paths**:
  - `apps/notebook/src/components/HeaderSelectBar.tsx` (`parseHtmlToParagraphs`, `paragraphDescription`, `paragraphByKey`)
  - `apps/notebook/src/screens/main/NoteItemSections.tsx` (`diffToSnapshot` Delta 복원 및 헤더 내비게이션)
  - `apps/notebook/src/screens/main/EditPageScreen.tsx` (문단 편집 모드 로딩 및 통합 저장 로직)
  - `apps/notebook/src/screens/main/MovePageScreen.tsx` (문단 단위 노트 이동, 분할 및 백링크 치환)
  - `apps/notebook/src/features/archive/ArchiveConfigSection.tsx` (이력 복원 기반 History Export)
  - `apps/notebook/src/hooks/useNoteStorage.ts` (`SNAPSHOT` 및 `DELTA` 타입 이력 저장/조회 훅)
* **Dependencies**:
  - `diff-match-patch` (Google Diff Match Patch 라이브러리)
* **Patterns to follow**:
  - H1~H6 태그를 순회하며 `base64(H1),base64(H2)` 형태의 계층 path 생성
  - 이력 저장 시 변경분은 `DELTA` 타입으로 분리하여 용량 최적화
  - 문단 이동 시 `replaceBacklinks` 유틸을 호출하여 본문 내 내부 앵커 링크 갱신
* **Patterns to avoid**:
  - 마크다운 원본 텍스트와의 호환성을 깨는 비표준 메타데이터 주입 지양
  - SNAPSHOT 없는 고아(Orphan) DELTA 레코드 생성 금지

### Verification

- [x] `parseHtmlToParagraphs`가 H1~H6 태그를 올바르게 계층 트리(`path`)로 분할하는지 검증
- [x] 문단 편집 모드에서 특정 헤더 문단 수정 후 저장 시 전체 문서 HTML로 올바르게 재결합되는지 검증
- [x] `diffToSnapshot`을 통한 `DELTA` 이력과 원본 `SNAPSHOT` 결합 시 정확한 복원 결과 확인
- [x] Archive 이력 내보내기 시 Delta 항목의 복원 및 마크다운 Export 정상 동작 확인
- [x] `cleanId` 및 `autoSection`을 통한 중복 헤더 제목 문단의 정상 구분 동작 확인

## Alternatives Considered

* 문서 전체 단위 편집 및 매 변경마다 풀 스냅샷 저장: 구현은 단순하나 대용량 문서 편집 시 UX가 저하되고 저장소 용량 오버헤드가 급증하여 기각.
* AST 기반 실시간 블록 에디터 (Notion 스타일) DB 분할: 블록 관리는 명확하나 마크다운 파일 기반 로컬 퍼스트 저장 방식과의 구조적 괴리로 기각.

## More Information

* 관련 소스 코드:
  - [HeaderSelectBar.tsx](../../apps/notebook/src/components/HeaderSelectBar.tsx)
  - [EditPageScreen.tsx](../../apps/notebook/src/screens/main/EditPageScreen.tsx)
  - [MovePageScreen.tsx](../../apps/notebook/src/screens/main/MovePageScreen.tsx)
  - [useNoteStorage.ts](../../apps/notebook/src/hooks/useNoteStorage.ts)
* 후속 ADR: [2507-tag-based-kanban-scrum-board.md](2507-tag-based-kanban-scrum-board.md) (문단 파싱 기반 보드 뷰 확장)
