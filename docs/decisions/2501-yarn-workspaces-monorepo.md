---
status: accepted
date: 2025-01-27
decision-makers: "@blacktokki"
---

# 2501. Yarn Workspaces 기반 모노레포 아키텍처 채택

## Context and Problem Statement

`blacktokki-client` 프로젝트는 여러 클라이언트 애플리케이션(`apps/*`)과 공통 UI/도메인 컴포넌트, 유틸리티 라이브러리(`packages/*`)를 포함하고 있습니다.
기존의 다중 레포지토리(Polyrepo) 방식이나 분리된 구조는 다음과 같은 문제점을 유발합니다:
1. 애플리케이션 간 공통 코드(`@blacktokki/account`, `@blacktokki/editor`, `@blacktokki/navigation` 등)의 공유 및 실시간 동기화가 어려움.
2. 패키지 변경 시 매번 외부 레포지토리/레지스트리에 게시(publish)하고 의존성 버전을 업데이트해야 하는 번거로움.
3. React 19, React Native, Babel 등 프레임워크 및 코어 라이브러리의 버전 파편화 위험.

이를 해결하기 위해 클라이언트 프로젝트 전반의 코드 공유성을 높이고 의존성 관리 및 빌드 파이프라인을 일원화할 수 있는 아키텍처가 필요했습니다.

## Decision

`Yarn Workspaces` 기반 모노레포 아키텍처를 채택하여 프로젝트 전체를 단일 저장소에서 통합 관리합니다.
- 루트 `package.json`에 `workspaces` 항목(`packages/*`, `apps/*`)을 정의하여 모든 워크스페이스를 일원화합니다.
- 특정 에디터 및 타사 패키지(`tinymce`, `supercode`)와의 의존성 충돌을 방지하기 위해 `nohoist` 옵션을 적용합니다.
- `resolutions` 필드를 통해 React 19.0.0 및 React Native 0.79.6 등 핵심 의존성 버전을 프로젝트 전체에서 고정 및 유지합니다.

## Consequences

* Good: 단일 출처(Single Source of Truth)를 확보하여 모든 클라이언트 코드 및 공유 라이브러리가 단일 저장소 내에 존재하므로 탐색 및 리팩토링이 용이합니다.
* Good: 루트 레포지토리 수준에서 의존성 버전을 조율하여 버전 불일치로 인한 런타임 버그를 사전에 예방합니다.
* Good: `yarn build`, `yarn test` 명령어로 전체 모노레포에 대한 빌드 및 검증을 일괄 실행할 수 있습니다.
* Bad: 의존성이 루트 `node_modules`로 호이스팅되는 현상으로 인해 특정 패키지에서 참조 오류가 발생할 수 있어 `nohoist` 설정을 지속적으로 유지·관리해야 합니다.
* Bad: `packages/*` 수정 시 소스(`src/`)를 수정하고 `yarn build` (또는 `yarn workspace <package> build`)를 실행해야 하며, 컴파일된 `build/` 아티팩트를 직접 편집할 수 없습니다.

## Implementation Plan

* **Affected paths**:
  - `package.json` (루트 워크스페이스 구성, `nohoist`, `resolutions`, 빌드/테스트 스크립트)
  - `packages/*` (`packages/blacktokki-account`, `packages/blacktokki-core`, `packages/blacktokki-editor`, `packages/blacktokki-navigation`, `packages/eslint`)
  - `apps/*` (`apps/notebook`, `apps/expo-blank`)
  - `AGENTS.md` (모노레포 개발 규칙 및 워크스페이스 빌드 가이드)
* **Dependencies**: 없음 (Yarn v1 기본 기능 활용)
* **Patterns to follow**:
  - 라이브러리 수정 시 `packages/*/src/`에서 수정하고 `yarn build` (또는 `yarn workspace <package> build`)로 `build/` 산출물 갱신
  - 공통 패키지(`packages/*`) 수정 없이 단일 앱(`apps/*`) 내부 코드만 변경된 경우 루트 빌드(`yarn build`) 생략
  - 애플리케이션(`apps/*`)의 `package.json`은 `@blacktokki/*` 패키지를 로컬 워크스페이스 심볼릭 링크로 연결하여 참조
* **Patterns to avoid**:
  - `packages/*/build/` 아티팩트 직접 편집 금지
  - 공통 패키지 미수정 단일 앱 작업 시 불필요한 루트 `yarn build` 실행 금지

### Verification

- [x] 루트 디렉토리에서 `yarn build` (`yarn workspaces run build`) 실행 시 모든 패키지와 앱이 오류 없이 빌드되는지 확인
- [x] `yarn test` (`yarn workspaces run test`) 실행 시 전체 테스트 슈트가 성공적으로 수행되는지 확인
- [x] `packages/*`의 변경사항이 `apps/notebook` 등의 애플리케이션에 정상적으로 연동되는지 검증

## Alternatives Considered

* Turborepo / Lerna + pnpm/npm 모노레포: 빌드 캐싱 및 태스크 파이프라인 관리가 우수하나, 추가 도구 도입으로 인한 초기 설정 복잡도가 증가하여 기각.
* 다중 레포지토리 (Polyrepo): 각 앱과 패키지를 별도 저장소로 분리하면 버전 관리 부담이 크고 로컬 동시 개발 생산성이 저하되어 기각.

## More Information

* 프로젝트 전역 개발 규칙: [AGENTS.md](../../AGENTS.md)
