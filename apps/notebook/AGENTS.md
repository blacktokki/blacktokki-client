# AGENTS.md - Notebook 클라이언트를 위한 개발 지침 

## 기본 프로젝트 구조 (`/src`)
1. `react`을 사용하는 프로젝트 구조를 기반으로 적용한다.(`/components`, `/hooks`)
2. `react-navigation`을 사용하는 프로젝트 구조를 추가로 적용한다.(`/screens`, `/navigation`).
3. 각 기능 간의 종속 관계는  (`types` or `styles`) ◀ (`components` or (`services` ◀ `hooks`)) ◀ `modals` ◀ (`screens` or `features`) ◀ `navigation` 순서로 적용한다.

## 프레임워크 및 라이브러리
### expo / react-native / react-native-web
1. PC 웹을 기준으로 우선 개발하되, 가능한 모바일 웹, 모바일 앱에 호환되는 코드를 작성해야 한다.
### react-navigation
1. navigation 사용시 일반적인 화면 전환이나 메인 탭 이동 시에는 기존 스택 화면을 재사용하고 중복을 방지하는 `navigate()`를 사용한다.
2. navigation 사용시 상세 페이지 내에서 또 다른 상세 페이지로 이동하는 등 동일한 구조의 화면을 중첩해서 쌓아야 할 때는 `push()`를 사용한다.
3. navigation 사용시 사용자가 '뒤로 가기'를 통해 이전 탐색 이력을 순차적으로 확인해야 하는 '순환적 탐색' 구조에서는 반드시 `push()`를 적용해야 한다.
4. navigation 사용시 불필요한 메모리 낭비와 스택 오버플로우를 막기 위해, 화면의 고유성이 보장되어야 하는 경우에는 `navigate()` 사용을 권장한다.
### react-query
1. `\service`의 기능들은 `react-query`를 포함한 커스텀 훅을 구현해서 사용한다.
### react-native-vector-icons
1. 아이콘 종류는 `FontAwesome`, `MaterialCommunityIcons(MaterialDesignIcons)`만 사용한다.
### react-native-render-html
1. RenderHtml 컴포넌트를 사용할 경우 `useToCardPage` 또는 `DiffPreview`를 통해서 사용한다.

## 내부 라이브러리
### @blacktokki/core
1. lang 함수에 새로운 다국어 값을 추가 할 경우 `/lang`에 해당 값을 정의해야 한다.
2. 한국어 다국어 테이블은 `/lang/ko.json` 에서 영어 번역문과 한국어 번역문을 key-value로 하는 json object 형태로 저장한다.
3. 모달 컴포넌트는 앱별 `/modals`에 추가하고, `index.ts`로 내보낸다.
4. 앱 내 모달은 전역 모달 컨텍스트(`useModalsContext`)에서 제공하는 `setModal` 함수를 사용해 열고 닫아야 한다.
5. 모달을 닫을 때는 `setModal(Component, null)`을 사용한다.
### @blacktokki/account
1. `auth.isLocal === true`인 경우 api 및 서버를 사용하지 않고, 데이터를 `IndexedDB`에 저장한다.
2. `auth.isLocal`값과 무관하게 `AsyncStorage`에 데이터를 저장할 때 key값에 사용자를 식별할 수 있는 subkey를 포함해야 한다.
### @blacktokki/navigation
1. `useNavigation()`을 사용할 수 없는 경우, `@blacktokki/navigation`의 `push()` 또는 `navigate()`를 사용할 수 있다.
2. 설정 컴포넌트는 `ConfigSection`를 포함하고 `commonStyles.card`를 스타일로 하는 `View` 컴포넌트로 구성된다.
3. Drawer에 포함되는 컴포넌트는 `width: 240` 이하의 크기로 구성한다.
### @blacktokki/editor
1. html 문자열을 단순 텍스트로 전환할 경우 `raw(...)` 를 사용한다.

## 세부 프로젝트 구조
### types (`/src/types.tsx`)
1. 공통 타입 정의는 `/types`에 포함한다.
2. 각 타입에 대한 지침은 정의된 `TSDoc` 명세를 참고한다.
### styles (`/src/styles.ts`)
1. 색상, 간격, 폰트 크기 등은 `styles.ts`에 포함한다.
2. 프로젝트 전반에서 쓰이는 공통 스타일은 `src/styles.ts`에 추가해 다른 컴포넌트에서 재사용 가능하게 유지하고,추가시 대비(contrast)와 가독성을 고려한다.
3. `createCommonStyles` 내에 있는 `commonColors`의 색상은 더 이상 추가하지 않는다.
4. 새로운 컴포넌트용 스타일을 만들기 전에 반드시 `src/styles.ts`에서 적절한 스타일이 있는지 확인한다.
5. 인라인 스타일로 정의를 지양하고, 하드코딩된 스타일 사용을 최소화 한다.
6. 컴포넌트 내부에서는 `import { createCommonStyles } from '../styles'; const styles = createCommonStyles(colorScheme);` 형태로 사용한다.
7. 기본 스타일에서 확장할 경우 `style={[styles.container, styles.card, localStyles.custom]}`처럼 조합한다.
8. 색상의 경우 `createCommonStyles` 내에 있는 `commonColors`에 정의된 색상만 사용한다.
### services (`/src/services`)
1. 외부 API 요청은 `/services`에 포함한다.
### components (`/src/components`)
1. `modals`, `screens`, `features` 에서 공통적으로 사용되는 컴포넌트를 포함한다.
### features (`/src/features`)
1. 이 서비스의 부가기능은 `/features`에 각 부가기능 별로 포함한다.
2. `/services/notebook.ts`을 사용하면서 백엔드에서 해당 기능의 존재를 인지하는 경우 해당 기능을 `features`로 분리 할 수 없다.
### screens (`/src/screens`)
1. 스크린은 `Screens.tsx`으로 끝나는 이름으로 지정한다.
2. 여러 스크린에서 사용 가능한 공통 화면은 `Section.tsx` 또는 `Sections.tsx`로 끝나는 이름으로 지정한다.

## 그외 개발 가이드라인
1. TypeScript의 타입 체크를 만족해야 한다.
2. 소스코드 내 주석이 필요한 경우 가능한 `JSDoc` 또는 `TSDoc` 명세를 만족해야 한다.
3. `parseHtmlToParagraphs(...)` 함수는 HTML 내의 `H1`~`H6` 태그를 기준으로 문단을 분리하고, `path` (부모 헤더의 b64 인코딩된 문자열)를 생성하여 계층 구조를 만든다.
4. `paragraphDescription(...)`을 사용해 문단(하위 문단 포함 또는 제외)에 해당하는 HTML만 추출한다.
5. 추가 및 변경된 기능은 사용자 가이드(사용 방법.md)에 마크다운 포맷으로 반영하여야 한다.
6. 기존 코드를 수정할 시 불필요한 변경 사항을 최소화 한다.(공백, 줄바꿈, 주석, console.log 등)

## AGENTS.md 수정 원칙
1. 기존 내용을 수정할 시 불필요한 변경 사항을 최소화 한다.
2. 기존 헤더 제목은 가능한 수정하지 않는다.
3. 코딩 에이전트 또는 LLM이 기본적으로 숙지하고 있는 항목은 추가하지 않는다.
4. 다른 항목에서 이미 언급 된 내용은 추가하지 않는다.
5. 소스코드 및 패키지 경로, 그 외 강조할 키워드는 인라인 코드 블럭으로 작성한다.
6. 전체 가이드라인의 항목은 101개 이내로 항목당 2문장 이내로 작성한다.
