import { useInfiniteQuery } from 'react-query';

import { isHiddenTitle } from './usePrivacy';
import { search } from '../services/agent';

export const useAgentSearch = (query: string) => {
  return useInfiniteQuery({
    queryKey: ['agentSearch', query],
    queryFn: ({ pageParam = 0 }) =>
      search(query, pageParam).then((r) => r.filter((v) => !isHiddenTitle(v.title))),
    getNextPageParam: (lastPage, allPages) => {
      return allPages.length;
    },
    enabled: !!query,
    staleTime: 1000 * 60 * 5,
  });
};
