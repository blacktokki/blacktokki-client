---
status: accepted
date: 2025-05-18
---

# 2503. 로컬 계정 지원 및 오프라인 우선(Offline-First) 하이브리드 인증

- **Status**: accepted
- **Date**: 2025-05-18
- **Deciders**: blacktokki core team

## Context (배경 및 맥락)

`blacktokki-client` 애플리케이션(예: `apps/notebook`)은 네트워크 연결 없이도 사용자가 즉시 데이터를 작성하고 조작할 수 있는 **오프라인 우선(Offline-First)** 사용자 경험을 제공해야 합니다.
기존의 서버 중앙 집중식 인증 구조(JWT, OAuth, OTP 기반)에만 의존하는 경우 다음과 같은 문제가 발생합니다:

1. 네트워크 미연결 환경이나 서버 장애 발생 시 앱 진입 및 데이터 액세스 불가
2. 단순 메모 작성/노트북 사용을 원하는 사용자에게 강제 로그인 장벽 제공
3. 로그인 상태와 비로그인(로컬) 상태 간 데이터 격리 및 스토리지 키 관리의 모호성

따라서 서버 로그인(온라인 계정)과 서버 연결 없이 작동하는 로컬 로그인(로컬 계정)을 동시 지원하는 **하이브리드 인증 구조**가 필요하게 되었습니다.

## Decision Drivers (결정 요인)

- **오프라인 동작 보장**: 인터넷 연결이 없거나 불안정한 환경에서도 핵심 기능이 차단 없이 동작해야 함.
- **점진적 계정 전환**: 로컬 계정 모드로 즉시 사용 후, 필요 시 온라인 계정(OAuth, JWT)으로 로그인 및 동기화 가능해야 함.
- **데이터 격리 및 저장소 스코핑**: 로컬 사용자 데이터와 온라인 사용자 데이터가 서로 엉키지 않도록 AsyncStorage 키 분리가 이루어져야 함.
- **네트워크 오류 백오프 및 복원력**: 서버 프로필/토큰 검증(`checkLogin`) 실패 시 네트워크 오류(`ERR_NETWORK`)를 식별하여 앱이 튕기지 않고 오프라인 상태로 안전하게 전환되어야 함.

## Considered Options (고려된 대안들)

### Option 1: 서버 전용 온라인 인증 (Server-Only Authentication)
모든 앱 기능 사용 시 서버 로그인 및 유효한 JWT 토큰을 필수 조건으로 강제함.
- **장점**: 단일 데이터 흐름 및 간단한 백엔드 인터페이스 구조.
- **단점**: 네트워크가 없으면 앱 사용이 불가능하며, 오프라인 미지원.

### Option 2: 로컬 계정 + 하이브리드 인증 (Offline-First Hybrid Auth with Local Account) [선택됨]
`packages/blacktokki-account`에서 `useLocal` 상태(AsyncStorage의 `Authorization:Local`)를 통해 로컬 모드와 온라인 인증 모드를 통합 관리함.
- **장점**:
  - 오프라인 환경에서 네트워크 요청 없이 즉시 앱 진입 가능 (`isLogin = user !== null || useLocal`).
  - 스토리지 키를 `auth.isLocal ? '' : `${auth.user?.id}`` 형태로 스코핑하여 데이터 격리 달성.
  - 네트워크 오류 발생 시 `checkLogin()`에서 `{ error, isOffline }` 형태의 오프라인 대응 가능.
- **단점**:
  - 각 스토리지 훅에서 `subkey` 분리 로직 관리 필요.
  - 로컬 데이터를 온라인 계정으로 병합/동기화 시 복잡도 발생.

### Option 3: 익명 임시 서버 게스트 계정 (Anonymous Server Guest Account)
비로그인 사용자 접속 시 백엔드 API를 호출하여 세션용 임시 익명 게스트 계정을 자동 생성함.
- **장점**: 서버 DB에서 모든 사용자 데이터를 통일되게 관리.
- **단점**: 초기 실행 시 네트워크 연결이 필수적이므로 완전한 오프라인 환경 지원 불가, 서버 DB에 가비지 게스트 데이터 축적.

## Decision Outcome (결정 결과)

**Option 2: 로컬 계정 + 하이브리드 인증 (Offline-First Hybrid Auth)** 방식을 채택합니다.

1. `packages/blacktokki-account` 패키지의 `AuthProvider` / `useAuthContext`를 통해 온라인 계정(JWT/OAuth/OTP)과 로컬 계정(`isLocal`)의 통합 인증 상태를 관리합니다.
2. AsyncStorage의 `Authorization:Local` 키를 통해 사용자의 로컬 모드 선택 여부를 영속화합니다.
3. `checkLogin()` 서비스는 네트워크 에러 발생 시 `isOffline` 플래그를 포함한 에러를 반환하여 안전한 오프라인 폴백 조치를 취할 수 있게 합니다.
4. 클라이언트 앱(`apps/notebook` 등)에서는 `auth.isLocal` 여부에 따라 AsyncStorage 저장 공간을 분리(`subkey = isLocal ? '' : user.id`)합니다.

## Positive Consequences (긍정적 효과)

- **오프라인 사용자 경험 극대화**: 네트워크 연결 여부와 상관없이 서비스 핵심 기능 사용 가능.
- **신속한 앱 진입**: 로컬 인증 모드 시 서버 왕복 없이 즉시 메인 화면 진입.
- **안전한 데이터 분리**: 사용자 아이디 기반 스토리지 서브키 분리로 로컬 데이터와 계정 데이터 간 혼선 방지.
- **유연한 2FA/OTP 확장**: 서버 로그인 사용자에 대해 선택적 OTP 검증 프로세스(`createOtp`, `verifyOtp`)를 하이브리드 인터페이스 내에 포함.

## Negative Consequences (부정적 효과 및 감수할 위험)

- **클라이언트 상태 관리 복잡성**: `AuthProvider` 내부에서 `useLocal`, `user`, `request`, `otpRequest` 등의 상태 전환 트랜지션을 정확하게 핸들링해야 함.
- **스토리지 키 의존성**: 클라이언트 내 모든 데이터 저장/조회 훅(`useUsageMode`, `useNoteStorage` 등)에서 `subkey` 처리 누락 시 데이터 혼선 위험.

## Implementation Plan (구현 계획)

### 1. Affected Code Directories and Files (영향 받는 주요 파일 및 경로)
- `packages/blacktokki-account/src/types.tsx` ([types.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/packages/blacktokki-account/src/types.tsx)): `User`, `CreateUser`, `OtpResponse` 타입 정의
- `packages/blacktokki-account/src/hooks/useAuthContext.tsx` ([useAuthContext.tsx](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/packages/blacktokki-account/src/hooks/useAuthContext.tsx)): `authReducer`, `AuthProvider`, `useLocal` 토글, `LOGIN_LOCAL`, `LOGOUT_LOCAL` 구현
- `packages/blacktokki-account/src/services/account.ts` ([account.ts](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/packages/blacktokki-account/src/services/account.ts)): `checkLogin()`, `login()`, `oauthLogin()`, `isOffline` 처리
- `packages/blacktokki-account/src/services/axios.ts` ([axios.ts](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/packages/blacktokki-account/src/services/axios.ts)): `setLocal()`, `getLocal()`, `getToken()`, `setToken()`, Axios response interceptor
- `apps/notebook/src/hooks/useUsageMode.ts` ([useUsageMode.ts](file:///c:/Users/ydh05/OneDrive/바탕 화면/blacktokki-client/apps/notebook/src/hooks/useUsageMode.ts)): `auth.isLocal` 판별 후 `subkey` 생성 및 AsyncStorage 로컬 스코핑 적용

### 2. Verification Criteria (검증 항목)
- [ ] `getLocal()` 실행 시 AsyncStorage의 `Authorization:Local` 값에 따라 `LOGIN_LOCAL` 또는 `LOGOUT_LOCAL` 액션이 디스패치되는지 확인.
- [ ] `checkLogin()` 실행 시 네트워크 미연결 상황(`ERR_NETWORK`)에서 `isOffline: true` 객체가 올바르게 예외 처리되는지 확인.
- [ ] `auth.isLocal` 상태일 때 `isLogin` 값이 `true`로 평가되고 서버 인증 API 호출 없이 정상 구동되는지 확인.
- [ ] `apps/notebook` 내 스토리지 훅에서 `auth.isLocal`인 경우 `subkey`가 `''`로 설정되어 로컬 전용 데이터 스페이스에 액세스되는지 확인.
