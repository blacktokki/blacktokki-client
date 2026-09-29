import { Platform } from 'react-native';

const safeFilename = (value: string): string =>
  (value || 'notebook')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'notebook';

export const exportTurtleFile = async (turtle: string, title: string): Promise<void> => {
  const filename = `${safeFilename(title)}.ttl`;

  if (Platform.OS === 'web') {
    const blob = new Blob([turtle], { type: 'text/turtle;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 500);
    return;
  }

  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device.');
  }
  const uri = `${FileSystem.cacheDirectory}${encodeURIComponent(filename)}`;
  await FileSystem.writeAsStringAsync(uri, turtle, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: 'text/turtle',
    UTI: 'public.plain-text',
    dialogTitle: filename,
  });
};
