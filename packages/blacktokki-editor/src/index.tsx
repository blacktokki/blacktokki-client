import { exportMarkdowns, importMarkdowns } from './lib/markdown';

export { default as Editor } from './components/Editor';
export { default as EditorViewer } from './components/EditorViewer';
export { renderer as toHtml, parser as toMarkdown } from './lib/markdown';
export * from './lib/dom';

export type FsData = {
  contents: { title: string; description?: string }[];
  jsons: { title: string; data: any }[];
};

export const markdownFs = () => ({
  export: (data: FsData, filename: string) => exportMarkdowns(data.contents, data.jsons, filename),
  import: importMarkdowns,
});
