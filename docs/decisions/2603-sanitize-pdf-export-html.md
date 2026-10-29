---
status: accepted
date: 2026-10-29
decision-makers: '프로젝트 관리자 (채팅에서 의도 요약 승인)'
---

# 2603. PDF 내보내기 HTML을 허용 목록으로 정제하고 인쇄 스크립트를 차단한다

## Context and Problem Statement

`apps/notebook/src/features/pdf/exportPdf.ts`는 노트 또는 선택한 문단의 제목과 본문 HTML로 인쇄 문서를 만든다. 기존 구현은 제목을 `<title>`과 `<h1>`에 이스케이프 없이 삽입하고, 본문도 정제 없이 같은 출처의 iframe에 `document.write()`로 넣었다. 공격자가 제어한 값이 내보내기 함수에 전달되면 사용자의 PDF 내보내기 실행 시 삽입된 스크립트가 부모 문서를 변경할 수 있다.

또한 `packages/blacktokki-editor/src/lib/markdown.ts`의 코드 블록 렌더러는 Markdown의 언어 정보를 `class` 속성에 직접 삽입했다. Markdown의 원시 HTML 지원 여부와 별개로 이 속성에서 HTML 삽입이 가능했다. 가져오기부터 저장까지 공격자 입력이 전달되는 전체 경로는 이 결정에서 검증하지 않는다.

웹 브라우저와 Expo 모바일의 PDF 내보내기 모두 보호해야 하며, 기존 테마와 문서의 제목·표·목록·강조·코드·링크·이미지를 보존해야 한다. ADR-2505의 공통 Expo 실행 흐름과 패키지 소스 빌드 규칙을 따른다.

## Decision

1. 제목은 HTML 텍스트 문맥에 맞게 `&`, `<`, `>`, `"`, `'`를 이스케이프한 뒤 인쇄 HTML에 넣는다. 공유 대화상자의 제목은 원래 텍스트를 사용한다.
2. 본문 전체를 조합한 뒤, 출력 직전에 `sanitize-html`로 정제한다. 웹의 iframe과 모바일의 `Print.printToFileAsync()`에 동일하게 정제된 HTML을 전달한다. 저장된 노트나 Markdown 렌더러의 출력을 신뢰 경계로 취급하지 않는다.
3. 허용 태그·속성·URL 스킴을 `exportPdf.ts` 내부의 `sanitizePdfHtml()`에 명시한다. 문서 서식과 이미지, 안전한 링크는 허용하고 이벤트 속성, 사용자 CSS, 문서 메타데이터, 폼, 임베드 문서는 허용하지 않는다. `script`, `style`, `iframe`, `object`, `svg`, `math`, `template` 등은 내부 내용도 제거한다. 코드 클래스는 `language-` 접두사의 제한된 문자만 허용한다.
4. iframe을 부모 문서에 붙이기 전에 `sandbox="allow-same-origin allow-modals"`를 설정한다. 부모가 인쇄 문서에 접근하고 `print()`를 호출하는 데 필요한 권한만 허용하며 `allow-scripts`는 추가하지 않는다.
5. 인쇄 문서의 `<head>` 앞부분에 Content Security Policy(CSP)를 넣는다. 기본 리소스·스크립트·기준 URL 변경·폼 전송을 차단하고, 생성된 스타일과 문서 이미지에 필요한 리소스만 허용한다. CSP와 sandbox는 본문 정제를 보완한다.
6. Markdown 코드 블록의 언어 정보는 첫 토큰만 사용하고, `html`에서 `markup`으로의 기존 매핑을 유지한 뒤 HTML 속성에 맞게 이스케이프한다.

범위 밖: 노트 저장 형식 변경, 가져오기·저장 전체의 별도 보안 감사, PDF 테마 재설계, 모든 외부 이미지 요청 차단. 사용자의 요청에 따라 저장소에 테스트 코드를 추가하지 않고 임시 검증을 수행한다.

## Consequences

- 출력 경계에서 정제하므로 기존 저장 데이터를 일괄 변환할 필요가 없다. 기존 노트도 수정된 내보내기 경로의 보호를 받는다.
- 사용자 지정 HTML 스타일과 임베드 콘텐츠는 PDF에서 제거된다. 이 동작을 사용자 가이드에 설명하고 기본 서식이 유지되는지 확인한다.
- 정제 라이브러리와 전이 의존성이 번들에 추가된다. `yarn.lock`에 버전을 고정하고, 업데이트 시 허용 목록과 웹·모바일 호환성을 다시 확인한다.
- 허용한 HTTP(S) 이미지의 네트워크 로드는 유지된다. 외부 리소스 접근 정책을 바꿀 경우 별도 결정을 기록한다.

## Implementation Plan

- **Affected paths**:
  - `apps/notebook/src/features/pdf/exportPdf.ts`: 제목 이스케이프, PDF 전용 HTML 허용 목록과 본문 정제, CSP, iframe sandbox.
  - `packages/blacktokki-editor/src/lib/markdown.ts`: 코드 블록 언어 토큰 추출과 속성 이스케이프.
  - `apps/notebook/package.json`, `yarn.lock`: 의존성 선언과 잠금.
  - `apps/notebook/public/사용 방법.md`: PDF에서 유지·제외되는 콘텐츠 설명.
- **Dependencies**: Node.js 20.20.0 호환성을 위해 앱 런타임은 `sanitize-html@2.17.5`, 개발 시 타입 정의는 `@types/sanitize-html@2.16.1`로 고정한다. `sanitize-html@2.17.6`부터는 Node.js `>=22.12.0`이 필요하므로 버전 범위를 열지 않는다.
- **Patterns to follow**: 기존 `exportPdf()`의 문단 선택·테마·플랫폼 분기를 유지한다. 정제는 공통 HTML 생성 전에 한 번 적용한다. 패키지 빌드 출력은 직접 수정하지 않고 `yarn workspace @blacktokki/editor build`로 생성한다.
- **Patterns to avoid**: 정규식으로 HTML을 파싱하는 자체 필터, 이벤트 속성 또는 임의 CSS 허용, `allow-scripts`와 `allow-same-origin`의 동시 허용, CSP만으로 정제를 대체하는 구현.
- **Migration/configuration**: 데이터 마이그레이션, 환경 변수, 기능 플래그는 필요하지 않다. 의존성을 설치하고 기존 Expo 실행 흐름을 사용한다.

### Verification

- [x] 실제 소스를 컴파일한 임시 검증에서 제목 태그 탈출, 이벤트 속성, 위험 URL, 중첩 문서, Markdown 코드 언어의 HTML 삽입이 차단된다.
- [x] 정상 제목·표·목록·강조·코드·링크·이미지가 유지되고, 전체 노트와 선택 문단 및 세 테마에 동일한 정제가 적용된다.
- [x] 웹 iframe의 sandbox가 문서 삽입 전에 설정되고, 모바일 인쇄 함수도 정제된 HTML을 받는다.
- [x] 격리된 Chrome에서 삽입 스크립트가 부모 문서를 변경하지 못하며 부모의 인쇄 호출은 유지된다.
- [x] 변경 파일 lint와 관련 타입 확인, `yarn workspace @blacktokki/editor build` 결과를 확인한다.

## Alternatives Considered

- 본문 전체를 텍스트로 변환: 구현 범위는 작지만 표·링크·이미지 등 PDF의 문서 서식을 잃으므로 선택하지 않았다.
- 기존 HTML 파서로 직접 필터 구현: 새 정제 의존성을 줄일 수 있으나 URL 검증·인코딩·잘못된 HTML 처리까지 자체 유지보수해야 하므로 선택하지 않았다.
- 브라우저 DOM 기반 정제만 적용: 브라우저에서는 적합하지만 모바일의 DOM 없는 HTML 생성 경로에도 같은 정책이 필요하므로 순수 JavaScript 정제 라이브러리를 선택했다.
- iframe sandbox 또는 CSP만 적용: 실행 제한은 유용하지만 모바일 출력과 위험한 HTML·URL 자체의 제거를 함께 보장해야 하므로 단독 대책으로 선택하지 않았다.

## More Information

- 관련 결정: [ADR-2505](2505-expo-sdk-52-standardization.md).
- [sanitize-html 공식 문서](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html): 태그·속성·URL 허용 목록과 브라우저 번들 사용법.
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html): 출력 문맥에 맞는 인코딩과 HTML 정제.
- [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe): sandbox의 `allow-same-origin`, `allow-modals`, `allow-scripts` 권한.
- 재검토 조건: 정제 라이브러리 보안 공지, HTML 허용 목록 확장, PDF 렌더러·Expo 버전 또는 인쇄 iframe 권한 변경.
- 2026-10-29 검증: 실제 TypeScript 소스를 컴파일한 임시 실행에서 웹·모바일 분기 × 전체 노트·선택 문단 × 세 테마의 12가지 조합을 확인했다. 모바일은 `expo-print` 호출에 전달되는 HTML까지 확인했으며 실기기 PDF 생성은 확인하지 않았다. Metro 웹 번들로 실행한 격리된 Chrome에서 악성 제목·본문·Markdown의 부모 DOM 변경이 차단됐고, 실제 인쇄 호출과 `beforeprint` 이벤트가 각각 3회 정상 동작했다. 별도의 정제 우회 입력을 넣은 iframe에서도 sandbox가 스크립트를 차단했다. 이 브라우저 검증의 HTTP(S) 요청은 차단했으며 실제 사용자 데이터는 사용하지 않았다.
- 변경 파일 ESLint, 앱 전체 TypeScript 검사(`tsc --noEmit -p apps/notebook/tsconfig.json`), 편집기 패키지 빌드, 임시 검증용 Metro 웹·iOS 번들 컴파일이 통과했다. 테스트 코드는 저장소에 추가하지 않았다.
- 2026-10-30 호환성 조정: 초기의 `sanitize-html@^2.18.1` 및 `@types/sanitize-html@^2.16.2` 선언을 Node.js 20.20.0에서 설치 가능한 위 버전으로 고정했다. 사용자 요청에 따라 별도 `sanitizePdfHtml.ts` 파일은 만들지 않고 기존 `exportPdf.ts`에 같은 허용 목록을 합쳤다. 2.17.6 이후의 정제 라이브러리 보안 수정은 포함되지 않으므로 허용 목록을 확장할 때 최신 보안 공지와 Node.js 요구 버전을 함께 재검토한다.
- 2026-10-30 검증: Node.js 20.20.0에서 엔진 검사를 유지한 의존성 설치, 앱 전체 TypeScript 검사와 변경 파일 ESLint가 통과했다. 실제 `exportPdf.ts`를 컴파일한 임시 검사 24개에서 문서 서식 보존, 위험 HTML·URL 차단, 중첩 iframe 처리와 웹·모바일 호출 경로의 전체 노트·선택 문단 및 세 테마 조합을 확인했다. 플랫폼 인쇄 API와 iframe은 대체 객체로 검증했으며 실기기 PDF 생성이나 브라우저 실행을 재검증한 것은 아니다. 임시 테스트 코드는 저장소에 남기지 않았다.
