import { useMemo } from 'react';

import {
  resolveTopicBoardPages,
  ResolvedTopicBoardPages,
  ResolveTopicBoardPagesParams,
} from './topicBoardEligibility';

export type UseResolvedTopicBoardsParams = ResolveTopicBoardPagesParams;

/**
 * 지식 그래프에서 사용할 주제 보드 가상 페이지 및 통계를 리액트 메모이제이션으로 계산하는 훅.
 */
export function useResolvedTopicBoards({
  notePages,
  boardPages,
  usageMode,
  enableTopicBoards,
}: UseResolvedTopicBoardsParams): ResolvedTopicBoardPages {
  return useMemo(
    () =>
      resolveTopicBoardPages({
        notePages,
        boardPages,
        usageMode,
        enableTopicBoards,
      }),
    [notePages, boardPages, usageMode, enableTopicBoards]
  );
}

export default useResolvedTopicBoards;
