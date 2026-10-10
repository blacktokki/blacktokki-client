import type { Content } from '../../../types';
import {
  inferBoardCandidates,
  inferTopLevelBoardCandidates,
  BoardCandidate,
  TopLevelBoardCandidate,
} from '../../topicDashboard/inferBoardCandidates';

export type KnowledgeGraphBoardPage = Content & {
  columnNoteTitles?: readonly string[];
  isTopicCandidate?: boolean;
};

/**
 * 주제 대시보드의 추론 기능(inferBoardCandidates, inferTopLevelBoardCandidates)을 활용하여,
 * 아직 생성되지 않은 주제 보드 후보들을 지식 그래프에서 보드 노드로 전환할 수 있는
 * 가상 보드 페이지(KnowledgeGraphBoardPage) 목록으로 변환한다.
 *
 * @param notePages 같은 노트북에 속한 노트 목록.
 * @param boardPages 이미 생성되어 있는 실제 보드 목록.
 * @returns 지식 그래프에 보드 노드로 반영할 가상 보드 페이지 목록.
 */
export function inferTopicBoardPages(
  notePages: readonly Content[],
  boardPages: readonly Content[] = []
): KnowledgeGraphBoardPage[] {
  const pathCandidates = inferBoardCandidates(notePages, boardPages);
  const topLevelCandidates = inferTopLevelBoardCandidates(notePages, boardPages);
  const allCandidates: (BoardCandidate | TopLevelBoardCandidate)[] = [
    ...pathCandidates,
    ...topLevelCandidates,
  ];

  return allCandidates.map((candidate, index) => {
    const isTopLevel = 'grouping' in candidate && candidate.grouping === 'TOP_LEVEL_NOTES';

    const boardPage: KnowledgeGraphBoardPage = {
      id: -(index + 1), // 실제 보드 ID와 겹치지 않는 음수 가상 ID
      userId: 0,
      order: index,
      input: candidate.title,
      title: candidate.title,
      type: 'BOARD',
      updated: new Date().toISOString(),
      description: '',
      option: candidate.option,
      columnNoteTitles: isTopLevel ? candidate.columnNoteTitles : undefined,
      isTopicCandidate: true,
    };

    return boardPage;
  });
}
