import { Paragraph } from '../../components/HeaderSelectBar';

// 1. Formal Entity Roles & VOWL Shapes
export type OntologyEntityRole = 'CLASS' | 'INSTANCE' | 'LITERAL';
export type OntologyInstanceKind =
  | 'CARD'
  | 'NOTE'
  | 'PARAGRAPH'
  | 'BOARD_PARAGRAPH'
  | 'CONNECTED_PARAGRAPH'
  | 'EXTERNAL_LINK'
  | 'CONNECTED_EXTERNAL_LINK';
export type OntologyClassKind = 'NOTE' | 'BOARD_CARD' | 'EXTERNAL_LINK' | 'TITLE_KEYWORD';
export type OntologyClassCategory = 'BUILT_IN' | 'BOARD' | 'TOPIC';

// 2. Data Properties (YAML Frontmatter only)
// Enforced constraint: Only NOTE instances can have non-empty properties.
// Always and only keys defined in YAML frontmatter can become properties.
export type OntologyPropertyValue =
  | string
  | number
  | boolean
  | null
  | unknown[]
  | Record<string, unknown>;

export interface OntologySectionProperty {
  title: string;
  level: number;
  path: string;
  autoSection?: string;
}

export interface OntologyDataProperties {
  schedule?: string;
  sections?: OntologySectionProperty[];
  [key: string]: OntologyPropertyValue | undefined;
}

// 3. Object & Datatype Relations (Edges in VOWL)
export type InferableRelationType = 'INSTANCE_OF' | 'SUBCLASS_OF';
export type InferredRelationType = `INFERRED_${InferableRelationType}`;

export interface OntologyInference {
  rule: 'INSTANCE_INHERITANCE' | 'SUBCLASS_TRANSITIVITY';
  /** IDs of the original edges supporting this inference. */
  premiseEdgeIds: string[];
  /** IDs of the nodes whose labels or roles were used by the rule. */
}

export type OntologyRelationType =
  | 'INSTANCE_OF' // Individual -> class membership
  | 'SUBCLASS_OF' // Sub-class hierarchy
  | 'REPRESENTED_BY_NOTE' // Class -> corresponding note annotation
  | 'REFERENCES' // Document _NOTELINK (reference/citation)
  | 'EXTERNAL_REFERENCE' // Document -> external link individual
  | 'PART_OF' // Parent/Child document path hierarchy
  | InferredRelationType // Preserve the inferred predicate separately from its evidence
  | 'DATATYPE_PROPERTY'; // Instance -> Literal (e.g. hasSchedule)

// 4. Axioms (Constraints, Validation, Inference)
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
  inferredEdges: InferredOntologyEdge[];
}

export interface OntologyParagraph extends Paragraph {
  origin?: string;
  section?: string;
}

export interface OntologyNode {
  id: string;
  name: string;
  role: OntologyEntityRole;
  instanceKind?: OntologyInstanceKind;
  classKind?: OntologyClassKind;
  classCategory?: OntologyClassCategory;
  /** Canonical label used only by explicitly allowed matching rules. */
  matchLabel?: string;
  boardTitle?: string;
  noteTitle: string;
  paragraph?: OntologyParagraph;
  /** Original headings represented by a board-wide shared paragraph instance. */
  paragraphOccurrences?: OntologyParagraph[];
  description?: string;
  properties: OntologyDataProperties; // Formal Data Properties
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  strokeColor?: string;
  datatypeKey?: string; // 'schedule'
  literalValue?: string;
  width?: number; // For rectangular literal nodes
  height?: number;
}

export interface OntologyEdge {
  id: string;
  source: string;
  target: string;
  type: OntologyRelationType;
  label?: string;
  dashed?: boolean;
  color?: string;
  targetSection?: string;
  propertyLabel?: string; // Explicit VOWL label displayed in center property box
}

export interface OntologyLinkEvidence {
  label: string;
  url: string;
}

export interface InferredOntologyEdge extends OntologyEdge {
  type: InferredRelationType;
  inferences: OntologyInference[];
}

export interface OntologyGraphData {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  datatypeNodes?: OntologyNode[];
  datatypeEdges?: OntologyEdge[];
  axioms: AxiomEvaluationResult;
}
