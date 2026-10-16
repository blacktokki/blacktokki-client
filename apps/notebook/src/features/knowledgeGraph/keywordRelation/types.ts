import type {
  RelationDiscoveryResult,
  RelationEntityResult,
  RelationInputPattern,
} from './relationDiscovery';
import type { RelationModelProgress } from './relationModels';

/** Scoped source data needed by relation analysis, independent of template discovery. */
export type RelationAnalysisNote = { title: string; description?: string };

export type RelationAnalysisState = {
  status: 'idle' | 'running' | 'ready' | 'stopping' | 'cancelled' | 'completed' | 'failed';
  prepareOnly: boolean;
  phase: 'keywords' | 'embedding' | 'merge' | 'validation' | 'retry';
  processed: number;
  total: number;
  elapsedMs: number;
  modelChecks: number;
  reused: number;
  failed: number;
  savedBatch: number;
  entities?: RelationEntityResult;
  patterns?: RelationInputPattern[];
  patternChanges?: { added: number; removed: number };
  model?: RelationModelProgress;
  result?: RelationDiscoveryResult;
  error?: string;
};

export function initialRelationAnalysisState(): RelationAnalysisState {
  return {
    status: 'idle',
    prepareOnly: true,
    phase: 'keywords',
    processed: 0,
    total: 0,
    elapsedMs: 0,
    modelChecks: 0,
    reused: 0,
    failed: 0,
    savedBatch: 0,
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
