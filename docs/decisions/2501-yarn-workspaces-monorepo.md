# 2501. Yarn Workspaces 기반 모노레포 아키텍처 채택
- Status: accepted
- Date: 2025-01-27

## Context and Problem Statement
`blacktokki-client` 프로젝트는 여러 클라이언트 애플리케이션(`apps/*`)과 공통 UI/도메인 컴포넌트, 유틸리티 라이브러리(`packages/*`)를 포함하고 있습니다.
기존의 다중 레포지토리(Polyrepo) 방식이나 분리된 구조는 다음과 같은 문제점을 유발합니다:
1. 애플리케이션 간 공통 코드(`@blacktokki/account`, `@blacktokki/editor`, `@blacktokki/navigation` 등)의 공유 및 실시간 동기화가 어려움.
2. 패키지 변경 시 매번 외부 레포지토리/레지스트리에 게시(publish)하고 의존성 버전을 업데이트해야 하는 번거로움.
3. React 19, React Native, Babel 등 프레임워크 및 코어 라이브러리의 버전 파편화 위험.

이를 해결하기 위해 클라이언트 프로젝트 전반의 코드 공유성을 높이고 의존성 관리 및 빌드 파이프라인을 일원화할 수 있는 아키텍처가 필요했습니다.

## Decision Drivers
- **코드 재사용성 극대화**: `@blacktokki/editor`, `@blacktokki/account`, `@blacktokki/navigation` 등 공통 라이브러리를 `apps/notebook`, `apps/expo-blank` 등 여러 앱에서 즉시 참조하여 재사용.
- **의존성 파편화 방지**: 루트 `package.json`의 `resolutions`를 통해 React(19.0.0), React Native(0.79.6), Babel 등의 주요 패키지 버전을 프로젝트 전체에서 통일.
- **통합 빌드 및 스크립트 일원화**: 루트에서 `yarn build` (`yarn workspaces run build`) 한 번으로 모든 워크스페이스 빌드 수행.
- **개발 생산성(DX)**: 별도의 패키지 게시 과정 없이 모노레포 내 심볼릭 링크를 통해 코드 변경사항을 즉시 확인 및 반영.

## Considered Options
1. **Yarn Workspaces 기반 모노레포 (선택됨)**
   - Yarn의 `workspaces` 및 `nohoist` 기능을 활용하여 `packages/*`와 `apps/*`를 하나의 저장소에서 통합 관리.
2. **Turborepo / Lerna + pnpm/npm 모노레포**
   - 빌드 캐싱 및 태스크 파이프라인 관리가 우수하나, 추가 도구 도입으로 인한 초기 설정 complexity 증가.
3. **다중 레포지토리 (Polyrepo)**
   - 각 앱과 패키지를 별도 저장소로 분리. 버전 관리 부담이 크고 로컬 동시 개발 생산성이 저하됨.

## Decision Outcome
`Yarn Workspaces` 기반 모노레포 아키텍처를 채택했습니다.
- 루트 `package.json`에 `workspaces` 항목(`packages/*`, `apps/*`)을 정의하여 모든 워크스페이스를 통합 관리합니다.
- 특정 에디터 및 타사 패키지(`tinymce`, `supercode`)와의 의존성 충돌을 방지하기 위해 `nohoist` 옵션을 적용합니다.
- `resolutions` 필드를 통해 React 19.0.0 및 React Native 0.79.6 등 핵심 의존성 버전을 고정 및 유지합니다.

## Positive Consequences
- **단일 출처(Single Source of Truth)**: 모든 클라이언트 코드 및 공유 라이브러리가 단일 저장소 내에 존재하여 탐색 및 리팩토링이 용이.
- **효율적인 의존성 관리**: 루트 레포지토리 수준에서 의존성 버전을 조율하여 버전 불일치로 인한 런타임 버그 예방.
- **통합 빌드/테스트 파이프라인**: `yarn build`, `yarn test` 명령어로 전체 모노레포에 대한 빌드 및 검증을 일괄 실행.

## Negative Consequences
- **호이스팅 패키지 격리 필요**: 의존성이 루트 `node_modules`로 올려지는(hoisting) 현상으로 인해 특정 패키지에서 참조 오류가 발생할 수 있으며, 이를 위해 `nohoist` 설정을 유지·관리해야 함.
- **빌드 워크플로 규칙 준수 필요**: `packages/*` 수정 시 소스(`src/`)를 수정하고 `yarn build` 또는 `yarn workspace <package> build`를 실행해야 하며, 컴파일된 `build/` 아티팩트를 직접 Edit해서는 안 됨.

## Implementation Plan (affected paths, patterns, verification)
### Affected Paths
- `package.json` (루트 워크스페이스 구성, `nohoist`, `resolutions`, 빌드/테스트 스크립트)
- `packages/*` (`packages/blacktokki-account`, `packages/blacktokki-core`, `packages/blacktokki-editor`, `packages/blacktokki-navigation`, `packages/eslint`)
- `apps/*` (`apps/notebook`, `apps/expo-blank`)
- [AGENTS.md](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/AGENTS.md) (모노레포 개발 규칙 및 워크스페이스 빌드 가이드)

### Patterns & Conventions
1. **소소 수정 및 빌드 패턴**:
   - `packages/*/src/`에서 라이브러리 코드를 수정하고 `yarn build` (또는 `yarn workspace <package> build`) 명령을 사용하여 빌드 출력물(`build/`)을 갱신.
   - `packages/*/build/` 아티팩트 직접 Edit 금지.
2. **앱 독립 작업 시 빌드 생략**:
   - 공통 패키지(`packages/*`) 수정 없이 단일 애플리케이션(`apps/*`) 내부 코드만 변경된 경우 루트 빌드(`yarn build`) 생략 가능.
3. **심볼릭 링크 참조**:
   - 애플리케이션(`apps/*`)의 `package.json`은 `@blacktokki/*` 패키지를 로컬 워크스페이스 심볼릭 링크로 연결하여 참조.

### Verification
- [ ] 루트 디렉토리에서 `yarn build` (`yarn workspaces run build`) 실행 시 모든 패키지와 앱이 오류 없이 빌드되는지 확인.
- [ ] `yarn test` (`yarn workspaces run test`) 실행 시 전체 테스트 슈트가 성공적으로 수행되는지 확인.
- [ ] `packages/*`의 변경사항이 `apps/notebook` 등의 애플리케이션에 정상적으로 연동되는지 검증.
