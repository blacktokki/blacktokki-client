import type { StackNavigationProp } from '@react-navigation/stack';

import type { BoardCandidate, TopLevelBoardCandidate } from './inferBoardCandidates';
import type { Paragraph } from '../../components/HeaderSelectBar';
import type { BoardOption, Content, NavigationParamList } from '../../types';

export type TopicNavigationParamList = {
  TopicDashboard: undefined;
  TopicBatchMove: {
    title: string;
    batchTitles: string[];
    boardOption?: BoardOption;
  };
};

export type TopicDashboardNavigationProp = StackNavigationProp<
  NavigationParamList & TopicNavigationParamList
>;

export interface TopicDashboardCardItem {
  id: string;
  title: string;
  description: string;
  boardTitle: string;
  columnName: string;
  rowName: string;
  noteTitle: string;
  paragraph: Paragraph & { origin: string };
}

export type TopicCardItem = TopicDashboardCardItem;

export interface TopicDashboardBoardColumn {
  name: string;
  noteTitle: string;
  items: TopicDashboardCardItem[];
  parentParagraph?: Paragraph;
}

export type TopicBoardColumn = TopicDashboardBoardColumn;

export interface TopicDashboardBoardRow {
  name: string;
  columns: TopicDashboardBoardColumn[];
}

export type TopicBoardRow = TopicDashboardBoardRow;

export interface TopicDashboardBoard {
  title: string;
  candidate: BoardCandidate | TopLevelBoardCandidate;
  option: BoardOption;
  columnNotes: Content[];
  rows: TopicDashboardBoardRow[];
  cards: TopicDashboardCardItem[];
  isTopLevel: boolean;
  stats: {
    cardCount: number;
    columnCount: number;
    rowCount: number;
  };
}

export type TopicBoard = TopicDashboardBoard;

export interface TopicDashboardMetrics {
  totalTopics: number;
  totalColumns: number;
  totalCards: number;
  topLevelCount: number;
}
