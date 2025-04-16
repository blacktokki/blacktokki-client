import { Editor, IAllProps } from '@tinymce/tinymce-react';
//@ts-ignore
import markdownIt from 'markdown-it';
import React from 'react';
// import { createRoot } from 'react-dom/client';
import { EditorEvent } from 'tinymce';
import TurndownService from 'turndown';

import { EditorProps } from '../types';

const markdownToHtml = markdownIt();
const HtmlToMarkdown = new TurndownService({
  preformattedCode: true,
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
});

// A function that renders markdown to HTML
const renderer = (markdownCode: string) => {
  return markdownToHtml.render(markdownCode);
};

// A function that converts HTML back to Markdown
export const parser = (htmlCode: string) => {
  return HtmlToMarkdown.turndown(htmlCode);
};

const INIT: IAllProps['init'] = {
  plugins: 'image link charmap advlist lists paste hr supercode', // textcolor imagetools,
  toolbar:
    'supercode | blocks | bold italic underline strikethrough | undo redo | alignleft aligncenter alignright | bullist numlist | hr link blockquote', // charmap removeformat
  setup: () => {},
};

const PATH = process.env.PUBLIC_URL + '/tinymce/tinymce.min.js';

// const CustomComponent = () => {
//   return (
//     <div style={{ padding: '10px', backgroundColor: '#f9f9f9' }}>
//       <h4>Custom React Component</h4>
//       <button onClick={() => alert('Button clicked!')}>Click Me</button>
//     </div>
//   );
// };

export const toRaw = (text: string) => {
  return text
    .replaceAll(/\n/g, '')
    .replaceAll(/<hr\s*[/]?>\n/gi, '')
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/<br\s*[/]?>/gi, '\r\n')
    .replaceAll(/<\/?[^>]*>/gi, '');
};

export default (
  props: EditorProps & {
    readonly?: boolean;
    onPress?: () => void;
    setValue: (v: string) => void;
    onLink?: (url: string) => void;
  }
) => {
  const customDiv = document.createElement('div');
  // const root = createRoot(customDiv);
  const bodyStyle: string[] = [];
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
        editor.mode.set(props.readonly ? 'readonly' : 'design');
        if (props.onPress) {
          let pressed = false;
          let moved = false;
          const onPress = props.onPress;
          const onStart = () => {
            pressed = true;
          };
          const onMove = () => {
            if (pressed) {
              moved = true;
            }
          };
          const onEnd = (e: EditorEvent<MouseEvent | TouchEvent>) => {
            pressed = false;
            if (moved) {
              moved = false;
            } else if (e.target.href) {
              if (props.onLink) {
                props.onLink(e.target.href);
              } else {
                window.open(e.target.href, '_blank');
              }
            } else {
              onPress();
            }
          };

          editor.on('mousedown', onStart);
          editor.on('touchstart', onStart);
          editor.on('mousemove', onMove);
          editor.on('touchmove', onMove);
          editor.on('mouseup', onEnd);
          editor.on('touchend', onEnd);
        }
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
        setup: INIT.setup,
        plugins:
          (props.readonly ? 'link' : INIT.plugins) + (props?.autoResize ? ' autoresize' : ''),
        toolbar: props.readonly ? '' : INIT.toolbar,
        height: '100%',
        skin: props.theme === 'light' ? 'oxide' : 'oxide-dark',
        content_css: props.theme === 'light' ? 'default' : 'dark',
        menubar: false,
        branding: false,
        statusbar: false,
        block_formats:
          'Paragraph=p; Heading 1=h1; Heading 2=h2; Heading 3=h3; Heading 4=h4; Heading 5=h5; Heading 6=h6; Preformatted=pre',
        content_style: bodyStyle.length > 0 ? `body { ${bodyStyle.join(';')} }` : undefined,
        autoresize_bottom_margin: 10,
        init_instance_callback: () => {
          document.querySelectorAll('.tox-tbtn').forEach((btn) => {
            if (btn.getAttribute('aria-label') === 'Source Code Editor (Ctrl + space)') {
              btn.setAttribute('data-mce-name', 'supercode');
            }
          });
        },
        supercode: {
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
