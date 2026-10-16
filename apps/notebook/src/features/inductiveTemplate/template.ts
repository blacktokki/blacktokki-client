import { SavedTemplate, TemplateNavigationParams } from './types';

/** Restored navigation state can contain an incomplete object despite the route's static type. */
export function validateTemplateNavigationParams(
  value: unknown
): value is TemplateNavigationParams {
  if (!value || typeof value !== 'object') return false;
  const { template, noteTitle } = value as TemplateNavigationParams;
  if (!template || typeof template !== 'object') return false;
  return (
    typeof template.name === 'string' &&
    !!template.name.trim() &&
    typeof template.markdown === 'string' &&
    !!template.markdown.trim() &&
    Array.isArray(template.sourceTitles) &&
    template.sourceTitles.every((title) => typeof title === 'string') &&
    (template.folderName === undefined || typeof template.folderName === 'string') &&
    (noteTitle === undefined || typeof noteTitle === 'string')
  );
}

export function templateScope(
  isLocal: boolean,
  userId: number | undefined,
  notebookId: number,
  isPrivate: boolean
): string {
  return `${isLocal ? 'local' : `user:${userId}`}:${notebookId}:${
    isPrivate ? 'private' : 'normal'
  }`;
}

export function templateVariables(markdown: string): string[] {
  return [
    ...new Set(
      [...markdown.matchAll(/\{\{\s*([^{}\n]{1,100}?)\s*\}\}/g)].map((match) => match[1].trim())
    ),
  ];
}

/** Substitution is a single pass, so variable values cannot introduce another substitution. */
export function fillTemplate(markdown: string, values: Record<string, string>): string {
  return markdown.replace(/\{\{\s*([^{}\n]{1,100}?)\s*\}\}/g, (match, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(values, name.trim())
      ? values[name.trim()]
      : undefined;
    return value === undefined || value === '' ? match : value;
  });
}

/** Live preview and saving use the same filled body; titles remain literal Markdown text. */
export function fillNoteTemplate(
  markdown: string,
  values: Record<string, string>,
  title?: string | null,
  tableFields: string[] = []
): string {
  const singleLine = new Set(tableFields);
  const filledValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      singleLine.has(key)
        ? value
            .replace(/\r?\n/g, '<br>')
            .replace(/\\*\|/g, (pipe) => (pipe.length % 2 ? '\\' + pipe : pipe))
        : value,
    ])
  );
  if (!title) return fillTemplate(markdown, filledValues);
  const name = title
    .split('/')
    .at(-1)!
    .replace(/([\\\x60*_{}[\]<>#|!])/g, '\\$1');
  return fillTemplate(markdown, { ...filledValues, title: name });
}

/** Reject ambiguous filesystem paths before invoking the ordinary notebook save pipeline. */
export function validNoteTitle(title: string): boolean {
  return !noteTitleIssue(title);
}

/** The form explains the same rule that blocks saving, using translatable message keys. */
export function noteTitleIssue(title: string): string | undefined {
  if (!title.trim()) return 'Enter a note title to save.';
  if (title.length > 240) return 'Use 240 characters or fewer for the note path.';
  if (/[\\<>:"|?*\u0000-\u001f]/.test(title))
    return 'Remove unsupported characters from the note name: \\ < > : " | ? *';
  const parts = title.split('/');
  if (parts.some((part) => !part)) return 'Remove empty folder names from the note path.';
  if (parts.some((part) => part !== part.trim()))
    return 'Remove spaces at the start or end of note and folder names.';
  if (parts.some((part) => ['.', '..'].includes(part)))
    return 'The note path cannot contain . or .. segments.';
  if (parts.some((part) => /\.$/.test(part)))
    return 'Note and folder names cannot end with a period.';
  if (parts.some((part) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    return 'Use a different note or folder name; this name is reserved.';
}

export function validateSavedTemplate(value: unknown): value is SavedTemplate {
  if (!value || typeof value !== 'object') return false;
  const item = value as SavedTemplate;
  return (
    typeof item.id === 'string' &&
    !!item.id &&
    typeof item.name === 'string' &&
    !!item.name.trim() &&
    item.name.length <= 120 &&
    typeof item.markdown === 'string' &&
    !!item.markdown.trim() &&
    item.markdown.length <= 500000 &&
    Array.isArray(item.sourceTitles) &&
    item.sourceTitles.every((title) => typeof title === 'string') &&
    typeof item.updatedAt === 'string'
  );
}

/** Portable templates carry no notebook IDs or source note bodies. */
export function exportTemplate(template: Pick<SavedTemplate, 'name' | 'markdown'>): string {
  return JSON.stringify({ version: 1, name: template.name, markdown: template.markdown }, null, 2);
}

export function importTemplate(json: string): { name: string; markdown: string } {
  if (json.length > 550000) throw new Error('Invalid template file.');
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Invalid template file.');
  }
  if (
    value?.version !== 1 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 120 ||
    typeof value.markdown !== 'string' ||
    !value.markdown.trim() ||
    value.markdown.length > 500000
  )
    throw new Error('Invalid template file.');
  return { name: value.name.trim(), markdown: value.markdown };
}
