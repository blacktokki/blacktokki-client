---
status: accepted
date: 2025-06-30
decision-makers: "@blacktokki"
---

# 2505. Expo SDK 52 업그레이드 및 모바일/웹 크로스플랫폼 표준화

## Context and Problem Statement

`blacktokki-client` 모노레포 프로젝트는 모바일(iOS/Android)과 웹(Web) 환경에서 동시에 동작하는 크로스플랫폼 애플리케이션(`apps/notebook`, `apps/expo-blank` 등)을 포함하고 있습니다.

기존 프레임워크 환경에서는 모바일과 웹 간의 모듈 번들링 방식 차이, React/React Native 버전 불일치, Metro 번들러의 모노레포 패키지 심볼릭 링크 참조 문제 등으로 인해 개발 및 배포 환경에서 지속적인 호환성 이슈가 발생하였습니다.

이를 해결하기 위해 Expo SDK 52를 표준 프레임워크로 채택하여 모노레포 전체의 모바일 및 웹 크로스플랫폼 빌드/개발 환경을 단일화하고 표준화하기로 결정하였습니다.

## Decision

Expo SDK 52 기반으로 모바일 및 웹 크로스플랫폼 개발 및 빌드 환경을 표준화합니다.
- `@expo/metro-runtime` 및 React Native Web을 표준 번들링 파이프라인으로 채택하여 `expo start`, `expo export -p web` 단일 CLI로 제어합니다.
- 모노레포 루트 `package.json`의 `resolutions` 설정을 통해 React 19, React Native, React Native Web 등의 코어 패키지 버전을 강제 통일합니다.
- 모노레포 공통 모듈(`packages/*`) 심볼릭 링크 해석을 `metro.config.js` 표준 구성으로 통합합니다.

Non-goals: 웹과 모바일의 빌드 도구를 분리하여 Webpack/Vite를 별도 운용하는 다중 번들러 환경은 구축하지 않습니다.

## Consequences

* Good: 모바일(iOS/Android) 및 웹(Web) 전 타겟에서 모듈 번들링 및 실행 명령이 통일됩니다 (`yarn notebook`).
* Good: `expo export -p web` 기반 정적 빌드 생성을 통해 GitHub Pages CI/CD 배포 파이프라인이 대폭 간소화됩니다.
* Good: React Native Paper, React Native SVG 등 주요 크로스플랫폼 UI 라이브러리의 통합이 일관되게 유지됩니다.
* Bad: 웹 전용 외부 에셋(TinyMCE 에디터 파일 등) 처리를 위해 루트 `package.json`의 `nohoist` 및 사전 빌드 스크립트를 지속 관리해야 합니다.
* Bad: 모노레포 전체에서 `react`, `react-dom`, `react-native`, `react-native-web` 버전을 `resolutions`로 엄격하게 관리해야 하는 제약이 발생합니다.

## Implementation Plan

* **Affected paths**:
  - `package.json` (루트 워크스페이스 및 `resolutions` 관리)
  - `apps/notebook/package.json`, `apps/notebook/app.json`, `apps/notebook/metro.config.js`
  - `apps/expo-blank/package.json`, `apps/expo-blank/metro.config.js`
* **Dependencies**:
  - `expo`: `^52.0.0`
  - `@expo/metro-runtime`, `react-native-web`, `react-native-paper`, `react-native-safe-area-context`, `react-native-svg`
* **Patterns to follow**:
  - 웹 및 모바일 앱 구동 시 `expo start` 사용, 웹 배포 시 `expo export -p web` 표준 명령 사용
  - 모노레포 공통 모듈 참조는 `metro.config.js` 표준 구성을 통해 심볼릭 링크 해석
  - 웹 전용 에셋 복사는 `apps/notebook/package.json`의 `build` 스크립트를 통해 사전에 준비
* **Patterns to avoid**:
  - `packages/` 하위 소스 수정 시 컴파일된 `build/` 산출물 직접 편집 금지 (`yarn build` 활용)
  - 각 앱 패키지에서 React 또는 React Native 버전을 개별 지정하여 워크스페이스 resolutions 충돌 유발 금지

### Verification

- [x] `yarn workspace @blacktokki/notebook start` 실행 시 개발 서버가 정상 구동되는지 확인
- [x] `yarn workspace @blacktokki/notebook web` 실행 시 웹 환경(19006 포트 등)에서 정상 작동하는지 확인
- [x] `yarn workspace @blacktokki/notebook build` 및 `expo export -p web` 실행을 통해 정적 `dist` 웹 에셋이 성공적으로 생성되는지 검증
- [x] 모노레포 루트 `yarn build` 실행 시 에러 없이 모든 패키지 및 앱 구성이 빌드되는지 확인

## Alternatives Considered

* 순수 React Native CLI + Webpack/Vite 기반 웹 분리: 도구 선택의 자유도는 높으나 코드 공유 레이어에서 모바일/웹 분기 및 이중 빌드 관리에 과도한 공수가 발생하여 기각.
* 레거시 Expo 유지 및 개별 빌드 파이프라인 운용: 변경은 최소화되나 React 19 호환 및 모노레포 심볼릭 링크 문제가 해결되지 않아 기각.

## More Information

* 패키지 빌드 규칙: 공통 패키지(`packages/*`) 수정 시에는 반드시 해당 소스(`src/`)를 수정한 후 빌드 스크립트를 실행하며, 단일 앱(`apps/*`) 소스만 변경된 경우 패키지 빌드는 생략합니다 ([AGENTS.md](../../AGENTS.md)).
