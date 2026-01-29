import { useInfiniteQuery } from 'react-query';

import { search } from './agent';
import { usePrivate } from '../../hooks/usePrivate';

export const useAgentSearch = (query: string, exact: boolean, withExternal: boolean) => {
  const { data: privateConfig } = usePrivate();
  return useInfiniteQuery({
    queryKey: ['agentSearch', query, privateConfig.enabled, exact, withExternal],
    queryFn: ({ pageParam = 0 }) =>
      search(query, pageParam, privateConfig.enabled, exact, withExternal),
    getNextPageParam: (lastPage, allPages) => {
      return allPages.length;
    },
    enabled: !!query,
    staleTime: 1000 * 5,
  });
};
