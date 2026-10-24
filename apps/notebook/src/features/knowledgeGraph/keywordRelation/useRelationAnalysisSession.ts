/** Notebook analysis scope, source notes and the shared background session. */
import { useAuthContext } from '@blacktokki/account';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import {
  initialRelationAnalysisState,
  RelationAnalysisSession,
  RelationAnalysisNote,
} from './types';
import { useNotePages } from '../../../hooks/useNoteStorage';
import { isHiddenTitle, usePrivate } from '../../../hooks/usePrivate';
import { useUsageMode } from '../../../hooks/useUsageMode';
import type { Content } from '../../../types';

const sessions = new Map<string, { owner: object; value: RelationAnalysisSession }>();

const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const noop = () => {};

/** Observe only the current accessible scope; the background slot owns execution. */
export function useRelationAnalysisSession(requested = true): RelationAnalysisSession {
  const { scope, available } = useRelationAnalysisScope(requested);
  const empty = useMemo<RelationAnalysisSession>(
    () => ({
      data: {
        scope,
        available: false,
        notes: { isError: false, isFetching: false, refetch: noop },
      },
      analysis: { ...initialRelationAnalysisState(), start: noop, stop: noop },
    }),
    [scope]
  );
  const snapshot = useCallback(
    () => (available && readRelationAnalysisSession(scope)) || empty,
    [scope, available, empty]
  );
  return useSyncExternalStore(subscribeRelationAnalysisSession, snapshot, () => empty);
}

/** One extension-owned snapshot is shared by every entry button and result screen. */
export function publishRelationAnalysisSession(
  scope: string,
  owner: object,
  value: RelationAnalysisSession
) {
  sessions.set(scope, { owner, value });
  notify();
}

export function clearRelationAnalysisSession(scope: string, owner: object) {
  if (sessions.get(scope)?.owner !== owner) return;
  sessions.delete(scope);
  notify();
}

function readRelationAnalysisSession(scope: string) {
  return sessions.get(scope)?.value;
}

function subscribeRelationAnalysisSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Match account/notebook storage subkeys while keeping private analysis separate. */
function relationAnalysisScope(
  local: boolean,
  userId: number | undefined,
  notebookId: number,
  privateMode: boolean
) {
  return `${local ? '' : userId}:${notebookId}:${privateMode ? 'private' : 'normal'}`;
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
  };
}

/** Fetch scoped notes when the extension is enabled, independently of screen focus. */
export function useRelationAnalysisNotes(requested = true) {
  const { scope, available, notebookId, privateMode } = useRelationAnalysisScope(requested);
  const select = useCallback(
    (sources: Content[]): RelationAnalysisNote[] =>
      sources
        .filter(
          (note) =>
            note.type === 'NOTE' &&
            !!note.description?.trim() &&
            (privateMode || !isHiddenTitle(note.title))
        )
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(({ title, description }) => ({ title, description })),
    [privateMode]
  );
  const notes = useNotePages(notebookId, {
    enabled: available,
    select,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  return { scope, available, notes };
}
