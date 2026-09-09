---
status: accepted
date: 2025-11-23
decision-makers: "@blacktokki"
---

# 2508. 2단계 인증(2FA / OTP) 보안 인증 레이어

## Context and Problem Statement

`blacktokki-client` 모노레포 환경에서 사용자 계정의 보안성을 향상시키고 주요 앱(`apps/notebook` 등)에서 2단계 인증(TOTP 기반 2FA)을 일관되게 적용할 필요가 있었습니다.
단순한 1차 비밀번호 인증 방식만으로는 계정 탈취 위험을 완전히 차단하기 어렵기 때문에, 비밀번호 인증 후 추가적인 6자리 TOTP(Time-based One-Time Password) 코드를 통한 step-up 인증 기능이 필요했습니다.

또한 클라이언트 애플리케이션의 인증 상태 관리(`AuthContext`)와 API 계층(`axios` 인터셉터) 간의 유기적 결합을 통해 2FA 미완료/실패 시 세션 권한을 안전하게 제한하고, OTP 재설정 및 해제 요청 시 권한 강등(`resetRoles`) 프로세스를 일관되게 유지하는 아키텍처가 필요했습니다.

## Decision

중앙집중식 계정 서비스(`packages/blacktokki-account`) 기반 2FA/OTP 토큰 갱신 및 권한 축소(`resetRoles`) 보안 레이어 패턴을 채택합니다.
- REST API 엔드포인트(`/api/v1/otp`, `/api/v1/otp/verify`, `/api/v1/user/token/refresh/`)와 연동하여 인증 상태를 JWT 토큰 단위로 엄격히 관리합니다.
- OTP 검증 성공 시 `setToken(token)`을 통해 모든 `axios` 인스턴스의 `Authorization` 헤더(`JWT <token>`) 및 `AsyncStorage`를 갱신합니다.
- 2FA 실패 또는 비활성화 시 `deactivateOtpToken()`을 호출하여 서버 측에서 JWT 토큰의 권한 범위를 즉시 축소(`refreshToken(resetRoles: true)`)합니다.
- `AuthContext` reducer 기반 상태 관리(`OTP_REQUEST`, `OTP_SUCCESS`)로 발급 및 검증 비동기 흐름을 캡슐화합니다.

Non-goals:
- 백엔드 연동 없이 클라이언트 로컬 UI state로만 2FA를 판별하는 취약한 구조는 지양합니다.
- 외부 서드파티 MFA(Auth0, Firebase Auth)에 인증 주권을 위임하지 않습니다.

## Consequences

* Good: `packages/blacktokki-account`를 통해 2FA 발급, 검증, 비활성화 로직이 일원화되어 클라이언트 앱의 통합 비용이 최소화됩니다.
* Good: JWT 토큰 단위로 2FA 승인 상태가 검증되어 높은 수준의 보안 무결성을 확보합니다.
* Good: OTP 검증 취소나 해제 시 권한 축소(`resetRoles`)가 즉시 서버 측에 반영되어 세션 권한 승격을 차단합니다.
* Bad: 백엔드 OTP API 엔드포인트 세션 및 네트워크 종속성이 증가합니다.
* Bad: 오프라인(Offline) 환경에서는 2FA OTP의 신규 발급 및 서버 토큰 갱신이 제한됩니다.

## Implementation Plan

* **Affected paths**:
  - `packages/blacktokki-account/src/types.tsx` (`OtpResponse`, `User.otpDeletionRequested` 타입 정의)
  - `packages/blacktokki-account/src/services/account.ts` (`createOtp`, `verifyOtp`, `deactivateOtpToken`, `logout(resetOtp)`)
  - `packages/blacktokki-account/src/services/axios.ts` (`refreshToken(resetRoles)` 및 401/403 토큰 자동 갱신 인터셉터)
  - `packages/blacktokki-account/src/hooks/useAuthContext.tsx` (`AuthContext`, `authReducer`, `otp` 객체 제공)
  - `apps/notebook/App.tsx` (`AuthProvider` 적용)
* **Dependencies**: 없음 (기존 Axios 및 AsyncStorage 활용)
* **Patterns to follow**:
  - OTP 검증 성공 시 `setToken(token)`으로 Axios 기본 헤더 및 스토리지 동기화
  - 검증 실패/취소 시 UI 상태 초기화와 함께 `deactivateOtpToken()` 수행하여 권한 강등 보장
  - `AuthProvider`를 최상위에 배치하여 하위 화면에서 통일된 context 인터페이스 사용
* **Patterns to avoid**:
  - 토큰 갱신 없이 클라이언트 플래그만으로 보안 뷰를 잠금 해제하는 보안 허점 방치 금지

### Verification

- [x] `createOtp()` 호출 시 secretKey와 otpAuthUrl을 정상 수신 확인
- [x] `verifyOtp()` 성공 시 반환된 JWT 토큰이 `setToken()`을 통해 인스턴스 헤더에 올바르게 적용되는지 확인
- [x] OTP verification 취소 또는 실패 시 `refreshToken(resetRoles: true)`로 권한 축소 요청 전달 확인
- [x] `apps/notebook/App.tsx`에서 `AuthProvider`로 주입되어 앱 전역에서 auth/otp context 참조 가능 확인

## Alternatives Considered

* 클라이언트 자율 2FA 상태 관리 방식: 백엔드 연동은 단순하나 토큰 레벨 보안이 보장되지 않아 클라이언트 상태 변조 공격에 취약하여 기각.
* 외부 서드파티 MFA (Auth0 / Firebase Auth) 이관: 자체 유지보수 부담은 줄어드나 기존 백엔드 계정 인프라와의 결합도가 떨어지고 추가 비용이 발생하여 기각.

## More Information

* 선행 ADR: [2503-offline-first-local-account.md](2503-offline-first-local-account.md) (하이브리드 인증 기반)
* 관련 소스 코드:
  - [account.ts](../../packages/blacktokki-account/src/services/account.ts)
  - [axios.ts](../../packages/blacktokki-account/src/services/axios.ts)
  - [useAuthContext.tsx](../../packages/blacktokki-account/src/hooks/useAuthContext.tsx)
