import { inferTemplate, renderTemplate, suggestTemplateGroups, withAncestors } from './inference';
import { groupNotePaths, TitleFolder } from './titleGrouping';
import { ExampleNote, ExtractionMode, TemplateCandidate } from './types';

const folderSources = (folder: TitleFolder): string[] => [
  ...folder.groups.flatMap((group) => group.notes.map((note) => note.title)),
  ...folder.folders.flatMap(folderSources),
];

/** Split supported top-level source groups together, retaining the whole candidate if any lacks examples. */
function splitTemplatePaths(
  template: TemplateCandidate,
  notebookRoots: string[]
): TemplateCandidate[] {
  const tree = groupNotePaths(
    template.sourceTitles.map((title) => ({ title })),
    notebookRoots
  );
  if (!tree.folders.length) return [template];
  const nameFor = (folder: TitleFolder) =>
    folder.name === template.name ? template.name : `${folder.name} · ${template.name}`;
  if (tree.folders.length === 1) return [{ ...template, name: nameFor(tree.folders[0]) }];
  const rootTitles = new Set(tree.groups.flatMap((group) => group.notes.map((note) => note.title)));
  if (tree.folders.some((folder) => folder.count < 2) || rootTitles.size === 1) return [template];
  const split = tree.folders.map((folder) => {
    const titles = new Set(folderSources(folder));
    return {
      ...template,
      sourceTitles: template.sourceTitles.filter((title) => titles.has(title)),
    };
  });
  if (rootTitles.size)
    split.push({
      ...template,
      sourceTitles: template.sourceTitles.filter((title) => rootTitles.has(title)),
    });
  return split;
}

/** Finding similar notes produces ready-to-use templates without manual example selection. */
export function discoverTemplates(
  notes: ExampleNote[],
  dateLabel = 'Date',
  notebookRoots: string[] = [],
  mode: ExtractionMode = 'current'
): TemplateCandidate[] {
  const templates = new Map<string, TemplateCandidate>();
  const unique = [...new Map(notes.map((note) => [note.title.normalize('NFC'), note])).values()];
  for (const group of suggestTemplateGroups(unique, mode)) {
    const draft = inferTemplate(group.notes, group.tableColumns, mode);
    // Use the whole group. Occasional sections should not crowd a reusable template.
    const minimum = Math.max(2, Math.ceil(draft.sourceTitles.length * 0.6));
    const ids = withAncestors(
      draft,
      draft.blocks.filter((block) => block.sources.length >= minimum).map((block) => block.id)
    );
    if (!ids.length) continue;
    const markdown = renderTemplate(draft, ids, dateLabel);
    const existing = templates.get(markdown);
    if (existing) {
      existing.sourceTitles = [...new Set([...existing.sourceTitles, ...draft.sourceTitles])];
    } else {
      templates.set(markdown, {
        name: group.title.slice(0, 110),
        markdown,
        sourceTitles: draft.sourceTitles,
      });
    }
  }
  const names = new Map<string, number>();
  return [...templates.values()]
    .flatMap((template) => splitTemplatePaths(template, notebookRoots))
    .map((template) => {
      const count = (names.get(template.name) || 0) + 1;
      names.set(template.name, count);
      return { ...template, name: count > 1 ? `${template.name} (${count})` : template.name };
    });
}

/** Resolve source titles against the current scoped query, so removed or hidden notes stay absent. */
export function templateNotes(template: TemplateCandidate, notes: ExampleNote[]): ExampleNote[] {
  const titles = new Set(template.sourceTitles.map((title) => title.normalize('NFC')));
  const related = new Map<string, ExampleNote>();
  for (const note of notes) {
    const title = note.title.normalize('NFC');
    if (titles.has(title) && !related.has(title)) related.set(title, note);
  }
  return [...related.values()];
}
