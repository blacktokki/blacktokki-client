# Copilot / AI 작업자 가이드 (레포 전역)

이 파일은 레포 수준에서 AI 기반 코딩 에이전트가 빠르게 이해해야 할 전역 규칙과 패턴을 담습니다. 애플리케이션(apps/*) 또는 패키지(packages/*)별 세부 안내는 각 경로의 AGENTS/README 문서를 참고하세요. 예: `apps/notebook/AGENTS.md`.

**핵심 요약:**
- **모노레포:** 루트 `package.json`의 `workspaces`로 `packages/*` 및 `apps/*`를 관리합니다.
- **빌드/워크플로:** 루트에서 전체 워크스페이스 빌드: `yarn build` (실제: `yarn workspaces run build`).

**코드 변경 규칙 (중요)**
- **/packages 소스 수정 규칙:** `packages/` 하위의 소스 파일을 수정할 때는 해당 패키지의 `build/` (컴파일된 출력) 파일을 직접 편집하지 마세요. 대신 소스(`src/`)를 변경하고 패키지의 빌드 스크립트(예: `yarn workspace <package> build` 또는 루트 `yarn build`)를 사용해 빌드하세요. 빌드 출력은 소스 변경의 결과물일 뿐 직접 편집 대상이 아닙니다.
- **ESLint / 포매터:** 저장소에서 사용하는 ESLint 규칙과 포맷터(예: Prettier)를 준수하세요. 변경 시 lint 오류를 남기지 않도록 하고, 커밋 전에 포맷터를 적용하세요.
- **모달 구현 규칙:** 앱 내 모달은 전역 모달 컨텍스트(`useModalsContext`)에서 제공하는 `setModal` 함수를 사용해 열고 닫아야 합니다.
	- 모달을 닫을 때는 `setModal(null)` 또는 프로젝트에서 정의한 모달 닫기 API를 사용하세요.
	- 모달 컴포넌트는 앱별 `apps/<app>/src/modals/` 디렉터리에 추가하고, 필요하면 `index.ts`로 내보내세요.
	- 모달은 키보드/포커스 흐름과 접근성(aria 등)을 고려해 테스트하세요.

**레포 수준 명령(자주 쓰는 것)**
- 루트: `yarn build` 또는 `yarn workspaces run build` (전체 빌드).
- 각 앱/패키지별 개발 서버나 빌드 명령은 해당 앱의 AGENTS 또는 README에 기술되어 있습니다. 예: `apps/notebook/AGENTS.md`.

**패키지 개요(참고)**
- `@blacktokki/editor`: 에디터 관련 패키지. (WYSIWYG/마크다운 통합 컴포넌트)
- `@blacktokki/account`: 인증/계정 관련 훅 및 컨텍스트
- `@blacktokki/navigation`: 공통 네비게이션 유틸리티

문서 내용에 누락되거나 더 알고 싶은 것(예: CI, 환경변수, 외부 API 엔드포인트)이 있으면 알려주세요. 전역 가이드에 반영하겠습니다.