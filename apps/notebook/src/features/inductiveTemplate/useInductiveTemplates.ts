import { useAuthContext } from '@blacktokki/account';
import { useIsFocused } from '@react-navigation/native';
import { useEffect } from 'react';
import { useQuery } from 'react-query';

import { templateScope } from './template';
import { getContents } from '../../hooks/useNoteStorage';
import { isHiddenTitle, usePrivate } from '../../hooks/usePrivate';
import { useUsageMode } from '../../hooks/useUsageMode';
import { getStorageConfig } from '../../services/storage';

const emptyNotebookRoots: string[] = [];

export function useInductiveTemplates() {
  const isFocused = useIsFocused();
  const { auth } = useAuthContext();
  const { notebook, usageMode } = useUsageMode();
  const { data: privateConfig, isLoading: privacyLoading } = usePrivate();
  const notebookId = notebook?.id || 0;
  const isPrivate = !!privateConfig.enabled;
  const scope = templateScope(!!auth.isLocal, auth.user?.id, notebookId, isPrivate);
  const enabled =
    auth.isLocal !== undefined &&
    auth.user !== undefined &&
    (auth.isLocal || auth.user?.id !== undefined) &&
    usageMode !== undefined &&
    usageMode !== 'SIMPLE' &&
    !privacyLoading;
  const rootNames = useQuery({
    queryKey: ['inductiveTemplateNotebookRoots', scope, notebook?.title],
    queryFn: async () => {
      const config = auth.isLocal ? await getStorageConfig(notebookId) : undefined;
      return [
        ...new Set(
          [notebook?.title, config?.handle?.name, config?.pathName].filter(
            (name): name is string => !!name
          )
        ),
      ];
    },
    enabled,
    refetchOnWindowFocus: false,
  });
  const examples = useQuery({
    queryKey: ['inductiveTemplateExamples', scope],
    queryFn: async () =>
      (
        await getContents({
          isOnline: !auth.isLocal,
          types: ['NOTE'],
          parentId: notebookId,
          throwOnError: true,
        })
      )
        .filter(
          (note) =>
            note.type === 'NOTE' &&
            !!note.description?.trim() &&
            (isPrivate || !isHiddenTitle(note.title))
        )
        .sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title)),
    enabled,
    refetchOnWindowFocus: false,
  });
  const { refetch } = examples;
  const { refetch: refetchRootNames } = rootNames;
  useEffect(() => {
    if (enabled && isFocused) {
      refetch();
      refetchRootNames();
    }
  }, [enabled, isFocused, refetch, refetchRootNames]);
  return {
    scope,
    enabled: enabled && !rootNames.isLoading,
    examples,
    notebookRoots: rootNames.data || emptyNotebookRoots,
  };
}
