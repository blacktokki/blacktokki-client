# 🐇 Blacktokki Notebook

**Blacktokki Notebook**은 마크다운 기반의 노트 및 타임라인 중심 지식 관리 앱입니다. 모바일과 웹 모두에서 동작하며, 구조화된 문서, 일정 자동 추적, 아카이브, 문단 이동 등 생산성을 높이기 위한 기능을 제공합니다.

<!-- !\[홈화면 스크린샷 예시] -->

---

## 📁 프로젝트 구조

```bash
apps/notebook/
├── screens/                # 주요 화면 컴포넌트 (Note, Edit, Timeline 등)
├── components/             # 재사용 UI 구성요소 (SearchBar, TimerTag 등)
├── hooks/                  # React Query 기반 데이터 훅
├── services/               # API 연동 서비스
├── styles/                 # 공통 스타일 정의
├── types/                  # 타입 선언
├── modals/                 # 날짜 선택기 등 모달 컴포넌트
├── package.json            # Expo 및 의존성 설정
└── ...
```

---

## 🚀 빠른 시작

### 요구 사항

* Node.js ≥ 16
* Yarn ≥ 1.22
* Expo CLI (`npm install -g expo-cli`)

### 설치

```bash
git clone https://github.com/blacktokki/blacktokki-notebook.git
yarn
yarn build
```

### 실행

```bash
yarn workspace @blacktokki/notebook yarn web           # 웹 브라우저 실행 (React Native Web)
```

---

## 🌐 웹 앱 배포

```bash
yarn workspace @blacktokki/notebook yarn github # → 정적 파일 빌드 → SEO 텍스트 치환 → GitHub Pages 업로드
```

* 배포 주소: [https://blacktokki.github.io/blacktokki-notebook](https://blacktokki.github.io/blacktokki-notebook)

---

## 📦 주요 의존성

| 패키지                        | 설명                      |
| -------------------------- | ----------------------- |
| `@blacktokki/core`         | 테마, 다국어, 유틸리티 등 핵심 모듈   |
| `@blacktokki/editor`       | 마크다운 기반 커스텀 에디터         |
| `@blacktokki/navigation`   | 크로스 플랫폼 내비게이션 설정        |
---

## 🧩 주요 화면/기능

| 파일명                       | 설명                       |
| ------------------------- | ------------------------ |
| `NotePageScreen.tsx`      | 문서 보기 및 문단 탐색            |
| `EditPageScreen.tsx`      | 마크다운 편집기                 |
| `MovePageScreen.tsx`      | 문단 이동 기능                 |
| `TimeLineScreen.tsx`      | 날짜 기반 노트 필터링             |
| `RecentPageScreen.tsx`    | 최근 수정 노트                 |
| `ProblemScreen.tsx`       | 작성이 필요한 문서 목록            |
| `HomeScreen.tsx`          | 탭 뷰 홈: 탐색 / 최근 변경 / 설정   |
| `ExtraConfigSections.tsx` | 계정 설정, 내보내기/가져오기 등 환경 설정 |
| `ContentGroupSection.tsx` | 최근 열람/문제 노트 목록 구성        |
| `DateHeaderSection.tsx`   | 타임라인 날짜 탐색 UI            |

---

## 🧪 개발 도구 및 기타 스크립트

| 스크립트 명          | 설명                              |
| --------------- | ------------------------------- |
| `yarn analyzer` | 웹 빌드 + 번들 분석기 실행                |
| `yarn pwa`      | PWA 설정 자동 적용 (expo-pwa 사용)      |
| `yarn build`    | `@blacktokki/editor` 포함 웹 빌드 수행 |

---

## 🖥️ 웹 및 모바일 차이점

| 기능/구성요소     | 모바일                            | 웹                                    |
| ----------- | ------------------------------ | ------------------------------------ |
| 홈 내비게이션     | 하단 탭(TabView)                  | 좌측 Drawer 메뉴 (`ContentGroupSection`) |
| 스크롤 영역      | ScrollView                     | Flex 기반 그리드 + 스크롤                    |
| 드래그 지원      | `@dnd-kit` (모바일 대응 X)          | `react-dnd` 기반 마우스 조작 가능             |
| 검색창 위치      | 상단 고정                          | 홈 헤더 영역 내 렌더링                        |
| 모달 / 날짜 선택기 | 전체화면 모달 방식 (`DatePickerModal`) | 중간 뷰에 오버레이 형태                        |

---

## 🧩 ESLint & 코드 스타일

```json
"eslintConfig": {
  "extends": "@blacktokki/eslint-config"
}
```

커스텀 ESLint 설정은 공통 룰셋을 기반으로 합니다.
