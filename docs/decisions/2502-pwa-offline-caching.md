---
status: accepted
date: 2025-02-16
decision-makers: "@blacktokki"
---

# 2502. PWA 서비스 워커 및 오프라인 캐싱 전략

## Context and Problem Statement

`blacktokki-client` 모노레포의 웹 애플리케이션 `apps/notebook` (`@blacktokki/notebook`)은 Expo Web 기반으로 제작되어 GitHub Pages(`https://blacktokki.github.io/blacktokki-notebook/`) 환경에 배포됩니다.

현재 `apps/notebook/public/manifest.json`을 통해 기본적인 PWA(Progressive Web App) 매니페스트 설정을 제공하고 있으나, 서비스 워커(Service Worker)가 등록되어 있지 않아 웹 브라우저 오프라인 환경이나 네트워크 불안정 시 웹 애플리케이션 접근 및 정적 자원(TinyMCE 에디터, 정적 번들 이미지 등) 로딩이 불가능한 한계가 존재합니다.

`apps/notebook`은 노트 편집 및 관리를 위한 핵심 기능을 제공하므로 네트워크 연결이 끊긴 상태에서도 로컬 데이터 접근(AsyncStorage)과 정적 자원 로딩이 원활히 동작하는 오프라인 퍼스트(Offline-first) 경험 확립이 필요합니다.

## Decision

커스텀 서비스 워커 기반 캐싱 전략(Custom Service Worker)을 도입합니다.
- **App Shell 및 HTML (`index.html`)**: `StaleWhileRevalidate` 전략을 적용하여 최신 업데이트를 백그라운드 반영하면서 오프라인 캐시를 지원합니다.
- **정적 에셋 (JS, CSS, Images, TinyMCE 렌더러)**: `CacheFirst` 전략을 적용하여 빠른 구동 속도를 확보합니다.
- **GitHub Pages 베이스 경로 수용**: `/blacktokki-notebook/` 스코프를 명시하고 상대 경로 기반 캐시 제어를 수행합니다.

Non-goals: 복잡한 PWA 전용 Webpack 플러그인에 의존하지 않고 독립된 커스텀 서비스 워커 파일(`sw.js`)과 빌드 스크립트(`scripts/seo.js`)를 통해 관리합니다.

## Consequences

* Good: 브라우저 오프라인 모드에서도 `blacktokki-notebook` 웹 앱 진입 및 노트 편집이 가능합니다.
* Good: TinyMCE 정적 리소스 및 번들 파일 캐싱으로 재방문 시 로딩 성능이 향상됩니다.
* Good: Expo Metro web export 이후 `scripts/seo.js` 등 post-build 단계에서 독립적인 서비스 워커 연동이 가능합니다.
* Bad: 정적 파일 및 에디터 자원 업데이트 시 서비스 워커 버저닝(Cache Busting)을 지속적으로 관리해야 합니다.
* Bad: 첫 방문 시 서비스 워커 설치 및 캐시 사전 로딩(Pre-caching) 작업에 따른 초기 리소스 소모가 발생합니다.

## Implementation Plan

* **Affected paths**:
  - `apps/notebook/public/sw.js` (서비스 워커 구동 파일)
  - `apps/notebook/public/manifest.json` (PWA 매니페스트)
  - `apps/notebook/scripts/seo.js` (서비스 워커 등록 태그 및 매니페스트 주입)
  - `apps/notebook/index.js` 또는 `apps/notebook/App.tsx` (서비스 워커 등록 스크립트)
  - `apps/notebook/package.json`
* **Dependencies**: 없음 (Vanilla Service Worker API 활용)
* **Patterns to follow**:
  - `apps/notebook/public/sw.js`에 캐시 이름 설정(`blacktokki-notebook-v1`) 및 fetch/install/activate 핸들러 구성
  - post-build 작업(`yarn build` / `yarn github`) 시 `dist/` 폴더에 `sw.js`를 포함하고 `index.html` 내 등록 스크립트 주입
* **Patterns to avoid**:
  - Metro 웹 번들링 설정과 충돌할 수 있는 불필요한 Webpack 전용 플러그인 도입 지양

### Verification

- [x] `dist/index.html` 내 서비스 워커 등록 스크립트 및 manifest link 정상 주입 확인
- [x] 크롬 개발자 도구 Application > Service Workers 탭에서 서비스 워커 활성화 확인
- [x] Network 탭에서 Offline 상태로 전환 후 앱 리로드 시 정상 동작 확인

## Alternatives Considered

* PWA 전용 Webpack/Workbox 플러그인 자동화: Expo Metro 기반 Web 번들링 커스텀 설정과의 의존성 마찰 발생 가능성으로 기각.
* 서비스 워커 미도입 (웹 매니페스트만 유지): 오프라인 상태에서 앱 실행 자체가 불가능하므로 기각.

## More Information

* 관련 ADR: [2501-yarn-workspaces-monorepo.md](2501-yarn-workspaces-monorepo.md)
