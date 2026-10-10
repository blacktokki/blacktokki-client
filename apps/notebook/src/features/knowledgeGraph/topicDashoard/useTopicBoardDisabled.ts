import { useCallback, useRef } from 'react';

/**
 * 이전 토글 상태와 현재 토글 상태를 비교하여 주제 보드 토글이 해제(true -> false)되었는지 판별한다.
 */
export function isTopicBoardDisabled(
  previousEnabled: boolean | undefined,
  currentEnabled: boolean | undefined
): boolean {
  return previousEnabled === true && !currentEnabled;
}

export interface UseTopicBoardDisabledResult {
  /** 현재 렌더링/시뮬레이션 시점에서 토글 해제 여부를 반환하고 이전 상태를 현재 상태로 갱신한다. */
  consumeIsTopicBoardDisabled: () => boolean;
  /** 이전 상태 ref 직접 접근 */
  prevEnableTopicBoardsRef: React.MutableRefObject<boolean | undefined>;
}

/**
 * 지식 그래프 캔버스 시뮬레이션에서 주제 보드 토글 해제 전환을 감지하고 추적하는 훅.
 */
export function useTopicBoardDisabled(enableTopicBoards?: boolean): UseTopicBoardDisabledResult {
  const prevEnableTopicBoardsRef = useRef<boolean | undefined>(enableTopicBoards);

  const consumeIsTopicBoardDisabled = useCallback((): boolean => {
    const disabled = isTopicBoardDisabled(prevEnableTopicBoardsRef.current, enableTopicBoards);
    prevEnableTopicBoardsRef.current = enableTopicBoards;
    return disabled;
  }, [enableTopicBoards]);

  return {
    consumeIsTopicBoardDisabled,
    prevEnableTopicBoardsRef,
  };
}

export default useTopicBoardDisabled;
