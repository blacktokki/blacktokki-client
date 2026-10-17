/** Optimize entry point: preserves the application runner contract within this folder. */
import {
  optimizedValidationVerdict,
  needsControlValidation,
  needsSemanticValidation,
  prepareResultValidations,
  relationPolicy,
} from './validation';
import type { RelationPolicy } from './validation';
import { createRelationCacheIdentity } from '../relationCacheMetadata';
import {
  createRelationNliCacheStore,
  isRelationNliScore,
  relationCacheHash,
  RelationNliCacheStore,
  RelationNliCatalog,
  RelationNliReference,
  ValidationUpdate,
} from '../relationCheckpoint';
import {
  checkRelationCancelled,
  createRelationDiscoveryMemory,
  discoverInductiveRelations,
  getRelationInputPatterns,
  EntailmentScores,
  RelationDiscoveryMemory,
  RelationDiscoveryResult,
  RelationDiscoveryRuntime,
  RelationEntityResult,
  RelationEntityProgress,
  RelationInputPattern,
  RelationValidationProgress,
} from '../relationDiscovery';
import {
  createRelationDiscoveryRuntime,
  RELATION_MODELS,
  RELATION_MODEL_DTYPES,
  RelationModelProgress,
} from '../relationModels';
import { createRelationInferenceProgress, RelationInferenceProgress } from '../relationProgress';
import { RelationAnalysisNote } from '../types';
import { validNliScores } from './semantic';
import { checkInputBudget, relationInputBudget, InputBudget } from './token-budget';

type ValidationTask = { candidate: number; index: number };
export type RelationAnalysisOptions = {
  scope: string;
  policy?: Partial<RelationPolicy>;
  /** Prepare session embeddings and compare identities against durable final NLI results. */
  embeddingOnly?: boolean;
  /** After unchanged preparation, restore complete final scores without model inference. */
  restoreUnchanged?: boolean;
  cacheOnly?: boolean;
  signal?: AbortSignal;
  batchSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  store?: RelationNliCacheStore;
  runtimeFactory?: () => RelationDiscoveryRuntime;
  inputBudget?: InputBudget;
  onModelProgress?: (progress: RelationModelProgress) => void;
  onEntities?: (result: RelationEntityResult) => void;
  onEntityProgress?: (progress: RelationEntityProgress) => void;
  onInferenceProgress?: (progress: RelationInferenceProgress) => void;
  onPatterns?: (patterns: RelationInputPattern[]) => void;
  onBatch?: (progress: RelationValidationProgress, updates: ValidationUpdate[]) => void;
};

function validationQueue(result: RelationDiscoveryResult): ValidationTask[] {
  const queue: ValidationTask[] = [];
  let active = result.candidates.flatMap((candidate, position) =>
    candidate.validations.length ? [position] : []
  );
  for (let index = 0; active.length; index++) {
    const next: number[] = [];
    for (const position of active) {
      queue.push({ candidate: position, index });
      if (result.candidates[position].validations.length > index + 1) next.push(position);
    }
    active = next;
  }
  return queue;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
let activeAnalysis: Promise<void> = Promise.resolve();
let session:
  | {
      scope: string;
      version: string;
      memory: RelationDiscoveryMemory;
      inputKeys: Map<string, Map<string, string>>;
    }
  | undefined;

/** Release intermediate texts and vectors when leaving analysis or switching account/privacy scope. */
export function clearRelationAnalysisMemory(scope?: string) {
  if (!scope || session?.scope === scope) session = undefined;
}

/** Serialize model sessions and independent final-score writes, including cancellation saves. */
export function runInductiveRelationAnalysis(
  notes: RelationAnalysisNote[],
  options: RelationAnalysisOptions
): Promise<RelationDiscoveryResult> {
  const run = activeAnalysis.then(() => analyze(notes, options));
  activeAnalysis = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function analyze(
  notes: RelationAnalysisNote[],
  options: RelationAnalysisOptions,
  cachedCatalog?: RelationNliCatalog
): Promise<RelationDiscoveryResult> {
  checkRelationCancelled(options.signal);
  const batchSize = options.batchSize ?? 200;
  const policy = relationPolicy(options.policy);
  const maxRetries = options.maxRetries ?? 2;
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    !Number.isSafeInteger(maxRetries) ||
    maxRetries < 0
  )
    throw new Error('Relation batch size and retry count must be valid integers.');
  const memoryVersion = JSON.stringify([
    'optimized-v1',
    policy,
    RELATION_MODELS,
    RELATION_MODEL_DTYPES,
  ]);
  if (session?.scope !== options.scope || session.version !== memoryVersion)
    session = {
      scope: options.scope,
      version: memoryVersion,
      memory: createRelationDiscoveryMemory(),
      inputKeys: new Map(),
    };
  const currentSession = session;
  const memory = currentSession.memory;
  const store = options.store || createRelationNliCacheStore();
  const version = await relationCacheHash(
    JSON.stringify(['final-nli-v1', RELATION_MODELS.nli, RELATION_MODEL_DTYPES.nli])
  );
  const catalog = cachedCatalog || (await store.catalog?.(options.scope, version));
  checkRelationCancelled(options.signal);
  // Raw scores depend on the model and input; restored grouping also depends on policy.
  const identity = createRelationCacheIdentity(['optimized-v1', policy]);
  const runtimeFactory: () => RelationDiscoveryRuntime =
    (options.cacheOnly
      ? () => ({
          embed: async (): Promise<number[]> => {
            throw Object.assign(new Error('Embedding is not cached.'), {
              name: 'RelationAnalysisCacheMissError',
            });
          },
          entailment: async (): Promise<EntailmentScores> => {
            throw Object.assign(new Error('NLI is not cached.'), {
              name: 'RelationAnalysisCacheMissError',
            });
          },
        })
      : options.runtimeFactory) ||
    (() => createRelationDiscoveryRuntime(options.signal, options.onModelProgress));
  let runtime = runtimeFactory();
  try {
    const result = await discoverInductiveRelations(notes, {
      runtime,
      memory,
      signal: options.signal,
      embeddingOnly: options.embeddingOnly,
      cacheOnly: options.cacheOnly,
      restoreGroups: (groups) => identity.restore(groups, catalog),
      onEntities: options.onEntities,
      onEntityProgress: options.onEntityProgress,
      onInferenceProgress: options.onInferenceProgress,
      onPatterns: options.onPatterns,
      ...policy,
    });
    checkRelationCancelled(options.signal);
    prepareResultValidations(result, policy);
    Object.assign(result, {
      verificationStats: result.candidates
        .flatMap((candidate) => candidate.validations)
        .reduce(
          (counts, value) => {
            const kind =
              (value as import('./validation').OptimizedValidation).verification?.kind ||
              'semantic';
            counts[kind]++;
            return counts;
          },
          { semantic: 0, 'record-membership': 0, 'source-reconstruction': 0 }
        ),
    });
    if (options.cacheOnly && result.discoveryIncomplete)
      throw Object.assign(new Error('Discovery cannot be restored completely from memory.'), {
        name: 'RelationAnalysisCacheMissError',
      });
    const keys = new Set(await Promise.all(getRelationInputPatterns(result).map(identity.pattern)));
    const compare = (previous: Set<string>) => ({
      added: [...keys].filter((key) => !previous.has(key)).length,
      removed: [...previous].filter((key) => !keys.has(key)).length,
    });
    const changes = compare(catalog?.patterns || new Set());
    result.cacheIndexIncomplete = !!catalog?.legacyRecords;
    result.patternChanges = result.cacheIndexIncomplete ? undefined : changes;
    if (options.embeddingOnly) {
      if (
        options.restoreUnchanged &&
        !result.discoveryIncomplete &&
        (result.cacheIndexIncomplete || (!changes.added && !changes.removed))
      ) {
        try {
          const restored = await analyze(
            notes,
            {
              ...options,
              embeddingOnly: false,
              cacheOnly: true,
              restoreUnchanged: false,
            },
            catalog
          );
          if (restored.cacheRestored || (restored.validationProgress?.completed || 0) > 0)
            return {
              ...restored,
              discoveryStats: result.discoveryStats
                ? {
                    ...result.discoveryStats,
                    mergeScoreReuses: restored.discoveryStats?.mergeScoreReuses || 0,
                  }
                : restored.discoveryStats,
            };
        } catch (error) {
          if (!(error instanceof Error) || error.name !== 'RelationAnalysisCacheMissError')
            throw error;
        }
      }
      return result;
    }
    const stats = result.nliStats!;
    const queue = validationQueue(result);
    const validationOf = (task: ValidationTask) =>
      result.candidates[task.candidate].validations[task.index];
    type Input = { evidence: string; hypothesis: string; id: string; scores?: EntailmentScores };
    const inputs: Input[] = [];
    const byEvidence = new Map<string, Map<string, Input>>();
    const inputOf = (validation: { evidence: string; hypothesis: string }) => {
      let hypotheses = byEvidence.get(validation.evidence);
      if (!hypotheses) byEvidence.set(validation.evidence, (hypotheses = new Map()));
      let input = hypotheses.get(validation.hypothesis);
      if (!input) {
        input = {
          evidence: validation.evidence,
          hypothesis: validation.hypothesis,
          id: currentSession.inputKeys.get(validation.evidence)?.get(validation.hypothesis) || '',
        };
        hypotheses.set(validation.hypothesis, input);
        inputs.push(input);
      }
      return input;
    };
    const controlInputOf = (validation: ReturnType<typeof validationOf>) =>
      validation.control &&
      inputOf({ evidence: validation.evidence, hypothesis: validation.control.hypothesis });
    for (const task of queue) {
      const validation = validationOf(task);
      inputOf(validation);
      controlInputOf(validation);
    }
    const newInputs = inputs.filter((input) => !input.id);
    for (let offset = 0; offset < newInputs.length; offset += 200) {
      await Promise.all(
        newInputs.slice(offset, offset + 200).map(async (input) => {
          input.id = await relationCacheHash(JSON.stringify([input.evidence, input.hypothesis]));
        })
      );
      await pause(0);
      checkRelationCancelled(options.signal);
    }
    currentSession.inputKeys = new Map(
      [...byEvidence].map(([evidence, hypotheses]) => [
        evidence,
        new Map([...hypotheses].map(([hypothesis, input]) => [hypothesis, input.id])),
      ])
    );
    const ids = inputs.map((input) => input.id);
    const references = new Map<string, RelationNliReference[]>();
    const structuralReferences = new Map<string, RelationNliReference>();
    // Failed merging may split a real group; its scores are reusable but its grouping is provisional.
    for (const candidate of result.discoveryIncomplete ? [] : result.candidates) {
      if (!candidate.observations.length) continue;
      const relationship = await identity.group(candidate.observations);
      structuralReferences.set(relationship.id, relationship);
      for (let index = 0; index < candidate.validations.length; index++) {
        const observation = candidate.observations[index];
        if (!observation) continue;
        const validation = candidate.validations[index];
        const matchingInputs = [inputOf(validation), controlInputOf(validation)].filter(
          (input): input is Input => !!input
        );
        for (const input of matchingInputs) {
          let current = references.get(input.id);
          if (!current) references.set(input.id, (current = []));
          let reference = current.find((item) => item.id === relationship.id);
          if (!reference) {
            reference = { id: relationship.id, patterns: [] };
            current.push(reference);
          }
          const pattern = await identity.pattern(observation);
          if (!reference.patterns.includes(pattern)) reference.patterns.push(pattern);
        }
      }
    }
    for (const current of references.values()) {
      current.sort((a, b) => a.id.localeCompare(b.id));
      current.forEach((item) => item.patterns.sort());
    }
    const needsIndex = (id: string) =>
      references.has(id) &&
      JSON.stringify(catalog?.records.get(id)?.relationships || []) !==
        JSON.stringify(references.get(id));
    // Structural coverage is hash metadata on an actual successful final score. It never
    // fabricates a score for an unavailable input or counts that input as completed.
    let indexCarrier: Input | undefined;
    const indexStructure = (input: Input) => {
      if (result.discoveryIncomplete || !input.scores) return;
      indexCarrier ||= input;
      if (indexCarrier === input)
        references.set(
          input.id,
          [...structuralReferences.values()].sort((a, b) => a.id.localeCompare(b.id))
        );
    };
    const reflectSavedPatterns = () => {
      const patterns = new Set(
        inputs
          .filter((input) => input.scores)
          .flatMap((input) => (references.get(input.id) || []).flatMap((item) => item.patterns))
      );
      result.patternChanges = compare(patterns);
      result.cacheIndexIncomplete = false;
    };

    const cached = catalog
      ? new Map(
          ids.flatMap((id) =>
            catalog.records.has(id) ? [[id, catalog.records.get(id)!.scores] as const] : []
          )
        )
      : await store.load(options.scope, version, ids);
    checkRelationCancelled(options.signal);
    for (const input of inputs) {
      const scores = cached.get(input.id);
      input.scores = scores && validNliScores(scores) ? scores : undefined;
      indexStructure(input);
    }
    // An incomplete discovery cannot prove that a previous validation input has disappeared.
    if (!result.discoveryIncomplete && !options.cacheOnly)
      await store.prune(options.scope, version, new Set(ids));
    checkRelationCancelled(options.signal);
    let completed = 0;
    let failed = 0;
    for (const task of queue) {
      const validation = validationOf(task);
      const scores = inputOf(validation).scores;
      if (scores || !needsSemanticValidation(validation)) {
        if (scores) validation.scores = { ...scores };
        const control = controlInputOf(validation)?.scores;
        if (validation.control && control) validation.control.scores = { ...control };
        validation.verdict = optimizedValidationVerdict(validation, policy.entailmentThreshold);
        const pendingControl =
          !options.cacheOnly &&
          needsControlValidation(validation, policy.entailmentThreshold) &&
          !validation.control?.scores;
        if (validation.verdict !== 'unverified' && !pendingControl) {
          delete validation.skipReason;
          completed++;
        } else if (pendingControl) {
          validation.verdict = 'unverified';
          validation.skipReason = 'pending';
        }
      }
    }
    stats.reusedValidationChecks = completed;
    if (options.cacheOnly) {
      for (const task of queue) {
        checkRelationCancelled(options.signal);
        const validation = validationOf(task);
        if (validation.verdict !== 'unverified') continue;
        try {
          await checkInputBudget(
            options.inputBudget || relationInputBudget,
            validation.evidence,
            validation.hypothesis
          );
        } catch (error) {
          checkRelationCancelled(options.signal);
          if (error instanceof Error && error.name === 'AbortError') throw error;
          const tooLong = error instanceof Error && error.name === 'RelationContextTooLongError';
          validation.skipReason = tooLong ? 'context-too-long' : 'model-error';
          validation.error = error instanceof Error ? error.message : String(error);
          failed++;
          if (tooLong) stats.oversizedInputs++;
          else stats.modelErrors++;
        }
      }
      result.cacheRestored = completed === queue.length;
      result.validationProgress = {
        batch: 0,
        total: queue.length,
        completed,
        failed,
        pending: queue.length - completed - failed,
        uniqueInputs: inputs.length,
        reused: completed,
        modelChecks: 0,
        resumed: completed > 0,
        phase: 'validation',
        status: completed + failed === queue.length ? 'completed' : 'running',
      };
      if (!result.discoveryIncomplete) {
        const indexed = inputs.filter((input) => input.scores && needsIndex(input.id));
        for (let offset = 0; offset < indexed.length; offset += 200) {
          checkRelationCancelled(options.signal);
          await store.save(
            options.scope,
            version,
            indexed.slice(offset, offset + 200).map((input) => [input.id, input.scores!]),
            references
          );
        }
        reflectSavedPatterns();
        await store.prune(options.scope, version, new Set(ids));
        checkRelationCancelled(options.signal);
        options.onInferenceProgress?.({
          model: 'nli',
          phase: 'validation',
          unit: 'validation',
          total: queue.length,
          processed: completed,
          modelChecks: 0,
          modelFailures: 0,
          reusedChecks: completed,
          elapsedMs: 0,
          status: 'completed',
        });
      }
      return result;
    }
    const resumed = completed > 0;
    let cursor = 0;
    let batch = 0;
    let phase: RelationValidationProgress['phase'] = 'validation';
    let inFlightChars: number | undefined;
    let updates: ValidationUpdate[] = [];
    const pendingScores = new Map<string, EntailmentScores>();
    let unavailable = false;
    let storageFailed = false;
    let recordsSinceYield = 0;
    let lastYield = Date.now();
    const retryable = () => queue.filter((task) => validationOf(task).skipReason === 'model-error');
    const progress = (
      status: RelationValidationProgress['status'] = 'running'
    ): RelationValidationProgress => ({
      batch,
      total: queue.length,
      completed,
      failed,
      pending: queue.length - completed - failed,
      uniqueInputs: inputs.length,
      reused: stats.reusedValidationChecks || 0,
      modelChecks: stats.validationChecks,
      resumed,
      phase,
      status,
    });
    const persist = async () => {
      if (!pendingScores.size) return;
      try {
        await store.save(options.scope, version, [...pendingScores], references);
      } catch (error) {
        storageFailed = true;
        throw error;
      }
      pendingScores.clear();
      batch++;
    };
    const save = async (status: RelationValidationProgress['status'] = 'running') => {
      await persist();
      const batchUpdates = updates;
      updates = [];
      result.validationProgress = progress(status);
      checkRelationCancelled(options.signal);
      options.onBatch?.(result.validationProgress, batchUpdates);
    };
    const yieldToEvents = async () => {
      if (++recordsSinceYield >= 128 || Date.now() - lastYield >= 8) {
        await pause(0);
        recordsSinceYield = 0;
        lastYield = Date.now();
        checkRelationCancelled(options.signal);
      }
    };
    const infer = async (task: ValidationTask) => {
      checkRelationCancelled(options.signal);
      const validation = validationOf(task);
      const wasFailed = validation.skipReason === 'model-error';
      let checkingControl = false;
      try {
        const scoreInput = async (input: Input) => {
          let scores = input.scores;
          if (scores) stats.reusedValidationChecks = (stats.reusedValidationChecks || 0) + 1;
          else {
            await checkInputBudget(
              options.inputBudget || relationInputBudget,
              input.evidence,
              input.hypothesis
            );
            stats.validationChecks++;
            validation.attempts = (validation.attempts || 0) + 1;
            inFlightChars = input.evidence.length + input.hypothesis.length;
            scores = await runtime.entailment(input.evidence, input.hypothesis);
            if (!isRelationNliScore(scores) || !validNliScores(scores))
              throw new Error('NLI returned invalid scores.');
            input.scores = { ...scores };
            indexStructure(input);
            pendingScores.set(input.id, input.scores);
            stats.successfulChecks++;
          }
          checkRelationCancelled(options.signal);
          return { ...scores };
        };
        validation.scores = await scoreInput(inputOf(validation));
        if (needsControlValidation(validation, policy.entailmentThreshold)) {
          checkingControl = true;
          validation.control!.scores = await scoreInput(controlInputOf(validation)!);
        }
        validation.verdict = optimizedValidationVerdict(validation, policy.entailmentThreshold);
        delete (validation as import('./validation').OptimizedValidation).controlError;
        delete validation.skipReason;
        delete validation.error;
        completed++;
        if (wasFailed) failed--;
      } catch (error) {
        if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError'))
          throw error;
        const message = error instanceof Error ? error.message : String(error);
        const tooLong = error instanceof Error && error.name === 'RelationContextTooLongError';
        unavailable = error instanceof Error && error.name === 'RelationModelLoadError';
        if (checkingControl && validation.scores) {
          // The diagnostic failed, not the already scored main claim. Retry that optional
          // diagnostic on a later run without discarding or relabelling the main decision.
          validation.verdict = optimizedValidationVerdict(validation, policy.entailmentThreshold);
          Object.assign(validation, { controlError: message });
          delete validation.skipReason;
          delete validation.error;
          completed++;
          if (wasFailed) failed--;
        } else {
          validation.verdict = 'unverified';
          validation.skipReason = tooLong ? 'context-too-long' : 'model-error';
          validation.error = message;
          if (!wasFailed) failed++;
        }
        if (tooLong) stats.oversizedInputs++;
        else stats.modelErrors++;
        const warning = `NLI ${tooLong ? 'input too long' : 'inference failed'}: ${message}`;
        if (!result.warnings.includes(warning)) result.warnings.push(warning);
      } finally {
        inFlightChars = undefined;
      }
      updates.push({ ...task, validation: { ...validation } });
      await yieldToEvents();
    };
    let retryRound = 0;
    const liveProgress = createRelationInferenceProgress(
      () => ({
        model: 'nli',
        phase,
        unit: 'validation',
        total: queue.length,
        processed: completed + failed,
        modelChecks: stats.validationChecks,
        modelFailures: stats.modelErrors,
        reusedChecks: stats.reusedValidationChecks || 0,
        failedRecords: failed,
        inFlightInputChars: inFlightChars,
        savedBatch: batch,
      }),
      options.onInferenceProgress,
      options.signal
    );
    try {
      let retries: ValidationTask[] = [];
      while (cursor < queue.length || retries.length) {
        if (retries.length) {
          if (retryRound >= maxRetries) break;
          retryRound++;
          phase = 'retry';
          await pause(options.retryDelayMs ?? 1000);
          checkRelationCancelled(options.signal);
          await runtime.dispose?.();
          runtime = runtimeFactory();
          unavailable = false;
          for (const task of retries) {
            await infer(task);
            if (updates.length >= batchSize || unavailable) await save();
            if (unavailable) break;
          }
          if (updates.length || pendingScores.size) await save();
          retries = retryable();
          if (unavailable) continue;
          if (cursor < queue.length) retries = [];
          continue;
        }
        phase = 'validation';
        unavailable = false;
        const batchEnd = Math.min(cursor + batchSize, queue.length);
        while (cursor < batchEnd) {
          const task = queue[cursor++];
          const validation = validationOf(task);
          if (validation.verdict === 'unverified' && validation.skipReason !== 'context-too-long')
            await infer(task);
          else {
            const input = inputOf(validation);
            if (input.scores && needsIndex(input.id)) pendingScores.set(input.id, input.scores);
            await yieldToEvents();
          }
          if (unavailable) break;
        }
        if (updates.length || pendingScores.size) await save();
        await pause(0);
        checkRelationCancelled(options.signal);
        if (unavailable || cursor >= queue.length) retries = retryable();
      }
      await save(cursor < queue.length || retryable().length ? 'failed' : 'completed');
      liveProgress.finish(result.validationProgress!.status);
      if (!result.discoveryIncomplete) reflectSavedPatterns();
      return result;
    } catch (error) {
      // Completed final scores remain useful even when the source query or focus changes.
      if (!storageFailed) await persist();
      throw error;
    } finally {
      liveProgress.stop();
    }
  } finally {
    await runtime.dispose?.();
  }
}
