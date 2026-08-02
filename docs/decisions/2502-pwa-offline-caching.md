# 2502. PWA 서비스 워커 및 오프라인 캐싱 전략

- Status: accepted
- Date: 2025-02-16

## Context

`blacktokki-client` 모노레포의 웹 애플리케이션 `apps/notebook` (`@blacktokki/notebook`)은 Expo Web 기반으로 제작되어 GitHub Pages(`https://blacktokki.github.io/blacktokki-notebook/`) 환경에 배포됩니다.

현재 `apps/notebook/public/manifest.json`을 통해 기본적인 PWA(Progressive Web App) 매니페스트 설정을 제공하고 있으며, 빌드 스크립트(`scripts/seo.js`)를 통해 `dist/index.html`에 매니페스트 링크가 삽입되고 있습니다. 그러나 서비스 워커(Service Worker)가 등록되어 있지 않아 웹 브라우저 오프라인 환경이나 네트워크 불안정 시 웹 애플리케이션 접근 및 정적 자원(TinyMCE 에디터, 정적 번들 이미지 등) 로딩이 불가능한 한계가 존재합니다.

`apps/notebook`은 노트 편집 및 관리를 위한 핵심 기능을 제공하므로 네트워크 연결이 끊긴 상태에서도 로컬 데이터 접근(AsyncStorage)과 정적 자원 로딩이 원활히 동작하는 오프라인 퍼스트(Offline-first) 경험 확립이 필요합니다.

## Decision Drivers

- **오프라인 동작성**: 네트워크 연결이 없어도 App Shell, 에디터 자원(TinyMCE), 저장된 노트를 정상적으로 실행 및 조회할 수 있어야 함.
- **GitHub Pages 배포 환경 호환성**: Base URL 경로(`/blacktokki-notebook/`) 및 서비스 워커 스코프(Scope)와의 완벽한 호환.
- **캐싱 및 업데이트 제어**: 애플리케이션 정적 자원(JS, CSS, HTML, TinyMCE 라이브러리)의 신속한 로딩과 업데이트 메커니즘 제공.
- **개발 및 유지보수성**: 모노레포 환경과 Expo Web 빌드 프로세스(`expo export -p web`)에 부드럽게 통합되는 구조.

## Considered Options

1. **Option 1: 커스텀 서비스 워커 (Custom Service Worker + Workbox/Vanilla SW)**
   - `apps/notebook/public/sw.js`에 서비스 워커를 작성하고, 정적 자원에 대해 `CacheFirst` / `StaleWhileRevalidate` 캐싱 전략 적용.
   - `scripts/seo.js` 또는 `index.html`/`index.js`에서 서비스 워커 등록 코드 주입.

2. **Option 2: PWA 전용 Webpack/Workbox 플러그인 자동화 (Expo Webpack Plugin)**
   - Expo/Webpack 설정 레벨에서 Workbox plugin을 연동하여 오프라인 서비스 워커를 자동 생성.
   - 메인 유지보수는 편리하나 Expo 53+ Metro 기반 Web 번들링 커스텀 설정과의 의존성 마찰 발생 가능성.

3. **Option 3: 서비스 워커 미도입 (웹 매니페스트만 유지)**
   - 추가적인 서비스 워커 캐싱 없이 브라우저 기본 HTTP 캐시 메커니즘에 의존.
   - 오프라인 상태에서 앱 실행 자체가 불가능하므로 비채택.

## Decision Outcome

**Option 1: 커스텀 서비스 워커 기반 캐싱 전략 도입 (Custom Service Worker)**을 채택합니다.

서비스 워커를 통한 리소스 캐싱 분류 전략:
- **App Shell 및 HTML (`index.html`)**: `StaleWhileRevalidate` 전략 적용 (최신 업데이트 자동 반영 및 캐시 지원).
- **정적 에셋 (JS, CSS, Images, TinyMCE 렌더러)**: `CacheFirst` 전략 적용 (빠른 앱 구동속도 확보).
- **GitHub Pages 베이스 경로 수용**: `/blacktokki-notebook/` 스코프 명시 및 상대 경로 캐시 제어.

### Positive Consequences

- **오프라인 동작 보장**: 브라우저 오프라인 모드에서도 `blacktokki-notebook` 웹 앱 진입 및 노트 편집 가능.
- **로딩 성능 향상**: TinyMCE 정적 리소스 및 번들 파일 캐싱으로 재방문 시 초고속 로딩 제공.
- **독립적인 빌드 파이프라인**: Expo Metro web export 이후 `scripts/seo.js` 등 post-build 단계에서 수월하게 SW 연동 관리.

### Negative Consequences

- **캐시 무효화 관리 비용**: 정적 파일 및 에디터 자원 업데이트 시 서비스 워커 버저닝(Cache Busting) 관리가 필요함.
- **초기 로딩 시 SW 등록 추가 자원**: 첫 방문 시 SW 설치 및 캐시 사전 로딩(Pre-caching) 작업 소모.

## Implementation Plan

- **Affected paths**:
  - `apps/notebook/public/sw.js` (신규 작성)
  - `apps/notebook/public/manifest.json`
  - `apps/notebook/scripts/seo.js` (서비스 워커 등록 태그 주입)
  - `apps/notebook/index.js` 또는 `App.tsx` (서비스 워커 등록 스크립트)
  - `apps/notebook/package.json`

- **Pattern**:
  - PWA 서비스 워커 구동 파일: `apps/notebook/public/sw.js`
  - post-build 작업(`yarn build` / `yarn github`) 시 `dist/` 폴더에 `sw.js` 포함 및 `index.html` 등록 script 주입.

- **Steps**:
  1. `apps/notebook/public/sw.js`에 캐시 이름 설정(`blacktokki-notebook-v1`) 및 fetch/install/activate 이벤트 핸들러 작성.
  2. `scripts/seo.js` 파일 수정하여 `dist/index.html` `<head>` 태그 내 Service Worker 등록 스크립트 주입.
  3. `manifest.json` icon 및 start_url 경로 확인.
  4. 웹 환경에서 `yarn web` / `expo export -p web` 수행 후 서비스 워커 동작 및 캐싱 테스트.

- **Verification**:
  - [ ] `dist/index.html` 내 서비스 워커 등록 스크립트 및 manifest link 정상 주입 확인
  - [ ] 크롬 개발자 도구 Application > Service Workers 탭에서 서비스 워커 활성화 확인
  - [ ] Network 탭에서 Offline 상태로 전환 후 앱 리로드 시 정상 동작 확인
