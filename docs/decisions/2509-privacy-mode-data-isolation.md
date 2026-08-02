# 2509. 프라이버시 모드(Privacy Mode) 민감 정보 구획화
- Status: accepted
- Date: 2025-12-14

## Context and Problem Statement
`blacktokki-client` 프로젝트의 `apps/notebook` 애플리케이션에서는 노트, 퀵 메모(Quick Memo), 에이전트 검색 등 다양한 도메인의 사용 데이터가 저장되고 관리됩니다.
일반 메모와 함께 개인적인 민감 정보나 보안 데이터가 공존함에 따라 다음과 같은 문제점이 존재했습니다:
1. **단일 스토리지 키 사용 시의 데이터 노출**: 일반 데이터와 민감 데이터가 동일한 영구 스토리지(AsyncStorage) 키에 혼재될 경우, 화면 노출이나 렌더링 시 민감 정보가 우발적으로 노출될 위험이 있음.
2. **인증 없는 접근**: 디바이스가 잠금 해제된 상태에서 제3자가 애플리케이션을 열었을 때 민감 데이터에 즉시 접근할 수 있음.
3. **세션 방치 위험**: 프라이버시 모드를 사용자가 켠 상태로 앱을 방치할 경우 지속적으로 민감 데이터가 렌더링 상태로 남아있음.

이를 해결하기 위해 애플리케이션 전반에서 민감 정보를 격리(Data Isolation)하고, OTP 인증 기반의 상태 변경 및 자동 잠금(Auto Lock)을 제공하는 프라이버시 모드 아키텍처가 필요했습니다.

## Decision Drivers
- **민감 데이터의 물리적/논리적 구획화 (Data Isolation)**: 일반 저장소 키와 구분되는 프라이버시 전용 스토리지 키 프리픽스(`@blacktokki:notebook:private:`, `@blacktokki:notebook:quick_memo_private:`)를 사용하여 런타임 및 영구 저장 수준에서 완벽 분리.
- **본인 인증 기반 접근 제어 (OTP Verification)**: 프라이버시 모드 활성화/비활성화 및 관련 보안 설정 시 OTP 인증(`usePrivateOtp`, `OtpModal`)을 거치도록 강제.
- **세션 자동 관리 (Auto Lock on Inactivity)**: 10분(`INACTIVITY_LIMIT = 10 * 60 * 1000`) 이상 활동이 없거나 앱 방치 시 타이머를 이용해 자동으로 프라이버시 모드를 비활성화 및 잠금 조치.
- **캐시 동기화 및 보안 클리어 (Query Cache Invalidation)**: 프라이버시 모드 전환 시 React Query 캐시(`pageContents`, `boardContents`, `recentTabs`, `quickMemoSelection` 등)를 즉시 무효화하여 이전 렌더링 데이터의 메모리 잔재를 제거.

## Considered Options
1. **키 프리픽스 분리 스토리지 + React Query 캐시 무효화 + OTP/자동 잠금 타이머 (선택됨)**
   - AsyncStorage 키 수준에서 일반 키와 private 키를 분리하고, React Query 및 커스텀 훅(`usePrivate`)을 중심으로 OTP 인증 및 10분 타이머 자동 비활성화(autoUnlock) 메커니즘 구축.
2. **단일 스토리지 내 속성(Property) 기반 조건부 암호화/필터링**
   - 동일한 키 내에 데이터를 함께 저장하되 `isPrivate: boolean` 필드로 필터링. 캐시 오염 및 키 단위 물리적 격리가 되지 않아 소프트웨어 버그 시 데이터 유출 위험 존재.
3. **완전 서버 기반 원격 전용 격리 (Cloud Vault)**
   - 로컬 스토리지를 사용하지 않고 전량 서버 데이터베이스 및 보안 보관소로 전달. 네트워크 연결이 필요하며 로컬 상태(`auth.isLocal`) 및 오프라인 환경을 지원할 수 없음.

## Decision Outcome
**Option 1** (스토리지 키 구획화 + React Query 캐시 무효화 + OTP 인증 + 미활동 자동 잠금)을 채택하였습니다.

- `usePrivate` 훅을 단일 진실 원천(Single Source of Truth)으로 사용하여 프라이버시 모드 활성화 여부(`enabled`) 및 자동 잠금 여부(`autoUnlock`)를 관리합니다.
- 계정별 사용자 식별자(`subkey = auth.isLocal ? '' : auth.user.id`)와 연동하여 Multi-user 환경에서도 격리된 스토리지 키를 사용합니다.
- 퀵 메모 등 개별 기능에서는 `privateConfig.enabled` 상태에 따라 스토리지 키(`QUICK_MEMO_PRIVACY_KEY` vs `QUICK_MEMO_KEY`)를 동적으로 상이하게 지정합니다.
- 10분간 미활동 시 자동 잠금 타이머(`PRIVATE_TIMER_KEY`)가 트리거되어 프라이버시 모드가 자동으로 닫히고 관련 UI 쿼리가 즉시 무효화됩니다.

## Positive Consequences
- **보안성 향상**: 일반 데이터와 민감 데이터가 스토리지 키 차원에서 구획화되어 우발적인 민감 데이터 노출 방지.
- **자동 방어**: 미활동 10분 경과 시 자동 비활성화 및 React Query 캐시 이노베이션을 통해 디바이스 분실/방치 시 유출 최소화.
- **유연한 계정 및 오프라인 지원**: Local 모드와 서버 계정 모드 모두 subkey 및 `getOtpRequired` logic을 통해 일관된 보안 매커니즘 동작.

## Negative Consequences
- **개발 시 구획화 고려 필수**: 신규 데이터 훅 작성 시 `usePrivate` 상태에 따른 키 분기 로직을 누락 없이 구현해야 함.
- **쿼리 재요청 비용**: 프라이버시 모드 변경 시 `pageContents`, `boardContents`, `recentTabs` 등의 React Query 캐시가 전면 무효화되므로 화면 refetch가 발생함.

## Implementation Plan (affected paths, patterns, verification)

### Affected Paths
- `apps/notebook/src/hooks/usePrivate.ts` (프라이버시 상태 관리, OTP 연동, 10분 미활동 자동 잠금 타이머)
- `apps/notebook/src/features/quickMemo/useQuickMemoStorage.ts` (Quick Memo 프라이버시 키 격리 스토리지)
- `apps/notebook/src/features/agent/useAgentSearch.ts` (프라이버시 모드 반영 에이전트 검색 캐시 키)
- `apps/notebook/src/screens/main/home/ConfigSection.tsx` (프라이버시 모드 설정 UI 및 OTP 설정)
- `apps/notebook/src/modals/OtpModal.tsx` (OTP 인증 모달)

### Patterns & Conventions
1. **스토리지 키 분기 패턴**:
   - 데이터 저장/조회 시 `isPrivate ? PRIVACY_KEY : NORMAL_KEY` 형태의 키 지정.
2. **계정별 Subkey 구성**:
   - `subkey = auth.isLocal ? '' : `${auth.user?.id}``를 모든 스토리지 키 접미사로 결합.
3. **상태 변경 시 캐시 무효화**:
   - 프라이버시 모드 전환 완료 시 `queryClient.invalidateQueries`를 통해 관련 UI 쿼리 키를 즉시 무효화.

### Verification
- [ ] 프라이버시 모드 토글 시 OTP 인증 모달(`OtpModal`)이 정상 동작하는지 확인.
- [ ] Quick Memo 등 기능에서 프라이버시 모드 ON 상태일 때 private 키 프리픽스를 사용해 데이터가 저장되는지 확인.
- [ ] 10분 동안 미활동 시 타이머에 의해 프라이버시 모드가 자동 해제되고 React Query 캐시가 무효화되는지 확인.
