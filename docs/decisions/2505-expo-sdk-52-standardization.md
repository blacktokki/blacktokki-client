---
status: accepted
date: 2025-06-30
decision-makers: blacktokki core team
consulted: blacktokki frontend developers
informed: blacktokki architecture team
---

# 2505. Expo SDK 52 업그레이드 및 모바일/웹 크로스플랫폼 표준화

## Context and Problem Statement

`blacktokki-client` 모노레포 프로젝트는 모바일(iOS/Android)과 웹(Web) 환경에서 동시에 동작하는 크로스플랫폼 애플리케이션(`apps/notebook`, `apps/expo-blank` 등)을 포함하고 있습니다.

기존 프레임워크 환경에서는 모바일과 웹 간의 모듈 번들링 방식 차이, React/React Native 버전 불일치, Metro 번들러의 모노레포 패키지 심볼릭 링크 참조 문제 등으로 인해 개발 및 배포 환경에서 지속적인 호환성 이슈가 발생하였습니다. 

이를 해결하기 위해 Expo SDK 52를 표준 프레임워크로 채택하여 모노레포 전체의 모바일 및 웹 크로스플랫폼 빌드/개발 환경을 단일화하고 표준화하기로 결정하였습니다.

## Decision Drivers

* **크로스플랫폼 단일화**: iOS, Android, Web 간 단일 코드베이스 유지 및 개발 생산성 극대화
* **모노레포 호환성**: 모노레포 내 공통 패키지(`packages/*`) 및 외부 앱(`apps/*`) 간 심볼릭 링크 및 렌더링 파이프라인(Metro / React Native Web) 안정화
* **정적 웹 배포 지원**: `expo export -p web`을 활용한 GitHub Pages 등 정적 웹 호스팅 환경으로의 원활한 CI/CD 자동화 구축
* **최신 React 및 React Native 생태계 수용**: React 19 및 React Native Web 호환성 확보 및 모노레포 루트 `resolutions`를 통한 버전 통제

## Considered Options

* **옵션 1: Expo SDK 52 기반 모바일/웹 크로스플랫폼 표준화 (선택됨)**
* **옵션 2: 순수 React Native CLI + Webpack/Vite 기반 웹 구성을 통한 프레임워크 분리**
* **옵션 3: 레거시 Expo 버전 유지 및 모바일/웹 개별 빌드 파이프라인 운용**

## Decision Outcome

Chosen option: **"옵션 1: Expo SDK 52 기반 모바일/웹 크로스플랫폼 표준화"**

### 선택 이유
Expo SDK 52는 표준화된 `@expo/metro-runtime` 및 React Native Web 0.20.0 지원을 통해 모노레포 환경에서도 모바일 및 웹 빌드를 단일화된 CLI(`expo start`, `expo export`)로 제어할 수 있게 해줍니다. 모노레포 루트 `package.json`의 `resolutions` 설정과 `apps/notebook` 내 Metro 번들러 구성을 조화시켜 웹/모바일 타겟 간 버전 파편화를 완벽히 차단할 수 있습니다.

### Consequences

* **Positive**:
  * 모바일(iOS/Android) 및 웹(Web) 전 타겟에서 모듈 번들링 및 실행 명령 통일 (`yarn notebook`)
  * `expo export -p web` 기반 정적 빌드 생성을 통해 GitHub Pages CI/CD 배포 간소화
  * React Native Paper, React Native SVG 등 주요 크로스플랫폼 UI 라이브러리의 일관된 통합
* **Negative**:
  * 웹 전용 외부 에셋(예: TinyMCE 에디터 파일) 처리를 위해 루트 `package.json`의 `nohoist` 및 사전 빌드 스크립트 관리 필요
  * 모노레포 전체에서 `react`, `react-dom`, `react-native`, `react-native-web` 버전을 `resolutions`로 엄격하게 관리해야 함

## Pros and Cons of the Options

### 옵션 1: Expo SDK 52 기반 모바일/웹 크로스플랫폼 표준화

* Good, because 모바일과 웹 구동을 위한 Metro 번들러 및 에셋 처리 파이프라인이 단일화됨
* Good, because GitHub Pages 배포를 위한 `expo export` 웹 번들링 프로세스가 제공됨
* Bad, because 웹 특화 에셋(TinyMCE 등) 호환을 위한 추가 스크립트 및 `nohoist` 구성 필요

### 옵션 2: 순수 React Native CLI + Webpack/Vite 기반 웹 분리

* Good, because 웹과 모바일의 빌드 도구를 완전히 자유롭게 선택할 수 있음
* Bad, because 코드 공유 레이어에서 모바일/웹 간 분기 및 이중 빌드 관리에 상당한 공수가 발생함
* Bad, because 모노레포 내 공통 라이브러리(`packages/*`) 적용 시 별도의 웹 번들러 설정 유지 필요

### 옵션 3: 레거시 Expo 유지 및 개별 빌드 파이프라인 운용

* Good, because 기존 구성의 변경을 최소화할 수 있음
* Bad, because 최신 React 19 및 최신 라이브러리와의 버전 충돌 문제 해결 불가
* Bad, because 모노레포 환경에서 모듈 심볼릭 링크 해결 불완전

## Implementation Plan

* **Affected paths**:
  * `package.json` (루트 워크스페이스 및 `resolutions` 관리)
  * `apps/notebook/package.json`, `apps/notebook/app.json`, `apps/notebook/metro.config.js`
  * `apps/expo-blank/package.json`, `apps/expo-blank/metro.config.js`
* **Dependencies**:
  * `expo`: `^52.0.0` (또는 SDK 52 호환 라인 업그레이드)
  * `@expo/metro-runtime`, `react-native-web`, `react-native-paper`, `react-native-safe-area-context`, `react-native-svg`
* **Patterns to follow**:
  * 웹 및 모바일 앱 구동 시 `expo start` 스크립트를 사용하며 웹 배포 시 `expo export -p web` 표준 명령 사용
  * 모노레포 공통 모듈 참조는 `metro.config.js` 표준 구성을 통해 심볼릭 링크 해석
  * 웹 전용 에셋 복사는 `apps/notebook/package.json`의 `build` 스크립트를 통해 사전에 준비
* **Patterns to avoid**:
  * `packages/` 하위 소스 수정 시 컴파일된 `build/` 산출물 직접 편집 금지 (`yarn build` 활용)
  * 각 앱 패키지에서 React 또는 React Native 버전을 개별 지정하여 워크스페이스 resolutions 충돌을 유발하는 행위 금지
* **Configuration**:
  * `package.json` 내 `resolutions`에 `react`, `react-dom`, `react-native`, `react-native-web` 명시
  * `apps/notebook/app.json` 내 `web.favicon` 및 `experiments.baseUrl` (/blacktokki-notebook) 설정

### Verification

- [ ] `yarn workspace @blacktokki/notebook start` 실행 시 개발 서버가 정상 구동되는지 확인
- [ ] `yarn workspace @blacktokki/notebook web` 실행 시 웹 환경(19006 포트 등)에서 정상 작동하는지 확인
- [ ] `yarn workspace @blacktokki/notebook build` 및 `expo export -p web` 실행을 통해 정적 `dist` 웹 에셋이 성공적으로 생성되는지 검증
- [ ] 모노레포 루트 `yarn build` 실행 시 에러 없이 모든 패키지 및 앱 구성이 빌드되는지 확인

## More Information

* 본 ADR은 Expo SDK 52 업그레이드 및 모바일/웹 크로스플랫폼 빌드 구성을 표준화합니다.
* 패키지 빌드 규칙: 공통 패키지(`packages/*`) 수정 시에는 반드시 해당 소스(`src/`)를 수정 후 빌드 스크립트를 실행하며, 단일 앱 (`apps/*`) 소스만 변경된 경우 패키지 빌드는 생략합니다.
