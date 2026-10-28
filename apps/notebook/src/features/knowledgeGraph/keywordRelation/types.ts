/** Shared contracts and state factories for keyword analysis and graph search. */
import type { associationContextLabels } from './keyword/keywordUtils';
import type { RelationPatternCacheInfo } from './keywordRelationCache';
import type { KnowledgeGraphRelationType } from '../types';
import type { KnowledgeGraphNodeKindLabel } from '../utils/relations';

/** Scoped source data needed by relation analysis, independent of template discovery. */
export type RelationAnalysisNote = { title: string; description?: string };

export type RelationAnalysisState = {
  /** 이번 실행의 진행 상태를 이전 검색 임베딩 결과와 구분하는 세션 내 식별자. */
  runId: number;
  status: 'idle' | 'running' | 'ready' | 'stopping' | 'cancelled' | 'completed' | 'failed';
  prepareOnly: boolean;
  phase:
    | 'checking'
    | 'keywords'
    | 'types'
    | 'contexts'
    | 'candidates'
    | 'grouping'
    | 'restoring'
    | 'association';
  processed: number;
  total: number;
  /** 현재 단계의 세부 작업을 포함한 0~1 진행률. 처리 건수의 단위와 독립적이다. */
  stageProgress?: number;
  elapsedMs: number;
  entities?: RelationEntityResult;
  patterns?: RelationInputPattern[];
  patternCache?: RelationDiscoveryResult['patternCache'];
  result?: RelationDiscoveryResult;
  error?: string;
};

export function initialRelationAnalysisState(): RelationAnalysisState {
  return {
    runId: 0,
    status: 'idle',
    prepareOnly: true,
    phase: 'checking',
    processed: 0,
    total: 0,
    elapsedMs: 0,
  };
}

export type RelationAnalysisSession = {
  data: {
    scope: string;
    available: boolean;
    notes: {
      data?: RelationAnalysisNote[];
      isError: boolean;
      isFetching: boolean;
      refetch: () => void;
    };
  };
  analysis: RelationAnalysisState & { start: () => void; stop: () => void };
};

export type AssociationContextKind = keyof typeof associationContextLabels;

/** Bump when keyword admission, candidate collection or association scoring rules change. */
export const relationAssociationRevision = 'six-context-associations-v3';

export type RelationAssociationMetrics = {
  context: AssociationContextKind;
  contextCount: number;
  sourceCount: number;
  targetCount: number;
  pairCount: number;
  lift: number;
  npmi: number;
  specificity: number;
  score: number;
};

type RelationAssociationSummary = {
  context: AssociationContextKind;
  score: number;
  evidenceCount: number;
  /** Zero for a single pair, independently of repeated evidence supporting that pair. */
  generalizationScore: number;
};

type RelationAssociationStats = {
  contextCount: number;
  pairCount: number;
  evidenceCount: number;
};

export type AssociationInferenceProgress = {
  total: number;
  processed: number;
  ratio?: number;
  elapsedMs: number;
  status: 'running' | 'completed' | 'failed';
  model: 'statistics';
  phase: 'association';
  unit: 'note' | 'context' | 'pattern';
  stage: 'types' | 'contexts' | 'collection' | 'grouping' | 'evaluation' | 'completion';
};

export type AssociationOptions = {
  memory?: RelationDiscoveryMemory;
  translate?: (value: string) => string;
  signal?: AbortSignal;
  onEntities?: (result: RelationEntityResult) => void;
  onEntityTypes?: (result: RelationEntityResult) => void;
  onEntityProgress?: (progress: RelationEntityProgress) => void;
  onPatterns?: (patterns: RelationInputPattern[]) => void;
  onInferenceProgress?: (progress: AssociationInferenceProgress) => void;
};

export type RelationAssociationPreparation = {
  result: RelationDiscoveryResult;
  /** Retain occurrence counts, including singleton contexts, without calculating scores. */
  families: Map<string, RelationAssociationFamilyCounts>;
};

type RelationAssociationFamilyCounts = {
  contextCount: number;
  marginals: Map<string, number>;
  pairs: Map<string, number>;
};

export type RelationEntityResult = {
  status: 'completed';
  noteCount: number;
  inputCount: number;
  mentionCount: number;
  entities: {
    text: string;
    type: string | null;
    key?: string;
    mentionCount: number;
    noteCount: number;
  }[];
  /** Structural provenance and excerpts are cached with unscored relationship inputs. */
  details?: Record<string, RelationEntitySources>;
  /** Equal positive keyword counts in complete structural enumerations; never new entities. */
  enumerations?: RelationKeywordEnumeration[];
  /** Qualified recurring subenumerations and their strict-subset type hierarchy. */
  entityTypes?: RelationEntityType[];
};

export type RelationKeywordSource = {
  noteTitle: string;
  section: string;
  sectionPath?: string[];
  /** Original link destination; labels alone do not identify an external or internal link. */
  href?: string;
  kind: 'title' | 'heading' | 'link' | 'bold' | 'field-name' | 'field-value';
  keyword: string;
  text: string;
};

export type RelationEntitySentence = {
  noteTitle: string;
  section: string;
  sectionPath?: string[];
  text: string;
  entities: string[];
  entityKeys?: string[];
};

export type RelationEntitySources = {
  sources: RelationKeywordSource[];
  sentences: RelationEntitySentence[];
};

export type RelationEntityProgress = {
  status: 'running' | 'completed';
  ratio?: number;
  noteCount: number;
  completedNotes: number;
  inputCount: number;
  elapsedMs: number;
};

/** 검색에서 사용하는 임베딩 추론 인터페이스. 관계 평가는 통계만 사용한다. */
export type RelationDiscoveryRuntime = {
  prepare?: () => Promise<void>;
  embed: (text: string) => Promise<number[]>;
  /** 원본 입력 인덱스로 완료와 실패를 알리며 GPU 배치 순서와 무관하게 결과를 연결한다. */
  embedMany?: (
    texts: string[],
    callbacks: {
      onResult: (index: number, vector?: number[]) => void;
    }
  ) => Promise<void>;
  dispose?: () => void | Promise<void>;
};

export type RelationObservation = {
  /** Physical source identity is shared by every expanded type combination. */
  evidenceId?: string;
  noteTitle: string;
  section: string;
  sectionPath?: string[];
  source: string;
  target: string;
  sourceType: string | null;
  targetType: string | null;
  sourceEntityTypes?: [string];
  targetEntityTypes?: [string];
  origin: 'sentence' | 'field' | 'table';
  evidence: string;
  template: string;
  /** Sentence endpoints follow textual order, not an asserted semantic direction. */
  direction: 'text-order' | 'document-value' | 'column-order' | 'undirected';
};

export type RelationInputPattern = {
  associationContext?: RelationAssociationMetrics['context'];
  associationFamily?: string;
  label: string;
  /** 역할 설명자를 적용한 후보 패턴. 설명자가 없는 한쪽은 고정 키워드가 될 수 있다. */
  template: string;
  /** Positional source form prevents descriptor text from being interpreted as another slot. */
  slotTemplate?: string;
  origin: RelationObservation['origin'];
  sourceType: string | null;
  targetType: string | null;
  sourceEntityTypes?: [string];
  targetEntityTypes?: [string];
  source?: string;
  target?: string;
  observationCount: number;
  noteSupport: number;
  pairSupport: number;
};

export type RelationEvidenceMeasurement = {
  evidenceId?: string;
  noteTitle: string;
  evidence: string;
  association?: RelationAssociationMetrics;
};

export type InductiveRelationCandidate = {
  /** Prepared candidates retain their context without claiming to have been evaluated. */
  associationContext?: AssociationContextKind;
  association?: RelationAssociationSummary;
  /** Exact statistical population, shared across notes with the same structural roles. */
  associationFamily?: string;
  associationRoles?: string[];
  id: string;
  label: string;
  template: string;
  /** Public pattern text; template retains positional slots for concrete evidence reconstruction. */
  patternTemplate?: string;
  variants: string[];
  noteSupport: number;
  pairSupport: number;
  recurring: boolean;
  observations: RelationObservation[];
  measurements: RelationEvidenceMeasurement[];
};

export type RelationDiscoveryResult = {
  method?: 'association';
  associationStats?: RelationAssociationStats;
  noteCount: number;
  entityCount: number;
  observationCount: number;
  candidates: InductiveRelationCandidate[];
  warnings: string[];
  patternCache?: RelationPatternCacheInfo;
  cacheRestored?: boolean;
  /** Structural keywords supported by at least three distinct notes. */
  entityExtraction?: RelationEntityResult;
  inputPatterns?: RelationInputPattern[];
  discoveryStats?: RelationDiscoveryStats;
  associationProgress?: RelationAssociationProgress;
};

type RelationAssociationProgress = {
  total: number;
  completed: number;
  status: 'running' | 'completed' | 'failed';
};

type RelationDiscoveryStats = {
  changedNotes: number;
  reusedNotes: number;
  removedNotes: number;
};

export type ParsedRelationNote = {
  title: string;
  description: string;
  keywordSources: RelationKeywordSource[];
  sentences: RelationContent['sentences'];
  blocks: RelationTextBlock[];
  enumerations: RelationContent['enumerations'];
  contentVersion: string;
  searchable: string;
  entitySentences?: { dictionary: Set<string>; rows: RelationEntitySentence[] };
};

export type RelationDiscoveryMemory = {
  notes: Map<string, ParsedRelationNote>;
  documents: Map<string, RelationDocument>;
  stats: RelationDiscoveryStats;
  entityExtraction?: { notes: Map<string, ParsedRelationNote>; result: RelationEntityResult };
};

export type RelationTextBlock = {
  section: string;
  sectionPath: string[];
  text: string;
  field?: string;
  /** Whole property value before linked entries split into individual owner-value blocks. */
  fieldValue?: string;
  column?: string;
  columnIndex?: number;
  table?: number;
  row?: number;
  /** Original list ancestry remains available to association analysis. */
  listItem?: RelationEnumerationRegion['listItem'];
  /** Keep a full contextual claim even when it is not eligible for a binary relation. */
  sourceText?: string;
};

export type Region = RelationEnumerationRegion & {
  blocks: RelationTextBlock[];
  sources: RelationKeywordSource[];
  text: string;
  references: { text: string; href: string }[];
  position: string;
  selfReference: boolean;
  identities: string[];
};

export type RelationDocument = {
  description: string;
  title: string;
  regions: Region[];
  metadataValues: { field: string; value: string }[];
  /** Only explicit Markdown header rows; inferred rows never corroborate themselves. */
  headerRows: string[][];
};

export type RelationContent = {
  blocks: RelationTextBlock[];
  keywordSources: RelationKeywordSource[];
  sentences: Pick<RelationTextBlock, 'section' | 'sectionPath' | 'text'>[];
  excludedRegions: number[];
  enumerations: RelationEnumerationCandidate[];
};

export type RelationEnumerationKind =
  | 'note-title'
  | 'heading'
  | 'list'
  | 'table-column'
  | 'table-row';

export type RelationEnumerationRegion = {
  text: string;
  sectionPath: string[];
  headingLevel?: number;
  listItem?: { list: number; item: number; parent?: number };
  cell?: { table: number; row: number; column: number; header: boolean };
};

export type EnumerationItem = {
  noteTitle: string;
  sectionPath: string[];
  text: string;
  index: number;
};

export type RelationEnumerationCandidate = {
  kind: RelationEnumerationKind;
  noteTitle?: string;
  parentPath?: string;
  level?: number;
  list?: number;
  parentItem?: number;
  table?: number;
  row?: number;
  column?: number;
  items: EnumerationItem[];
};

export type RelationKeywordEnumeration = Omit<RelationEnumerationCandidate, 'items'> & {
  keywordCount: number;
  items: (EnumerationItem & { keywords: { key: string; text: string }[] })[];
  /** Original and decomposed interpretations share one structural source. */
  sourceIndex?: number;
  decomposed?: boolean;
};

export type RelationEnumerationPattern = {
  keywordCount: number;
  items: { keywords: RelationKeywordEnumeration['items'][number]['keywords'] }[];
  occurrences: (RelationKeywordEnumeration & { enumerationIndex: number })[];
};

export type RelationEntityType = RelationEnumerationPattern & {
  name: string;
  /** Zero-based references into the collected type array; shorter sets are parents. */
  parentIndices: number[];
  childIndices: number[];
};

export const GRAPH_SEARCH_EMBEDDING_CHARS = 384;

export type GraphSource = {
  id: string;
  title: string;
  paragraph?: string;
  section?: string;
  path?: string;
  text: string;
  href?: string;
  /** Complete structural units, in the unchanged text's character coordinates. */
  blocks?: { start: number; end: number }[];
  /** Table cells retain source coordinates and merged-cell ownership without copying their text. */
  tables?: {
    start: number;
    end: number;
    rows: {
      cells: {
        start: number;
        end: number;
        header?: boolean;
        rowSpan?: number;
        columnSpan?: number;
      }[];
    }[];
  }[];
  /** Enclosing heading sections; without headings the whole source is the context scope. */
  scopes?: { start: number; end: number }[];
  /** Heading names and HTML anchor identities resolve references without vocabulary rules. */
  anchors?: {
    name: string;
    start: number;
    end: number;
    section?: string;
    path?: string[];
    kind?: 'heading' | 'id';
  }[];
  /** Links belong to their original source blocks; targets retain canonical source coordinates. */
  references?: {
    start: number;
    end: number;
    href: string;
    name: string;
    internal?: boolean;
    unresolved?: boolean;
    targets?: { sourceId: string; start: number; end: number }[];
    /** Resolved app destination; the original href remains unchanged for source identity. */
    resolvedHref?: string;
  }[];
  /** Extraction text remains linked to its accessible original paragraph or note. */
  origin?: { sourceId: string; ranges: { start: number; end: number }[] };
};

export type SearchNode = {
  id: string;
  name: string;
  kind: KnowledgeGraphNodeKindLabel;
  typeLabel: string;
  noteTitle: string;
  /** Node-local metadata; shared source text is resolved through sourceIds. */
  body: string;
  sourceIds: string[];
  /** Query-local provenance hints; the complete source inventory and embedding input stay unchanged. */
  matchedSourceIds?: string[];
  url?: string;
};

export type SearchEdge = {
  id: string;
  source: string;
  target: string;
  type: KnowledgeGraphRelationType;
  label: string;
  directed: boolean;
  associationScore?: number;
  sourceIds: string[];
  /** Exact ranges recorded when this relationship was extracted, relative to its sources. */
  evidence?: { sourceId: string; start: number; end: number }[];
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

export type GraphSearchVectorCache = {
  model: string;
  vectors: [string, number[]][];
  graph?: {
    version: 1;
    revision: string;
    inputRevision?: string;
    documentCount: number;
    /** Vector identities in the document order of this exact snapshot revision. */
    documents: string[];
  };
};

export type GraphQueryPlan = {
  terms: string[];
  intent: 'related' | 'connection';
  maxHops: number;
  /** Explicitly named question subjects, before retrieval seed limits are applied. */
  targetIds?: string[];
  /** Alternatives matched at the same query mention; distinct mentions define distinct subjects. */
  targetGroups?: string[][];
  /** Names remain available even when retrieval limits exclude a named target. */
  targetNames?: Record<string, string>;
  /** Retain classifications for query targets outside the retrieved result. */
  targetTypes?: Record<string, string>;
  /** Originating notes for paragraph targets, even when retrieval excludes those targets. */
  targetNotes?: Record<string, string[]>;
};

export type GraphPath = {
  nodes: string[];
  edges: string[];
  kind?: 'connection' | 'surrounding';
};

export type GraphContextEntry =
  | { kind: 'node' | 'edge'; id: string; citationIds: string[] }
  | { kind: 'path'; index: number; citationIds: string[] };

export type GraphContextCitation = GraphSource & {
  /** The original source and the exact character range quoted by this citation. */
  sourceId: string;
  start: number;
  end: number;
};

export type GraphSearchResult = {
  scope: string;
  revision: string;
  query: string;
  plan: GraphQueryPlan;
  nodes: { node: SearchNode; score: number }[];
  edges: { edge: SearchEdge; score: number }[];
  paths: GraphPath[];
  sources: GraphSource[];
  context: {
    /** Canonical Markdown context; convert to HTML only at the viewer boundary. */
    text: string;
    citations: GraphContextCitation[];
    entries: GraphContextEntry[];
    truncated: boolean;
    usage: { characters: number; limit: number };
  };
  limited: boolean;
  /** False when an explicit retrieval limit interrupted the requested path search. */
  pathSearchComplete?: boolean;
};

export type GraphSearchProgress = {
  phase: 'index' | 'embedding' | 'search';
  processed: number;
  total: number;
};

export type GraphSearchCacheReadTiming = {
  details: Record<string, string | number | boolean | undefined>;
  steps: { name: string; start: number; end?: number; status?: '완료' | '실패' | '중단' }[];
  reused?: boolean;
};

export type GraphSearchCache = {
  read: <T>(
    scope: string,
    key: string,
    onRead?: (timing: GraphSearchCacheReadTiming) => void
  ) => Promise<T | undefined>;
  write: (scope: string, key: string, value: unknown) => Promise<void>;
};
