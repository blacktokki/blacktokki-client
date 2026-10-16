import { toMarkdown } from '@blacktokki/editor';

import { noteBasename as basename, prepareRelationCorpus } from './optimizer/corpus';
import type { RelationContent, RelationDocument, RelationTextBlock } from './optimizer/corpus';
import { discoverTableRelations, includeTableAnchors } from './optimizer/tables';
import type { TableContext } from './optimizer/tables';
import {
  DEFAULT_RELATION_POLICY,
  prepareRelationValidation,
  relationScoreVerdict,
} from './optimizer/validation';
import {
  classifyRelationKeywords,
  createRelationKeywordMatcher,
  normalizeRelationText as normalize,
  relationKeyword,
  relationKeywordKey as keywordKey,
  relationKeywordEntityKey,
} from './relationKeywords';
import { createRelationInferenceProgress, RelationInferenceProgress } from './relationProgress';
import { RelationAnalysisNote } from './types';

export type RelationMention = {
  key: string;
  text: string;
  type: string | null;
  start: number;
  end: number;
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
  /** Structural keyword provenance and complete contextual sentences stay in session memory. */
  details?: Record<string, RelationEntitySources>;
};
export type RelationKeywordSource = {
  noteTitle: string;
  section: string;
  sectionPath?: string[];
  /** Original link destination; labels alone do not identify an external or internal link. */
  href?: string;
  kind:
    | 'title'
    | 'heading'
    | 'link'
    | 'table-header'
    | 'bold'
    | 'field-name'
    | 'field-value'
    | 'table-cell';
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
  noteCount: number;
  completedNotes: number;
  inputCount: number;
  elapsedMs: number;
};

export type EntailmentScores = { entailment: number; neutral: number; contradiction: number };

/** Inference is injectable so discovery can be verified without downloading model weights. */
export type RelationDiscoveryRuntime = {
  embed: (text: string) => Promise<number[]>;
  /** Report each input by its original index, including failures, as batches finish. */
  embedMany?: (
    texts: string[],
    callbacks: {
      onBatch: (indices: number[]) => void;
      onResult: (index: number, vector?: number[]) => void;
    }
  ) => Promise<void>;
  entailment: (premise: string, hypothesis: string) => Promise<EntailmentScores>;
  release?: (stage: 'embedding') => Promise<void>;
  dispose?: () => void | Promise<void>;
};

export type RelationObservation = {
  noteTitle: string;
  section: string;
  sectionPath?: string[];
  source: string;
  target: string;
  sourceType: string | null;
  targetType: string | null;
  origin: 'sentence' | 'field' | 'table';
  evidence: string;
  template: string;
  /** Sentence endpoints follow textual order, not an asserted semantic direction. */
  direction: 'text-order' | 'document-value' | 'column-order';
};

export type RelationInputPattern = {
  label: string;
  /** Exact entity-masked text passed to the embedding model, before pattern merging. */
  template: string;
  origin: RelationObservation['origin'];
  sourceType: string | null;
  targetType: string | null;
  observationCount: number;
  noteSupport: number;
  pairSupport: number;
};

export type RelationValidation = {
  noteTitle: string;
  evidence: string;
  hypothesis: string;
  /** Source of the pattern instantiated with this observation's entities, not a literal quotation. */
  hypothesisSource?: Pick<RelationObservation, 'noteTitle' | 'section' | 'sectionPath'>;
  /** False means the originating example is checked, rather than a held-out note. */
  heldOut: boolean;
  basis?: 'reconstruction' | 'cross-note' | 'source';
  control?: { hypothesis: string; scores?: EntailmentScores };
  scores?: EntailmentScores;
  skipReason?: 'pending' | 'model-error' | 'context-too-long';
  error?: string;
  attempts?: number;
  verdict: 'supported' | 'contradicted' | 'neutral' | 'uncertain' | 'unverified';
};

export type InductiveRelationCandidate = {
  id: string;
  label: string;
  template: string;
  variants: string[];
  noteSupport: number;
  pairSupport: number;
  recurring: boolean;
  observations: RelationObservation[];
  validations: RelationValidation[];
};

export type RelationDiscoveryResult = {
  noteCount: number;
  entityCount: number;
  observationCount: number;
  candidates: InductiveRelationCandidate[];
  warnings: string[];
  contextualEvidence?: TableContext[];
  optimization?: { excludedNavigationRegions: number };
  patternChanges?: { added: number; removed: number };
  cacheIndexIncomplete?: boolean;
  cacheRestored?: boolean;
  /** Frequent structural keywords plus explicit whole table-record anchors. */
  entityExtraction?: RelationEntityResult;
  inputPatterns?: RelationInputPattern[];
  discoveryIncomplete?: boolean;
  discoveryStats?: RelationDiscoveryStats;
  validationProgress?: RelationValidationProgress;
  nliStats?: {
    mergeChecks: number;
    validationChecks: number;
    successfulChecks: number;
    reusedValidationChecks?: number;
    reusedMergeChecks?: number;
    modelErrors: number;
    oversizedInputs: number;
  };
};

export type RelationValidationProgress = {
  batch: number;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  uniqueInputs?: number;
  reused?: number;
  modelChecks?: number;
  resumed: boolean;
  phase: 'validation' | 'retry';
  status: 'running' | 'completed' | 'failed';
};

export type RelationDiscoveryOptions = {
  runtime: RelationDiscoveryRuntime;
  /** Intermediate parsing, vectors and merge scores exist only for the active in-memory session. */
  memory?: RelationDiscoveryMemory;
  signal?: AbortSignal;
  /** Similarity proposes a merge; bidirectional NLI must also support it. */
  similarityThreshold?: number;
  entailmentThreshold?: number;
  /** Bound pattern comparisons independently of final validation batches. */
  maxMergeNliChecks?: number;
  /** Extract keywords and relation patterns without running embeddings or NLI. */
  prepareOnly?: boolean;
  /** Prepare session vectors without starting either NLI merging or final validation. */
  embeddingOnly?: boolean;
  /** Cache restoration never starts NLI for an uncached pattern comparison. */
  cacheOnly?: boolean;
  restoreGroups?: (observations: RelationObservation[][]) => Promise<Map<string, string>>;
  onEntities?: (result: RelationEntityResult) => void;
  onEntityProgress?: (progress: RelationEntityProgress) => void;
  onInferenceProgress?: (progress: RelationInferenceProgress) => void;
  onPatterns?: (patterns: RelationInputPattern[]) => void;
};

type Pattern = {
  label: string;
  template: string;
  observations: RelationObservation[];
  observationKeys: Set<string>;
  noteTitles: Set<string>;
};

export type RelationDiscoveryStats = {
  changedNotes: number;
  reusedNotes: number;
  removedNotes: number;
  rematchedNotes: number;
  embeddingReuses: number;
  mergeScoreReuses: number;
};
type ParsedRelationNote = {
  title: string;
  description: string;
  keywords: string[];
  keywordSources: RelationKeywordSource[];
  sentences: RelationContent['sentences'];
  blocks: RelationTextBlock[];
  contentVersion: string;
  searchable: string;
  observations?: RelationObservation[];
  tableContexts?: TableContext[];
  dictionary?: Map<string, string | null>;
  entitySentences?: { dictionary: Set<string>; rows: RelationEntitySentence[] };
};
export type RelationDiscoveryMemory = {
  notes: Map<string, ParsedRelationNote>;
  documents: Map<string, RelationDocument>;
  embeddings: Map<string, number[]>;
  mergeScores: Map<string, EntailmentScores>;
  stats: RelationDiscoveryStats;
  entityExtraction?: { notes: Map<string, ParsedRelationNote>; result: RelationEntityResult };
};

export function createRelationDiscoveryMemory(): RelationDiscoveryMemory {
  return {
    notes: new Map(),
    documents: new Map(),
    embeddings: new Map(),
    mergeScores: new Map(),
    stats: {
      changedNotes: 0,
      reusedNotes: 0,
      removedNotes: 0,
      rematchedNotes: 0,
      embeddingReuses: 0,
      mergeScoreReuses: 0,
    },
  };
}

/** One stable identity for grouping, cache metadata and restored groups. */
export const relationPatternIdentity = (
  pattern: Pick<RelationInputPattern, 'origin' | 'template' | 'sourceType' | 'targetType'>
) =>
  JSON.stringify([
    pattern.origin,
    keywordKey(pattern.template),
    pattern.sourceType,
    pattern.targetType,
  ]);

function patternLabel({ origin, template }: Pick<RelationObservation, 'origin' | 'template'>) {
  if (origin === 'field')
    return /^\{\{E1\}\}의 (.+)[은는] \{\{E2\}\}이다\.$/.exec(template)?.[1] || template;
  if (origin === 'table') {
    const columns = /^(.+): \{\{E1\}\}; (.+): \{\{E2\}\}$/.exec(template);
    return columns ? `${columns[1]} / ${columns[2]}` : template;
  }
  return normalize(
    template
      .replace(/\{\{E[12]\}\}(?:은|는|이|가|을|를|의|에서|에게|에|으로|로|와|과)?/g, ' ')
      .replace(/[.!?。！？]$/g, '')
  );
}

/** Compact pre-merge inventory; existing checkpoints can recover it from original observations. */
function collectInputPatterns(observations: RelationObservation[]): RelationInputPattern[] {
  const patterns = new Map<
    string,
    { input: RelationInputPattern; notes: Set<string>; pairs: Set<string> }
  >();
  for (const observation of observations) {
    const { template, origin, sourceType, targetType } = observation;
    const patternKey = relationPatternIdentity(observation);
    let pattern = patterns.get(patternKey);
    if (!pattern) {
      pattern = {
        input: {
          label: patternLabel(observation),
          template,
          origin,
          sourceType,
          targetType,
          observationCount: 0,
          noteSupport: 0,
          pairSupport: 0,
        },
        notes: new Set<string>(),
        pairs: new Set<string>(),
      };
      patterns.set(patternKey, pattern);
    }
    pattern.input.observationCount++;
    pattern.notes.add(observation.noteTitle);
    pattern.pairs.add(
      JSON.stringify([keywordKey(observation.source), keywordKey(observation.target)])
    );
  }
  return [...patterns.values()]
    .map(({ input, notes, pairs }) => ({
      ...input,
      noteSupport: notes.size,
      pairSupport: pairs.size,
    }))
    .sort((a, b) => a.template.localeCompare(b.template));
}

export function getRelationInputPatterns(result: RelationDiscoveryResult): RelationInputPattern[] {
  return (
    result.inputPatterns ||
    collectInputPatterns(result.candidates.flatMap((candidate) => candidate.observations))
  );
}

export function checkRelationCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('Relation discovery cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

export const relationVerdict = relationScoreVerdict;

function parseRelationNote(
  note: RelationAnalysisNote,
  memory: RelationDiscoveryMemory,
  content?: RelationContent
): ParsedRelationNote {
  const path = normalize(note.title);
  const description = note.description || '';
  const previous = memory.notes.get(path);
  if (!content && previous) return previous;
  const contentVersion = JSON.stringify(content!.excludedRegions);
  if (
    previous?.title === note.title &&
    previous.description === description &&
    previous.contentVersion === contentVersion
  )
    return previous;
  const { blocks, keywordSources, sentences } = content!;
  const parsed = {
    title: note.title,
    description,
    contentVersion,
    blocks,
    keywords: keywordSources.map((source) => source.keyword),
    keywordSources,
    sentences,
    searchable: keywordKey(
      [basename(note.title), ...sentences.map((sentence) => sentence.text)].join('\n')
    ),
  };
  memory.notes.set(path, parsed);
  return parsed;
}

/** Count each original keyword once per note path; numeric variants never share support. */
export async function extractRelationEntities(
  notes: RelationAnalysisNote[],
  signal?: AbortSignal,
  onProgress?: (progress: RelationEntityProgress) => void,
  memory: RelationDiscoveryMemory = createRelationDiscoveryMemory()
): Promise<RelationEntityResult> {
  const unique = [...new Map(notes.map((note) => [normalize(note.title), note])).values()];
  if (memory) {
    const currentPaths = new Set(unique.map((note) => normalize(note.title)));
    for (const path of memory.notes.keys()) {
      if (!currentPaths.has(path)) {
        memory.notes.delete(path);
        memory.stats.removedNotes++;
      }
    }
  }
  const inventory = new Map<
    string,
    ReturnType<typeof relationKeyword> & { mentionCount: number; notes: Set<string> }
  >();
  const keywords = new Map<string, ReturnType<typeof relationKeyword>>();
  const parsedNotes: ParsedRelationNote[] = [];
  const started = Date.now();
  let inputCount = 0;
  let completedNotes = 0;
  const notify = (status: RelationEntityProgress['status']) => {
    checkRelationCancelled(signal);
    onProgress?.({
      status,
      noteCount: unique.length,
      completedNotes,
      inputCount,
      elapsedMs: Date.now() - started,
    });
    checkRelationCancelled(signal);
  };
  notify('running');
  const cached = memory?.entityExtraction;
  if (
    cached &&
    cached.notes.size === unique.length &&
    unique.every((note) => {
      const parsed = cached.notes.get(normalize(note.title));
      return parsed?.title === note.title && parsed.description === (note.description || '');
    })
  ) {
    memory!.notes = new Map(cached.notes);
    memory!.stats.reusedNotes += unique.length;
    inputCount = cached.result.inputCount;
    completedNotes = unique.length;
    notify('completed');
    return cached.result;
  }
  const corpus = await prepareRelationCorpus(unique, toMarkdown, memory.documents, () =>
    checkRelationCancelled(signal)
  );
  let lastYield = Date.now();
  for (const note of unique) {
    checkRelationCancelled(signal);
    const notePath = normalize(note.title);
    const previous = memory?.notes.get(notePath);
    const parsed = parseRelationNote(note, memory, corpus.get(normalize(note.title)));
    parsedNotes.push(parsed);
    if (memory) memory.stats[previous === parsed ? 'reusedNotes' : 'changedNotes']++;
    for (const text of parsed.keywords) {
      inputCount++;
      let keyword = keywords.get(text);
      if (!keyword) keywords.set(text, (keyword = relationKeyword(text)));
      const name = keyword.key;
      const entity = inventory.get(name) || {
        ...keyword,
        mentionCount: 0,
        notes: new Set<string>(),
      };
      entity.mentionCount++;
      entity.notes.add(notePath);
      inventory.set(name, entity);
    }
    completedNotes++;
    if (Date.now() - lastYield >= 8 || completedNotes % 25 === 0) {
      notify('running');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkRelationCancelled(signal);
      lastYield = Date.now();
    }
  }
  const entities = classifyRelationKeywords(
    [...inventory.values()]
      .filter((entity) => entity.notes.size >= 3)
      .map(({ text, type, key, mentionCount, notes }) => ({
        text,
        type,
        key,
        mentionCount,
        noteCount: notes.size,
      }))
      .sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text))
  );
  const details: Record<string, RelationEntitySources> = Object.create(null);
  const names = new Map(entities.map((entity) => [entity.key, entity.text]));
  for (const entity of entities) details[entity.key] = { sources: [], sentences: [] };
  const result: RelationEntityResult = {
    status: 'completed',
    noteCount: unique.length,
    inputCount,
    mentionCount: entities.reduce((sum, entity) => sum + entity.mentionCount, 0),
    entities,
    details,
  };
  const matchEntities = createEntityMatcher(result);
  const dictionary = new Set(names.keys());
  const dictionaryChanges = new Map<Set<string>, string[]>();
  for (const parsed of parsedNotes) {
    checkRelationCancelled(signal);
    for (const source of parsed.keywordSources)
      details[keywords.get(source.keyword)!.key]?.sources.push(source);
    const previous = parsed.entitySentences;
    let changes = previous && dictionaryChanges.get(previous.dictionary);
    if (previous && !changes) {
      changes = [...new Set([...previous.dictionary, ...dictionary])].filter(
        (id) => previous.dictionary.has(id) !== dictionary.has(id)
      );
      dictionaryChanges.set(previous.dictionary, changes);
    }
    if (!previous || changes!.some((id) => parsed.searchable.includes(id))) {
      const rows: RelationEntitySentence[] = [];
      for (const sentence of parsed.sentences) {
        const present = [...new Set(matchEntities(sentence.text).map((mention) => mention.key))];
        if (present.length)
          rows.push({
            noteTitle: parsed.title,
            ...sentence,
            entities: present.map((id) => names.get(id)!),
            entityKeys: present,
          });
      }
      parsed.entitySentences = { dictionary, rows };
    }
    for (const row of parsed.entitySentences!.rows)
      for (const id of row.entityKeys!) details[id].sentences.push(row);
    parsed.entitySentences!.dictionary = dictionary;
    if (Date.now() - lastYield >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkRelationCancelled(signal);
      lastYield = Date.now();
    }
  }
  notify('completed');
  if (memory)
    memory.entityExtraction = {
      notes: new Map(parsedNotes.map((parsed) => [normalize(parsed.title), parsed])),
      result,
    };
  return result;
}

const entityMatchers = new WeakMap<
  RelationEntityResult,
  ReturnType<typeof createRelationKeywordMatcher>
>();

/** Reuse the same compiled dictionary and text matches between extraction and discovery. */
function createEntityMatcher(result: RelationEntityResult) {
  let matcher = entityMatchers.get(result);
  if (!matcher)
    entityMatchers.set(result, (matcher = createRelationKeywordMatcher(result.entities)));
  return matcher;
}

function particle(text: string): string {
  const code = text.charCodeAt(text.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 ? '은' : '는';
}

function instantiate(template: string, observation: RelationObservation): string {
  return template.replace(/\{\{E([12])\}\}(은|는|이|가|을|를|과|와)?/g, (_, slot, suffix) => {
    const name = slot === '1' ? observation.source : observation.target;
    if (!suffix || !/[가-힣]$/.test(name)) return name + (suffix || '');
    const consonant = particle(name) === '은';
    const forms = [
      ['은', '는'],
      ['이', '가'],
      ['을', '를'],
      ['과', '와'],
    ];
    const formsForSuffix = forms.find((pair) => pair.includes(suffix))!;
    return name + formsForSuffix[consonant ? 0 : 1];
  });
}

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  left.forEach((value, index) => {
    dot += value * right[index];
    leftNorm += value * value;
    rightNorm += right[index] * right[index];
  });
  return dot / Math.sqrt(leftNorm * rightNorm) || 0;
}

function supports(scores: EntailmentScores, threshold: number): boolean {
  return (
    scores.entailment >= threshold &&
    scores.entailment > scores.neutral &&
    scores.entailment > scores.contradiction
  );
}

/**
 * Discover open relation candidates from scoped notes, without a predicate vocabulary.
 * Names come from observed fields, columns and entity-masked sentences. Similar patterns
 * merge only after mutual entailment. Every fact remains a candidate with source evidence;
 * final validations are queued for the shared batch runner.
 */
export async function discoverInductiveRelations(
  notes: RelationAnalysisNote[],
  options: RelationDiscoveryOptions
): Promise<RelationDiscoveryResult> {
  checkRelationCancelled(options.signal);
  const unique = [...new Map(notes.map((note) => [normalize(note.title), note])).values()].sort(
    (a, b) => a.title.localeCompare(b.title)
  );
  const nliStats: NonNullable<RelationDiscoveryResult['nliStats']> = {
    mergeChecks: 0,
    validationChecks: 0,
    successfulChecks: 0,
    modelErrors: 0,
    oversizedInputs: 0,
  };
  const result: RelationDiscoveryResult = {
    noteCount: unique.length,
    entityCount: 0,
    observationCount: 0,
    candidates: [],
    warnings: [],
    contextualEvidence: [],
    nliStats,
  };
  const memory = options.memory || createRelationDiscoveryMemory();
  if (memory) {
    memory.stats = createRelationDiscoveryMemory().stats;
    result.discoveryStats = memory.stats;
  }
  result.entityExtraction = await extractRelationEntities(
    unique,
    options.signal,
    options.onEntityProgress,
    memory
  );
  result.entityCount = result.entityExtraction.entities.length;
  checkRelationCancelled(options.signal);
  if (!unique.length) {
    options.onEntities?.(result.entityExtraction);
    memory?.embeddings.clear();
    memory?.mergeScores.clear();
    result.inputPatterns = [];
    options.onPatterns?.(result.inputPatterns);
    return result;
  }
  const { runtime } = options;
  const progressStops: (() => void)[] = [];
  try {
    const threshold = options.entailmentThreshold ?? DEFAULT_RELATION_POLICY.entailmentThreshold;
    const maxMergeChecks = options.maxMergeNliChecks ?? 200;
    const warn = (message: string) => {
      if (!result.warnings.includes(message)) result.warnings.push(message);
    };
    const entities = createEntityMatcher(result.entityExtraction);
    const entityTypes = new Map(
      result.entityExtraction.entities.map((entity) => [
        relationKeywordEntityKey(entity),
        entity.type,
      ])
    );
    const patterns = new Map<string, Pattern>();
    const observations: RelationObservation[] = [];
    const dictionaryChanges = new Map<Map<string, string | null>, string[]>();
    const changedNames = (previous?: Map<string, string | null>) => {
      if (!previous) return [...entityTypes.keys()];
      let changes = dictionaryChanges.get(previous);
      if (!changes) {
        changes = [...new Set([...previous.keys(), ...entityTypes.keys()])].filter(
          (name) =>
            previous.has(name) !== entityTypes.has(name) ||
            previous.get(name) !== entityTypes.get(name)
        );
        dictionaryChanges.set(previous, changes);
      }
      return changes;
    };
    const add = (observation: RelationObservation) => {
      const patternKey = relationPatternIdentity(observation);
      const pattern = patterns.get(patternKey) || {
        label: patternLabel(observation),
        template: observation.template,
        observations: [],
        observationKeys: new Set<string>(),
        noteTitles: new Set<string>(),
      };
      const observationKey = JSON.stringify(observation);
      if (!pattern.observationKeys.has(observationKey)) {
        pattern.observations.push(observation);
        pattern.observationKeys.add(observationKey);
        pattern.noteTitles.add(observation.noteTitle);
      }
      patterns.set(patternKey, pattern);
    };

    for (const note of unique) {
      const owner = basename(note.title);
      const parsed = parseRelationNote(note, memory);
      if (
        parsed.observations &&
        !changedNames(parsed.dictionary).some((name) => parsed.searchable.includes(name))
      ) {
        result.contextualEvidence!.push(...(parsed.tableContexts || []));
        observations.push(...parsed.observations);
        parsed.dictionary = entityTypes;
        continue;
      }
      if (memory) memory.stats.rematchedNotes++;
      const tables = discoverTableRelations(note.title, parsed.blocks, entities);
      const collected: RelationObservation[] = [...tables.observations];
      parsed.tableContexts = tables.contexts;
      result.contextualEvidence!.push(...tables.contexts);
      for (const block of parsed.blocks) {
        checkRelationCancelled(options.signal);
        if (block.column) continue;
        const mentions = entities(block.text);
        if (block.field) {
          const ownerType = entityTypes.get(keywordKey(owner));
          if (ownerType === undefined) continue;
          for (const target of mentions) {
            if (keywordKey(owner) === target.key) continue;
            collected.push({
              noteTitle: note.title,
              section: block.section,
              sectionPath: block.sectionPath,
              source: owner,
              target: target.text,
              sourceType: ownerType,
              targetType: target.type,
              origin: 'field',
              evidence: `${owner}\n${block.field}: ${block.text}`,
              template: `{{E1}}의 ${block.field}${particle(block.field)} {{E2}}이다.`,
              direction: 'document-value',
            });
          }
          continue;
        }
        // A two-slot candidate must not accidentally retain a third entity as its predicate.
        if (mentions.length !== 2 || mentions[0].key === mentions[1].key) continue;
        const [source, target] = mentions;
        const template =
          block.text.slice(0, source.start) +
          '{{E1}}' +
          block.text.slice(source.end, target.start) +
          '{{E2}}' +
          block.text.slice(target.end);
        const label = patternLabel({ origin: 'sentence', template });
        // Coordinated names alone are co-occurrence evidence, not a relation pattern.
        if (!/\p{L}/u.test(label) || /^(?:and|or|with|및|그리고|또는)$/i.test(label)) continue;
        collected.push({
          noteTitle: note.title,
          section: block.section,
          sectionPath: block.sectionPath,
          source: source.text,
          target: target.text,
          sourceType: source.type,
          targetType: target.type,
          origin: 'sentence',
          evidence: block.text,
          template,
          direction: 'text-order',
        });
      }
      if (memory) {
        parsed.observations = collected;
        parsed.dictionary = entityTypes;
      }
      observations.push(...collected);
    }

    result.entityExtraction = includeTableAnchors(result.entityExtraction, observations);
    const classifiedTypes = new Map(
      result.entityExtraction.entities.map((entity) => [
        relationKeywordEntityKey(entity),
        entity.type,
      ])
    );
    for (const observation of observations)
      add({
        ...observation,
        sourceType: classifiedTypes.get(keywordKey(observation.source)) ?? null,
        targetType: classifiedTypes.get(keywordKey(observation.target)) ?? null,
      });
    result.entityCount = result.entityExtraction.entities.length;
    result.optimization = {
      excludedNavigationRegions: [...memory.notes.values()].reduce(
        (sum, note) => sum + JSON.parse(note.contentVersion).length,
        0
      ),
    };
    options.onEntities?.(result.entityExtraction);
    checkRelationCancelled(options.signal);
    const usedMergeInputs = new Set<string>();
    let nliInFlightChars: number | undefined;
    const score = async (
      premise: string,
      hypothesis: string
    ): Promise<EntailmentScores | undefined> => {
      checkRelationCancelled(options.signal);
      if (nliStats.mergeChecks >= maxMergeChecks) return;
      nliStats.mergeChecks++;
      const input = JSON.stringify([premise, hypothesis]);
      usedMergeInputs.add(input);
      const cached = memory?.mergeScores.get(input);
      if (cached) {
        nliStats.reusedMergeChecks = (nliStats.reusedMergeChecks || 0) + 1;
        memory!.stats.mergeScoreReuses++;
        return cached;
      }
      if (options.cacheOnly)
        throw Object.assign(new Error('NLI comparison is not cached.'), {
          name: 'RelationAnalysisCacheMissError',
        });
      nliInFlightChars = premise.length + hypothesis.length;
      try {
        const scores = await runtime.entailment(premise, hypothesis);
        checkRelationCancelled(options.signal);
        nliStats.successfulChecks++;
        memory?.mergeScores.set(input, scores);
        return scores;
      } catch (error) {
        checkRelationCancelled(options.signal);
        const message = error instanceof Error ? error.message : String(error);
        const tooLong = error instanceof Error && error.name === 'RelationContextTooLongError';
        if (tooLong) nliStats.oversizedInputs++;
        else {
          nliStats.modelErrors++;
          result.discoveryIncomplete = true;
        }
        warn(`NLI ${tooLong ? 'input too long' : 'inference failed'}: ${message}`);
      } finally {
        nliInFlightChars = undefined;
      }
    };
    const ordered = [...patterns.values()].sort((a, b) => a.template.localeCompare(b.template));
    result.observationCount = ordered.reduce(
      (sum, pattern) => sum + pattern.observations.length,
      0
    );
    result.inputPatterns = collectInputPatterns(ordered.flatMap((pattern) => pattern.observations));
    checkRelationCancelled(options.signal);
    options.onPatterns?.(result.inputPatterns);
    const embeddings = new Map<Pattern, number[]>();
    if (memory) {
      const templates = new Set(ordered.map((pattern) => pattern.template));
      for (const template of memory.embeddings.keys()) {
        if (!templates.has(template)) memory.embeddings.delete(template);
      }
    }
    if (options.prepareOnly) return result;
    const restoredGroups = options.embeddingOnly
      ? undefined
      : await options.restoreGroups?.(ordered.map((pattern) => pattern.observations));
    const groupingRequired = ordered.some(
      (pattern) => !restoredGroups?.has(relationPatternIdentity(pattern.observations[0]))
    );
    if (options.cacheOnly && groupingRequired)
      throw Object.assign(new Error('Relationship grouping is not cached completely.'), {
        name: 'RelationAnalysisCacheMissError',
      });
    if (!options.cacheOnly && groupingRequired) {
      let embeddingProcessed = 0;
      let embeddingChecks = 0;
      let embeddingFailures = 0;
      let embeddingInFlightChars: number | undefined;
      const embeddingProgress = createRelationInferenceProgress(
        () => ({
          model: 'embedding',
          phase: 'embedding',
          unit: 'pattern',
          total: ordered.length,
          processed: embeddingProcessed,
          modelChecks: embeddingChecks,
          reusedChecks: memory?.stats.embeddingReuses,
          modelFailures: embeddingFailures,
          inFlightInputChars: embeddingInFlightChars,
        }),
        options.onInferenceProgress,
        options.signal
      );
      progressStops.push(embeddingProgress.stop);
      const pending = new Map<string, Pattern[]>();
      for (const pattern of ordered) {
        checkRelationCancelled(options.signal);
        const previous = memory?.embeddings.get(pattern.template);
        if (previous) {
          embeddings.set(pattern, previous);
          memory!.stats.embeddingReuses++;
          embeddingProcessed++;
          continue;
        }
        let items = pending.get(pattern.template);
        if (!items) pending.set(pattern.template, (items = []));
        items.push(pattern);
      }
      const inputs = [...pending.keys()];
      const callbacks = {
        onBatch: (indices: number[]) => {
          checkRelationCancelled(options.signal);
          embeddingChecks++;
          embeddingInFlightChars = indices.reduce((sum, index) => sum + inputs[index].length, 0);
        },
        onResult: (index: number, vector?: number[]) => {
          checkRelationCancelled(options.signal);
          const template = inputs[index];
          const items = pending.get(template)!;
          if (vector) {
            for (const pattern of items) embeddings.set(pattern, vector);
            memory?.embeddings.set(template, vector);
            if (memory) memory.stats.embeddingReuses += items.length - 1;
          } else {
            embeddingFailures += items.length;
            result.discoveryIncomplete = true;
            warn('Embeddings unavailable: only identical patterns are grouped.');
          }
          embeddingProcessed += items.length;
          embeddingInFlightChars = undefined;
        },
      };
      if (inputs.length && runtime.embedMany) await runtime.embedMany(inputs, callbacks);
      else {
        for (const [index, text] of inputs.entries()) {
          callbacks.onBatch([index]);
          let vector: number[] | undefined;
          try {
            vector = await runtime.embed(text);
          } catch {
            checkRelationCancelled(options.signal);
          }
          callbacks.onResult(index, vector);
        }
      }
      embeddingProgress.finish();
      await runtime.release?.('embedding');
      checkRelationCancelled(options.signal);
    }
    if (options.embeddingOnly) return result;
    const groups: Pattern[][] = [];
    const existingGroups = new Map<string, Pattern[]>();
    for (const pattern of ordered) {
      const id = restoredGroups?.get(relationPatternIdentity(pattern.observations[0]));
      if (!id) continue;
      let group = existingGroups.get(id);
      if (!group) {
        group = [];
        existingGroups.set(id, group);
        groups.push(group);
      }
      group.push(pattern);
    }
    let mergeProcessed = 0;
    const mergeErrorStart = nliStats.modelErrors;
    const mergeProgress = createRelationInferenceProgress(
      () => ({
        model: 'nli',
        phase: 'merge',
        unit: 'pattern',
        total: ordered.length,
        processed: mergeProcessed,
        modelChecks: nliStats.mergeChecks - (nliStats.reusedMergeChecks || 0),
        reusedChecks: nliStats.reusedMergeChecks || 0,
        modelFailures: nliStats.modelErrors - mergeErrorStart,
        inFlightInputChars: nliInFlightChars,
        checkLimit: maxMergeChecks,
      }),
      options.onInferenceProgress,
      options.signal
    );
    progressStops.push(mergeProgress.stop);
    let comparisons = 0;
    let lastYield = Date.now();
    for (const pattern of ordered) {
      if (restoredGroups?.has(relationPatternIdentity(pattern.observations[0]))) {
        mergeProcessed++;
        continue;
      }
      if (nliStats.mergeChecks >= maxMergeChecks) {
        groups.push([pattern]);
        mergeProcessed++;
        continue;
      }
      let match: Pattern[] | undefined;
      for (const group of groups) {
        if (++comparisons % 128 === 0) {
          if (Date.now() - lastYield >= 8) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            lastYield = Date.now();
          }
          checkRelationCancelled(options.signal);
        }
        const representative = group[0];
        const first = representative.observations[0];
        const current = pattern.observations[0];
        if (
          first.origin !== current.origin ||
          first.sourceType !== current.sourceType ||
          first.targetType !== current.targetType ||
          !group.every(
            (member) =>
              cosine(embeddings.get(member) || [], embeddings.get(pattern) || []) >=
              (options.similarityThreshold ?? DEFAULT_RELATION_POLICY.similarityThreshold)
          )
        )
          continue;
        let equivalent = true;
        for (const member of group) {
          const example = member.observations[0];
          const forward = await score(example.evidence, instantiate(pattern.template, example));
          const reverse = await score(current.evidence, instantiate(member.template, current));
          if (
            !forward ||
            !reverse ||
            !supports(forward, threshold) ||
            !supports(reverse, threshold)
          ) {
            equivalent = false;
            break;
          }
        }
        if (equivalent) {
          match = group;
          break;
        }
      }
      if (match) match.push(pattern);
      else groups.push([pattern]);
      mergeProcessed++;
    }
    mergeProgress.finish();
    if (memory) {
      for (const input of memory.mergeScores.keys()) {
        if (!usedMergeInputs.has(input)) memory.mergeScores.delete(input);
      }
    }
    const alternatives = [...result.entityExtraction.entities].sort(
      (a, b) => a.text.length - b.text.length || a.text.localeCompare(b.text)
    );
    for (const group of groups) {
      const representative = [...group].sort(
        (a, b) =>
          b.observations.length - a.observations.length || a.template.localeCompare(b.template)
      )[0];
      const observations = group.flatMap((pattern) => pattern.observations);
      const roleAlternatives = [
        ...observations.map((item) => ({ text: item.target, type: item.targetType })),
        ...alternatives,
      ];
      const noteSupport = new Set(observations.map((item) => item.noteTitle)).size;
      const pairSupport = new Set(
        observations.map((item) =>
          JSON.stringify([keywordKey(item.source), keywordKey(item.target)])
        )
      ).size;
      const validations: RelationValidation[] = [];
      // Two distinct-note examples suffice to locate a held-out source for any observation.
      const templateSources = new Map(
        group.map((pattern) => {
          const first = pattern.observations[0];
          const other = pattern.observations.find((item) => item.noteTitle !== first.noteTitle);
          return [pattern, { first, other }] as const;
        })
      );
      for (const observation of observations) {
        const heldOutPattern = group.find(
          (pattern) => pattern.noteTitles.size > 1 || !pattern.noteTitles.has(observation.noteTitle)
        );
        const hypothesisPattern = heldOutPattern || representative;
        const { first, other } = templateSources.get(hypothesisPattern)!;
        const source = first.noteTitle === observation.noteTitle ? other || first : first;
        validations.push(
          prepareRelationValidation(
            observation,
            hypothesisPattern.template,
            source,
            roleAlternatives,
            instantiate
          )
        );
      }
      result.candidates.push({
        id: `relation:${encodeURIComponent(
          JSON.stringify([
            representative.observations[0].origin,
            representative.template,
            representative.observations[0].sourceType,
            representative.observations[0].targetType,
          ])
        )}`,
        label: representative.label,
        template: representative.template,
        variants: group.map((pattern) => pattern.template),
        noteSupport,
        pairSupport,
        recurring: noteSupport >= 2 && pairSupport >= 2,
        observations,
        validations,
      });
    }
    result.candidates.sort(
      (a, b) =>
        b.noteSupport - a.noteSupport || b.pairSupport - a.pairSupport || a.id.localeCompare(b.id)
    );
    if (nliStats.mergeChecks >= maxMergeChecks && ordered.length > 1)
      warn(`NLI merge budget (${maxMergeChecks}) exhausted; remaining patterns stay separate.`);
    return result;
  } finally {
    progressStops.forEach((stop) => stop());
  }
}
