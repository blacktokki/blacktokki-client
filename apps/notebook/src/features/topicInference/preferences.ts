import { emptyTopicPreferences } from './inferTopics';
import { TopicPreferences } from './types';

/** A storage boundary that cannot carry one account, mode or notebook into another. */
export const topicPreferenceScope = (
  local: boolean,
  userId: number | undefined,
  mode: string | undefined,
  notebookId: number
): string => JSON.stringify([local ? 'local' : `account:${userId}`, mode, notebookId]);

/** Ignore malformed persisted values while retaining valid user choices. */
export function parseTopicPreferences(stored: string | null): TopicPreferences {
  if (!stored) return emptyTopicPreferences();
  try {
    const value = JSON.parse(stored);
    const labels: Record<string, string> = {};
    const excluded: Record<string, string[]> = {};
    for (const [id, label] of Object.entries(value.labels || {}))
      if (typeof label === 'string') labels[id] = label;
    for (const [id, ids] of Object.entries(value.excluded || {}))
      if (Array.isArray(ids)) excluded[id] = ids.filter((item) => typeof item === 'string');
    return {
      labels,
      excluded,
      hidden: Array.isArray(value.hidden)
        ? value.hidden.filter((id: unknown) => typeof id === 'string')
        : [],
      collections: Array.isArray(value.collections)
        ? value.collections
            .filter(
              (item: any) =>
                typeof item?.id === 'string' &&
                typeof item?.label === 'string' &&
                Array.isArray(item?.memberIds)
            )
            .map((item: any) => ({
              ...item,
              memberIds: item.memberIds.filter((id: unknown) => typeof id === 'string'),
            }))
        : [],
    };
  } catch {
    return emptyTopicPreferences();
  }
}
