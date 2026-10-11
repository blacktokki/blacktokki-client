import { toHtml, toMarkdown, type FsData } from '@blacktokki/editor';

import { Content, PostContent } from '../../types';

export function hashStringToId(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash) || 1;
}

export async function getNestedDirHandle(root: any, subpath: string, create = false): Promise<any> {
  if (!subpath || subpath === '.' || subpath === '/') return root;
  const parts = subpath.split(/[/\\]+/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (part === '.' || part === '..') continue;
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}

export async function getNestedFileHandle(
  root: any,
  filePath: string,
  create = false
): Promise<any> {
  const parts = filePath.split(/[/\\]+/).filter(Boolean);
  if (parts.length === 0) throw new Error('Invalid file path');
  const fileName = parts.pop()!;
  let parentDir = root;
  if (parts.length > 0) {
    parentDir = await getNestedDirHandle(root, parts.join('/'), create);
  }
  return await parentDir.getFileHandle(fileName, { create });
}

export async function deleteNestedEntry(root: any, pathName: string): Promise<boolean> {
  try {
    const parts = pathName.split(/[/\\]+/).filter(Boolean);
    if (parts.length === 0) return false;
    const name = parts.pop()!;
    let parentDir = root;
    if (parts.length > 0) {
      parentDir = await getNestedDirHandle(root, parts.join('/'), false);
    }
    await parentDir.removeEntry(name);
    return true;
  } catch (e) {
    return false;
  }
}

const ALLOWED_EXTENSIONS = /\.(md|markdown|json)$/i;

export async function scanDirectoryRecursive(
  dirHandle: any,
  basePath = ''
): Promise<{ path: string; name: string; handle: any; isFile: boolean }[]> {
  const results: { path: string; name: string; handle: any; isFile: boolean }[] = [];
  if (!dirHandle || !dirHandle.entries) return results;
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      const fullPath = basePath ? `${basePath}/${name}` : name;
      if (handle.kind === 'file') {
        if (ALLOWED_EXTENSIONS.test(name)) {
          results.push({ path: fullPath, name, handle, isFile: true });
        }
      } else if (handle.kind === 'directory') {
        if (!name.startsWith('.')) {
          results.push({ path: fullPath, name, handle, isFile: false });
          const subResults = await scanDirectoryRecursive(handle, fullPath);
          results.push(...subResults);
        }
      }
    }
  } catch (e) {
    console.error('Error scanning directory:', e);
  }
  return results;
}

export async function readFileText(
  fileHandle: any
): Promise<{ text: string; lastModified: number }> {
  const file = await fileHandle.getFile();
  return {
    text: await file.text(),
    lastModified: file.lastModified,
  };
}

export async function writeFileText(fileHandle: any, text: string): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Conversion cache validated against freshly read content and file metadata. */
type CachedDirectoryFile = {
  lastModified: number;
  size: number;
  checksum: string;
  content?: FsData['contents'][number] & { updated: string };
  json?: FsData['jsons'][number];
};

/** Computes SHA-256 with a lossless text fallback when Web Crypto is unavailable. */
async function checksumFileText(text: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    try {
      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text)
      );
      return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('')}`;
    } catch {
      // Retain exact source equality when the runtime cannot calculate a digest.
    }
  }
  return `text:${text}`;
}

const directoryFileCache = new WeakMap<object, Map<string, CachedDirectoryFile>>();
const pendingDirectoryScans = new WeakMap<object, ReturnType<typeof scanDirectoryRecursive>>();
const recentDirectoryHandles = new Map<number, any>();

/** IndexedDB returns cloned handles; retain a bounded set of equivalent directory identities. */
async function reuseDirectoryHandle(rootHandle: any, parentId: number): Promise<any> {
  const previous = recentDirectoryHandles.get(parentId);
  const sameEntry =
    previous &&
    (previous === rootHandle ||
      (rootHandle.isSameEntry && (await rootHandle.isSameEntry(previous))));
  const handle = sameEntry ? previous : rootHandle;
  recentDirectoryHandles.delete(parentId);
  recentDirectoryHandles.set(parentId, handle);
  if (recentDirectoryHandles.size > 4) {
    recentDirectoryHandles.delete(recentDirectoryHandles.keys().next().value!);
  }
  return handle;
}

async function readFsDataFromDir(rootHandle: any, storeName: 'NOTE' | 'BOARD'): Promise<FsData> {
  let scan = pendingDirectoryScans.get(rootHandle);
  if (!scan) {
    scan = scanDirectoryRecursive(rootHandle);
    pendingDirectoryScans.set(rootHandle, scan);
    scan.finally(() => pendingDirectoryScans.delete(rootHandle));
  }
  const entries = await scan;
  let cache = directoryFileCache.get(rootHandle);
  if (!cache) {
    cache = new Map();
    directoryFileCache.set(rootHandle, cache);
  }
  const paths = new Set(entries.filter((entry) => entry.isFile).map((entry) => entry.path));
  for (const path of cache.keys()) {
    if (!paths.has(path)) cache.delete(path);
  }
  const contents: { title: string; description?: string; updated?: string }[] = [];
  const jsons: { title: string; data: any }[] = [];
  const files = entries.filter(
    (entry) =>
      entry.isFile &&
      (storeName === 'NOTE'
        ? /\.(md|markdown)$/i.test(entry.name)
        : entry.name.endsWith('.json') && entry.name !== 'notebooks.json')
  );

  // Bound concurrent file reads while retaining the directory's result order.
  for (let offset = 0; offset < files.length; offset += 8) {
    const batch = await Promise.all(
      files.slice(offset, offset + 8).map(async (entry) => {
        try {
          const file = await entry.handle.getFile();
          const text = await file.text();
          const checksum = await checksumFileText(text);
          const cached = cache.get(entry.path);
          if (
            cached &&
            cached.lastModified === file.lastModified &&
            cached.size === file.size &&
            cached.checksum === checksum
          ) {
            return cached;
          }
          const result: CachedDirectoryFile = {
            lastModified: file.lastModified,
            size: file.size,
            checksum,
          };
          if (storeName === 'NOTE') {
            result.content = {
              title: entry.path.replace(/\.(md|markdown)$/i, ''),
              description: toHtml(text || ''),
              updated: new Date(file.lastModified).toISOString(),
            };
          } else {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
              if (!Array.isArray(parsed) && !parsed.updated) {
                parsed.updated = new Date(file.lastModified).toISOString();
              }
              result.json = {
                title: parsed.title || entry.name.replace(/\.json$/i, ''),
                data: parsed,
              };
            }
          }
          cache.set(entry.path, result);
          return result;
        } catch (e) {
          cache.delete(entry.path);
          console.error('Error reading notebook file:', entry.path, e);
          return undefined;
        }
      })
    );
    for (const result of batch) {
      if (result?.content) contents.push(result.content);
      if (result?.json) jsons.push(result.json);
    }
  }

  return { contents, jsons };
}

async function saveFsDataToDir(rootHandle: any, data: FsData): Promise<void> {
  for (const item of data.contents) {
    const title = item.title || 'Untitled';
    const mdText = toMarkdown(item.description || '');
    const fileHandle = await getNestedFileHandle(rootHandle, `${title}.md`, true);
    await writeFileText(fileHandle, mdText);
  }
  for (const item of data.jsons) {
    const fileName = `${item.title || 'board'}.json`;
    const fileHandle = await getNestedFileHandle(rootHandle, fileName, true);
    await writeFileText(fileHandle, JSON.stringify(item.data, null, 2));
  }
}

export async function readContentsFromDir(
  rootHandle: any,
  storeName: string,
  parentId: number
): Promise<Content[]> {
  if (storeName === 'NOTEBOOK') {
    try {
      const fileHandle = await rootHandle.getFileHandle('notebooks.json', { create: false });
      const { text } = await readFileText(fileHandle);
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  if (storeName === 'NOTE' || storeName === 'BOARD') {
    rootHandle = await reuseDirectoryHandle(rootHandle, parentId);
    const fsData = await readFsDataFromDir(rootHandle, storeName);
    const results: Content[] = [];

    if (storeName === 'NOTE') {
      for (const item of fsData.contents) {
        const title = item.title || '';
        const id = hashStringToId(title);
        results.push({
          id,
          parentId,
          type: 'NOTE',
          title,
          description: item.description || '',
          order: 0,
          updated: (item as any).updated || new Date().toISOString(),
          option: {},
          userId: 0,
          input: title,
        });
      }
      generateVirtualFolderNotes(results, parentId);
    } else if (storeName === 'BOARD') {
      for (const item of fsData.jsons) {
        if (item.data && typeof item.data === 'object' && !Array.isArray(item.data)) {
          const boardData = item.data as Partial<Content>;
          const isBoard =
            boardData.type === 'BOARD' ||
            (boardData.option &&
              ('BOARD_HEADER_LEVEL' in boardData.option || 'BOARD_TYPE' in boardData.option));
          if (!isBoard) continue;

          const title = boardData.title || item.title || '';
          if (!title) continue;

          const id = boardData.id || hashStringToId(title);
          results.push({
            id,
            parentId,
            type: 'BOARD',
            title,
            description: boardData.description || '',
            order: boardData.order || 0,
            updated: boardData.updated || new Date().toISOString(),
            option: (boardData.option as any) || { BOARD_HEADER_LEVEL: 3 },
            userId: boardData.userId || 0,
            input: boardData.input || title,
          });
        }
      }
    }

    return results.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }

  return [];
}

/**
 * 폴더 구조는 존재하지만 부모 노트 파일(.md)이 없거나 description이 빈 문자열인 경우,
 * 직계 자식 노트 링크를 포함한 내용을 채웁니다.
 * (local 모드에서만 호출되며 results를 in-place로 수정합니다.)
 */
export function generateVirtualFolderNotes(results: Content[], parentId: number): void {
  const existingTitles = new Set(results.map((r) => r.title).filter(Boolean));
  const virtualPrefixes = new Set<string>();
  const latestDescendantUpdates = new Map<string, string>();

  for (const item of results) {
    if (!item.title) continue;
    const parts = item.title.split('/');
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join('/');
        if (
          item.updated &&
          new Date(item.updated).getTime() >
            new Date(latestDescendantUpdates.get(prefix) || 0).getTime()
        ) {
          latestDescendantUpdates.set(prefix, item.updated);
        }
        if (!existingTitles.has(prefix)) {
          virtualPrefixes.add(prefix);
        }
      }
    }
  }

  const virtualNotesMap = new Map<string, Content>();

  // 파일이 없는 폴더에 대해 가상 노트 생성
  for (const prefix of virtualPrefixes) {
    const virtualNote: Content = {
      id: hashStringToId(prefix),
      parentId,
      type: 'NOTE',
      title: prefix,
      description: '',
      order: 0,
      updated: latestDescendantUpdates.get(prefix) || new Date(0).toISOString(),
      option: {},
      userId: 0,
      input: prefix,
    };
    virtualNotesMap.set(prefix, virtualNote);
    results.push(virtualNote);
  }

  // description이 빈 문자열인 기존 노트도 대상에 포함
  const emptyDescNotes = results.filter(
    (r) => !virtualNotesMap.has(r.title) && (r.description ?? '') === ''
  );
  for (const note of emptyDescNotes) {
    virtualNotesMap.set(note.title, note);
  }

  const childrenByTitle = new Map<string, Content[]>();
  for (const note of results) {
    const slash = note.title.lastIndexOf('/');
    if (slash < 0) continue;
    const parent = note.title.slice(0, slash);
    const children = childrenByTitle.get(parent) ?? [];
    children.push(note);
    childrenByTitle.set(parent, children);
  }
  for (const [prefix, targetNote] of virtualNotesMap) {
    const directChildren = (childrenByTitle.get(prefix) ?? []).sort((a, b) =>
      (a.title || '').localeCompare(b.title || '')
    );

    if (directChildren.length > 0) {
      targetNote.description = directChildren
        .map(
          (child) => `<p><a href="?title=${encodeURIComponent(child.title)}">${child.title}</a></p>`
        )
        .join('');
    }
  }
}

export async function saveContentsToDir(
  rootHandle: any,
  storeName: string,
  parentId: number,
  contents: (Content | PostContent)[],
  deleteIdOrTitle?: number | string
): Promise<void> {
  rootHandle = await reuseDirectoryHandle(rootHandle, parentId);
  directoryFileCache.delete(rootHandle);
  if (contents.length > 0) {
    if (storeName === 'NOTEBOOK') {
      const currentNotebooks = await readContentsFromDir(rootHandle, 'NOTEBOOK', parentId);
      let maxId = currentNotebooks.reduce((max, nb) => Math.max(max, nb.id || 0), 0);
      for (const item of contents) {
        const nb = item as Content;
        if (nb.id === undefined) {
          nb.id = ++maxId;
        }
        const index = currentNotebooks.findIndex((c) => c.id === nb.id);
        if (index >= 0) {
          currentNotebooks[index] = nb;
        } else {
          currentNotebooks.push(nb);
        }
      }
      const fileHandle = await rootHandle.getFileHandle('notebooks.json', { create: true });
      await writeFileText(fileHandle, JSON.stringify(currentNotebooks, null, 2));
      return;
    }

    if (storeName === 'NOTE' || storeName === 'BOARD') {
      const fsData: FsData = {
        contents:
          storeName === 'NOTE'
            ? contents.map((item) => ({
                title: item.title || 'Untitled',
                description: item.description || '',
              }))
            : [],
        jsons:
          storeName === 'BOARD'
            ? contents.map((item) => {
                const title = item.title || 'board';
                const id = (item as Content).id || hashStringToId(title);
                return {
                  title,
                  data: {
                    ...item,
                    id,
                    type: 'BOARD',
                    title,
                  },
                };
              })
            : [],
      };
      await saveFsDataToDir(rootHandle, fsData);
    }
  } else if (deleteIdOrTitle !== undefined) {
    if (storeName === 'NOTEBOOK') {
      const currentNotebooks = await readContentsFromDir(rootHandle, 'NOTEBOOK', parentId);
      const filtered = currentNotebooks.filter(
        (c) => String(c.id) !== String(deleteIdOrTitle) && c.title !== deleteIdOrTitle
      );
      const fileHandle = await rootHandle.getFileHandle('notebooks.json', { create: true });
      await writeFileText(fileHandle, JSON.stringify(filtered, null, 2));
      return;
    }

    if (storeName === 'NOTE') {
      if (typeof deleteIdOrTitle === 'string') {
        await deleteNestedEntry(rootHandle, `${deleteIdOrTitle}.md`);
        await deleteNestedEntry(rootHandle, `${deleteIdOrTitle}.markdown`);
      } else if (typeof deleteIdOrTitle === 'number') {
        const notes = await readContentsFromDir(rootHandle, 'NOTE', parentId);
        const found = notes.find((n) => n.id === deleteIdOrTitle);
        if (found && found.title) {
          await deleteNestedEntry(rootHandle, `${found.title}.md`);
          await deleteNestedEntry(rootHandle, `${found.title}.markdown`);
        }
      }
    } else if (storeName === 'BOARD') {
      if (typeof deleteIdOrTitle === 'string') {
        await deleteNestedEntry(rootHandle, `${deleteIdOrTitle}.json`);
      } else if (typeof deleteIdOrTitle === 'number') {
        const boards = await readContentsFromDir(rootHandle, 'BOARD', parentId);
        const found = boards.find((b) => b.id === deleteIdOrTitle);
        if (found) {
          await deleteNestedEntry(rootHandle, `${found.title || found.id}.json`);
        } else {
          await deleteNestedEntry(rootHandle, `${deleteIdOrTitle}.json`);
        }
      }
    }
  }
}
