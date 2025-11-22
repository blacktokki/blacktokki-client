업자 가이드

이 파일은 이 저장소에서 AI 기반 코딩 에이전트가 즉시 생산적으로 작업할 수 있도록 핵심 정보만 추려 제공합니다.

**주의:** 노트 앱 세부 가이드는 `apps/notebook/AGENTS.md`에 자세히 있습니다. 변경 시 참조하세요.

**아키텍처 요약:**
- **모노레포:** 루트 `package.json`의 `workspaces`로 `packages/*` 및 `apps/*` 관리.
- **앱:** 노트 앱은 `apps/notebook` (Expo + React Native / web). 에디터는 패키지 `@blacktokki/editor`를 사용.
- **상태:** 전역 데이터는 `react-query`(훅) 중심으로 구성.
- **저장소 분기:** 인증 상태 `useAuthContext().auth.isLocal`에 따라
  - 로컬: `IndexedDB` (Content) + `AsyncStorage` (키워드, 최근 등)
  - 온라인: `src/services/notebook.ts`의 `axios` API 사용

**중요한 파일 / 진입점 (빠르게 찾아야 할 곳)**
- `apps/notebook/src/hooks/useNoteStorage.ts` — 노트 CRUD + React Query 훅 (가장 중요)
- `apps/notebook/src/hooks/useProblem.ts` — 편집 제안(Problems) 분석 로직
- `apps/notebook/src/components/HeaderSelectBar.tsx` — `parseHtmlToParagraphs` (HTML → Paragraph[])
- `apps/notebook/src/screens/main/EditPageScreen.tsx` — 편집기와 저장 플로우 (`useCreateOrUpdatePage` 호출)
- `apps/notebook/src/screens/main/KanbanScreen.tsx` — 칸반 렌더링 및 카드 이동 로직 (두 번의 노트 업데이트 필요)
- `apps/notebook/src/components/TimerTag.tsx` — 날짜 추출/수정 로직 (`extractDates`, `replaceDay`)
- `apps/notebook/src/types.tsx` — 핵심 타입(`Content`, `ParagraphKey`, `BoardOption`)

**프로젝트 규칙 / 패턴 (명확히 알아둘 점)**
- 노트 계층은 DB 테이블이 아닌 `title` 네이밍 컨벤션(예: `프로젝트/기획`)으로 구현됩니다.
- 노트 본문은 `description` 필드에 **HTML 문자열**로 저장 — 여러 유틸이 HTML 파싱/재조합을 전제로 작동합니다.
- 문단 식별은 `path`(헤더 기반 b64 인코딩)로 관리되므로, 문단 이동/삭제 시 HTML을 파싱→조작→재조합해야 합니다.
- 칸반 카드 이동은 원본 노트와 대상 노트를 각각 업데이트(두 번의 `useCreateOrUpdatePage` 호출)해야 데이터 일관성이 유지됩니다.
- 편집 제안(`useProblem`)은 노트 간 텍스트 매칭(정규식)과 링크 존재 여부를 교차 검사합니다 — 대량 데이터 연산에 주의.

**개발자 워크플로(자주 쓰는 명령)**
- 루트에서 전체 워크스페이스 빌드: `yarn build` (실제: `yarn workspaces run build`)
- 노트 앱 개발 서버 (Expo):
  - `yarn notebook` (루트 스크립, `yarn workspace @blacktokki/notebook`로 이동)
  - 또는 `cd apps/notebook && yarn start` / `yarn web` (웹, 포트 `19006`)
- 에디터 빌드/퍼블리시: `yarn workspace @blacktokki/editor ...` (apps/notebook `package.json`의 `build` 스크립트 참조)

**변경/수정 시 체크리스트 (AI가 자동으로 수정할 때)**
1. 유저 영향 범위 판단: 변경이 `description` HTML 구조/파싱에 영향을 주는지 확인
2. 관련 훅/캐시: `useNotePages`, `useNotePage`, `useCreateOrUpdatePage` 흐름을 따라 React Query 캐시 invalidation을 적용
3. 로컬 vs 온라인 분기: `useAuthContext().auth.isLocal` 체크가 필요한지 확인
4. 동시성/트랜잭션: 칸반 카드 이동 등 멀티-엔티티 업데이트는 두번의 저장이 필요함을 보존
5. 테스트: 편집-저장-조회(파싱/렌더링) 시나리오를 수동으로 검증
6. ESLint 규칙 준수: 저장소에서 사용 중인 `ESLint` 규칙을 준수하세요. 코드 변경 시 lint 오류가 남지 않도록 하고, 자동 포맷터(예: `prettier`)가 설정되어 있으면 동일한 규칙을 따르세요.
7. `/packages` 소스 수정 규칙: `packages/` 하위의 소스 파일을 수정할 때는 해당 패키지의 `build/`(컴파일된 출력) 파일을 직접 편집하지 마세요. 대신 소스(`src/`)를 변경하고 패키지의 빌드 스크립트(예: `yarn workspace <package> build` 또는 루트 `yarn build`)를 사용해 빌드하세요. 빌드 출력은 소스 변경의 결과물일 뿐 직접 편집 대상이 아닙니다.

**코드 예시(빠른 수정을 할 때 열어볼 함수)**
- 문단 파싱/조립: `apps/notebook/src/components/HeaderSelectBar.tsx` (`parseHtmlToParagraphs`)
- 저장 훅: `apps/notebook/src/hooks/useNoteStorage.ts` (`saveContents`, `useCreateOrUpdatePage`)
- 온라인 API 래퍼: `apps/notebook/src/services/notebook.ts` (`axios` 인스턴스 및 `postContent`/`patchContent`)

**디버깅 힌트**
- 편집 후 화면이 갱신되지 않으면 React Query 캐시 키(`useNotePages` 관련)를 확인하세요.
- 날짜/타임라인 관련 버그는 `apps/notebook/src/components/TimerTag.tsx`의 정규식(`extractDates`)을 의심하세요.
- 스냅샷/델타 복원 문제는 `diff-match-patch` 사용부(`NotePageScreen.tsx`)를 확인하세요.

문서 내용에 누락되거나 더 알고 싶은 것(예: CI, 환경변수, 외부 API 엔드포인트)이 있으면 알려주세요. 세부사항을 반영해 파일을 업데이트하겠습니다.