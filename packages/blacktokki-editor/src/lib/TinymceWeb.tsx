import { Editor, IAllProps } from '@tinymce/tinymce-react';
import React from 'react';

import { AutoCompleteProps, EditorProps } from '../types';

// import { createRoot } from 'react-dom/client';

let markdown: {
  parser: (htmlCode: string) => string;
  renderer: (markdownCode: string) => string;
  toRaw: (text: string) => string;
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

const INIT: IAllProps['init'] = {
  plugins: 'image link advlist lists supercode codesample searchreplace autolink insertdatetime', // textcolor imagetools,
  toolbar:
    'supercode | blocks | bold italic underline strikethrough | undo redo | bullist numlist | hr link blockquote codesample searchreplace insertdatetime', // alignleft aligncenter alignright charmap removeformat
};

const PATH = process.env.PUBLIC_URL + '/tinymce/tinymce.min.js';
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
  return (
    <Editor
      tinymceScriptSrc={PATH}
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
      onEditorChange={props.setValue}
      init={{
        readonly: props.readonly,
        disabled: props.readonly,
        disable_nodechange: props.readonly,
        setup: () => {},
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
        ],
        content_style:
          (bodyStyle.length > 0 ? `body { ${bodyStyle.join(';')} }` : '') +
          'p { margin: 0.5rem 0; }',
        inline_boundaries: false,
        autoresize_bottom_margin: 10,
        paste_postprocess: (editor, args) => {
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
          document.querySelectorAll('.tox-tbtn').forEach((btn) => {
            if (btn.getAttribute('aria-label') === 'Source Code Editor (Ctrl + space)') {
              btn.setAttribute('data-mce-name', 'supercode');
              if (initMarkdown) {
                (btn as HTMLElement).click();
              }
            }
          });
          editor.on('ExecCommand', (e) => {
            if (!props.readonly && e.command === 'ToggleView' && e.value === 'supercode') {
              initMarkdown = !initMarkdown;
            }
          });
          if (props.autoComplete) {
            props.autoComplete.forEach((ac, index) => {
              const getMatchedChars = ac.getMatchedChars;
              editor.ui.registry.addAutocompleter('autoComplete-' + index, {
                trigger: ac.trigger,
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
          iconName: 'edit-block',
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
