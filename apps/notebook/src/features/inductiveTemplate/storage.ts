import AsyncStorage from '@react-native-async-storage/async-storage';

import { validateSavedTemplate } from './template';
import { SavedTemplate } from './types';

const STORAGE_KEY = '@blacktokki:notebook:inductive_templates:';

export async function loadTemplates(scope: string): Promise<SavedTemplate[]> {
  const json = await AsyncStorage.getItem(STORAGE_KEY + scope);
  if (!json) return [];
  const value = JSON.parse(json);
  if (!Array.isArray(value) || !value.every(validateSavedTemplate)) {
    throw new Error('Could not load saved templates.');
  }
  return value;
}

export async function saveTemplate(scope: string, template: SavedTemplate): Promise<void> {
  if (!validateSavedTemplate(template)) throw new Error('Invalid template file.');
  const templates = await loadTemplates(scope);
  await AsyncStorage.setItem(
    STORAGE_KEY + scope,
    JSON.stringify([template, ...templates.filter((item) => item.id !== template.id)])
  );
}

export async function deleteTemplate(scope: string, id: string): Promise<void> {
  const templates = await loadTemplates(scope);
  await AsyncStorage.setItem(
    STORAGE_KEY + scope,
    JSON.stringify(templates.filter((item) => item.id !== id))
  );
}
