import { useMemo, useState, useCallback } from 'react';

import type { TopicDashboardCardItem, TopicDashboardMetrics } from './types';
import { useBoardPages } from '../../hooks/useBoardStorage';
import { useNotePages } from '../../hooks/useNoteStorage';
import type { BoardOption } from '../../types';
import { buildTopicDashboardBoard, extractTopicDashboards } from './utils/extractTopicDashboard';

export function useTopicDashboard() {
  const { data: pages = [], isLoading: isNoteLoading } = useNotePages();
  const { data: boards = [], isLoading: isBoardLoading } = useBoardPages();

  const [selectedTitle, setSelectedTitle] = useState<string | undefined>(undefined);
  const [customOptions, setCustomOptions] = useState<Record<string, BoardOption>>({});

  const topicDashboards = useMemo(() => {
    if (pages.length === 0) return [];
    return extractTopicDashboards(pages, boards);
  }, [pages, boards]);

  // 선택된 보드가 없으면 undefined (개요에서 특정 보드를 선택하기 전까지는 currentBoard 없음)
  const activeTitle = selectedTitle;

  const currentBoard = useMemo(() => {
    if (!activeTitle) return undefined;
    const found = topicDashboards.find((b) => b.title === activeTitle);
    if (!found) return undefined;

    const customOption = customOptions[activeTitle];
    if (customOption) {
      return buildTopicDashboardBoard(found.candidate, pages, customOption);
    }
    return found;
  }, [activeTitle, topicDashboards, customOptions, pages]);

  const allCards = useMemo(() => {
    const list: TopicDashboardCardItem[] = [];
    topicDashboards.forEach((b) => list.push(...b.cards));
    return list;
  }, [topicDashboards]);

  // 대시보드 지표 통계 계산
  const metrics: TopicDashboardMetrics = useMemo(() => {
    let totalColumns = 0;
    let topLevelCount = 0;

    topicDashboards.forEach((b) => {
      totalColumns += b.stats.columnCount;
      if (b.isTopLevel) {
        topLevelCount++;
      }
    });

    return {
      totalTopics: topicDashboards.length,
      totalColumns,
      totalCards: allCards.length,
      topLevelCount,
    };
  }, [topicDashboards, allCards.length]);

  const setBoardOption = useCallback((boardTitle: string, option: BoardOption) => {
    setCustomOptions((prev) => ({
      ...prev,
      [boardTitle]: option,
    }));
  }, []);

  const selectBoard = useCallback((title?: string) => {
    setSelectedTitle(title);
  }, []);

  return {
    topicDashboards,
    topicBoards: topicDashboards, // 이전 호환
    currentBoard,
    allCards,
    selectedTitle: activeTitle,
    selectBoard,
    selectTopic: selectBoard,
    setBoardOption,
    metrics,
    totalBoardCount: topicDashboards.length,
    totalCardCount: allCards.length,
    isLoading: isNoteLoading || isBoardLoading,
  };
}

export const useTopicCards = useTopicDashboard;
export default useTopicDashboard;
