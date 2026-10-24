import AsyncStorage from '@react-native-async-storage/async-storage';

import { deleteSyncAnchorFromDB, getSyncAnchorFromDB, saveSyncAnchorToDB } from './db';
import { DEFAULT_SYNC_OPTIONS, SyncAnchor, SyncOptions } from './types';

const SYNC_OPTIONS_KEY = '@blacktokki:notebook:sync_options:';
const SYNC_ANCHOR_KEY = '@blacktokki:notebook:sync_anchor:';

export const getSyncAnchorKey = (userId: number | string, notebookTitle: string): string => {
  return `${SYNC_ANCHOR_KEY}${userId}:${notebookTitle.trim().toLowerCase()}`;
};

export const getSyncAnchor = async (anchorKey: string): Promise<SyncAnchor> => {
  return await getSyncAnchorFromDB<SyncAnchor>(anchorKey);
};

export const saveSyncAnchor = async (anchorKey: string, anchor: SyncAnchor): Promise<void> => {
  await saveSyncAnchorToDB(anchorKey, anchor);
};

export const deleteSyncAnchor = async (
  userId: number | string,
  notebookTitle: string
): Promise<void> => {
  const anchorKey = getSyncAnchorKey(userId, notebookTitle);
  await deleteSyncAnchorFromDB(anchorKey);
};

export const getSyncOptions = async (subkey: string): Promise<SyncOptions> => {
  try {
    const value = await AsyncStorage.getItem(SYNC_OPTIONS_KEY + subkey);
    if (!value) return DEFAULT_SYNC_OPTIONS;
    return { ...DEFAULT_SYNC_OPTIONS, ...JSON.parse(value) };
  } catch (e) {
    return DEFAULT_SYNC_OPTIONS;
  }
};

export const setSyncOptions = async (subkey: string, options: SyncOptions): Promise<void> => {
  try {
    await AsyncStorage.setItem(SYNC_OPTIONS_KEY + subkey, JSON.stringify(options));
  } catch (e) {
    console.error('Failed to save sync options', e);
  }
};

export const deleteSyncOptions = async (
  userId: number | string,
  notebookId: number | string
): Promise<void> => {
  try {
    await AsyncStorage.removeItem(`${SYNC_OPTIONS_KEY}${userId}:${notebookId}`);
  } catch (e) {
    console.error('Failed to delete sync options', e);
  }
};
