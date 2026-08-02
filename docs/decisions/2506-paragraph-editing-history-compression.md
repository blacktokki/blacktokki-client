# ADR-2506: 문단(Paragraph) 단위 데이터 편집 및 히스토리 압축 알고리즘

- **Status**: accepted
- **Date**: 2025-07-21
- **Authors**: blacktokki-client team
- **Deciders**: blacktokki-client team

## Context (맥락 및 배경)

`blacktokki-client` 애플리케이션(특히 `apps/notebook` 및 `@blacktokki/editor`)은 마크다운 및 HTML 문서를 다루는 모노레포 기반 에디터 및 노트 플랫폼입니다.

대용량 노트를 편집할 때 문서 전체를 매번 수정하고 전체 텍스트 히스토리를 무조건 풀 스냅샷(Full Snapshot)으로 저장할 경우 다음과 같은 문제가 발생합니다:
1. **편집 효율성 및 사용자 경험**: 긴 문서에서 특정 절(Section)이나 문단(Paragraph)만 수정하고 싶을 때, 전체 문서 편집 UI는 컨텍스트 파악과 세밀한 조작을 방해함.
2. **저장소 및 네트워크 오버헤드**: 편집 변경 사항이 생길 때마다 전체 HTML 문서를 저장/전송하면 로컬 오프라인 저장소(`IndexedDB`, `OPFS`) 및 백엔드 데이터베이스 용량이 급격히 증가함.

이를 해결하기 위해 HTML 헤더 레벨(`H1`~`H6`) 기반으로 문단을 동적으로 분할/병합하여 문단 단위 편집 및 이동을 지원하고, 변경 이력(Archive History) 저장 시 Delta Diff 알고리즘을 활용하여 히스토리를 효율적으로 압축 관리하는 데이터 처리 아키텍처를 정의하고자 합니다.

## Decision Drivers (결정 요인)

1. **무손실 DOM 기반 헤더 계층 파싱**: 마크다운/HTML 본문 내 헤더(`H1`~`H6`) 구조를 기반으로 부모-자식 헤더 패스(`path`, base64 인코딩)를 자동 생성하여 문단 단위 파싱 및 복원을 지원해야 함.
2. **동일 제목 문단 식별 (`autoSection` / `cleanId`)**: 한 노트 내에 동일한 제목의 헤더가 다수 존재하더라도, 상위 헤더 패스 및 ID 정규화를 통해 정확한 대상 문단을 지정해 편집/이동할 수 있어야 함.
3. **용량 효율적인 이력 저장 (Snapshot + Delta Compression)**: 이력 기록 시 매번 전체 본문을 저장하는 대신, 기준 스냅샷(`SNAPSHOT`)과 델타 변경분(`DELTA`)으로 분리하여 저장 용량을 최적화하고, 조회/내보내기 시 원본으로 복원할 수 있어야 함.
4. **역링크(Backlink) 및 하위 문단 동기화**: 문단을 독립된 노트로 분리/이동하거나 수정할 때 본문 내 링크(`<a>` 태그 / `?title=...#paragraph`) 및 역링크가 깨지지 않도록 동적으로 업데이트되어야 함.

## Considered Options (고려한 대안들)

### Option 1: 문서 전체 단위 편집 및 매 변경마다 풀 스냅샷 저장
- **장점**: 문단 파싱 알고리즘이나 Diff 복원 계산 오버헤드가 없으며 구현이 단순함.
- **단점**: 모바일/웹 환경에서 대용량 노트 편집 시 UX가 부자연스럽고, 이력이 쌓일수록 저장 공간 및 데이터 전송 오버헤드가 기하급수적으로 증가함.

### Option 2: AST(Abstract Syntax Tree) 기반 실시간 블록 에디터 (Notion 스타일) 데이터베이스 분할
- **장점**: 블록 단위 완전 독립 저장으로 개별 블록 저장 및 이력 관리가 매우 명확함.
- **단점**: 일반 마크다운/HTML 파일 기반 로컬 퍼스트 저장 방식(`auth.isLocal`, OPFS, 마크다운 zip 파일 내보내기/불러오기)과의 구조적 이격이 커지며 호환성이 깨짐.

### Option 3 (선택됨): HTML DOM 헤더 기반 문단 분할 편집 및 Diff-Match-Patch 히스토리 압축
- **장점**: 
  - 단일 HTML/마크다운 텍스트 원본을 유지하면서, `parseHtmlToParagraphs`를 통해 동적으로 문단 트리를 구성하여 문단 단위 편집/이동을 수행.
  - 이력 저장 시 `Google diff-match-patch` 기반 Delta Diff 알고리즘 (`diffToSnapshot`)을 활용하여 이력 데이터를 압축 저장 및 복원.
  - 마크다운 파일과의 100% 호환성과 용량 최적화, 부분 편집 UX를 모두 충족함.
- **단점**: DOM 파싱 및 Delta 복원 연산이 필요하며, 편집 후 전체 문서 통합 과정에서 문자열 재구성 로직이 필요함.

## Decision Outcome (결정 결과)

**Option 3**을 선택하여 구현합니다.

### 1. 문단 단위 데이터 분할 및 편집 알고리즘
- **문단 파싱 (`parseHtmlToParagraphs`)**:
  - `DOMParser`를 이용해 본문 DOM을 순회하며 `H1`~`H6` 태그를 만날 때마다 기존 문단을 `flushCurrent()`하고 새로운 `Paragraph` 객체를 생성.
  - 상위 헤더 제목들을 utf-8 text encoder + base64인코딩하여 comma로 구분된 `path`를 생성 (예: `base64(H1),base64(H2)`).
  - 중복 제목 헤더 발생 시 상위 헤더 패스 역추적을 통해 `autoSection` 값을 할당하여 식별성 확보.
- **문단 지정 및 추출 (`paragraphByKey`, `paragraphDescription`)**:
  - 헤더 제목 및 정규화된 `cleanId` 비교, `section` base64 패스 매칭을 통해 대상 문단을 선택.
  - `paragraphDescription`을 통해 해당 문단 및 하위 문단(Sub-paragraph)의 HTML 텍스트만 추출해 에디터에 제공.
- **문단 편집 통합 (`EditPageScreen.tsx`)**:
  - 문단 편집 모드 저장을 실행하면 전체 문단 목록 중 대상 `targetPath` 문단의 `description`을 새 편집 내용으로 교체하고, 하위 문단 영역을 통합하여 전체 HTML 문서(`finalDescription`)로 재구성 후 원자적 업데이트 수행.

### 2. 히스토리 압축 및 복원 알고리즘
- **이력 저장 모델 (`SNAPSHOT` & `DELTA`)**:
  - 최초 또는 주요 시점에는 전체 본문 이력을 `type: 'SNAPSHOT'`으로 저장.
  - 연속된 수정 내역은 `type: 'DELTA'` 타입과 참조 `SNAPSHOT_ID`를 함께 기록.
- **Delta 압축 및 복원 (`diffToSnapshot`)**:
  - `diff-match-patch` (`DiffMatchPatch`) 라이브러리의 `diff_fromDelta` 및 `diff_text2`를 활용.
  - `DELTA` 데이터 조회 시 참조 `SNAPSHOT`의 `description`과 delta 텍스트를 인자로 전달하여 원래 시점의 완전한 텍스트로 복원 (`diffToSnapshot(snapshot.description, archive.description)`).
- **Archive 내보내기/불러오기 (`ArchiveConfigSection.tsx`)**:
  - `ExportButton` 실행 시 전체 히스토리를 순회하며 `DELTA` 항목을 `SNAPSHOT` 기준 복원 후 사용자 이력 zip 파일로 내보냄.

## Positive/Negative Consequences (긍정적/부정적 결과)

### Positive (긍정적 효과)
- 대용량 문서에서도 특정 문단만 선택해 직관적이고 빠르게 편집 가능.
- 헤더 계층 기반 문단 이동(`MovePageScreen`) 및 백링크(`replaceBacklinks`) 자동 업데이트와의 완벽한 연동.
- 이력 저장 용량이 획기적으로 감소하여 로컬 퍼스트(OPFS/IndexedDB) 저장 환경 성능 향상.
- 단일 마크다운/HTML 호환 텍스트 구조를 유지하여 파일 Export/Import 시 데이터 유실이 없음.

### Negative (부정적 효과)
- HTML 구조 파싱 및 DOM 변환 과정에서 잘못된 HTML 태그가 존재할 경우 파싱 오버헤드 또는 예외 발생 위험이 존재함.
- `diff-match-patch` 델타 적용 과정에서 기준 `SNAPSHOT` 데이터가 손상되면 연결된 `DELTA` 이력 복원이 불가능함.

## Implementation Plan (구현 계획)

### Affected Paths
- [HeaderSelectBar.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/components/HeaderSelectBar.tsx): `parseHtmlToParagraphs`, `paragraphDescription`, `paragraphByKey` 파싱 알고리즘 구현
- [NoteItemSections.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/screens/main/NoteItemSections.tsx): `diffToSnapshot` Delta Diff 복원 유틸리티 및 헤더 이력 내비게이션
- [EditPageScreen.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/screens/main/EditPageScreen.tsx): 문단 편집 모드 로딩 및 문단 통합 저장 로직 (`handleSave`)
- [MovePageScreen.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/screens/main/MovePageScreen.tsx): 문단 단위 노트 이동, 분할 및 역링크(`replaceBacklinks`) 치환 로직
- [ArchiveConfigSection.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/features/archive/ArchiveConfigSection.tsx): 이력 복원 기반 History Export 기능
- [useNoteStorage.ts](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/hooks/useNoteStorage.ts): `SNAPSHOT` 및 `DELTA` 타입 이력 저장/조회 훅 (`useSnapshotPages`, `useSnapshotAll`)

### Verification Criteria
- [x] `parseHtmlToParagraphs`가 H1~H6 태그를 올바르게 계층 트리(`path`)로 분할하는지 검증.
- [x] 문단 편집 모드에서 특정 헤더 문단 수정 후 저장 시 전체 문서 HTML로 올바르게 재결합되는지 검증.
- [x] `diffToSnapshot`을 통한 `DELTA` 이력과 원본 `SNAPSHOT` 결합 시 정확한 복원 결과 확인.
- [x] Archive 이력 내보내기 시 Delta 항목의 복원 및 마크다운 Export 정상 동작 확인.
- [x] `cleanId` 및 `autoSection`을 통한 중복 헤더 제목 문단의 정상 구분 동작 확인.
