---
status: accepted
date: 2025-05-18
decision-makers: "@blacktokki"
---

# 2503. 로컬 계정 지원 및 오프라인 우선(Offline-First) 하이브리드 인증

## Context and Problem Statement

`blacktokki-client` 애플리케이션(예: `apps/notebook`)은 네트워크 연결 없이도 사용자가 즉시 데이터를 작성하고 조작할 수 있는 **오프라인 우선(Offline-First)** 사용자 경험을 제공해야 합니다.

기존의 서버 중앙 집중식 인증 구조(JWT, OAuth, OTP 기반)에만 의존하는 경우 다음과 같은 문제가 발생합니다:
1. 네트워크 미연결 환경이나 서버 장애 발생 시 앱 진입 및 데이터 액세스 불가
2. 단순 메모 작성/노트북 사용을 원하는 사용자에게 강제 로그인 장벽 제공
3. 로그인 상태와 비로그인(로컬) 상태 간 데이터 격리 및 스토리지 키 관리의 모호성

따라서 서버 로그인(온라인 계정)과 서버 연결 없이 작동하는 로컬 로그인(로컬 계정)을 동시 지원하는 **하이브리드 인증 구조**가 필요했습니다.

## Decision

로컬 계정 지원 및 오프라인 우선 하이브리드 인증(Offline-First Hybrid Auth with Local Account) 방식을 채택합니다.
1. `packages/blacktokki-account` 패키지의 `AuthProvider` / `useAuthContext`를 통해 온라인 계정(JWT/OAuth/OTP)과 로컬 계정(`isLocal`)의 통합 인증 상태를 관리합니다.
2. AsyncStorage의 `Authorization:Local` 키를 통해 사용자의 로컬 모드 선택 여부를 영속화합니다.
3. `checkLogin()` 서비스는 네트워크 에러 발생 시 `isOffline` 플래그를 포함한 객체를 반환하여 앱이 튕기지 않고 안전한 오프라인 폴백 조치를 취할 수 있게 합니다.
4. 클라이언트 앱(`apps/notebook` 등)에서는 `auth.isLocal` 여부에 따라 AsyncStorage 저장 공간을 분리(`subkey = isLocal ? '' : user.id`)합니다.

Non-goals: 완전한 오프라인 환경을 저해하는 임시 게스트 계정의 서버 DB 자동 발급은 수행하지 않습니다.

## Consequences

* Good: 네트워크 연결 여부와 상관없이 오프라인에서 핵심 기능을 제약 없이 사용할 수 있습니다.
* Good: 로컬 인증 모드 선택 시 서버 왕복 없이 즉시 메인 화면에 신속하게 진입합니다.
* Good: 사용자 ID 기반 스토리지 서브키 분리로 로컬 데이터와 계정 데이터 간 혼선 없이 안전하게 데이터가 격리됩니다.
* Good: 서버 로그인 사용자에 대해 선택적 OTP 검증 프로세스(`createOtp`, `verifyOtp`)를 유연하게 확장할 수 있습니다.
* Bad: `AuthProvider` 내부에서 `useLocal`, `user`, `request`, `otpRequest` 등의 상태 전환 트랜지션을 정교하게 핸들링해야 합니다.
* Bad: 클라이언트 내 데이터 저장/조회 훅(`useUsageMode`, `useNoteStorage` 등)에서 `subkey` 처리 누락 시 데이터 혼선 위험이 발생할 수 있습니다.

## Implementation Plan

* **Affected paths**:
  - `packages/blacktokki-account/src/types.tsx` (`User`, `CreateUser`, `OtpResponse` 타입 정의)
  - `packages/blacktokki-account/src/hooks/useAuthContext.tsx` (`authReducer`, `AuthProvider`, `useLocal` 토글, `LOGIN_LOCAL`, `LOGOUT_LOCAL` 구현)
  - `packages/blacktokki-account/src/services/account.ts` (`checkLogin()`, `login()`, `oauthLogin()`, `isOffline` 처리)
  - `packages/blacktokki-account/src/services/axios.ts` (`setLocal()`, `getLocal()`, `getToken()`, `setToken()`, Axios 인터셉터)
  - `apps/notebook/src/hooks/useUsageMode.ts` (`auth.isLocal` 판별 후 `subkey` 생성 및 AsyncStorage 스코핑)
* **Dependencies**: 없음 (기존 Axios 및 AsyncStorage 활용)
* **Patterns to follow**:
  - `isLogin = user !== null || useLocal` 형태로 통합 로그인 상태 판별
  - 스토리지 키 격리 시 `auth.isLocal ? '' : `${auth.user?.id}`` 형태로 subkey 분리
  - 네트워크 장애 시 `ERR_NETWORK`를 포착하여 `isOffline: true` 폴백 플래그 반환
* **Patterns to avoid**:
  - 오프라인 지원을 방해하는 앱 진입 시 필수 서버 로그인 강제 금지
  - subkey 누락으로 로컬 데이터와 계정 데이터가 단일 스토리지 키에 덮어써지는 구조 금지

### Verification

- [x] `getLocal()` 실행 시 AsyncStorage의 `Authorization:Local` 값에 따라 `LOGIN_LOCAL` 또는 `LOGOUT_LOCAL` 액션이 디스패치되는지 확인
- [x] `checkLogin()` 실행 시 네트워크 미연결 상황(`ERR_NETWORK`)에서 `isOffline: true` 객체가 올바르게 예외 처리되는지 확인
- [x] `auth.isLocal` 상태일 때 `isLogin` 값이 `true`로 평가되고 서버 인증 API 호출 없이 정상 구동되는지 확인
- [x] `apps/notebook` 내 스토리지 훅에서 `auth.isLocal`인 경우 `subkey`가 `''`로 설정되어 로컬 전용 데이터 스페이스에 액세스되는지 확인

## Alternatives Considered

* 서버 전용 온라인 인증 (Server-Only Authentication): 모든 기능 사용 시 서버 로그인 및 JWT를 강제하여 구현은 단순하나 오프라인 지원이 완전히 불가능하므로 기각.
* 익명 임시 서버 게스트 계정 (Anonymous Server Guest Account): 최초 실행 시 네트워크 연결이 필수적이므로 완전한 오프라인 환경을 지원할 수 없고 서버 DB에 가비지 데이터가 누적되어 기각.

## More Information

* 관련 소스 코드:
  - [types.tsx](../../packages/blacktokki-account/src/types.tsx)
  - [useAuthContext.tsx](../../packages/blacktokki-account/src/hooks/useAuthContext.tsx)
  - [account.ts](../../packages/blacktokki-account/src/services/account.ts)
  - [axios.ts](../../packages/blacktokki-account/src/services/axios.ts)
  - [useUsageMode.ts](../../apps/notebook/src/hooks/useUsageMode.ts)
* 후속 ADR: [2508-2fa-otp-security-layer.md](2508-2fa-otp-security-layer.md) (2단계 인증 통합)
