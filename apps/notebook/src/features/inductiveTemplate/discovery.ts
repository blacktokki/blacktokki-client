import {
  extractStructure,
  inferTemplate,
  renderTemplate,
  suggestTemplateGroups,
  withAncestors,
} from './inference';
import { groupNotePaths, groupNoteTitles, TitleFolder } from './titleGrouping';
import { ExampleNote, TemplateCandidate, TemplateGroup } from './types';

const folderSources = (folder: TitleFolder): string[] => [
  ...folder.groups.flatMap((group) => group.notes.map((note) => note.title)),
  ...folder.folders.flatMap(folderSources),
];

/**
 * Split source folders only when every top-level folder has at least two examples.
 * A single loose note also keeps the candidate together, avoiding unsupported singleton templates.
 * Notebook containers are excluded by groupNotePaths. An original single-folder candidate uses
 * a folder prefix; splits retain the common structural name and body, scoped to their own sources.
 */
function splitTemplatePaths(
  template: TemplateCandidate,
  notebookRoots: string[]
): TemplateCandidate[] {
  const tree = groupNotePaths(
    template.sourceTitles.map((title) => ({ title })),
    notebookRoots
  );
  if (!tree.folders.length) return [template];
  if (tree.folders.length === 1) {
    const folderName = tree.folders[0].name;
    return folderName === template.name
      ? [template]
      : [{ ...template, name: `${folderName} · ${template.name}`, folderName }];
  }
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

/**
 * Discover usable templates from all scoped sources without manual example selection.
 * Retain blocks supported by at least 60% of the group and at least two distinct notes,
 * adding their ancestors so nested fields keep their context. Compare the entire group:
 * sampling the first few notes can mistakenly retain sections that are rare overall.
 * Recover recurring title patterns within one folder for otherwise uncovered notes,
 * requiring two shared headings/fields or a named table rather than title similarity alone.
 * Notes in different folders can also share a core of at least three named outer sections;
 * every member must contain the entire core, preventing weak chains of partial overlap.
 * Merge identical skeletons before splitting source folders. Name candidates from retained
 * headings at every level, deduplicating labels while preserving order and the full name.
 */
export function discoverTemplates(
  notes: ExampleNote[],
  dateLabel = 'Date',
  notebookRoots: string[] = []
): TemplateCandidate[] {
  const templates = new Map<string, TemplateCandidate>();
  const unique = [...new Map(notes.map((note) => [note.title.normalize('NFC'), note])).values()];
  const addTemplate = (group: TemplateGroup, folderForm = false) => {
    const draft = inferTemplate(group.notes);
    // Use the whole group. Occasional sections should not crowd a reusable template.
    const minimum = Math.max(2, Math.ceil(draft.sourceTitles.length * 0.6));
    const ids = withAncestors(
      draft,
      draft.blocks.filter((block) => block.sources.length >= minimum).map((block) => block.id)
    );
    if (!ids.length) return;
    const selected = new Set(ids);
    if (folderForm) {
      const shared = draft.blocks.filter((block) => block.sources.length >= minimum);
      const labels = new Set(
        shared.filter((block) => ['heading', 'field'].includes(block.kind)).map((block) => block.id)
      );
      const namedTable = shared.some(
        (block) =>
          block.kind === 'table' &&
          block.columns?.some((column) => !/^(?:Column|열) \d+$/i.test(column))
      );
      if (labels.size < 2 && !namedTable) return;
    }
    const headings = draft.blocks.filter(
      (block) => block.kind === 'heading' && selected.has(block.id)
    );
    const name = [...new Set(headings.map((block) => block.label))].join(' / ') || group.title;
    const markdown = renderTemplate(draft, ids, dateLabel);
    const existing = templates.get(markdown);
    if (existing) {
      existing.sourceTitles = [...new Set([...existing.sourceTitles, ...draft.sourceTitles])];
    } else {
      templates.set(markdown, {
        name,
        markdown,
        sourceTitles: draft.sourceTitles,
      });
    }
  };
  for (const group of suggestTemplateGroups(unique)) addTemplate(group);
  // Repeated title patterns in one folder can retain a useful core despite optional sections.
  const covered = new Set([...templates.values()].flatMap((template) => template.sourceTitles));
  const recoverFolderForms = (folder: TitleFolder) => {
    for (const group of folder.groups) {
      if (
        group.notes.length < 2 ||
        !group.pattern.includes('{{') ||
        group.notes.every((note) => covered.has(note.title))
      )
        continue;
      addTemplate(
        { title: group.pattern.replace(/\{\{[^{}]+\}\}/g, '…'), notes: group.notes },
        true
      );
    }
    folder.folders.forEach(recoverFolderForms);
  };
  recoverFolderForms(groupNoteTitles(unique));
  // A shared outer core is independent of paths, while title-pattern recovery stays folder-scoped.
  const outlines = unique
    .map((note) => ({
      note,
      headings: new Set(
        extractStructure(note)
          .filter(
            (block) => block.kind === 'heading' && !block.parentId && /\p{L}/u.test(block.label)
          )
          .map((block) => block.id)
      ),
    }))
    .filter(({ headings }) => headings.size >= 3);
  const cores = new Map<string, string[]>();
  for (let left = 0; left < outlines.length; left++) {
    for (let right = left + 1; right < outlines.length; right++) {
      if (covered.has(outlines[left].note.title) && covered.has(outlines[right].note.title))
        continue;
      const shared = [...outlines[left].headings].filter((id) => outlines[right].headings.has(id));
      if (shared.length >= 3) cores.set(JSON.stringify([...shared].sort()), shared);
    }
  }
  for (const core of cores.values()) {
    const sources = outlines.filter(({ headings }) => core.every((id) => headings.has(id)));
    addTemplate({ title: '', notes: sources.map(({ note }) => note) }, true);
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
