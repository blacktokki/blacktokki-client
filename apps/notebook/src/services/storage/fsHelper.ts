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

export async function scanDirectoryRecursive(
  dirHandle: any,
  basePath = ''
): Promise<{ path: string; name: string; handle: any; isFile: boolean }[]> {
  const results: { path: string; name: string; handle: any; isFile: boolean }[] = [];
  if (!dirHandle || !dirHandle.entries) return results;
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue;
      const fullPath = basePath ? `${basePath}/${name}` : name;
      if (handle.kind === 'file') {
        results.push({ path: fullPath, name, handle, isFile: true });
      } else if (handle.kind === 'directory') {
        results.push({ path: fullPath, name, handle, isFile: false });
        const subResults = await scanDirectoryRecursive(handle, fullPath);
        results.push(...subResults);
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

async function readFsDataFromDir(rootHandle: any): Promise<FsData> {
  const entries = await scanDirectoryRecursive(rootHandle);
  const contents: { title: string; description?: string; updated?: string }[] = [];
  const jsons: { title: string; data: any }[] = [];

  for (const entry of entries) {
    if (!entry.isFile) continue;
    if (/\.(md|markdown)$/i.test(entry.name)) {
      try {
        const { text, lastModified } = await readFileText(entry.handle);
        const title = entry.path.replace(/\.(md|markdown)$/i, '');
        const htmlDescription = toHtml(text || '');
        contents.push({
          title,
          description: htmlDescription,
          updated: new Date(lastModified).toISOString(),
        });
      } catch (e) {
        console.error('Error reading note file:', entry.path, e);
      }
    } else if (entry.name.endsWith('.json') && entry.name !== 'notebooks.json') {
      try {
        const { text } = await readFileText(entry.handle);
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          jsons.push({
            title: (parsed as any).title || entry.name.replace(/\.json$/i, ''),
            data: parsed,
          });
        }
      } catch (e) {
        console.error('Error reading board file:', entry.path, e);
      }
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

  if (storeName === 'SNAPSHOT' || storeName === 'DELTA') {
    try {
      const histDir = await rootHandle.getDirectoryHandle('.history', { create: false });
      const entries = await scanDirectoryRecursive(histDir);
      const results: Content[] = [];
      for (const entry of entries) {
        if (!entry.isFile || !entry.name.endsWith('.json')) continue;
        try {
          const { text } = await readFileText(entry.handle);
          results.push(JSON.parse(text));
        } catch (e) {}
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  if (storeName === 'NOTE' || storeName === 'BOARD') {
    const fsData = await readFsDataFromDir(rootHandle);
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
        if (item.data && typeof item.data === 'object') {
          results.push(item.data as Content);
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
  const existingTitles = new Set(results.map((r) => r.title));
  const virtualPrefixes = new Set<string>();

  for (const item of results) {
    const parts = item.title.split('/');
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join('/');
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
      updated: new Date().toISOString(),
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

  for (const [prefix, targetNote] of virtualNotesMap) {
    const allDescendants = results.filter(
      (r) => r.title !== prefix && r.title.startsWith(prefix + '/')
    );

    if (allDescendants.length === 0) continue;

    // 가상 노트인 경우에만 updated를 자식 중 최신값으로 갱신
    if (virtualPrefixes.has(prefix)) {
      let maxUpdated = new Date(0).toISOString();
      for (const desc of allDescendants) {
        if (desc.updated && new Date(desc.updated) > new Date(maxUpdated)) {
          maxUpdated = desc.updated;
        }
      }
      if (maxUpdated !== new Date(0).toISOString()) {
        targetNote.updated = maxUpdated;
      }
    }

    const directChildren = allDescendants
      .filter((r) => r.title.slice(prefix.length + 1).split('/').length === 1)
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (directChildren.length > 0) {
      targetNote.description = directChildren
        .map(
          (child) =>
            `<p><a href="?title=${encodeURIComponent(child.title)}">${child.title}</a></p>`
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

    if (storeName === 'SNAPSHOT' || storeName === 'DELTA') {
      const histDir = await rootHandle.getDirectoryHandle('.history', { create: true });
      for (const item of contents) {
        const fileName = `${item.type}_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 7)}.json`;
        const fileHandle = await histDir.getFileHandle(fileName, { create: true });
        await writeFileText(fileHandle, JSON.stringify(item, null, 2));
      }
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
            ? contents.map((item) => ({
                title: item.title || 'board',
                data: item,
              }))
            : [],
      };
      await saveFsDataToDir(rootHandle, fsData);
      return;
    }
  } else if (deleteIdOrTitle !== undefined) {
    if (storeName === 'NOTEBOOK') {
      const currentNotebooks = await readContentsFromDir(rootHandle, 'NOTEBOOK', parentId);
      const filtered = currentNotebooks.filter((c) => c.id !== deleteIdOrTitle);
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

export async function getDirStats(
  dirHandle: any
): Promise<{ count: number; totalSize: number; lastModified: number }> {
  let count = 0;
  let totalSize = 0;
  let lastModified = 0;
  if (!dirHandle || !dirHandle.entries) return { count, totalSize, lastModified };
  try {
    const entries = await scanDirectoryRecursive(dirHandle);
    for (const entry of entries) {
      if (!entry.isFile || entry.name.startsWith('.')) continue;
      try {
        const file = await entry.handle.getFile();
        count++;
        totalSize += file.size || 0;
        if (file.lastModified > lastModified) {
          lastModified = file.lastModified;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { count, totalSize, lastModified };
}
