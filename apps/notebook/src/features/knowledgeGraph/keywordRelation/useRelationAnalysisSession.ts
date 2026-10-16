import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { initialRelationAnalysisState, RelationAnalysisSession } from './types';
import { useRelationAnalysisScope } from './useRelationAnalysisNotes';

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

export function readRelationAnalysisSession(scope: string) {
  return sessions.get(scope)?.value;
}

export function subscribeRelationAnalysisSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
