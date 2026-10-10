import { useMemo } from 'react';

import { findBoardReferencePatterns } from './findBoardReferencePatterns';
import { buildTopicLinkDetails } from './topicLinkDetails';
import { useBoardPages } from '../../../hooks/useBoardStorage';
import { useNotePages } from '../../../hooks/useNoteStorage';
import type { Content } from '../../../types';
import { inferBoardCandidates, inferTopLevelBoardCandidates } from '../inferBoardCandidates';

const emptyContents: Content[] = [];
const detailsCache = new WeakMap<
  readonly Content[],
  WeakMap<readonly Content[], ReturnType<typeof buildTopicLinkDetails>>
>();

/** Query data is shared by the menu badge and dashboard; analyze each snapshot once. */
export function getTopicConnectionDetails(notes: readonly Content[], boards: readonly Content[]) {
  let byBoards = detailsCache.get(notes);
  if (!byBoards) {
    byBoards = new WeakMap();
    detailsCache.set(notes, byBoards);
  }
  const cached = byBoards.get(boards);
  if (cached) return cached;
  const candidates = [
    ...inferBoardCandidates(notes, boards),
    ...inferTopLevelBoardCandidates(notes, boards),
  ];
  const details = buildTopicLinkDetails(
    findBoardReferencePatterns(notes, boards, candidates, { includeNoteBoardPatterns: true }),
    notes,
    boards,
    candidates
  );
  byBoards.set(boards, details);
  return details;
}

/** 개요 집계와 연결 규칙 탭이 동일한 추론 결과를 사용한다. 실제 보드도 후보 선택과 무관하게 포함한다. */
export function useTopicConnections() {
  const noteQuery = useNotePages();
  const boardQuery = useBoardPages();
  const details = useMemo(
    () =>
      getTopicConnectionDetails(noteQuery.data ?? emptyContents, boardQuery.data ?? emptyContents),
    [noteQuery.data, boardQuery.data]
  );
  return {
    details,
    proposalCount: details.reduce((total, item) => total + item.proposals.length, 0),
    isLoading: noteQuery.isLoading || boardQuery.isLoading,
    isError: noteQuery.isError || boardQuery.isError,
  };
}
