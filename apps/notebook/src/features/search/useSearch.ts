import { useAuthContext } from '@blacktokki/account';
import { useMemo } from 'react';
import { useInfiniteQuery } from 'react-query';

import {
  getSearchIndex,
  getSearchSourceRevision,
  indexNoteContents,
  searchVectorDb,
} from './oramaEngine';
import { useNotePages } from '../../hooks/useNoteStorage';
import { usePrivate } from '../../hooks/usePrivate';
import { useUsageMode } from '../../hooks/useUsageMode';
import type { Content } from '../../types';

const EMPTY_CONTENTS: Content[] = [];

export const useSearch = (query: string, exact: boolean, withExternal: boolean) => {
  const { auth } = useAuthContext();
  const { usageMode, notebook } = useUsageMode();
  const { data: privateConfig } = usePrivate();
  const { data: contents } = useNotePages();
  const scope = JSON.stringify([
    auth.isLocal ? 'local' : auth.user?.id,
    usageMode,
    notebook?.id || 0,
    !!privateConfig?.enabled,
  ]);
  const index = useMemo(() => getSearchIndex(scope), [scope]);
  const sourceRevision = useMemo(
    () => getSearchSourceRevision(index, contents || EMPTY_CONTENTS),
    [index, contents]
  );

  return useInfiniteQuery({
    queryKey: ['agentSearch', scope, index.db?.id, query, exact, withExternal, sourceRevision],
    queryFn: async ({ pageParam = 0 }) => {
      await indexNoteContents(contents || EMPTY_CONTENTS, index);
      return searchVectorDb(query, pageParam, 20, index);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage && lastPage.length >= 20 ? allPages.length : undefined,
    enabled:
      !!query?.trim() &&
      contents !== undefined &&
      usageMode !== undefined &&
      auth.isLocal !== undefined,
    staleTime: 1000 * 5,
  });
};
