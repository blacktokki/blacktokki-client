---
status: accepted
date: 2025-11-23
decision-makers: blacktokki client core team
consulted: security team, platform team
informed: frontend developers
---

# 2508: 2단계 인증(2FA / OTP) 보안 인증 레이어

## Context and Problem Statement

`blacktokki-client` 모노레포 환경에서 사용자 계정의 보안성을 향상시키고 주요 앱(`apps/notebook` 등)에서 2단계 인증(TOTP 기반 2FA)을 일관되게 적용할 필요가 있었습니다.
단순한 1차 비밀번호 인증 방식만으로는 계정 탈취 위험을 완전히 차단하기 어렵기 때문에, 비밀번호 인증 후 추가적인 6자리 TOTP(Time-based One-Time Password) 코드를 통한 step-up 인증 기능이 필요했습니다.

또한 클라이언트 애플리케이션의 인증 상태 관리(`AuthContext`)와 API 계층(`axios` 인터셉터) 간의 유기적 결합을 통해 2FA 미완료/실패 시 세션 권한을 안전하게 제한하고, OTP 재설정 및 해제 요청 시 권한 강등(`resetRoles`) 프로세스를 일관되게 유지하는 아키텍처가 필요했습니다.

## Decision Drivers

* **보안성(Security)**: 단순 로그인 세션 외에 민감 작업 또는 보안 강화 시 2FA TOTP 검증 필수화.
* **재사용성(Reusability)**: `@blacktokki/account` 패키지 단위로 계정/인증 로직을 캡슐화하여 `apps/notebook` 등 다양한 클라이언트 앱에서 통일된 API로 사용.
* **세션 권한 제어(Role Control)**: 2FA 검증 실패 또는 해제 시 서버 토큰 갱신 로직(`refreshToken(resetRoles: true)`)을 통해 접근 권한을 축소/다운그레이드.
* **사용자 경험(UX)**: 비밀번호 입력, OTP QR 생성(`otpAuthUrl`), TOTP 코드 검증, 게스트/로컬 로그인 전환 간 상태 동기화 지원.

## Considered Options

* **Option 1: 클라이언트 자율 2FA 상태 관리 방식**
  * 로그인 성공 후 클라이언트의 로컬 state로 2FA 완료 여부를 판별하고 UI 차단만 수행.
* **Option 2: 중앙집중식 계정 서비스(`packages/blacktokki-account`) 기반 2FA/OTP 토큰 갱신 및 권한 축소(`resetRoles`) 보안 레이어 패턴 (선택됨)**
  * REST API endpoints(`/api/v1/otp`, `/api/v1/otp/verify`, `/api/v1/user/token/refresh/`)와 연동하여 인증 상태를 JWT 토큰 단위로 엄격히 보장.
* **Option 3: 외부 서드파티 MFA (Auth0 / Firebase Auth) 이관**
  * 외부 서비스 팝업/리다이렉트를 통해 2FA 처리.

## Decision Outcome

Chosen option: **Option 2 ("중앙집중식 계정 서비스 기반 2FA/OTP 보안 레이어")**, 백엔드 API 규격과 직접 연동되며 모노레포 구조에 최적화된 패키지 캡슐화를 제공하고 JWT 토큰 단위의 보안 제어가 가능하기 때문입니다.

### Consequences

* **Positive**:
  * `packages/blacktokki-account`를 통해 2FA TOTP 발급, 검증, 비활성화 로직이 일원화되어 `apps/notebook` 등 클라이언트 앱의 통합 비용이 최소화됨.
  * OTP 검증 실패/비활성화 시 `deactivateOtpToken()` / `refreshToken(resetRoles: true)`를 호출하여 서버 측에서 JWT 토큰의 권한 범위를 즉시 축소 가능.
  * `AuthContext` reducer 기반 상태 관리(`OTP_REQUEST`, `OTP_SUCCESS`)로 OTP 발급 및 검증 과정의 비동기 흐름이 예측 가능함.
* **Negative**:
  * 백엔드 OTP API 엔드포인트 세션 및 네트워크 종속성이 증가함.
  * offline 상태 처리 시 OTP 검증 제한.

## Implementation Plan

### Affected Paths
- [packages/blacktokki-account/src/types.tsx](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/packages/blacktokki-account/src/types.tsx): `OtpResponse`, `User.otpDeletionRequested` 타입 정의.
- [packages/blacktokki-account/src/services/account.ts](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/packages/blacktokki-account/src/services/account.ts): `createOtp`, `verifyOtp`, `deactivateOtpToken`, `logout(resetOtp)` 구현.
- [packages/blacktokki-account/src/services/axios.ts](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/packages/blacktokki-account/src/services/axios.ts): `refreshToken(resetRoles)` 및 401/403 토큰 자동 갱신 인터셉터.
- [packages/blacktokki-account/src/hooks/useAuthContext.tsx](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/packages/blacktokki-account/src/hooks/useAuthContext.tsx): `AuthContext`, `authReducer`, `otp` 객체 (`create`, `verify`) 제공.
- [apps/notebook/App.tsx](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/apps/notebook/App.tsx): `AuthProvider` 적용.

### Key API & Service Specifications
1. **OTP Creation**: `POST /api/v1/otp` -> returns `{ secretKey, otpAuthUrl }`.
2. **OTP Verification**: `POST /api/v1/otp/verify` with `{ secretKey?, code }` -> returns updated JWT token.
3. **Role Downgrade / Reset**: `deactivateOtpToken()` triggers `refreshToken(resetRoles: true)` via `POST /api/v1/user/token/refresh/`.
4. **OTP Deletion / Logout**: `DELETE /api/v1/otp` when `resetOtp` flag is passed to `logout()`.

### Patterns to Follow
- OTP 검증 성공 시 `setToken(token)`을 통해 모든 `axios` 인스턴스의 `Authorization` 헤더(`JWT <token>`) 및 `AsyncStorage`를 갱신합니다.
- OTP 실패 시 UI 상태를 안전하게 초기화하고 `deactivateOtpToken()`을 수행하여 권한 승격을 방지합니다.

### Verification

- [x] `createOtp()` 호출 시 secretKey와 otpAuthUrl을 정상 수신 확인
- [x] `verifyOtp()` 성공 시 반환된 JWT 토큰이 `setToken()`을 통해 인스턴스 헤더에 올바르게 적용되는지 확인
- [x] OTP verification 취소 또는 실패 시 `refreshToken(resetRoles: true)`로 권한 축소 요청 전달 확인
- [x] `apps/notebook/App.tsx`에서 `AuthProvider`로 주입되어 앱 전역에서 auth/otp context 참조 가능 확인

## Pros and Cons of the Options

### Option 1: 클라이언트 자율 2FA 상태 관리 방식
* Good, because 백엔드 API 연동 복잡성이 감소함.
* Bad, because 토큰 레벨의 보안이 보장되지 않아 클라이언트 상태 변조 공격에 취약함.

### Option 2: 중앙집중식 계정 서비스 기반 2FA/OTP 보안 레이어 패턴
* Good, because JWT 토큰 단위로 2FA 승인 상태가 검증되어 높은 보안 수준 확보.
* Good, because 모노레포 패키지(`packages/blacktokki-account`)로 캡슐화되어 여러 서비스에서 공유 가능.
* Bad, because 토큰 갱신 및 백엔드 OTP API 연동에 따른 구현 및 네트워크 오버헤드 존재.

### Option 3: 외부 서드파티 MFA 이관
* Good, because 자체 2FA 코드 유지보수 부담이 줄어듦.
* Bad, because 기존 계정 인프라와의 결합도가 떨어지고 서드파티 비용 발생.

## More Information

* 본 ADR은 `packages/blacktokki-account` 패키지 소스 코드 분석을 바탕으로 작성되었습니다.
* 관련 코드:
  * [account.ts](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/packages/blacktokki-account/src/services/account.ts#L46-L76)
  * [axios.ts](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/packages/blacktokki-account/src/services/axios.ts#L46-L75)
  * [useAuthContext.tsx](file:///c:/Users/ydh05/OneDrive/%EB%B0%94%ED%83%95%20%ED%99%94%EB%A9%B4/blacktokki-client/packages/blacktokki-account/src/hooks/useAuthContext.tsx#L173-L235)
