---
status: accepted
date: 2025-06-01
---

# 2504. 모듈성 확보를 위한 플러그인/확장기능(Extension) 아키텍처

- **Status**: accepted
- **Date**: 2025-06-01
- **Deciders**: blacktokki core team

## Context (배경 및 맥락)

`blacktokki-client` 애플리케이션(특히 `apps/notebook`)은 기본 노트 편집 기능 외에 퀵 메모(`quickMemo`), 고급 검색(`agent`), 타임라인 관리(`timeline`), 원고/문단 수정 제안(`problem`), 데이터 내보내기/가져오기(`archive`), 랜덤 노트 접근(`random`), 다원화된 PDF 출력 스킨(`pdfExportDefault`, `pdfExportTheme`, `pdfExportMidnight`), 외부 테마 스킨(`themeVscode`, `themeGithub`, `themeNamuwiki`) 등 다채로운 부가 기능(Features/Extensions)을 제공하고 있습니다.

이러한 부가 기능들이 확장됨에 따라 다음과 같은 아키텍처적 과제가 발생하였습니다:

1. **강한 결합도(Tight Coupling)로 인한 유지보수성 저하**: 모든 부가 기능 코드가 핵심 화면(Core Screens), 헤더(Headers), 툴바(Toolbars) 내에 하드코딩될 경우, 단일 애플리케이션 코드베이스가 거대해지고 신규 기능 추가 시 기존 코드 훼손 위험이 커집니다.
2. **선택적 기능 활성화/비활성화 및 사용자 설정 필요성**: 모든 사용자가 모든 기능이 켜진 화면을 필요로 하지 않으며, 심플 모드(`usageMode === 'SIMPLE'`)나 사용자 개별 preference에 따라 특정 기능을 동적으로 켜고 끌 수 있어야 합니다.
3. **노트북 및 계정별 설정 영속화**: 로컬 계정 및 온라인 계정, 그리고 각 노트북 단위(`currentNotebookId`)로 활성화된 플러그인 설정이 동적으로 저장되고 동기화되어야 합니다.
4. **다양한 UI 인젝션 포인트(Injection Points) 필요**: 플러그인은 단순히 개별 스크린(Screen)을 제공하는 것을 넘어, 하위 버튼(`elements`), 노트 하단 커스텀 섹션(`NoteSections`), 상단 헤더 아이콘(`HeaderIconButtons`), 테마 스타일 생성기(`createCommonStylesList`) 등 다양한 위치에 UI 및 동작을 주입할 수 있어야 합니다.

따라서 핵심 노팅 아키텍처의 단순함을 유지하면서도 유연하게 기능을 확장하고 동적으로 바인딩할 수 있는 **플러그인/확장기능(Extension) 레지스트리 아키텍처**가 필요하게 되었습니다.

## Decision Drivers (결정 요인)

- **개결합 모듈성(Loose Coupling & Modularity)**: 각 확장기능은 `apps/notebook/src/features/` 하위의 독립된 디렉토리에 자기 완결적으로 위치하며, 핵심 컴포넌트는 개별 기능의 세부 구현을 알 필요가 없어야 함.
- **다중 UI 주입 슬롯(Multi-Slot UI Injection)**: 스크린(`screens`), 버튼 요소를 전달하는 슬롯(`elements`), 노트 하단 영역(`NoteSections`), 헤더 액션 아이콘(`HeaderIconButtons`), 아카이브 추가 액션(`extraArchiveButtons`), 공통 스타일 생성기(`createCommonStylesList`) 등 풍부한 슬롯 인터페이스 제공.
- **사용자/노트북 스코핑 퍼시스턴스**: `AsyncStorage` 키(`@blacktokki:notebook:extension:${subkey}`)를 활용하여 로컬/온라인 계정 및 선택된 노트북 단위로 확장기능 활성화 목록을 영속화 및 `react-query`로 상태 관리.
- **사용 모드 분리(Usage Mode Isolation)**: `SIMPLE` 모드 실행 시 부가 확장 기능을 자동으로 모두 제외(`getExtension([])`)하여 경량화된 노트 기능만 제공.
- **개발 지침 준수**: `AGENTS.md`의 백엔드 분리 원칙(백엔드 `/services/notebook.ts`가 존재를 인지하지 않는 순수 프론트엔드 확장 기능만 `/src/features`로 분리)을 만족.

## Considered Options (고려된 대안들)

### Option 1: 하드코딩 조건문 방식 (Hardcoded Conditional Rendering)
핵심 화면 및 내비게이션, 헤더 컴포넌트 내부에서 각 기능을 직접 `import`하고 `if (isQuickMemoEnabled)` 형태의 조건문으로 직접 렌더링.
- **장점**: 초기 도입 시 타입 및 레지스트리 구조를 설계할 필요가 없어 단순함.
- **단점**: 신규 부가기능이 추가될 때마다 메인 화면, 내비게이션 드로어, 헤더, 설정 화면 등 수많은 곳을 동시에 수정해야 하며, 코드 결합도가 극도로 높아짐.

### Option 2: 전역 레지스트리 및 슬롯 인젝션 훅 아키텍처 (`features` Registry + `useExtension` Hook) [선택됨]
- `src/hooks/useExtension.ts`에 `Feature` 타입과 전역 `features` 레지스트리 객체를 정의.
- `src/features/index.tsx`에서 각 부가기능 모듈을 `features[key]` 형태로 등록.
- 핵심 화면에서는 `useExtension()` 훅을 호출하여 현재 동적으로 바인딩된 슬롯 컴포넌트 배열만 map 렌더링.
- **장점**:
  - 플러그인 독립성 확보: 신규 기능 추가 시 `src/features/<featureName>` 디렉토리 추가 및 레지스트리 등록만으로 완료.
  - 슬롯 기반 확장성: 버튼, 스크린, 헤더, 테마 등 다양한 주입 지점을 유연하게 확장 가능.
  - `react-query` 기반으로 설정 변경 시 캐시 무효화(`invalidateQueries`)를 통한 즉각적 UI 갱신.
- **단점**:
  - 중앙 레지스트리 객체 공유에 따른 타입 및 키 충돌 주의 필요.
  - 동적 컴포넌트 배열 리스트 렌더링 시 React Key 및 props 전달 규격 준수 필요.

### Option 3: 동적 NPM 번들 로딩 / Micro-frontend 아키텍처
런타임 시점에 외부 서버에서 독립적으로 번들링된 JS 플러그인을 다운로드하여 샌드박스 영역에서 실행.
- **장점**: 앱 업데이트 없이 새로운 플러그인 배포 가능.
- **단점**: React Native / Expo 환경에서의 번들 동적 실행 제약, 보안 위험, 네이티브 모듈 접근 불가 및 아키텍처 오버엔지니어링.

## Decision Outcome (결정 결과)

**Option 2: 전역 레지스트리 및 슬롯 인젝션 훅 아키텍처 (`features` Registry + `useExtension` Hook)**를 채택합니다.

1. **확장기능 규격 정의 (`useExtension.ts`)**:
   - `FeatureInfo` (title, description, isDefault, screens) 및 `Feature` (search, elements, NoteSections, HeaderIconButtons, extraArchiveButtons, createCommonStylesList) 인터페이스를 정의합니다.
   - 중앙 전역 객체 `export const features: Record<string, FeatureInfo & Feature> = {};`를 만듭니다.

2. **기능 등록 및 내비게이션 바인딩 (`features/index.tsx`)**:
   - 각 부가 기능(`quickMemo`, `agent`, `timeline`, `problem`, `archive`, `random`, `pdfExportDefault`, `pdfExportTheme`, `pdfExportMidnight`, `themeVscode`, `themeGithub`, `themeNamuwiki` 등)의 속성을 `features[key]`에 등록합니다.
   - 내비게이션 구성 함수 `export default (title) => NavigationConfig`를 통해 등록된 확장기능 스크린들을 React Navigation 설정으로 자동 변환합니다.

3. **설정 영속화 및 훅 (`useExtension.ts`)**:
   - `getExtensionConfig(subkey)` 및 `saveExtensionConfig(subkey, config)`를 통해 `AsyncStorage` 키 (`@blacktokki:notebook:extension:${subkey}`)에 유저/노트북별 활성화 기능을 저장합니다.
   - `useExtension()` 커스텀 훅을 통해 활성화된 기능들을 하나로 축합(`reduce`)하여 슬롯별 컴포넌트 렌더러 함수(`feature.elements(type)`, `feature.NoteSections`, `feature.HeaderIconButtons` 등)를 클라이언트 UI 컴포넌트에 공급합니다.
   - `useSetExtensionConfig()` 뮤테이션 훅을 제공하여 `ExtensionScreen` 등에서 토글 변경 시 즉시 React Query 캐시를 무효화합니다.

## Positive Consequences (긍정적 효과)

- **뛰어난 모듈성 및 유지보수성**: 핵심 노트 편집 영역과 부가 기능 간의 결합도가 완전히 낮아지며, 각 기능은 `/src/features/*` 디렉토리 내에 독립적으로 존재합니다.
- **유연한 UI 슬롯 주입**: 메인 화면 버튼, 드로어 아이콘, 노트 하단 확장 영역, 헤더 액션 등 다수의 인젝션 지점을 통해 메인 코드 변경 없이 UI를 확장할 수 있습니다.
- **사용 모드 및 계정별 격리 지원**: `usageMode === 'SIMPLE'`에서는 확장 기능이 차단되어 최소한의 메모 앱으로 작동하며, 로컬/온라인 계정 및 노트북별로 서로 다른 플러그인 활성화 조합을 유지할 수 있습니다.
- **안전한 확장기능 토글**: 사용자가 `ExtensionScreen`에서 실시간으로 기능을 켜고 끌 수 있으며, UI에 즉시 반영됩니다.

## Negative Consequences (부정적 효과 및 감수할 위험)

- **슬롯 인터페이스 호환성 유지 의무**: `Feature` 타입 변경 시 레지스트리에 등록된 10여 개 이상의 기존 확장 기능 모듈을 모두 점검 및 업데이트해야 합니다.
- **동적 렌더링에 따른 성능/Key 주의**: `NoteSections`나 `elements` 등의 동적 배열 렌더링 시 React Key 생성을 신경 써야 하며, 훅 내부 상태 보존에 유의해야 합니다.

## Implementation Plan (affected paths, patterns, verification)

### Affected Paths
- `apps/notebook/src/hooks/useExtension.ts` ([useExtension.ts](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-client/apps/notebook/src/hooks/useExtension.ts)): `Feature` 타입, `features` 레지스트리 객체, `useExtension` 훅, AsyncStorage 영속화 로직.
- `apps/notebook/src/features/index.tsx` ([index.tsx](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-client/apps/notebook/src/features/index.tsx)): 개별 확장기능(`quickMemo`, `agent`, `timeline`, `problem`, `archive`, `random`, `pdfExport*`, `theme*`)의 레지스트리 바인딩 및 내비게이션 팩토리 함수.
- `apps/notebook/src/features/*` (개별 확장기능 모듈 디렉토리): `agent/`, `archive/`, `pdf/`, `problem/`, `quickMemo/`, `random/`, `themeGithub/`, `themeNamuwiki/`, `themeVscode/`, `timeline/`.
- `apps/notebook/src/screens/main/ExtensionScreen.tsx` ([ExtensionScreen.tsx](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-client/apps/notebook/src/screens/main/ExtensionScreen.tsx)): 확장기능 ON/OFF 토글 관리 화면.
- `apps/notebook/src/screens/main/NotePageScreen.tsx` ([NotePageScreen.tsx](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-client/apps/notebook/src/screens/main/NotePageScreen.tsx)), `HomeScreen.tsx`, `Drawer.tsx`, `SearchBar.tsx`: `useExtension()`에서 주입된 슬롯 컴포넌트/유틸리티 렌더링.
- `apps/notebook/AGENTS.md` ([AGENTS.md](file:///c:/Users/ydh05/OneDrive/바탕%20화면/blacktokki-client/apps/notebook/AGENTS.md)): 확장기능 분리 규칙 명시.

### Patterns & Conventions
1. **신규 확장기능 개발 패턴**:
   - 부가기능 코드는 `apps/notebook/src/features/<featureName>/` 디렉토리에 작성합니다.
   - 백엔드 API 서비스(`services/notebook.ts`)가 특정 기능의 존재를 알아야 하는 핵심 기능인 경우 `features`로 분리하지 않습니다.
   - `src/features/index.tsx`에서 `features['featureName'] = { ... }` 형태로 슬롯 컴포넌트와 메타데이터를 등록합니다.
2. **UI 슬롯 소비 패턴**:
   - 화면 및 컴포넌트에서는 `const { data } = useExtension();`으로 확장 데이터를 가져온 후 `data.feature.elements('button')`, `data.feature.NoteSections` 등을 동적으로 매핑 렌더링합니다.
3. **영속화 키 관리 패턴**:
   - `EXTENSION_KEY` (`@blacktokki:notebook:extension:`) 뒤에 `auth.isLocal` 여부와 `currentNotebookId` 조합의 `subkey`를 부여하여 사용자/노트북 간 기능 활성화 상태를 완전 격리합니다.

### Verification
- [ ] `useExtension()` 훅 실행 시 `usageMode === 'SIMPLE'` 모드에서 빈 기능 목록이 반환되는지 확인.
- [ ] `ExtensionScreen`에서 특정 확장기능(예: Timeline, Quick Memo) 토글 시 `useSetExtensionConfig`에 의해 `AsyncStorage`에 변경사항이 영속화되고 UI가 즉시 업데이트되는지 확인.
- [ ] `NotePageScreen` 및 `Drawer`, `SearchBar` 등에서 동적 주입된 슬롯 컴포넌트(`NoteSections`, `HeaderIconButtons`, `elements`)가 오류 없이 렌더링되는지 확인.
- [ ] 신규 확장기능 모듈 등록 시 타입 체크 및 React Navigation 스크린 등록이 정상 동작하는지 확인.
