import { SavedTemplate } from './types';

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

/** Reject ambiguous filesystem paths before invoking the ordinary notebook save pipeline. */
export function validNoteTitle(title: string): boolean {
  return (
    !!title.trim() &&
    title === title.trim() &&
    title.length <= 240 &&
    !/[\\<>:"|?*\u0000-\u001f]/.test(title) &&
    title
      .split('/')
      .every(
        (part) =>
          !!part &&
          part === part.trim() &&
          !['.', '..'].includes(part) &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
      )
  );
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
