import { Editor, IAllProps } from '@tinymce/tinymce-react';
//@ts-ignore
import markdownIt from 'markdown-it';
import React from 'react';
// import { createRoot } from 'react-dom/client';
import TurndownService from 'turndown';

import { EditorProps } from '../types';

const INIT: IAllProps['init'] = {
  plugins: 'image link charmap advlist lists paste hr supercode codesample searchreplace', // textcolor imagetools,
  toolbar:
    'supercode | blocks | bold italic underline strikethrough | undo redo | alignleft aligncenter alignright | bullist numlist | hr link blockquote codesample searchreplace', // charmap removeformat
};

const markdownToHtml = markdownIt();
const HtmlToMarkdown = new TurndownService({
  preformattedCode: true,
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
});

//@ts-ignore
markdownToHtml.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const code = token.content;
  let language = token.info || '';
  if (language === 'html') {
    language = 'markup';
  }
  let escapeCode: string = markdownToHtml.utils.escapeHtml(code);
  if (escapeCode.endsWith('\n')) {
    escapeCode = escapeCode.slice(0, escapeCode.length - 1);
  }
  // Create custom HTML for code blocks
  return `<pre class="language-${language}"><code>${escapeCode}</code></pre>`;
};

HtmlToMarkdown.addRule('codeBlock', {
  filter(node, options) {
    // Determine if this node should be treated as a code block
    // For example, looking for <pre><code> combinations
    return (
      node.nodeName === 'PRE' && node.firstChild !== null && node.firstChild.nodeName === 'CODE'
    );
  },
  replacement(content, node, options) {
    // Get the language if specified (often in a class attribute)
    const language = (node as HTMLElement).getAttribute('class') || '';
    const languageMatch = language.match(/language-(\S+)/);
    let languageSpec = languageMatch ? languageMatch[1] : '';
    if (languageSpec === 'markup') {
      languageSpec = 'html';
    }
    if (languageSpec === 'none') {
      languageSpec = '';
    }
    // Get the code content and trim whitespace
    const code = (node.firstChild as HTMLElement).textContent || '';
    // Format as a code block with your preferred style
    // This example uses GitHub-style code fences with language specification
    return '\n\n```' + languageSpec + '\n' + code + '\n```\n\n';
  },
});

// A function that renders markdown to HTML
const renderer = (markdownCode: string) => {
  return markdownToHtml.render(markdownCode);
};

// A function that converts HTML back to Markdown
export const parser = (htmlCode: string) => {
  return HtmlToMarkdown.turndown(htmlCode);
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

export const toRaw = (text: string) => {
  return markdownToHtml.utils.escapeHtml(text);
  // return text
  //   .replaceAll(/\n/g, '')
  //   .replaceAll(/<hr\s*[/]?>\n/gi, '')
  //   .replaceAll(/&nbsp;/gi, ' ')
  //   .replaceAll(/<br\s*[/]?>/gi, '\r\n')
  //   .replaceAll(/<\/?[^>]*>/gi, '');
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
          (props.readonly ? 'link' : INIT.plugins) + (props?.autoResize ? ' autoresize' : ''),
        toolbar: props.readonly ? '' : INIT.toolbar,
        toolbar_mode: 'sliding',
        height: '100%',
        skin: props.theme === 'light' ? 'oxide' : 'oxide-dark',
        content_css: props.theme === 'light' ? 'default' : 'dark',
        menubar: false,
        branding: false,
        statusbar: false,
        block_formats:
          'Paragraph=p; Heading 1=h1; Heading 2=h2; Heading 3=h3; Heading 4=h4; Heading 5=h5; Heading 6=h6;',
        content_style: bodyStyle.length > 0 ? `body { ${bodyStyle.join(';')} }` : undefined,
        inline_boundaries: false,
        autoresize_bottom_margin: 10,
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
