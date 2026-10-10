import { fillTemplate, templateVariables, validNoteTitle } from './template';
import { groupNoteTitles, TitleFolder } from './titleGrouping';
import { ExampleNote } from './types';

export type TitleTemplate = {
  id: string;
  path: string;
  pattern: string;
  variables: string[];
  sourceTitles: string[];
};

/** Each body template can offer several title patterns inferred from its current source notes. */
export function discoverTitleTemplates(
  notes: ExampleNote[],
  names?: Parameters<typeof groupNoteTitles>[1]
): TitleTemplate[] {
  const collect = (folder: TitleFolder): TitleTemplate[] => [
    ...folder.groups.flatMap((group) => {
      const variables = templateVariables(group.pattern);
      if (group.notes.length < 2 || !variables.length) return [];
      return [
        {
          id: group.id,
          path: folder.path,
          pattern: (folder.path ? folder.path + '/' : '') + group.pattern,
          variables,
          sourceTitles: group.notes.map((note) => note.title),
        },
      ];
    }),
    ...folder.folders.flatMap(collect),
  ];
  return collect(groupNoteTitles(notes, names));
}

/** Fill the note name only; its source folder remains literal and all title fields are required. */
export function titleFromTemplate(
  template: TitleTemplate,
  values: Record<string, string>
): string | null {
  if (
    template.variables.some(
      (key) =>
        !Object.prototype.hasOwnProperty.call(values, key) ||
        !values[key].trim() ||
        /[/\\]/.test(values[key]) ||
        templateVariables(values[key]).length > 0
    )
  )
    return null;
  const prefix = template.path ? template.path + '/' : '';
  const title = (prefix + fillTemplate(template.pattern.slice(prefix.length), values)).normalize(
    'NFC'
  );
  return validNoteTitle(title) ? title : null;
}
