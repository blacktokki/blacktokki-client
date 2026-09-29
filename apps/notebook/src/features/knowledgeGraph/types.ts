import { Paragraph } from '../../components/HeaderSelectBar';

// 1. Graph entity roles
export type KnowledgeGraphEntityRole = 'CLASS' | 'INSTANCE' | 'LITERAL';
export type KnowledgeGraphInstanceKind =
  | 'CARD'
  | 'NOTE'
  | 'PARAGRAPH'
  | 'BOARD_PARAGRAPH'
  | 'CONNECTED_PARAGRAPH'
  | 'EXTERNAL_LINK'
  | 'CONNECTED_EXTERNAL_LINK';
export type KnowledgeGraphClassKind =
  | 'NOTE'
  | 'BOARD_CARD'
  | 'EXTERNAL_LINK'
  | (string & Record<never, never>);
export type KnowledgeGraphClassCategory = 'BUILT_IN' | 'BOARD' | (string & Record<never, never>);

// 2. Note metadata (YAML frontmatter only)
// Enforced constraint: Only NOTE instances can have non-empty properties.
// Always and only keys defined in YAML frontmatter can become properties.
export type KnowledgeGraphPropertyValue =
  | string
  | number
  | boolean
  | null
  | unknown[]
  | Record<string, unknown>;

export interface KnowledgeGraphSectionProperty {
  title: string;
  level: number;
  path: string;
  autoSection?: string;
}

export interface KnowledgeGraphDataProperties {
  schedule?: string;
  sections?: KnowledgeGraphSectionProperty[];
  [key: string]: KnowledgeGraphPropertyValue | undefined;
}

// 3. Graph relations
export type KnowledgeGraphRelationType =
  | 'INSTANCE_OF' // Individual -> class membership
  | 'SUBCLASS_OF' // Sub-class hierarchy
  | 'REPRESENTED_BY_NOTE' // Class -> corresponding note annotation
  | 'REFERENCES' // Document _NOTELINK (reference/citation)
  | 'EXTERNAL_REFERENCE' // Document -> external link individual
  | 'PART_OF' // Parent/Child document path hierarchy
  | 'DATATYPE_PROPERTY' // Instance -> Literal (e.g. hasSchedule)
  | (string & Record<never, never>); // Extension relation types

// 4. Axioms (Constraints, Validation)
export type AxiomType =
  | 'REFERENTIAL_INTEGRITY' // No broken links referencing non-existent documents or sections
  | 'ISOLATED_ENTITY'; // Isolated notes with no incoming relations or board

export interface ProblemRecord {
  title: string;
  paragraph?: string;
  subtitles: string[];
}

export interface AxiomViolation {
  id: string;
  type: AxiomType;
  severity: 'error' | 'warning';
  message: string;
  affectedNodeIds: string[];
  affectedEdgeIds?: string[];
}

export interface AxiomEvaluationResult {
  /** Logical/business-rule consistency: warnings do not make this false. */
  isConsistent: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  violations: AxiomViolation[];
}

export interface KnowledgeGraphParagraph extends Paragraph {
  origin?: string;
  section?: string;
}

export interface KnowledgeGraphNode {
  id: string;
  name: string;
  role: KnowledgeGraphEntityRole;
  instanceKind?: KnowledgeGraphInstanceKind;
  classKind?: KnowledgeGraphClassKind;
  classCategory?: KnowledgeGraphClassCategory;
  boardTitle?: string;
  noteTitle: string;
  paragraph?: KnowledgeGraphParagraph;
  /** Original headings represented by a board-wide shared paragraph instance. */
  paragraphOccurrences?: KnowledgeGraphParagraph[];
  description?: string;
  properties: KnowledgeGraphDataProperties;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  strokeColor?: string;
  width?: number; // For rectangular literal nodes
  height?: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  type: KnowledgeGraphRelationType;
  label?: string;
  dashed?: boolean;
  color?: string;
  targetSection?: string;
  propertyLabel?: string;
}

export interface KnowledgeGraphLinkEvidence {
  label: string;
  url: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  /** Source headings contained in card bodies, available to extensions. */
  cardSubheadings?: {
    cardNodeId: string;
    occurrenceId: string;
    title: string;
    noteTitle: string;
  }[];
  axioms: AxiomEvaluationResult;
}
