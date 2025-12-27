import { useAuthContext } from '@blacktokki/account';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { getPatList, postPat, deletePat } from '../services/notebook';

export const usePat = () => {
  const { auth } = useAuthContext();

  // PAT 목록 조회
  const listQuery = useQuery({
    queryKey: ['patList'],
    queryFn: getPatList,
    enabled: !auth.isLocal && !!auth.user, // 온라인 계정일 때만 활성화
  });
  return listQuery;
};

export const usePatMutation = () => {
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: postPat,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patList'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePat(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patList'] });
    },
  });

  return {
    createPat: createMutation,
    deletePat: deleteMutation,
  };
};
