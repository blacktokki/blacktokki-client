import { Editor, IAllProps } from '@tinymce/tinymce-react';
import React from 'react';
// import { createRoot } from 'react-dom/client';
import { EditorEvent } from 'tinymce';

import { EditorProps } from '../types';

const INIT: IAllProps['init'] = {
  plugins: 'image link charmap advlist lists paste hr noneditable', //autoresize textcolor imagetools,
  toolbar:
    'fontsizeselect | bold italic underline strikethrough | undo redo | alignleft aligncenter alignright | bullist numlist | hr link', // charmap removeformat
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

export default (props: EditorProps & { readonly?: boolean; onPress?: () => void }) => {
  const customDiv = document.createElement('div');
  // const root = createRoot(customDiv);
  return (
    <Editor
      tinymceScriptSrc={PATH}
      onInit={(_e, editor) => {
        props.onReady?.();
        (editor as any).setMode(props.readonly ? 'readonly' : 'design');
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
              window.open(e.target.href, '_blank');
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
        const editorContainer = document.querySelector('.tox-editor-container');
        const toolbar = document.querySelector('.tox-editor-header');
        if (editorContainer && toolbar) {
          // Insert customDiv after the toolbar
          toolbar.parentNode?.insertBefore(customDiv, toolbar.nextSibling);
          // root.render(<></>);
          editor.on('remove', () => {});
        }
      }}
      onEditorChange={props.setValue}
      init={{
        readonly: props.readonly,
        disabled: props.readonly,
        disable_nodechange: props.readonly,
        setup: INIT.setup,
        plugins: props.readonly ? 'link' : INIT.plugins,
        toolbar: props.readonly ? '' : INIT.toolbar,
        height: '100%',
        skin: props.theme === 'light' ? 'oxide' : 'oxide-dark',
        content_css: props.theme === 'light' ? 'default' : 'dark',
        menubar: false,
        branding: false,
        statusbar: false,
        block_formats: '제목1=h2;제목2=h3;제목3=h4;본문=p;',
        fontsize_formats: '8pt 10pt 12pt 14pt 16pt 18pt 24pt',
        forced_root_block_attrs: { style: 'font-size: 14pt' },
        content_style: props.readonly ? 'body { caret-color: transparent; }' : undefined,
      }}
      value={props.value}
    />
  );
};
