import { useInfiniteQuery } from 'react-query';

import { usePrivate } from './usePrivate';
import { search } from '../services/agent';

export const useAgentSearch = (query: string) => {
  const { data: privateConfig } = usePrivate();
  return useInfiniteQuery({
    queryKey: ['agentSearch', query, privateConfig.enabled],
    queryFn: ({ pageParam = 0 }) => search(query, pageParam, privateConfig.enabled),
    getNextPageParam: (lastPage, allPages) => {
      return allPages.length;
    },
    enabled: !!query,
    staleTime: 1000 * 5,
  });
};
