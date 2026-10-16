import type { SearchEmbeddingStatus } from './search/embeddingStatus';
import type { RelationAnalysisState } from './types';

const phases = {
  keywords: 'Extracting entity keywords',
  embedding: 'Embedding patterns',
  merge: 'Comparing relationship patterns',
  validation: 'Validating relationships',
  retry: 'Retrying failed validations',
};
const statuses = {
  idle: 'Ready to analyze',
  running: 'Analysis in progress',
  ready: 'Ready to analyze',
  stopping: 'Saving completed results',
  cancelled: 'Analysis stopped',
  completed: 'Analysis complete',
  failed: 'Analysis needs attention',
};

const stageLabels = {
  ...phases,
  embedding: 'Pattern embeddings',
  merge: 'NLI duplicate check',
  validation: 'NLI final check',
  retry: 'NLI final check',
};
const stages = { keywords: 0, embedding: 0, merge: 1, validation: 2, retry: 2 };
const fraction = ({ processed, total }: { processed: number; total: number }, empty = 0) =>
  total ? Math.min(1, Math.max(0, processed / total)) : empty;

/** Include the final search embeddings to display the four equally weighted analysis stages. */
export function relationAnalysisDisplay(
  analysis: Pick<RelationAnalysisState, 'status' | 'phase' | 'prepareOnly' | 'processed' | 'total'>,
  searchEmbedding?: SearchEmbeddingStatus
) {
  const display = {
    busy: analysis.status === 'running' || analysis.status === 'stopping',
    ratio: analysis.status === 'ready' ? 0 : fraction(analysis, analysis.status === 'idle' ? 0 : 1),
    statusLabel:
      analysis.status === 'stopping' && analysis.prepareOnly
        ? 'Stopping preparation'
        : analysis.status === 'idle' || (analysis.status === 'running' && analysis.prepareOnly)
        ? 'Preparing analysis automatically'
        : statuses[analysis.status],
    phaseLabel: phases[analysis.phase],
  };
  if (!searchEmbedding || analysis.prepareOnly || analysis.status === 'ready') return display;
  const completed = analysis.status === 'completed';
  const stage = completed ? 3 : stages[analysis.phase];
  const current = completed
    ? searchEmbedding.phase === 'completed'
      ? 1
      : fraction(searchEmbedding)
    : analysis.phase === 'keywords'
    ? 0
    : fraction(analysis);
  const phaseLabel = completed
    ? searchEmbedding.phase === 'completed'
      ? 'Search embeddings ready'
      : searchEmbedding.phase === 'failed'
      ? 'Search embeddings failed'
      : 'Preparing search embeddings'
    : stageLabels[analysis.phase];
  const statusLabel =
    completed && searchEmbedding.phase !== 'completed'
      ? searchEmbedding.phase === 'failed'
        ? 'Analysis needs attention'
        : 'Analysis in progress'
      : display.statusLabel;
  return {
    ...display,
    ratio: (stage + current) / 4,
    phaseLabel,
    statusLabel,
  };
}
