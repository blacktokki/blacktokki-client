import { toRaw } from '@blacktokki/editor';

export type MemoSelection = { title: string; noteId?: number };

export type MemoTab = MemoSelection & {
  id: string;
  content?: string;
  originalChecksum?: string;
  /** Calculated in memory; the current content already lives in the draft record. */
  contentChecksum?: string;
  createdNoteTitle?: string;
};

export type MemoTabs = {
  tabs: MemoTab[];
  activeId?: string;
};

export type MemoNote = { id: number; title: string; description?: string };

export function memoDraftTitle(content: string) {
  // Preserve editor line breaks when toRaw removes the HTML tags.
  const withLineBreaks = content
    .replace(/<br\b[^>]*>/gi, '$&\u2028')
    .replace(/<\/(?:p|div|h[1-6]|li|pre|blockquote|tr)\s*>/gi, '\u2028$&');
  const firstLine = toRaw(withLineBreaks).split(/[\r\n\u2028]/, 1)[0];
  return Array.from(firstLine.trim()).slice(0, 35).join('').trimEnd();
}

const EMPTY_CHECKSUM = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export async function checksumMemoContent(content: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content)
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}

export const memoHasChanges = (tab: MemoTab) =>
  tab.originalChecksum !== undefined && tab.originalChecksum !== tab.contentChecksum;

export const newMemoTab = (selection: MemoSelection, description?: string): MemoTab => ({
  ...selection,
  id:
    selection.noteId !== undefined
      ? `note:${selection.noteId}`
      : Date.now().toString(36) + Math.random().toString(36).slice(2),
  content: description,
  originalChecksum: description ? undefined : EMPTY_CHECKSUM,
  contentChecksum: description ? undefined : EMPTY_CHECKSUM,
});

export function addMemoDraft(state: MemoTabs): MemoTabs {
  const tab = newMemoTab({ title: '' }, '');
  return { ...state, tabs: [...state.tabs, tab], activeId: tab.id };
}

/** Use the shared order for saved tabs and keep drafts in their local slots. */
export function visibleMemoTabs(state: MemoTabs, notes: MemoNote[]): MemoTab[] {
  const saved = notes.map((note) => {
    const selection = { title: note.title, noteId: note.id };
    const cached = state.tabs.find((tab) => tab.noteId === note.id);
    return cached
      ? { ...cached, ...selection, content: cached.content ?? note.description ?? '' }
      : newMemoTab(selection, note.description || '');
  });
  const savedIds = new Set(saved.map((tab) => tab.id));
  const slots: MemoTab[] = [];
  for (let index = state.tabs.length - 1; index >= 0; index--) {
    const tab = state.tabs[index];
    if (savedIds.has(tab.id)) slots.push(saved.pop()!);
    else if (tab.noteId === undefined) slots.push(tab);
  }
  return [...saved, ...slots.reverse()];
}

export function reorderMemoTabs(state: MemoTabs, ordered: MemoTab[]): MemoTabs {
  const cached = new Map(state.tabs.map((tab) => [tab.id, tab]));
  const tabs = ordered.map((tab) => {
    const latest = cached.get(tab.id);
    cached.delete(tab.id);
    return latest ?? tab;
  });
  return { ...state, tabs: [...tabs, ...cached.values()] };
}

/** Cache drafts separately so an external tab closure does not lose unsaved edits. */
export function syncMemoTabs(state: MemoTabs, notes: MemoNote[]): MemoTabs {
  const retained = state.tabs.filter(
    (tab) =>
      tab.noteId === undefined ||
      notes.some((note) => note.id === tab.noteId) ||
      memoHasChanges(tab)
  );
  let tabs = retained.length === state.tabs.length ? state.tabs : retained;
  const visible = visibleMemoTabs({ ...state, tabs }, notes);
  for (const tab of visible) {
    const existing = tabs.find((item) => item.id === tab.id);
    if (!existing) tabs = [tab, ...tabs];
    else if (
      existing.noteId !== tab.noteId ||
      existing.title !== tab.title ||
      existing.content !== tab.content
    ) {
      tabs = tabs.map((item) => (item.id === tab.id ? tab : item));
    }
  }
  const activeId = visible.find((tab) => tab.id === state.activeId)?.id || visible[0]?.id;
  return tabs === state.tabs && activeId === state.activeId ? state : { ...state, tabs, activeId };
}

export function closeMemoTab(state: MemoTabs, id: string): MemoTabs {
  return { ...state, tabs: state.tabs.filter((tab) => tab.id !== id) };
}
