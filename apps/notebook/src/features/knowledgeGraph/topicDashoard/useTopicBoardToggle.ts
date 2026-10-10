import { useCallback, useState } from 'react';

import { isTopicBoardAllowed, TopicDashboardExtensionState } from './topicBoardEligibility';

export interface UseTopicBoardToggleOptions {
  initialState?: boolean;
  usageMode?: string;
  extension?: TopicDashboardExtensionState | null;
}

export interface UseTopicBoardToggleResult {
  /** 사용 모드 및 확장 상태를 고려한 실제 유효 토글 활성화 여부 */
  enableTopicBoards: boolean;
  /** 사용자가 직접 토글한 원본 상태 */
  rawEnableTopicBoards: boolean;
  /** 현재 환경에서 주제 보드 기능이 허용되는지 여부 */
  isTopicBoardAllowed: boolean;
  setEnableTopicBoards: (updater: boolean | ((prev: boolean) => boolean)) => void;
  toggleTopicBoards: () => void;
}

/**
 * 지식 그래프에서 주제 대시보드 기반 보드 노드 전환 토글 상태를 관리하는 훅.
 */
export function useTopicBoardToggle(
  optionsOrInitialState: boolean | UseTopicBoardToggleOptions = false
): UseTopicBoardToggleResult {
  const options =
    typeof optionsOrInitialState === 'boolean'
      ? { initialState: optionsOrInitialState }
      : optionsOrInitialState;

  const { initialState = false, usageMode, extension } = options;
  const [rawEnableTopicBoards, setEnableTopicBoards] = useState(initialState);

  const isAllowed =
    usageMode !== undefined || extension !== undefined
      ? isTopicBoardAllowed(usageMode, extension)
      : true;

  const toggleTopicBoards = useCallback(() => {
    setEnableTopicBoards((prev) => !prev);
  }, []);

  return {
    enableTopicBoards: isAllowed && rawEnableTopicBoards,
    rawEnableTopicBoards,
    isTopicBoardAllowed: isAllowed,
    setEnableTopicBoards,
    toggleTopicBoards,
  };
}

export default useTopicBoardToggle;
