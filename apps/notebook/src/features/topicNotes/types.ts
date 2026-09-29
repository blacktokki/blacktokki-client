import { KnowledgeGraphNode } from '../knowledgeGraph/types';

export const TOPIC_CLASS_KIND = 'TITLE_KEYWORD' as const;
export const TOPIC_CLASS_CATEGORY = 'TOPIC' as const;

export interface TopicClassNode extends KnowledgeGraphNode {
  role: 'CLASS';
  classKind: typeof TOPIC_CLASS_KIND;
  classCategory: typeof TOPIC_CLASS_CATEGORY;
  matchLabel: string;
}

export const topicMatchLabel = (node: KnowledgeGraphNode): string | undefined =>
  'matchLabel' in node && typeof node.matchLabel === 'string' ? node.matchLabel : undefined;
