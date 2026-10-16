import type { KnowledgeGraphRelationType } from '../../types';
import type { KnowledgeGraphNodeKindLabel } from '../../utils/relations';

export type GraphSource = {
  id: string;
  title: string;
  paragraph?: string;
  section?: string;
  path?: string;
  text: string;
  href?: string;
};
export type SearchNode = {
  id: string;
  name: string;
  kind: KnowledgeGraphNodeKindLabel;
  typeLabel: string;
  noteTitle: string;
  body: string;
  sourceIds: string[];
  url?: string;
};
export type SearchEdge = {
  id: string;
  source: string;
  target: string;
  type: KnowledgeGraphRelationType;
  label: string;
  directed: boolean;
  verdict?: 'supported' | 'contradicted';
  sourceIds: string[];
};
export type GraphSearchSnapshot = {
  version: 1;
  scope: string;
  revision: string;
  nodes: SearchNode[];
  edges: SearchEdge[];
  sources: GraphSource[];
  coverage: { keywords: boolean; templates: boolean };
};
export type SearchDocument = { id: string; kind: 'node' | 'edge'; name: string; text: string };
export type GraphQueryPlan = {
  query: string;
  terms: string[];
  anchorNodeIds: string[];
  matchedEdgeIds: string[];
  intent: 'related' | 'connection';
  maxHops: number;
};
export type GraphPath = { nodes: string[]; edges: string[]; disputed: boolean };
export type GraphContextEntry =
  | { kind: 'node' | 'edge'; id: string; citationIds: string[] }
  | { kind: 'path'; index: number; citationIds: string[] };
export type GraphSearchResult = {
  scope: string;
  revision: string;
  query: string;
  plan: GraphQueryPlan;
  nodes: { node: SearchNode; score: number; direct: boolean }[];
  edges: { edge: SearchEdge; score: number; direct: boolean }[];
  paths: GraphPath[];
  sources: GraphSource[];
  context: {
    text: string;
    citations: GraphSource[];
    entries: GraphContextEntry[];
    truncated: boolean;
  };
  limited: boolean;
};
export type GraphSearchProgress = {
  phase: 'index' | 'embedding' | 'search';
  processed: number;
  total: number;
};
export type GraphSearchCache = {
  read: <T>(scope: string, key: string) => Promise<T | undefined>;
  write: (scope: string, key: string, value: unknown) => Promise<void>;
};
