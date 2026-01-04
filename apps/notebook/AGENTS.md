# 🤖 AGENTS.md

이 문서는 Blacktokki Notebook 애플리케이션의 아키텍처, 핵심 로직, 데이터 흐름에 대한 기술 가이드입니다. AI 어시스턴트가 코드를 이해하고 수정(vibe coding)하는 것을 돕기 위해 작성되었습니다.

## 1. 📘 프로젝트 개요

Blacktokki Notebook은 React Native (Expo)로 구축된 마크다운 기반의 지식 및 시간 관리 도구입니다. 사용자는 노트를 작성하고, 이를 계층적으로 구성하며, 타임라인, 칸반 보드, 편집 제안 등의 기능을 통해 관리할 수 있습니다.

**핵심 기술 스택:**
* **프레임워크:** React Native (Expo)
* **상태 관리:** React Query (캐싱, 서버 상태 동기화)
* **네비게이션:** `@react-navigation`
* **데이터 저장 (로컬):** IndexedDB (노트/보드 본문), AsyncStorage (키워드, 최근 페이지 등 메타데이터)
* **데이터 저장 (온라인):** `services/notebook.ts`를 통한 외부 API (axios)
* **UI:** `react-native-paper` 및 커스텀 컴포넌트

---

## 2. 🏛️ 핵심 아키텍처 및 데이터 모델

### 2.1. 데이터 모델 (`src/types.tsx`)

* **`Content`**: 애플리케이션의 핵심 데이터 유닛입니다. `NOTE`, `BOARD`, `SNAPSHOT`, `DELTA` 등의 `type`을 가집니다.
    * `title`: 노트의 고유 식별자(PK)로 사용됩니다.
    * `description`: **HTML 문자열**로 저장된 노트의 본문입니다.
    * `option`: `BOARD` 타입의 경우 칸반 설정을 저장합니다 (`BoardOption`).
* **`Paragraph`**: **런타임 데이터 모델**입니다. `Content.description` (HTML)을 파싱하여 생성됩니다.
    * `src/components/HeaderSelectBar.tsx`의 `parseHtmlToParagraphs` 함수가 이 로직을 담당합니다.
    * HTML 내의 `H1`~`H6` 태그를 기준으로 문단을 분리하고, `path` (부모 헤더의 b64 인코딩된 문자열)를 생성하여 계층 구조를 만듭니다.
* **계층 구조 (폴더):** 데이터베이스에 별도 "폴더" 엔티티는 없습니다. **타이틀 네이밍 컨벤션** (`/` 사용)으로 구현됩니다.
    * 예: "프로젝트/기획" 노트는 "프로젝트" 노트의 하위 노트로 간주됩니다.
    * 관련 로직: `src/hooks/useProblem.ts`의 `getSplitTitle`, `src/screens/main/EditPageScreen.tsx`의 `getChildrenPages`.

### 2.2. 데이터 흐름 및 상태 관리 (`useNoteStorage.ts`)

본 앱은 **React Query**를 중앙 상태 관리자로 사용합니다. 모든 데이터 페칭 및 뮤테이션은 React Query 훅을 통해 이루어집니다.

**계정 및 저장소 모드:**
* `useAuthContext` (`@blacktokki/account`)의 `auth.isLocal` 값에 따라 데이터 저장소가 분기됩니다.
* **Local (`auth.isLocal === true`):**
    * `NOTE`, `BOARD` 데이터는 **IndexedDB**에 저장됩니다 (`openDB` 함수).
    * `RECENT_PAGES_KEY`, `KEYWORDS_KEY` 등은 **AsyncStorage**에 저장됩니다.
* **Online (`auth.isLocal === false`):**
    * `src/services/notebook.ts`의 `axios` 인스턴스를 통해 외부 API와 통신합니다.
    * `getContentList`, `postContent`, `patchContent` 등이 사용됩니다.

**핵심 데이터 훅:**
* `useNotePages()`: **가장 중요한 훅.** 모든 'NOTE' 타입 `Content`를 React Query 캐시에 로드합니다. 대부분의 다른 훅과 기능이 이 데이터를 사용합니다.
* `useNotePage(title)`: `useNotePages`의 캐시에서 특정 `title`을 가진 노트를 조회합니다.
* `useCreateOrUpdatePage()`: **유일한 노트 저장/수정 수단.** `auth.isLocal`을 확인하여 IndexedDB 또는 API (`saveContents`)에 데이터를 저장합니다.
* `useRecentPages()`: AsyncStorage에서 최근 페이지 `title` 목록을 가져와 `useNotePages` 데이터와 조인합니다.
* `useBoardPages()`, `useKeywords()`: 각각 칸반 보드와 검색 키워드 데이터를 관리합니다.

---

## 3. 💡 주요 기능별 구현 상세

### 3.1. 노트 조회 및 편집

* **노트 조회 (`src/screens/main/notepage/NotePageScreen.tsx`):**
    * `useNotePage`로 노트 데이터를 가져옵니다.
    * `parseHtmlToParagraphs`로 `description`을 `Paragraph[]`로 변환합니다.
    * 네비게이션 파라미터(`paragraph`, `section`)를 받아 `paragraphItem`을 찾습니다.
    * `paragraphDescription` (`useProblem.ts`)을 사용해 현재 문단(`fullParagraph` 토글에 따라 하위 포함)에 해당하는 HTML만 추출합니다.
    * `EditorViewer` (`@blacktokki/editor`)로 HTML을 렌더링합니다.
* **노트 편집 (`src/screens/main/EditPageScreen.tsx`):**
    * `<Editor>` 컴포넌트를 사용합니다.
    * **자동완성:** `autoComplete` prop을 통해 `[` (내부 링크) 및 `http` (외부 링크 미리보기) 트리거를 구현합니다.
        * `[`: `getFilteredPages` (검색) 및 `getChildrenPages` (자식 노트)를 조합해 링크를 제안합니다.
    * **저장:** `handleSave`가 `mutation.mutate` (which is `useCreateOrUpdatePage`)를 호출하여 저장합니다.
    * **저장되지 않은 변경:** `useUnsaveEffect` 커스텀 훅이 `navigation.addListener('beforeRemove')` 이벤트를 감청하여 `AlertModal` (`src/modals/AlertModal.tsx`)을 띄웁니다.

### 3.2. 검색 (`src/components/SearchBar.tsx`)

* `getFilteredPages`: `pages` (from `useNotePages`)와 `searchText`를 받아 필터링합니다.
    1.  노트 `title` (starts with, includes)
    2.  **HTML 링크 텍스트:** `getLinks` -> `extractHtmlLinksWithQuery`가 `description` HTML을 파싱하여 `<a>` 태그의 텍스트와 `href`를 추출해 검색 대상에 포함시킵니다.
* `urlToNoteLink`: 내부 앱 링크(e.g., `?title=...&paragraph=...`)를 다시 네비게이션 파라미터 객체로 변환합니다.
* **검색 기록:** `useKeywords` (`useKeywordStorage.ts`)를 통해 AsyncStorage에 저장된 기록을 불러옵니다.

### 3.3. 타임라인 (`src/hooks/useTimeLine.ts`)

* `useTimeLine` 훅이 `useNotePages`의 모든 노트를 가져옵니다.
* `paragraphsToDatePatterns` (`TimerTag.tsx`)를 호출하여 각 노트의 `header`와 `description` 텍스트를 파싱합니다.
* `extractDates` (`TimerTag.tsx`) 함수가 **정규식(Regex) 목록**을 사용해 `YYYY-MM-DD`, `MM/DD ~ MM/DD` 등 다양한 날짜 형식을 텍스트에서 추출합니다.
* `TimeLineScreen.tsx`은 `useTimeLine` 훅에서 반환된 날짜가 포함된 노트 목록을 표시합니다.
* **타이머 태그 (`TimerTagSection.tsx`):** 노트 페이지 상단에 표시되는 캘린더 태그입니다.
    * `TimerTag.tsx` 컴포넌트는 날짜 수정(+1일, +1달 등) 버튼을 제공합니다.
    * 날짜 수정 시 `replaceDay`, `addDay` 헬퍼 함수가 원본 문자열(`v.original`)을 변경한 뒤, `useCreateOrUpdatePage`를 호출해 노트 전체를 다시 저장합니다.

### 3.4. 칸반 보드 (`src/screens/main/KanbanScreen.tsx`)

* **데이터 모델:** `Content`의 `type`이 'BOARD'입니다.
* `useBoardPages`로 보드 목록을, `useRecentBoard`로 현재 활성 보드를 가져옵니다.
* 보드의 `option` 필드에 설정이 저장됩니다:
    * `BOARD_NOTE_IDS`: 컬럼으로 사용될 `NOTE`의 `id` 배열.
    * `BOARD_HEADER_LEVEL`: 카드로 변환할 헤더 레벨 (e.g., `3` -> `H3`).
* **렌더링:**
    1.  `KanbanScreen.tsx`은 `noteColumns` (선택된 노트)를 가져옵니다.
    2.  각 노트를 `parseHtmlToParagraphs`로 파싱합니다.
    3.  `option.BOARD_HEADER_LEVEL`과 일치하는 레벨의 `Paragraph` 객체만 필터링하여 카드로 만듭니다.
* **드래그 앤 드롭 (`src/components/Kanban/index.tsx`):**
    * `PanResponder` (`KanbanCard.tsx`)를 사용해 드래그 이벤트를 구현합니다.
* **카드 이동 로직 (`onEnd` 콜백 in `KanbanScreen.tsx`):**
    1.  카드를 다른 컬럼으로 드롭하면, 해당 카드의 `Paragraph` 데이터(와 하위 문단들)가 이동됩니다.
    2.  로컬 `move` 함수가 호출됩니다.
    3.  `move` 함수는 원본 노트와 대상 노트의 `description` HTML을 모두 `parseHtmlToParagraphs`로 파싱합니다.
    4.  이동할 문단(카드)을 원본 `Paragraph[]` 배열에서 제거하고 대상 `Paragraph[]` 배열에 삽입합니다.
    5.  두 `Paragraph[]` 배열을 다시 **HTML 문자열로 재조합**합니다 (`sourceDescription`, `targetDescription`).
    6.  `useCreateOrUpdatePage` 훅을 **두 번** 호출하여 원본 노트와 대상 노트를 각각 업데이트합니다.

### 3.5. 편집 제안 (Problems) (`src/hooks/useProblem.ts`)

이 훅은 애플리케이션에서 가장 복잡한 비즈니스 로직 중 하나입니다. `useNotePages`로 모든 노트를 가져와 다양한 문제를 검사합니다.

* `getData(pages)`: 모든 페이지에 대해 `getDataLinear`와 `getDataMatrix`를 실행합니다.
* **`getDataLinear` (단일 노트 검사):**
    * **`Empty paragraph`**: `parseHtmlToParagraphs`로 파싱 후, `paragraphDescription`으로 문단 내용을 가져와 `trim(...).length === 0`인지 확인합니다.
    * **`Duplicate paragraphs`**: 동일한 `title`과 `autoSection`을 가진 문단을 찾습니다.
    * **`Too high readability score`**: `getReadabilityLevel`이 문장 길이, 음절 등을 분석해 가독성 점수를 매깁니다.
* **`getDataMatrix` (노트 간 교차 검사):**
    * **`Unknown note link`**: `getLinks`로 노트 내 `<a>` 태그를 추출한 뒤, `titleSet` (모든 노트 제목)에 `link.title`이 존재하는지 확인합니다.
    * **`Unlinked note keyword`**: **가장 복잡한 로직.**
        1.  노트 A의 `title` (e.g., "React Query")을 가져옵니다.
        2.  다른 모든 노트 B, C, D... 의 `description`을 가져옵니다.
        3.  `<a>` 태그를 제외한 순수 텍스트 (`_target.raw`)에서 "React Query"라는 **문자열**이 발견되는지 `RegExp`로 검색합니다 (`_target.raw.match(...)`).
        4.  발견되면 "Unlinked note keyword" 문제를 리포트합니다.

### 3.6. 아카이브 (스냅샷) (`src/hooks/useNoteStorage.ts`)

* **저장:** (Online 모드에서만 활성화) `saveContents` 함수는 `NOTE`를 저장할 때, `SNAPSHOT` 타입의 `Content`를 `parentId` (원본 노트 ID)와 함께 추가로 `postContent`합니다.
* **조회:**
    * `src/screens/main/ArchiveScreen.tsx`: `useSnapshotPages` (infinite query)를 사용해 `SNAPSHOT`과 `DELTA` 타입의 `Content` 목록을 가져옵니다.
    * `src/screens/main/notepage/NotePageScreen.tsx`: `archiveId` 파라미터가 있으면 스냅샷을 봅니다.
    * **Diff 뷰:** `diffToSnapshot` 함수 (`NotePageScreen.tsx`)가 `diff-match-patch` 라이브러리를 사용해 'DELTA' 타입의 diff 텍스트를 원본 스냅샷과 병합하여 특정 시점의 HTML을 복원합니다.

---

## 4. 🧭 네비게이션 및 주요 화면

* **네비게이션 설정:** `src/navigation/index.tsx`
    * `@blacktokki/navigation` 라이브러리를 사용해 네비게이션을 설정합니다.
    * 모달, 드로어, 헤더를 정의합니다.
* **화면 목록:** `src/screens/index.ts`
    * 네비게이션 스택에 사용되는 스크린 이름과 컴포넌트를 매핑합니다.
* **드로어 (사이드바):** `src/navigation/Drawer.tsx`
    * 홈, 타임라인, 편집 제안, 칸반 및 최근 노트/탭 목록을 표시합니다.
* **홈 화면:** `src/screens/main/home/HomeScreen.tsx`
    * `HomeSection`을 사용해 탭 뷰(Discovery, All Notes, Config)를 구성합니다.

---

## 5. 🎨 스타일 및 테마

* **스타일 시트:** `createCommonStyles(theme: 'light' | 'dark')` 함수가 `useColorScheme()` 훅의 결과에 따라 동적으로 스타일 객체를 생성합니다.
- **공통 스타일 적극 활용:** 가능한 한 컴포넌트에서 `commonStyles.card`, `commonStyles.container`, `commonStyles.title` 등 기존 스타일을 그대로 사용하세요. 새로운 컴포넌트용 스타일을 만들기 전에 반드시 `src/styles.ts`에서 적절한 토큰/유틸이 있는지 확인합니다. 색상, 간격, 폰트 크기 등은 `styles.ts`에 정의하고 `createCommonStyles`에서 참조하세요. 하드코딩된 값 사용을 최소화합니다.
- **테마와 다크 모드:** 테마별 차이는 `createCommonStyles`에서 처리하고, 컴포넌트에서는 `const styles = createCommonStyles(colorScheme)` 또는 프로젝트의 `useTheme()` 훅을 통해 스타일을 가져오세요. 다크모드에서 대비(contrast)와 가독성을 반드시 확인합니다.
- **인라인 스타일 최소화:** 인라인 스타일은 유지보수성과 재사용성을 저하시킵니다. 스타일은 가능하면 `styles.ts`나 컴포넌트 로컬 `StyleSheet`로 분리하세요. 플랫폼 특이 스타일은 `Platform.select` 또는 스타일 합성으로 처리합니다. 특히 색상의 경우 `createCommonStyles` 내에 있는 `commonColors`에 정의된 색상만 반드시 사용하고, 인라인 스타일로 정의를 지양합니다.
- **재사용성 유지:** 프로젝트 전반에서 쓰이는 공통 스타일은 `src/styles.ts`에 추가해 다른 컴포넌트에서 재사용 가능하게 유지하세요. 같은 역할을 하는 유틸이나 스타일이 여러 파일에 중복되지 않도록 합니다.
- **예시 사용법:** 컴포넌트 내부에서는 `import { createCommonStyles } from '../styles'; const styles = createCommonStyles(colorScheme);` 형태로 사용하고, `style={[styles.container, styles.card, localStyles.custom]}`처럼 조합합니다.

---

## 6. ⚙️ 시나리오별 가이드

애플리케이션의 주요 기능이 여러 컴포넌트와 훅에 걸쳐 어떻게 동작하는지 설명합니다.

### 6.1. 시나리오 1: 새 노트 생성 및 링크 추가

1.  사용자가 `SearchBar`에 존재하지 않는 "새 노트 제목"을 입력하고 Enter를 누릅니다.
2.  `handleSearch` -> `useOnPressKeyword`가 `navigation.push('NotePage', { title: "새 노트 제목" })`을 호출합니다.
3.  `NotePageScreen`이 로드되고, `useNotePage` 훅이 이 제목의 노트가 캐시(`useNotePages`)에 없음을 확인하고 기본 객체를 반환합니다.
4.  `description`이 비어 있으므로 "This note has no content yet..." 메시지와 'Edit' 버튼이 표시됩니다.
5.  사용자가 'Edit' 버튼을 누르면 `navigation.navigate('EditPage', ...)`가 호출되어 `EditPageScreen`으로 이동합니다.
6.  `EditPageScreen`에서 사용자가 `[`를 입력하면 `autoComplete` prop의 트리거가 발동합니다. `getMatchedChars` 콜백이 `getFilteredPages`를 호출하여 다른 노트 목록을 링크 후보로 제안합니다.
7.  사용자가 내용을 작성하고 'save' 버튼을 누르면 `handleSave`가 `mutation.mutate` (`useCreateOrUpdatePage` 훅)를 호출합니다.
8.  `useCreateOrUpdatePage` 훅은 `auth.isLocal`을 확인한 뒤, `saveContents`를 호출하여 새 노트의 `description` (HTML)을 IndexedDB 또는 API에 저장합니다.

### 6.2. 시나리오 2: 일정 노트 작성 및 타임라인 확인

1.  사용자가 `EditPageScreen`에서 노트 본문에 "중요한 회의 2025-10-24"라고 텍스트를 입력하고 저장합니다.
2.  `useCreateOrUpdatePage`가 노트를 저장합니다.
3.  사용자가 드로어 메뉴에서 'Timeline'을 선택하여 `TimeLineScreen`으로 이동합니다.
4.  `TimeLineScreen` 내부의 `useTimeLine` 훅이 실행됩니다.
5.  `useTimeLine` 훅은 `useNotePages`를 통해 모든 노트의 `description`을 가져옵니다.
6.  `paragraphsToDatePatterns` -> `extractDates` 함수가 정규식(`/\b(\d{4}-\d{2}-\d{2})\b/g`)을 사용해 "2025-10-24" 문자열을 감지합니다.
7.  `useTimeLine` 훅은 현재 날짜(`date`)와 일치하는 노트 목록을 `TimeLineScreen`에 반환합니다.
8.  `TimeLineScreen`은 10월 24일 날짜에 "중요한 회의 2025-10-24"가 포함된 노트를 `NoteListSection`에 렌더링합니다.

### 6.3. 시나리오 3: 칸반 보드에서 문단(카드) 이동

1.  사용자가 `KanbanScreen`을 엽니다. `useRecentBoard` 훅이 현재 활성화된 'BOARD' 타입의 `Content`를 로드합니다.
2.  보드의 `option.BOARD_NOTE_IDS` (예: `[1, 5]`)와 `option.BOARD_HEADER_LEVEL` (예: `3`)을 읽습니다.
3.  `useNotePages` 훅의 데이터에서 ID가 1인 노트("To Do")와 5인 노트("Done")를 찾아 컬럼으로 사용합니다.
4.  두 노트의 `description` (HTML)을 `parseHtmlToParagraphs`로 파싱하고, `level === 3` (H3)인 `Paragraph` 객체만 필터링하여 각 컬럼의 카드로 렌더링합니다.
5.  사용자가 "To Do" 컬럼의 카드(특정 H3 문단)를 "Done" 컬럼으로 드래그 앤 드롭합니다. `KanbanCard.tsx`의 `PanResponder`가 이벤트를 처리합니다.
6.  `KanbanScreen`의 `onEnd` 콜백이 트리거됩니다.
7.  `onEnd` 내부의 로컬 `move` 함수가 "To Do" 노트와 "Done" 노트의 원본 `description`을 가져와 `parseHtmlToParagraphs`로 각각 `Paragraph[]` 배열로 변환합니다.
8.  `move` 함수는 이동된 카드의 `path`를 기준으로 "To Do" `Paragraph[]`에서 해당 문단(및 하위 문단)을 제거하고, "Done" `Paragraph[]`에 추가합니다. 그 후 두 `Paragraph[]` 배열을 다시 HTML 문자열(`sourceDescription`, `targetDescription`)로 재조합합니다.
9.  `useCreateOrUpdatePage` 훅이 **두 번** 호출됩니다. 첫 번째는 `sourceDescription`으로 "To Do" 노트를 업데이트하고, 두 번째는 `targetDescription`으로 "Done" 노트를 업데이트합니다.

---

## 7. 🗂️ 핵심 파일 요약

| 파일 | 역할 |
| --- | --- |
| `src/hooks/useNoteStorage.ts` | **(가장 중요)** 노트/스냅샷의 **데이터 접근 및 저장(CRUD) 로직** 전체. (React Query 훅) |
| `src/hooks/useProblem.ts` | "편집 제안" 기능의 모든 복잡한 분석 로직. |
| `src/hooks/useTimeLine.ts` | "타임라인" 기능의 날짜 추출 및 데이터 구성 로직. |
| `src/hooks/useBoardStorage.ts` | "칸반" 보드의 CRUD 로직. |
| `src/components/HeaderSelectBar.tsx` | `parseHtmlToParagraphs` (HTML -> `Paragraph[]`) 포함. |
| `src/components/TimerTag.tsx` | `extractDates` (텍스트 -> 날짜 Regex) 포함. |
| `src/components/SearchBar.tsx` | `getFilteredPages`, `getLinks` (검색 로직) 포함. |
| `src/screens/main/notepage/NotePageScreen.tsx` | 노트/문단/스냅샷 뷰어 스크린. |
| `src/screens/main/EditPageScreen.tsx` | 노트 편집기 스크린. |
| `src/screens/main/KanbanScreen.tsx` | "칸반" 기능의 핵심 UI 및 드래그 앤 드롭 로직. |
| `src/types.tsx` | `Content`, `ParagraphKey`, `BoardOption` 등 핵심 타입 정의. |
| `src/services/notebook.ts` | (Online 모드) 외부 API 통신 (axios) 레이어. |