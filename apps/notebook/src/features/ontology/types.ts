import { Paragraph } from '../../components/HeaderSelectBar';

// 1. Formal Entity Roles & VOWL Shapes
export type OntologyEntityRole = 'CLASS' | 'INSTANCE' | 'LITERAL';
export type OntologyInstanceKind = 'CARD' | 'NOTE' | 'PARAGRAPH' | 'CONNECTED_PARAGRAPH';
export type OntologyClassKind =
  | 'NOTE'
  | 'BOARD_CARD'
  | 'BOARD_STATUS'
  | 'LINKED_PARAGRAPH'
  | 'TITLE_KEYWORD';
export type OntologyClassCategory = 'BUILT_IN' | 'BOARD' | 'TOPIC';
export type OntologyNodeType = 'CLASS' | 'INSTANCE' | 'LITERAL';
export type VowlShape = 'circle' | 'rect';

// 2. Data Properties (Sections, Schedule)
export interface OntologySectionProperty {
  title: string;
  level: number;
  path: string;
  autoSection?: string;
}

export interface OntologyDataProperties {
  schedule?: string; // TimerTag (e.g. "YYYY-MM-DD")
  sections?: OntologySectionProperty[]; // Sub-headers internalized as structural properties
  updated?: string;
}

// 3. Object & Datatype Relations (Edges in VOWL)
export type InferableRelationType = 'INSTANCE_OF' | 'SUBCLASS_OF' | 'PART_OF';
export type InferredRelationType = `INFERRED_${InferableRelationType}`;

export interface OntologyInference {
  rule: 'INSTANCE_INHERITANCE' | 'SUBCLASS_TRANSITIVITY';
  /** IDs of the original edges supporting this inference. */
  premiseEdgeIds: string[];
  /** IDs of the nodes whose labels or roles were used by the rule. */
}

export type OntologyRelationType =
  | 'INSTANCE_OF' // Card -> Board (is-a membership)
  | 'SUBCLASS_OF' // Sub-class hierarchy
  | 'REFERENCES' // Document _NOTELINK (reference/citation)
  | 'PART_OF' // Parent/Child document path hierarchy
  | InferredRelationType // Preserve the inferred predicate separately from its evidence
  | 'DATATYPE_PROPERTY' // Instance -> Literal (e.g. hasSchedule)
  // Legacy document-hierarchy alias retained outside the removed recommendation model.
  | 'PARENT_CHILD';

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
  type: OntologyNodeType; // 'CLASS' | 'INSTANCE' | 'LITERAL'
  boardTitle?: string;
  noteTitle: string;
  paragraph?: OntologyParagraph;
  description?: string;
  properties: OntologyDataProperties; // Formal Data Properties
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  strokeColor?: string;
  // VOWL Specification Extensions
  shape?: VowlShape; // 'circle' for Class/Instance, 'rect' for Literal
  vowlType?: 'class' | 'instance' | 'literal';
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
  isAxiomViolation?: boolean;
  curveOffset?: number;
  // VOWL Specification Extensions
  propertyType?: 'object' | 'datatype';
  propertyLabel?: string; // Explicit VOWL label displayed in center property box
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
