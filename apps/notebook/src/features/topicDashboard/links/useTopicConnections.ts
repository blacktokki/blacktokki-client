import { useMemo } from 'react';

import { findBoardReferencePatterns } from './findBoardReferencePatterns';
import { buildTopicLinkDetails } from './topicLinkDetails';
import { useBoardPages } from '../../../hooks/useBoardStorage';
import { useNotePages } from '../../../hooks/useNoteStorage';
import { inferBoardCandidates, inferTopLevelBoardCandidates } from '../inferBoardCandidates';

/** 개요 집계와 연결 규칙 탭이 동일한 추론 결과를 사용한다. 실제 보드도 후보 선택과 무관하게 포함한다. */
export function useTopicConnections() {
  const noteQuery = useNotePages();
  const boardQuery = useBoardPages();
  const details = useMemo(() => {
    const notes = noteQuery.data ?? [];
    const boards = boardQuery.data ?? [];
    const candidates = [
      ...inferBoardCandidates(notes, boards),
      ...inferTopLevelBoardCandidates(notes, boards),
    ];
    return buildTopicLinkDetails(
      findBoardReferencePatterns(notes, boards, candidates, { includeNoteBoardPatterns: true }),
      notes,
      boards,
      candidates
    );
  }, [noteQuery.data, boardQuery.data]);
  return {
    details,
    proposalCount: details.reduce((total, item) => total + item.proposals.length, 0),
    isLoading: noteQuery.isLoading || boardQuery.isLoading,
    isError: noteQuery.isError || boardQuery.isError,
  };
}
