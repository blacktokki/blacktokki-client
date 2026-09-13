---
status: accepted
date: 2025-06-01
decision-makers: "@blacktokki"
---

# 2504. 모듈성 확보를 위한 플러그인/확장기능(Extension) 아키텍처

## Context and Problem Statement

`blacktokki-client` 애플리케이션(특히 `apps/notebook`)은 기본 노트 편집 기능 외에 퀵 메모(`quickMemo`), 고급 검색(`agent`), 타임라인 관리(`timeline`), 원고/문단 수정 제안(`problem`), 데이터 내보내기/가져오기(`archive`), 랜덤 노트 접근(`random`), 다원화된 PDF 출력 스킨(`pdfExportDefault`, `pdfExportTheme`, `pdfExportMidnight`), 외부 테마 스킨(`themeVscode`, `themeGithub`, `themeNamuwiki`) 등 다채로운 부가 기능(Features/Extensions)을 제공하고 있습니다.

이러한 부가 기능들이 확장됨에 따라 다음과 같은 아키텍처적 과제가 발생하였습니다:
1. 모든 부가 기능 코드가 핵심 화면(Core Screens), 헤더, 툴바에 하드코딩될 경우 코드베이스가 비대해지고 기존 코드 훼손 위험이 커집니다.
2. 심플 모드(`usageMode === 'SIMPLE'`)나 사용자 설정에 따라 특정 기능을 동적으로 활성화/비활성화할 수 있어야 합니다.
3. 로컬/온라인 계정 및 노트북 단위(`currentNotebookId`)로 활성화된 플러그인 설정이 동적으로 저장되고 격리되어야 합니다.
4. 스크린(`screens`), 버튼 요소(`elements`), 노트 하단 커스텀 섹션(`NoteSections`), 상단 헤더 아이콘(`HeaderIconButtons`), 공통 스타일 생성기(`createCommonStylesList`) 등 다양한 위치에 UI를 주입할 수 있어야 합니다.

## Decision

전역 레지스트리 및 슬롯 인젝션 훅 아키텍처(`features` Registry + `useExtension` Hook)를 채택합니다.
1. `src/hooks/useExtension.ts`에 `FeatureInfo` 및 `Feature` 인터페이스와 전역 `features` 레지스트리 객체를 정의합니다.
2. 각 부가기능 모듈을 `apps/notebook/src/features/<featureName>/` 디렉토리에 자기 완결적으로 격리하고 `src/features/index.tsx`에서 `features[key]` 형태로 등록합니다.
3. `useExtension()` 커스텀 훅을 통해 활성화된 기능들의 슬롯 컴포넌트 렌더러 함수를 화면 컴포넌트에 공급하고, `ExtensionScreen`에서 토글 시 `useSetExtensionConfig` 뮤테이션으로 즉시 React Query 캐시를 무효화합니다.
4. `AsyncStorage` 키(`@blacktokki:notebook:extension:${subkey}`)를 활용하여 계정 및 노트북 단위로 활성화 목록을 영속화합니다.

Non-goals:
- 백엔드 API 서비스(`services/notebook.ts`)가 알아야 하는 핵심 기능은 `features`로 분리하지 않습니다.
- React Native / Expo 환경에서 동적 외부 JS 번들을 다운로드해 실행하는 샌드박스 마이크로 프론트엔드는 지원하지 않습니다.

## Consequences

* Good: 핵심 노트 편집 영역과 부가 기능 간의 결합도가 완전히 낮아지며, 신규 기능 추가 시 독립 디렉토리 생성 및 레지스트리 등록만으로 완료됩니다.
* Good: 메인 화면 버튼, 드로어 아이콘, 노트 하단 확장 영역, 헤더 액션 등 다양한 인젝션 지점을 통해 메인 코드 변경 없이 UI를 확장할 수 있습니다.
* Good: `usageMode === 'SIMPLE'`에서는 확장 기능이 차단되어 최소한의 메모 앱으로 작동하며, 계정 및 노트북별로 서로 다른 플러그인 활성화 조합을 유지할 수 있습니다.
* Good: 사용자가 `ExtensionScreen`에서 실시간으로 기능을 켜고 끌 수 있으며 UI에 즉각 반영됩니다.
* Bad: `Feature` 타입 규격 변경 시 레지스트리에 등록된 10여 개 이상의 기존 확장 기능 모듈을 모두 점검 및 업데이트해야 합니다.
* Bad: 동적 배열 컴포넌트(`NoteSections`, `elements`) 렌더링 시 고유한 React Key 부여 및 훅 상태 보존에 각별히 유의해야 합니다.

## Implementation Plan

* **Affected paths**:
  - `apps/notebook/src/hooks/useExtension.ts` (`Feature` 타입, `features` 레지스트리 객체, `useExtension` 훅, AsyncStorage 영속화)
  - `apps/notebook/src/features/index.tsx` (개별 확장기능 바인딩 및 내비게이션 팩토리 함수)
  - `apps/notebook/src/features/*` (`agent/`, `archive/`, `pdf/`, `problem/`, `quickMemo/`, `random/`, `themeGithub/`, `themeNamuwiki/`, `themeVscode/`, `timeline/`)
  - `apps/notebook/src/screens/main/ExtensionScreen.tsx` (확장기능 ON/OFF 토글 관리 화면)
  - `apps/notebook/src/screens/main/NotePageScreen.tsx`, `HomeScreen.tsx`, `Drawer.tsx`, `SearchBar.tsx` (슬롯 컴포넌트 렌더링)
  - `apps/notebook/AGENTS.md` (확장기능 분리 개발 지침)
* **Dependencies**: 없음 (기존 React Query 및 React Navigation 활용)
* **Patterns to follow**:
  - 부가기능 코드는 `apps/notebook/src/features/<featureName>/` 디렉토리에 작성
  - 화면에서는 `const { data } = useExtension();`으로 슬롯 컴포넌트(`data.feature.elements`, `data.feature.NoteSections`)를 동적 매핑 렌더링
  - `@blacktokki:notebook:extension:` 뒤에 `auth.isLocal` 및 `currentNotebookId` 조합의 `subkey`를 부여하여 스코프 격리
* **Patterns to avoid**:
  - 백엔드 서비스와 결합되는 핵심 비즈니스 로직을 `features`로 분리 금지
  - 핵심 컴포넌트에 특정 확장 기능의 코드를 직접 하드코딩 `import`하는 방식 지양

### Verification

- [x] `useExtension()` 훅 실행 시 `usageMode === 'SIMPLE'` 모드에서 빈 기능 목록이 반환되는지 확인
- [x] `ExtensionScreen`에서 특정 확장기능 토글 시 `AsyncStorage`에 변경사항이 영속화되고 UI가 즉시 업데이트되는지 확인
- [x] `NotePageScreen` 및 `Drawer`, `SearchBar` 등에서 동적 주입된 슬롯 컴포넌트가 오류 없이 렌더링되는지 확인
- [x] 신규 확장기능 모듈 등록 시 타입 체크 및 React Navigation 스크린 등록이 정상 동작하는지 확인

## Alternatives Considered

* 하드코딩 조건문 방식 (Hardcoded Conditional Rendering): 초기 도입은 간단하나 신규 기능 추가 시마다 메인 화면/헤더/드로어 등을 전면 수정해야 하여 코드 결합도가 극도로 높아지므로 기각.
* 동적 NPM 번들 로딩 / Micro-frontend 아키텍처: React Native / Expo 환경에서 동적 번들 실행 제약, 보안 위험, 네이티브 모듈 접근 한계 및 오버엔지니어링으로 기각.

## More Information

* 관련 소스 코드 및 문서:
  - [useExtension.ts](../../apps/notebook/src/hooks/useExtension.ts)
  - [features/index.tsx](../../apps/notebook/src/features/index.tsx)
  - [ExtensionScreen.tsx](../../apps/notebook/src/screens/main/ExtensionScreen.tsx)
  - [apps/notebook/AGENTS.md](../../apps/notebook/AGENTS.md)
