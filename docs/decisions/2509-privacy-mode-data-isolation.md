---
status: accepted
date: 2025-12-14
decision-makers: "@blacktokki"
---

# 2509. 프라이버시 모드(Privacy Mode) 민감 정보 구획화

## Context and Problem Statement

`blacktokki-client` 프로젝트의 `apps/notebook` 애플리케이션에서는 노트, 퀵 메모(Quick Memo), 에이전트 검색 등 다양한 도메인의 사용 데이터가 저장되고 관리됩니다.

일반 메모와 함께 개인적인 민감 정보나 보안 데이터가 공존함에 따라 다음과 같은 문제점이 존재했습니다:
1. 일반 데이터와 민감 데이터가 동일한 영구 스토리지(AsyncStorage) 키에 혼재될 경우 화면 노출이나 렌더링 시 민감 정보가 우발적으로 노출될 위험이 있음.
2. 디바이스가 잠금 해제된 상태에서 제3자가 애플리케이션을 열었을 때 민감 데이터에 즉시 접근할 수 있음.
3. 프라이버시 모드를 켠 상태로 앱을 방치할 경우 지속적으로 민감 데이터가 렌더링 상태로 남아있음.

이를 해결하기 위해 애플리케이션 전반에서 민감 정보를 격리(Data Isolation)하고, OTP 인증 기반의 상태 변경 및 자동 잠금(Auto Lock)을 제공하는 프라이버시 모드 아키텍처가 필요했습니다.

## Decision

스토리지 키 구획화, React Query 캐시 무효화, OTP 인증, 미활동 자동 잠금 메커니즘을 통합한 프라이버시 모드 아키텍처를 채택합니다.
- `usePrivate` 훅을 단일 진실 원천(Single Source of Truth)으로 사용하여 프라이버시 모드 활성화 여부(`enabled`) 및 자동 잠금 여부(`autoUnlock`)를 관리합니다.
- 계정별 사용자 식별자(`subkey = auth.isLocal ? '' : auth.user.id`)와 결합하여 전용 스토리지 키 프리픽스(`@blacktokki:notebook:private:`, `@blacktokki:notebook:quick_memo_private:`)를 사용하여 런타임 및 영구 저장 수준에서 물리적으로 분리합니다.
- 프라이버시 모드 활성화/비활성화 및 보안 설정 변경 시 OTP 인증(`usePrivateOtp`, `OtpModal`)을 거치도록 강제합니다.
- 10분(`INACTIVITY_LIMIT = 10 * 60 * 1000`) 이상 활동이 없거나 앱 방치 시 타이머를 이용해 자동으로 프라이버시 모드를 닫고, 전환 완료 시 React Query 캐시를 전면 무효화하여 메모리 잔재를 제거합니다.

Non-goals:
- 오프라인 환경을 지원할 수 없는 완전 서버 기반 원격 전용 보안 보관소(Cloud Vault)는 도입하지 않습니다.

## Consequences

* Good: 일반 데이터와 민감 데이터가 스토리지 키 차원에서 구획화되어 우발적인 민감 데이터 노출을 원천 차단합니다.
* Good: 미활동 10분 경과 시 자동 비활성화 및 React Query 캐시 무효화로 디바이스 방치 시 보안 유출을 최소화합니다.
* Good: 로컬 모드(`auth.isLocal`)와 서버 계정 모드 모두에서 서브키 기반으로 일관된 보안 메커니즘이 동작합니다.
* Bad: 신규 데이터 저장 훅 작성 시 `usePrivate` 상태에 따른 키 분기 로직을 누락 없이 구현해야 하는 개발 규칙 준수 부담이 있습니다.
* Bad: 프라이버시 모드 전환 시 UI 쿼리 캐시가 전면 무효화되어 일시적인 화면 재요청(Refetch) 비용이 발생합니다.

## Implementation Plan

* **Affected paths**:
  - `apps/notebook/src/hooks/usePrivate.ts` (프라이버시 상태 관리, OTP 연동, 10분 미활동 자동 잠금 타이머)
  - `apps/notebook/src/features/quickMemo/useQuickMemoStorage.ts` (Quick Memo 프라이버시 키 격리 스토리지)
  - `apps/notebook/src/features/agent/useAgentSearch.ts` (프라이버시 모드 반영 에이전트 검색 캐시 키)
  - `apps/notebook/src/screens/main/home/ConfigSection.tsx` (프라이버시 모드 설정 UI 및 OTP 설정)
  - `apps/notebook/src/modals/OtpModal.tsx` (OTP 인증 모달)
* **Dependencies**: 없음 (기존 React Query, AsyncStorage 활용)
* **Patterns to follow**:
  - 데이터 저장/조회 시 `isPrivate ? PRIVACY_KEY : NORMAL_KEY` 형태의 키 분기 적용
  - `subkey = auth.isLocal ? '' : `${auth.user?.id}`` 형태로 사용자 스코프 격리
  - 상태 변경 완료 시 `queryClient.invalidateQueries` 호출로 캐시 메모리 잔재 제거
* **Patterns to avoid**:
  - 동일 스토리지 키 내에 `isPrivate: boolean` 필드만 두고 소프트웨어 필터링으로 처리하는 위험한 구조 지양

### Verification

- [x] 프라이버시 모드 토글 시 OTP 인증 모달(`OtpModal`)이 정상 동작하는지 확인
- [x] Quick Memo 등 기능에서 프라이버시 모드 ON 상태일 때 private 키 프리픽스를 사용해 데이터가 저장되는지 확인
- [x] 10분 동안 미활동 시 타이머에 의해 프라이버시 모드가 자동 해제되고 React Query 캐시가 무효화되는지 확인

## Alternatives Considered

* 단일 스토리지 내 속성(Property) 기반 조건부 필터링: 구현은 쉬우나 캐시 오염 및 키 단위 물리적 격리가 되지 않아 소프트웨어 버그 시 데이터 유출 위험이 커서 기각.
* 완전 서버 기반 원격 전용 격리 (Cloud Vault): 오프라인 모드 및 로컬 퍼스트 원칙을 충족할 수 없어 기각.

## More Information

* 선행 ADR: [2503-offline-first-local-account.md](2503-offline-first-local-account.md), [2508-2fa-otp-security-layer.md](2508-2fa-otp-security-layer.md)
* 관련 소스 코드:
  - [usePrivate.ts](../../apps/notebook/src/hooks/usePrivate.ts)
  - [OtpModal.tsx](../../apps/notebook/src/modals/OtpModal.tsx)
