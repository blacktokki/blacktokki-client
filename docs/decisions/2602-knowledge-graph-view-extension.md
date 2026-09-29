---
status: accepted
date: 2026-09-17
decision-makers: '@blacktokki'
---

# 2602. 지식 그래프 뷰 확장 기능 아키텍처

## Context and Problem Statement

노트와 보드가 늘어나면 문서 계층, 카드·문단, 내부 참조와 외부 링크의 관계를 한눈에 파악하기 어렵습니다. 기존 저장 형식을 바꾸지 않고 현재 모드의 데이터를 탐색하고 검증할 화면이 필요합니다.

## Decision

`apps/notebook`은 `knowledgeGraph` 확장에서 현재 모드의 노트·보드를 읽어 그래프를 구성합니다.

1. **노드와 관계**
   - 기본 노트·외부 링크 분류와 보드별 분류를 표시합니다. 노트·보드 문단·카드·일반 문단·외부 링크는 각각 개별 노드입니다.
   - 노트 경로와 문단 계층의 포함 관계, 내부 참조, 외부 링크 및 분류 소속 관계를 구분합니다. 카드 헤더는 카드 노드 하나로 표현하고, 같은 보드에서 이름이 같은 보드 문단은 출처를 보존하면서 하나로 합칩니다.
   - 본문이 없는 노트는 제외합니다. 내용이 있는 노트가 직접 참조하거나 바로 위 경로에 사용하는 기존 빈 노트는 구조를 잇는 노드로 유지합니다.
2. **화면과 검증**
   - HTML5 2D Canvas와 포스 시뮬레이션으로 그래프를 그립니다. 노드 선택 시 `1`, `2`, `전체` 범위의 관계를 탐색합니다. 일반 문단과 일반 외부 링크의 표시를 각각 전환할 수 있습니다.
   - 참조 무결성과 고립 노드를 현재 애플리케이션 규칙으로 검사하고, 영향을 받은 노드를 화면에서 찾을 수 있게 합니다. 노트의 YAML frontmatter 값은 상세 시트의 메타데이터 칩으로 표시합니다.
   - ADR 2504의 확장 등록 규격을 따라 `features['knowledgeGraph']`에 연결하고 한국어 `사용 방법.md`와 영어 `Usage.md`를 함께 유지합니다.

## Consequences

- Good: 저장 형식 마이그레이션 없이 문서 구조와 참조를 탐색할 수 있습니다.
- Tradeoff: 큰 그래프의 렌더링과 레이아웃 비용을 관리해야 하므로 인접 목록, Canvas 렌더링 및 포스 시뮬레이션의 성능 검증을 유지합니다.

## Implementation

- **Data construction**: `useKnowledgeGraphData.ts`에서 현재 모드의 노트·보드를 읽고 관계를 구성합니다. `utils/axioms.ts`에서 검증을 계산합니다.
- **Presentation**: `KnowledgeGraphView.tsx`와 `canvasRenderer.ts`는 화면에 표시할 노드·관계를 처리하고, `KnowledgeGraphPreviewSheet.tsx`는 상세정보와 원본 노트 탐색을 제공합니다.
- **Documentation**: `apps/notebook/public/사용 방법.md`와 `apps/notebook/public/Usage.md`에 진입, 탐색, 보기 옵션 및 빈 노트 처리 규칙을 기록합니다.

## Verification

- [x] `yarn workspace @blacktokki/notebook test:knowledgeGraph` 회귀 테스트 64개 통과
- [x] `node node_modules/typescript/bin/tsc --noEmit --project apps/notebook/tsconfig.json` 타입 검사 통과
- [x] 변경한 앱 소스의 ESLint 검사 및 `git diff --check` 통과

## Alternatives Considered

- 단순 하이퍼링크 그래프: 보드·카드·문단 구조를 표현하지 못합니다.
- 모든 노드를 SVG 요소로 렌더링: 노드·관계가 많아질수록 DOM 부담이 커져 Canvas를 선택했습니다.

## More Information

### 2026-09-29: 같은 노드 쌍의 관계명 레이블 분리

같은 두 노드 사이에 유형이 다른 관계가 여러 개 있으면 중점에 그린 관계명 레이블이 완전히 겹칩니다. `canvasRenderer.ts`는 표시할 레이블을 연결 방향과 무관하게 노드 쌍별로 묶고 관계 ID 순서로 정렬한 뒤, 각 레이블을 두 노드의 중점에서 세로 18px 간격으로 배치합니다. 레이블 박스 높이가 13px이므로 인접 박스 사이에는 5px 간격이 남습니다. 관계가 하나뿐이면 중점에 그대로 표시합니다.

구현 위치는 `apps/notebook/src/features/knowledgeGraph/utils/canvasRenderer.ts`이며, `apps/notebook/src/features/knowledgeGraph/__tests__/knowledge-graph-canvas.test.cjs`에서 정방향·역방향 관계, 가로·세로 노드 쌍, 단일 관계를 검증합니다. 그래프 회귀 테스트 66개와 TypeScript 검사가 통과했습니다.

## Related Decisions

- [2504-plugin-extension-architecture.md](2504-plugin-extension-architecture.md)
- [2507-tag-based-kanban-scrum-board.md](2507-tag-based-kanban-scrum-board.md)
