---
status: accepted
date: 2026-08-02
decision-makers: blacktokki-client team
---

# 2601. npx skills 및 postinstall 기반 AI 에이전트 스킬 자동화

## Context and Problem Statement

`blacktokki-client` 모노레포 프로젝트에서 AI 에이전트 기반 코딩 워크플로(Harness Diagnostics, ADR 작성 등)를 도입함에 따라, 프로젝트에 필요한 AI 에이전트 스킬들을 팀원 및 CI/CD 환경 전반에 일관되고 자동화된 방식으로 제공할 수 있는 가동 체계가 필요하게 되었습니다.

기존에는 개발자가 개별 스킬을 수동으로 클론하거나 CLI 명령어를 개별 실행해야 하는 번거로움이 있었으며, 스킬 버전의 파편화 및 오프라인/새 환경에서의 세팅 누락 위험이 존재했습니다.

이에 따라 패키지 설치 단계(`postinstall`)에서 `npx skills` CLI를 활용하여 표준 스킬을 자동 설치 및 동기화하고, `skills-lock.json`으로 스킬 버전을 고정 관리할 수 있는 아키텍처를 도입하기로 결정했습니다.

## Decision Drivers

* **개발자 경험(DX) 및 자동화**: 프로젝트 신규 세팅 시 `yarn` 명령어 실행만으로 추가 수동 작업 없이 모든 AI 에이전트 스킬이 즉시 준비되어야 함.
* **버전 일관성 및 재현성**: `skills-lock.json`을 통해 팀 전체 및 CI 환경에서 일관된 버전과 해시 값을 보장해야 함.
* **Git 저장소 경량화 및 청결성**: 다운로드된 외부 서드파티 스킬 코드는 Git 버전 관리 대상에서 제외(`.gitignore`)하여 저장소 용량을 최적화해야 함.
* **표준화된 CLI 규격 사용**: `npx skills` 생태계 CLI 규격을 준수하여 새로운 스킬 추가/업데이트를 유연하게 수행할 수 있어야 함.

## Considered Options

* **옵션 1**: `npx --yes skills` + `package.json postinstall` 훅 + `.agents/skills/setup.sh` 자동화 (**선택됨**)
* **옵션 2**: README 문서에 수동 설치 가이드를 작성하고 개발자가 직접 CLI 실행
* **옵션 3**: Git Submodule 또는 서드파티 소스코드를 저장소에 직접 커밋하여 관리

## Decision Outcome

Chosen option: **"옵션 1: npx --yes skills + package.json postinstall 훅 + .agents/skills/setup.sh 자동화"**

`package.json`의 `postinstall` 라이프사이클 훅을 활용하여 패키지 설치 시 `.agents/skills/setup.sh` 스크립트가 자동 실행되도록 설정합니다. 스크립트 내부에서는 `npx --yes skills add` 명령어를 통해 `junh0328/harness-diagnostics` 및 `skillrecordings/adr-skill`을 자동 다운로드하고, `skills-lock.json`을 통해 무결성을 검증합니다. 다운로드된 디렉터리는 `.gitignore`에 등록하여 관리합니다.

### Consequences

* **Good (긍정적)**:
  * 온보딩 절차가 단순화되어 `yarn` 설치 명령어 하나로 개발 환경 구축 완결.
  * `skills-lock.json` 커밋을 통해 프로젝트 전체에서 동일한 AI 에이전트 스킬 버전 유지를 보장.
  * 서드파티 스킬 소스코드가 Git에 포함되지 않아 저장소가 경량화됨.
* **Bad (부정적)**:
  * `yarn install` 실행 시 `npx skills` 동작으로 인한 네트워크 통신 및 설치 시간 소폭 증가.
  * 외부 GitHub 리포지토리 다운로드에 의존하므로 네트워크가 차단된 오프라인 환경에서는 설치 제한 발생 가능.
* **Neutral (중립적)**:
  * 스킬 업데이트 시 `setup.sh` 및 `skills-lock.json`을 갱신하는 정기적 관리 필요.

## Implementation Plan

### Affected Paths
* `package.json` (postinstall 훅 등록)
* `.agents/skills/setup.sh` (스킬 설치 자동화 셸 스크립트)
* `.gitignore` (다운로드된 스킬 경로 제외)
* `skills-lock.json` (스킬 명세 및 해시 정보 잠금)

### Configuration / Code Specifications
1. **`package.json`**: `scripts` 항목에 `"postinstall": "bash .agents/skills/setup.sh"` 추가.
2. **`.agents/skills/setup.sh`**:
   ```bash
   #!/usr/bin/env bash
   set -eo pipefail

   echo "🤖 AI 에이전트 스킬 설치를 시작합니다..."
   npx --yes skills add junh0328/harness-diagnostics -y
   npx --yes skills add skillrecordings/adr-skill -y
   echo "✅ 모든 스킬 설치가 완료되었습니다!"
   ```
3. **`.gitignore`**:
   ```gitignore
   # Downloaded AI skills
   .agents/skills/harness-diagnostics
   .agents/skills/adr-skill
   ```
4. **`skills-lock.json`**: 생성된 Lock 파일을 Git 버전 관리에 포함.

### Verification

- [x] `package.json`의 `scripts.postinstall`에 `bash .agents/skills/setup.sh`가 올바르게 지정되어 있다.
- [x] `.agents/skills/setup.sh` 실행 시 `harness-diagnostics` 및 `adr-skill` 스킬이 정해진 경로에 자동으로 설치된다.
- [x] `.gitignore` 파일에 `.agents/skills/harness-diagnostics` 및 `.agents/skills/adr-skill`이 포함되어 Git 변경사항에 잡히지 않는다.
- [x] `skills-lock.json` 파일에 설치된 스킬 정보(`source`, `computedHash` 등)가 바르게 생성되어 버전이 고정된다.

## Pros and Cons of the Options

### 옵션 1: `npx --yes skills` + `package.json postinstall` 훅 + `.agents/skills/setup.sh` 자동화

* **Good**: 개발자 수동 개입 제로, `skills-lock.json` 기반 무결성 및 버전 고정, `.gitignore` 관리로 저장소 청결 유지.
* **Bad**: `install` 수행 시 네트워크 처리 시간 추가.

### 옵션 2: 수동 설치 가이드 문서화 및 직접 CLI 실행

* **Good**: `yarn install` 수행 속도 최적화, 네트워크 의존성 분리.
* **Bad**: 신규 개발자 온보딩 시 수동 명령어 누락 가능성 높음, 팀원 간 스킬 버전 파편화 위험.

### 옵션 3: Submodule 또는 소스코드 직접 커밋

* **Good**: 오프라인 환경에서도 스킬 소스코드가 즉시 사용 가능.
* **Bad**: 서드파티 코드로 인한 저장소 용량 증대, Submodule 관리의 복잡성 증가.

## More Information

* 스킬 추가 또는 변경 시 `.agents/skills/setup.sh`에 명령어 세트를 추가한 후 `skills-lock.json`을 변경사항에 함께 커밋해야 합니다.
* 본 ADR은 생성 시점(2026-08-02) 기준으로 `accepted` 상태로 적용되었습니다.
