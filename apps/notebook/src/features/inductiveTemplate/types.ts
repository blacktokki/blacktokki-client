export type ExampleNote = { title: string; description?: string };
export type ExtractionMode = 'current' | 'previous';

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

export type TemplateDraft = { sourceTitles: string[]; blocks: TemplateBlock[] };
export type TemplateGroup = { title: string; notes: ExampleNote[]; tableColumns?: string[] };
export type SavedTemplate = {
  id: string;
  name: string;
  markdown: string;
  sourceTitles: string[];
  updatedAt: string;
};

export type TemplateCandidate = Pick<SavedTemplate, 'name' | 'markdown' | 'sourceTitles'>;
