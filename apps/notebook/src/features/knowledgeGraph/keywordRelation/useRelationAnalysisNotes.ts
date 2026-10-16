import { useAuthContext } from '@blacktokki/account';
import { useQuery } from 'react-query';

import { RelationAnalysisNote } from './types';
import { getContents } from '../../../hooks/useNoteStorage';
import { isHiddenTitle, usePrivate } from '../../../hooks/usePrivate';
import { useUsageMode } from '../../../hooks/useUsageMode';

/** Preserve the existing score-cache scope without depending on another feature. */
export function relationAnalysisScope(
  local: boolean,
  userId: number | undefined,
  notebookId: number,
  privateMode: boolean
) {
  return `${local ? 'local' : `user:${userId}`}:${notebookId}:${
    privateMode ? 'private' : 'normal'
  }`;
}

/** Resolve scope and access readiness without fetching the notebook body. */
export function useRelationAnalysisScope(requested = true) {
  const { auth } = useAuthContext();
  const { notebook, usageMode } = useUsageMode();
  const { data: privacy, isLoading: privacyLoading } = usePrivate();
  const notebookId = notebook?.id || 0;
  const privateMode = !!privacy.enabled;
  const scope = relationAnalysisScope(!!auth.isLocal, auth.user?.id, notebookId, privateMode);
  const available =
    requested &&
    auth.isLocal !== undefined &&
    auth.user !== undefined &&
    (auth.isLocal || auth.user?.id !== undefined) &&
    usageMode !== undefined &&
    usageMode !== 'SIMPLE' &&
    !privacyLoading;
  return {
    scope,
    available,
    notebookId,
    privateMode,
    isOnline: !auth.isLocal,
  };
}

/** Fetch scoped notes when the extension is enabled, independently of screen focus. */
export function useRelationAnalysisNotes(requested = true) {
  const { scope, available, notebookId, privateMode, isOnline } =
    useRelationAnalysisScope(requested);
  const notes = useQuery<RelationAnalysisNote[]>({
    queryKey: ['relationAnalysisNotes', scope],
    queryFn: async () =>
      (
        await getContents({
          isOnline,
          types: ['NOTE'],
          parentId: notebookId,
          throwOnError: true,
        })
      )
        .filter(
          (note) =>
            note.type === 'NOTE' &&
            !!note.description?.trim() &&
            (privateMode || !isHiddenTitle(note.title))
        )
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(({ title, description }) => ({ title, description })),
    enabled: available,
    refetchOnWindowFocus: false,
  });
  return { scope, available, notes };
}
