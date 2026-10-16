export type ExampleNote = { title: string; description?: string };
export type TemplateStage = 'preview' | 'sources' | 'writing';

/** Only structural labels are retained; example body values are never stored here. */
export type TemplateBlock = {
  id: string;
  parentId?: string;
  kind: 'heading' | 'field' | 'table' | 'row' | 'list' | 'date';
  label: string;
  level?: number;
  columns?: string[];
  listType?: 'bullet' | 'number' | 'task';
  dateStyle?: 'plain' | 'bold';
  sources: string[];
};

export type TemplateDraft = {
  sourceTitles: string[];
  blocks: TemplateBlock[];
  /** A leading heading matching the source note name, kept separate from shared section IDs. */
  titleHeading?: { level: number; sources: string[] };
};
export type TemplateGroup = { title: string; notes: ExampleNote[] };
export type SavedTemplate = {
  id: string;
  name: string;
  markdown: string;
  sourceTitles: string[];
  updatedAt: string;
};

export type TemplateCandidate = Pick<SavedTemplate, 'name' | 'markdown' | 'sourceTitles'> & {
  /** Source folder added as a prefix to the catalog name; omitted from note tags. */
  folderName?: string;
};

/** A selected template opens its preview, source list and note-writing workspace. */
export type TemplateNavigationParams = {
  template: TemplateCandidate;
  /** Full path of the unsaved note, prefilled when opening its template tag. */
  noteTitle?: string;
};
