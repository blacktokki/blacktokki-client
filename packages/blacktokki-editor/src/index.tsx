export { default as Editor } from './components/Editor';
export { default as EditorViewer } from './components/EditorViewer';

let markdown: { parser: (htmlCode: string) => string };
import('./lib/markdown').then((value) => {
  markdown = value;
});

export const toMarkdown = (htmlCode: string) => {
  return markdown.parser(htmlCode);
};
