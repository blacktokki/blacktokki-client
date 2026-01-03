import { useInfiniteQuery } from 'react-query';

import { usePrivacy } from './usePrivacy';
import { search } from '../services/agent';

export const useAgentSearch = (query: string) => {
  const { data: privacy } = usePrivacy();
  return useInfiniteQuery({
    queryKey: ['agentSearch', query, privacy.enabled],
    queryFn: ({ pageParam = 0 }) => search(query, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      return allPages.length;
    },
    enabled: !!query,
    staleTime: 1000 * 5,
  });
};
