/** Source-neutral input; identities and source locations are opaque to the inference engine. */
export interface TopicSection {
  id: string;
  heading?: string;
  text: string;
  references?: string[];
  paragraph?: string;
  section?: string;
}

export interface TopicDocument {
  id: string;
  title: string;
  sections: TopicSection[];
}

export interface TopicOccurrence {
  documentId: string;
  contentId: string;
  title: string;
  paragraph?: string;
  section?: string;
  sectionId: string;
}

export interface TopicMember {
  id: string;
  heading: string;
  text: string;
  /** Prepared during inference so filtering does not normalize the whole notebook on the UI thread. */
  searchText: string;
  occurrences: TopicOccurrence[];
}

export interface TopicEvidence {
  source: string;
  target: string;
  fragments: string[];
  /** Corroborating body phrases near the original section; headings and metadata are excluded. */
  contextFragments?: string[];
  references: string[];
  /** A ranking measure, never a probability of semantic correctness. */
  weight: number;
}

export interface InferredTopic {
  id: string;
  label: string;
  /** Every naming component is shared body evidence; separators do not imply a quoted sentence. */
  nameFragments?: string[];
  /** One original body excerpt to distinguish otherwise unresolved names, never a group-wide claim. */
  example?: { memberId: string; text: string };
  searchText: string;
  members: TopicMember[];
  evidence: TopicEvidence[];
  documentCount: number;
  kind: 'INFERRED' | 'CURATED';
}

export interface TopicInferenceResult {
  topics: InferredTopic[];
  unclassified: TopicMember[];
  documentCount: number;
  distinctContentCount: number;
  sectionCount: number;
  comparedPairCount: number;
}

export interface TopicPreferences {
  labels: Record<string, string>;
  excluded: Record<string, string[]>;
  hidden: string[];
  collections: { id: string; label: string; memberIds: string[] }[];
}
