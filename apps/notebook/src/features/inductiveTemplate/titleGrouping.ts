import DiffMatchPatch from 'diff-match-patch';

import { ExampleNote } from './types';

export type TitleNameGroup = { id: string; pattern: string; notes: ExampleNote[] };
export type TitleFolder = {
  id: string;
  name: string;
  path: string;
  count: number;
  folders: TitleFolder[];
  groups: TitleNameGroup[];
};
type PlaceholderKind = 'date' | 'number' | 'keyword';
type PlaceholderNames = Record<PlaceholderKind, string>;
type Atom = { value: string; kind: 'text' | 'date' | 'number' };
type MutableFolder = { path: string[]; notes: ExampleNote[]; folders: Map<string, MutableFolder> };

const slots: Record<PlaceholderKind, string> = {
  date: '\u0000',
  number: '\u0001',
  keyword: '\u0002',
};
const slotKinds = new Map(
  Object.entries(slots).map(([kind, value]) => [value, kind as PlaceholderKind])
);
const date = /^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{4}년\s*\d{1,2}월\s*\d{1,2}일)$/;
const number = /^\d+(?:\.\d+)?$/;
const tokens =
  /\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{4}년\s*\d{1,2}월\s*\d{1,2}일|\d+(?:\.\d+)?|[\s\S]/gu;
const naturalOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function nameGroups(
  notes: ExampleNote[],
  path: string[],
  names: PlaceholderNames
): TitleNameGroup[] {
  const atoms = new Map<string, Atom>();
  const codes = new Map<string, string>();
  const encode = (name: string) =>
    (name.normalize('NFC').match(tokens) || [])
      .map((value) => {
        const key = value.toLocaleLowerCase();
        let code = codes.get(key);
        if (!code) {
          code = String.fromCharCode(codes.size + 3);
          codes.set(key, code);
          atoms.set(code, {
            value,
            kind: date.test(value) ? 'date' : number.test(value) ? 'number' : 'text',
          });
        }
        return code;
      })
      .join('');
  const letterCount = (encoded: string) =>
    [...encoded].filter(
      (code) => atoms.get(code)?.kind === 'text' && /\p{L}/u.test(atoms.get(code)!.value)
    ).length;
  const slotFor = (encoded: string): string => {
    const kinds = [...encoded].map((code) => slotKinds.get(code) || atoms.get(code)?.kind);
    return kinds.every((kind) => kind === 'date')
      ? slots.date
      : kinds.every((kind) => kind === 'number')
      ? slots.number
      : slots.keyword;
  };
  const simplify = (pattern: string): string => {
    const parts = pattern.split(/([\u0000-\u0002])/);
    const shared = letterCount(pattern);
    return parts
      .map((part, index) =>
        !slotKinds.has(part) &&
        letterCount(part) === 1 &&
        shared > 1 &&
        (slotKinds.has(parts[index - 1]) || slotKinds.has(parts[index + 1]))
          ? slots.keyword
          : part
      )
      .join('')
      .replace(/[\u0000-\u0002]{2,}/g, slotFor);
  };
  const shape = (encoded: string) =>
    [...encoded]
      .map((code) => {
        const kind = atoms.get(code)?.kind;
        return kind === 'date' || kind === 'number' ? slots[kind] : code;
      })
      .join('');
  const dmp = new DiffMatchPatch();
  dmp.Diff_Timeout = 0.02;
  const groups: { encoded: string; shape: string; letters: number; notes: ExampleNote[] }[] = [];
  const ordered = [...notes].sort((a, b) => naturalOrder(a.title, b.title));
  for (const note of ordered) {
    const encoded = encode(note.title.split('/').at(-1)!);
    const letters = letterCount(encoded);
    const noteShape = shape(encoded);
    let best: { index: number; pattern: string; score: number } | undefined;
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      const differences = dmp.diff_main(group.encoded, encoded, false);
      let pattern = '';
      let changing = '';
      for (const [operation, text] of differences) {
        if (operation === 0) {
          if (changing) pattern += slotFor(changing);
          changing = '';
          pattern += text;
        } else changing += text;
      }
      if (changing) pattern += slotFor(changing);
      pattern = simplify(pattern);
      const shared = letterCount(pattern);
      const sameShape = group.shape === noteShape;
      const score = sameShape ? 1 : shared / Math.max(group.letters, letters, 1);
      if ((sameShape || shared >= 2) && score >= 0.5 && (!best || score > best.score))
        best = { index, pattern, score };
    }
    if (best) {
      const group = groups[best.index];
      group.encoded = best.pattern;
      group.letters = Math.max(group.letters, letters);
      group.notes.push(note);
    } else groups.push({ encoded, shape: noteShape, letters, notes: [note] });
  }
  const positions = new Map(notes.map((note, index) => [note.title, index]));
  return groups
    .map((group) => {
      const used = new Map<PlaceholderKind, number>();
      const sourceName = group.notes[0].title.split('/').at(-1)!.normalize('NFC');
      const sourceAtoms = sourceName.match(tokens) || [];
      const sourceEncoded = encode(sourceName);
      let position = 0;
      const pattern = group.encoded
        .split(/([\u0000-\u0002])/)
        .map((part) => {
          const kind = slotKinds.get(part);
          if (!kind) {
            // Restore literal casing from its source span, rather than another occurrence of a letter.
            const index = sourceEncoded.indexOf(part, position);
            if (index < 0) return [...part].map((code) => atoms.get(code)!.value).join('');
            position = index + part.length;
            return sourceAtoms.slice(index, position).join('');
          }
          const count = (used.get(kind) || 0) + 1;
          used.set(kind, count);
          return '{{ ' + names[kind] + (count > 1 ? ' ' + count : '') + ' }}';
        })
        .join('');
      return {
        id: JSON.stringify(['names', ...path, group.notes[0].title]),
        pattern,
        notes: group.notes.sort((a, b) => positions.get(a.title)! - positions.get(b.title)!),
      };
    })
    .sort((a, b) => naturalOrder(a.pattern, b.pattern));
}

function titleTree(
  notes: ExampleNote[],
  groupNames: (notes: ExampleNote[], path: string[]) => TitleNameGroup[],
  notebookRoots: string[] = []
): TitleFolder {
  const root: MutableFolder = { path: [], notes: [], folders: new Map() };
  const roots = new Set(notebookRoots.map((name) => name.normalize('NFC')));
  const seen = new Set<string>();
  for (const note of notes) {
    const title = note.title.normalize('NFC');
    if (seen.has(title)) continue;
    seen.add(title);
    const parts = title.split('/');
    const path = parts.length > 1 && roots.has(parts[0]) ? parts.slice(1) : parts;
    let current = root;
    for (const segment of path.slice(0, -1)) {
      let folder = current.folders.get(segment);
      if (!folder) {
        folder = { path: [...current.path, segment], notes: [], folders: new Map() };
        current.folders.set(segment, folder);
      }
      current = folder;
    }
    current.notes.push(note);
  }
  const finish = (folder: MutableFolder): TitleFolder => {
    const folders = [...folder.folders.values()]
      .map(finish)
      .sort((a, b) => naturalOrder(a.name, b.name));
    const groups = groupNames(folder.notes, folder.path);
    return {
      id: JSON.stringify(['folder', ...folder.path]),
      name: folder.path.at(-1) || '',
      path: folder.path.join('/'),
      count: folder.notes.length + folders.reduce((count, child) => count + child.count, 0),
      folders,
      groups,
    };
  };
  return finish(root);
}

/** Browse note paths within the notebook, retaining original titles for opening source notes. */
export function groupNotePaths(notes: ExampleNote[], notebookRoots: string[] = []): TitleFolder {
  return titleTree(
    notes,
    (siblings, path) =>
      siblings.map((note) => ({
        id: JSON.stringify(['note', ...path, note.title]),
        pattern: note.title.split('/').at(-1)!,
        notes: [note],
      })),
    notebookRoots
  );
}

/** Infer title templates from common name patterns among notes in the same path. */
export function groupNoteTitles(
  notes: ExampleNote[],
  names: PlaceholderNames = { date: 'Date', number: 'Number', keyword: 'Keyword' }
): TitleFolder {
  return titleTree(notes, (siblings, path) => nameGroups(siblings, path, names));
}

/** Filtering retains the original hierarchy and name patterns rather than regrouping matches. */
export function filterTitleTree(tree: TitleFolder, titles: string[]): TitleFolder {
  const matches = new Set(titles.map((title) => title.normalize('NFC')));
  const filter = (folder: TitleFolder): TitleFolder => {
    const folders = folder.folders.map(filter).filter((child) => child.count > 0);
    const groups = folder.groups
      .map((group) => ({
        ...group,
        notes: group.notes.filter((note) => matches.has(note.title.normalize('NFC'))),
      }))
      .filter((group) => group.notes.length > 0);
    return {
      ...folder,
      folders,
      groups,
      count:
        groups.reduce((count, group) => count + group.notes.length, 0) +
        folders.reduce((count, child) => count + child.count, 0),
    };
  };
  return filter(tree);
}
