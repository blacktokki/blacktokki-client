import { Editor, IAllProps } from '@tinymce/tinymce-react';
import React from 'react';

import { AutoCompleteProps, EditorProps } from '../types';

// import { createRoot } from 'react-dom/client';

let markdown: {
  parser: (htmlCode: string) => string;
  renderer: (markdownCode: string) => string;
  toRaw: (text: string) => string;
  exportMarkdowns: (
    contents: { title: string; description?: string }[],
    filename: string
  ) => Promise<void>;
  importMarkdowns: () => Promise<{ title: string; description: string }[]>;
};
import('./markdown').then((value) => {
  markdown = value;
});

export const parser = (htmlCode: string) => {
  return markdown.parser(htmlCode);
};

export const renderer = (markdownCode: string) => {
  return markdown.renderer(markdownCode);
};

export const toRaw = (text: string) => {
  return markdown.toRaw(text);
};

export const markdownFs = () => ({
  export: markdown.exportMarkdowns,
  import: markdown.importMarkdowns,
});

export const cleanId = (text: string) =>
  text
    .trim()
    .toLowerCase() // 1. 소문자로 전환
    .replace(/[()]/g, '') // 2. 소괄호 제거
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, '') // 3. 이모지 완벽 제거 (ES2018 정규식)
    .replace(/\s+/g, '-'); // 4. 공백을 하이픈으로 치환

const INIT: IAllProps['init'] = {
  plugins: 'image link advlist lists supercode codesample searchreplace autolink insertdatetime', // textcolor imagetools,
  toolbar:
    'blocks | bold italic underline strikethrough | undo redo | searchreplace | bullist numlist | hr link blockquote codesample insertdatetime supercode', // alignleft aligncenter alignright charmap removeformat
};

let initMarkdown = false;

// const CustomComponent = () => {
//   return (
//     <div style={{ padding: '10px', backgroundColor: '#f9f9f9' }}>
//       <h4>Custom React Component</h4>
//       <button onClick={() => alert('Button clicked!')}>Click Me</button>
//     </div>
//   );
// };

export default (
  props: EditorProps &
    AutoCompleteProps & {
      readonly?: boolean;
      onReady: () => void;
      onPress?: () => void;
      setValue: (v: string) => void;
      onLink?: (url: string) => void;
    }
) => {
  const customDiv = document.createElement('div');
  // const root = createRoot(customDiv);
  const bodyStyle: string[] = ['line-height: 1.75'];
  if (props.readonly) {
    bodyStyle.push('caret-color: transparent');
  }
  if (props.theme === 'dark') {
    bodyStyle.push('background-color: #1E1E1E');
  }
  const path = process.env.PUBLIC_URL + '/tinymce/tinymce.min.js';
  const dotDateFormat = new Date()
    .toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
    .replace(/\s/g, ' ');
  const composingRef = React.useRef(false);
  const completeRef = React.useRef<{ complete: () => void; timeout: NodeJS.Timeout }>(undefined);
  return (
    <Editor
      tinymceScriptSrc={path}
      onInit={(_e, editor) => {
        props.onReady?.();
        const toolbar = editor.getContainer().firstChild?.firstChild as HTMLElement;
        if (toolbar) {
          // Insert customDiv after the toolbar
          toolbar.parentNode?.insertBefore(customDiv, toolbar.nextSibling);
          // root.render(<></>);
          editor.on('remove', () => {});
        }
        if (props.readonly) {
          editor.getContainer().style.borderWidth = '0px';
          if (toolbar) {
            toolbar.style.backgroundColor = 'transparent';
            toolbar.style.borderBottomWidth = '0px';
          }
        }
      }}
      onEditorChange={(v) => {
        props.setValue(v);
        if (completeRef.current) {
          clearTimeout(completeRef.current.timeout);
          completeRef.current.timeout = setTimeout(() => completeRef.current?.complete?.(), 1000);
        }
      }}
      readonly={props.readonly}
      disabled={props.readonly}
      init={{
        disable_nodechange: props.readonly,
        setup: (editor) => {
          editor.ui.registry.addIcon(
            'markdown',
            `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M2,17V7h2.5L8,11.5L11.5,7H14v10h-2.2V9.5L8,14L4.2,9.5V17H2z M19,7v7h-2.5l3.5,4l3.5-4H21V7H19z" />
          </svg>
          `
          );
        },
        plugins:
          (props.readonly ? 'link codesample' : INIT.plugins) +
          (props?.autoResize ? ' autoresize' : ''),
        toolbar: props.readonly ? '' : INIT.toolbar,
        toolbar_mode: 'sliding',
        height: '100%',
        skin: props.theme === 'light' ? 'oxide' : 'oxide-dark',
        content_css: props.theme === 'light' ? 'default' : 'dark',
        menubar: false,
        branding: false,
        statusbar: false,
        formats: {
          underline: [{ inline: 'u', remove: 'all' }],
        },
        block_formats:
          'Paragraph=p; Heading 1=h1; Heading 2=h2; Heading 3=h3; Heading 4=h4; Heading 5=h5; Heading 6=h6; Code=code',
        insertdatetime_formats: [
          '%Y-%m',
          '%Y-%m-%d',
          new Date().toISOString().split('T')[0] + '/%Y-%m-%d',
          '%m/%d',
          new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ~ %m/%d',
          '%Y/%m/%d',
          new Date().toISOString().split('T')[0].replaceAll('-', '/') + ' ~ %Y/%m/%d',
          dotDateFormat,
          dotDateFormat + '~' + dotDateFormat,
        ],
        content_style:
          (bodyStyle.length > 0 ? `body { ${bodyStyle.join(';')} }` : '') +
          'p { margin: 0.5rem 0; }',
        inline_boundaries: false,
        autoresize_bottom_margin: 10,
        paste_postprocess: (editor, args) => {
          const replace = props.pasteAutocomplete?.(args.node.innerText);
          if (replace) {
            args.node.innerHTML = args.node.innerHTML.replace(args.node.innerText, replace);
            return;
          }
          props.autoComplete?.forEach((v) => {
            if (args.node.innerText.startsWith(v.trigger)) {
              editor.fire('keypress');
              args.node.innerHTML += ' ';
              setTimeout(() => {
                editor.undoManager.transact(() => {
                  editor.selection.setRng(editor.selection.getRng());
                  editor.execCommand('Delete');
                });
              }, 0);
            }
          });
        },
        init_instance_callback: (editor) => {
          editor.mode.set(props.readonly ? 'readonly' : 'design');
          if (props.onPress) {
            const onPress = props.onPress;
            const onClick = (e: Event) => {
              const anchor = (e.target as HTMLElement).closest('a');
              if (anchor && props.onLink) {
                if (props.onLink) {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onLink(anchor.href);
                }
              } else {
                e.preventDefault();
                e.stopPropagation();
                onPress();
              }
            };
            editor.getWin().addEventListener('click', onClick, { capture: true });
          }
          const onInitMarkdown = () =>
            setTimeout(() => {
              const container = editor.getContainer();
              const overflows = container.querySelectorAll('.tox-toolbar__overflow');

              overflows.forEach((overflowDiv) => {
                if (overflowDiv.classList.contains('tox-toolbar__overflow--closed')) {
                  overflowDiv.classList.remove(
                    'tox-toolbar__overflow--closed',
                    'tox-toolbar__overflow--shrinking'
                  );
                  overflowDiv.classList.add('tox-toolbar__overflow--open');
                  (overflowDiv as any).style.setProperty('height', 'auto', 'important');
                }
              });
            }, 0);

          document.querySelectorAll('.tox-tbtn').forEach((btn) => {
            const ariaLabel = 'Markdown Editor (Ctrl + space)';
            if (
              btn.getAttribute('aria-label') === 'Source Code Editor (Ctrl + space)' ||
              btn.getAttribute('aria-label') === ariaLabel
            ) {
              btn.setAttribute('data-mce-name', 'supercode');
              btn.setAttribute('aria-label', ariaLabel);
              if (initMarkdown) {
                (btn as HTMLElement).click();
                onInitMarkdown();
              }
            }
          });
          editor.on('NodeChange', () => {
            try {
              // 에디터 내의 모든 H1 ~ H6 요소를 가져옵니다.
              const headings = editor.dom.select('h1, h2, h3, h4, h5, h6');

              headings.forEach((heading) => {
                // [버그 수정] innerText 대신 textContent를 사용합니다.
                // 미완성된 HTML 상태에서도 DOM 트리의 텍스트를 안전하게 읽어옵니다.
                const text = heading.textContent || '';

                if (text.trim()) {
                  // [추가된 요구사항] ID 변환 규칙 적용
                  const id = cleanId(text);

                  // 기존 ID와 다를 경우에만 속성을 업데이트
                  if (heading.getAttribute('id') !== id) {
                    editor.dom.setAttrib(heading, 'id', id);
                  }
                }
                // [버그 수정] else 블록(텍스트가 없을 때 id를 null로 세팅하는 로직) 제거
                // HTML 파싱 중이거나 일시적으로 텍스트가 비어있을 때 모든 ID가 날아가는 현상을 방지합니다.
              });
            } catch (e) {
              console.warn('TinyMCE 헤더 ID 자동 생성 중 오류 발생:', e);
            }
          });
          editor.on('ExecCommand', (e) => {
            if (!props.readonly && e.command === 'ToggleView' && e.value === 'supercode') {
              initMarkdown = !initMarkdown;
              if (initMarkdown) {
                onInitMarkdown();
              }
            }
          });
          editor.on('compositionstart', () => {
            composingRef.current = true;
          });
          editor.on('compositionend', () => {
            composingRef.current = false;
            if (completeRef.current) {
              clearTimeout(completeRef.current.timeout);
              completeRef.current = undefined;
            }
          });
          if (props.autoComplete) {
            props.autoComplete.forEach((ac, index) => {
              const getMatchedChars = ac.getMatchedChars;
              editor.ui.registry.addAutocompleter('autoComplete-' + index, {
                trigger: ac.trigger,
                matches: (range, text, pattern) => {
                  // IME 입력 중이면 false를 반환해 UI 활성화를 원천 차단
                  if (composingRef.current && pattern.length === 2) {
                    const complete = () => {
                      const tempInput = document.createElement('input');
                      tempInput.style.position = 'fixed';
                      tempInput.style.opacity = '0';
                      document.body.appendChild(tempInput);

                      tempInput.focus(); // 포커스를 외부로 완전히 빼냄 (IME 종료)

                      setTimeout(() => {
                        editor.focus(); // 다시 에디터로 포커스 복귀
                        document.body.removeChild(tempInput);
                        completeRef.current = undefined;
                      }, 0);
                    };
                    completeRef.current = {
                      complete,
                      timeout: setTimeout(() => complete?.(), 1000),
                    };
                    return false;
                  }
                  return true;
                },
                fetch: (pattern) => {
                  return new Promise((resolve) => {
                    getMatchedChars(pattern).then((items) => {
                      const results = items.map((item) => ({
                        type: 'autocompleteitem' as any,
                        ...item,
                      }));
                      resolve(results);
                    });
                  });
                },
                onAction: (autocompleteApi, rng, value) => {
                  editor.selection.setRng(rng);
                  editor.insertContent(value);
                  autocompleteApi.hide();
                },
              });
            });
          }
        },
        codesample_languages: [
          { text: '-', value: 'none' },
          { text: 'HTML/XML', value: 'markup' },
          { text: 'JavaScript', value: 'javascript' },
          // { text: 'TypeScript', value: 'typescript' },
          { text: 'CSS', value: 'css' },
          { text: 'PHP', value: 'php' },
          { text: 'Ruby', value: 'ruby' },
          { text: 'Python', value: 'python' },
          { text: 'Java', value: 'java' },
          { text: 'C', value: 'c' },
          { text: 'C#', value: 'csharp' },
          { text: 'C++', value: 'cpp' },
        ],
        supercode: {
          iconName: 'markdown',
          theme: props.theme === 'light' ? 'chrome' : 'ambiance',
          dark: props.theme === 'dark',
          renderer, // Function : Markdown => HTML
          parser, // Function: HTML => Markdown
          language: 'markdown', // Uses 'markdown' language for code highlighting and autocomplete
        },
      }}
      value={props.value}
    />
  );
};
