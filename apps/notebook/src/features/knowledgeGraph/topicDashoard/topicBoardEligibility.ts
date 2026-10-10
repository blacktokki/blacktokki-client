import { inferTopicBoardPages, KnowledgeGraphBoardPage } from './inferTopicBoardPages';
import { isTopicBoardDisabled } from './useTopicBoardDisabled';
import type { Content } from '../../../types';

export interface TopicDashboardExtensionItem {
  key: string;
  active?: boolean;
}

export interface TopicDashboardExtensionState {
  info?: TopicDashboardExtensionItem[];
}

/**
 * 주제 대시보드 확장이 활성화되어 있고 SIMPLE 모드가 아닌지 확인
 */
export function isTopicDashboardActive(
  extension?: TopicDashboardExtensionState | null,
  usageMode?: string
): boolean {
  if (usageMode === 'SIMPLE') return false;
  return Boolean(extension?.info?.find((item) => item.key === 'topicDashboard')?.active);
}

/**
 * 지식 그래프에서 주제 보드 기능이 허용되는지 확인
 */
export function isTopicBoardAllowed(
  usageMode?: string,
  extension?: TopicDashboardExtensionState | null
): boolean {
  return isTopicDashboardActive(extension, usageMode);
}

export interface ResolveTopicBoardPagesParams {
  notePages: readonly Content[];
  boardPages: readonly Content[];
  usageMode?: string;
  enableTopicBoards?: boolean;
}

export interface ResolvedTopicBoardPages {
  candidates: KnowledgeGraphBoardPage[];
  candidateCount: number;
  effectiveBoardPages: KnowledgeGraphBoardPage[];
}

/**
 * 주제 대시보드 후보 보드 생성 및 활성화 여부에 따른 적용 보드 목록 반환
 */
export function resolveTopicBoardPages({
  notePages,
  boardPages,
  usageMode,
  enableTopicBoards = false,
}: ResolveTopicBoardPagesParams): ResolvedTopicBoardPages {
  const isAllowed = usageMode !== 'SIMPLE';
  const candidates = isAllowed ? inferTopicBoardPages(notePages, boardPages) : [];
  const candidateCount = isAllowed ? candidates.length : 0;
  const topicBoards = enableTopicBoards && isAllowed ? candidates : [];
  const effectiveBoardPages: KnowledgeGraphBoardPage[] =
    topicBoards.length > 0
      ? [...boardPages, ...topicBoards]
      : (boardPages as KnowledgeGraphBoardPage[]);

  return {
    candidates,
    candidateCount,
    effectiveBoardPages,
  };
}

export const shouldResetTopicBoardLayout = isTopicBoardDisabled;
