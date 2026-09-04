import { useEffect } from 'react';
import { useInfiniteQuery } from 'react-query';

import { indexNoteContents, searchVectorDb } from './oramaEngine';
import { useNotePages } from '../../hooks/useNoteStorage';
import { usePrivate } from '../../hooks/usePrivate';

export const useSearch = (query: string, exact: boolean, withExternal: boolean) => {
  const { data: privateConfig } = usePrivate();
  const { data: contents = [] } = useNotePages();

  useEffect(() => {
    if (contents.length > 0) {
      indexNoteContents(contents).catch((e) => {
        console.error('Failed to index notes into vector DB:', e);
      });
    }
  }, [contents]);

  return useInfiniteQuery({
    queryKey: ['agentSearch', query, privateConfig?.enabled, exact, withExternal, contents.length],
    queryFn: ({ pageParam = 0 }) => searchVectorDb(query, pageParam, 20),
    getNextPageParam: (lastPage, allPages) => {
      return lastPage && lastPage.length >= 20 ? allPages.length : undefined;
    },
    enabled: !!query,
    staleTime: 1000 * 5,
  });
};
