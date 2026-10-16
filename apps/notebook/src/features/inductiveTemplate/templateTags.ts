import { TemplateCandidate } from './types';

/** Remove only the folder prefix added during discovery, preserving heading text and numbering. */
export function templateTagName(template: TemplateCandidate): string {
  const prefix = template.folderName && `${template.folderName} · `;
  return prefix && template.name.startsWith(prefix)
    ? template.name.slice(prefix.length)
    : template.name;
}

/** Existing notes require membership; unsaved notes can use a matching immediate source folder. */
export function templatesForNote(
  templates: TemplateCandidate[],
  title: string,
  noteExists: boolean | undefined,
  notebookRoots: string[] = []
): TemplateCandidate[] {
  if (!title) return [];
  const normalizedTitle = title.normalize('NFC');
  if (noteExists !== false) {
    return templates.filter((template) =>
      template.sourceTitles.some((source) => source.normalize('NFC') === normalizedTitle)
    );
  }
  const roots = new Set(notebookRoots.map((root) => root.normalize('NFC')));
  const parentPath = (source: string) => {
    const parts = source.normalize('NFC').split('/');
    if (parts.length > 1 && roots.has(parts[0])) parts.shift();
    return parts.slice(0, -1).join('/');
  };
  const parent = parentPath(normalizedTitle);
  if (!parent) return [];
  return templates.filter((template) =>
    template.sourceTitles.some((source) => parentPath(source) === parent)
  );
}
