import { useEffect } from 'react';

import { graphSearchCache } from './cache';
import { publishSearchEmbeddingStatus } from './embeddingStatus';
import { graphSearchDocuments } from './engine';
import { ensureGraphSearchVectors } from './semantic';
import { createGraphSearchSnapshot } from './snapshot';
import { useSearchGraph } from './useGraphSearch';
import { useRelationAnalysisSession } from '../useRelationAnalysisSession';

async function prepareGraphSearchEmbeddings(
  input: ReturnType<typeof useSearchGraph>['input'],
  signal: AbortSignal,
  onProgress: (processed: number, total: number) => void
) {
  const snapshot = await createGraphSearchSnapshot({ ...input, signal });
  await ensureGraphSearchVectors({
    scope: snapshot.scope,
    revision: snapshot.revision,
    documents: graphSearchDocuments(snapshot),
    cache: graphSearchCache,
    signal,
    onProgress,
  });
  return snapshot.revision;
}

/** Embed the final graph after NLI has finished and its model has been released. */
export function GraphSearchEmbeddingBackground() {
  const data = useSearchGraph(true);
  const { analysis } = useRelationAnalysisSession();
  const analysisCompleted =
    analysis.status === 'completed' &&
    data.input.coverage.keywords &&
    (!data.templatesEnabled || data.input.coverage.templates);
  useEffect(() => {
    const scope = data.analysisScope;
    if (!data.available || data.loading || data.sourceError || !analysisCompleted) {
      publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 }, 'extension');
      return;
    }
    const controller = new AbortController();
    let completed = 0;
    let total = 0;
    publishSearchEmbeddingStatus(scope, { phase: 'running', processed: 0, total: 0 }, 'extension');
    prepareGraphSearchEmbeddings(data.input, controller.signal, (processed, count) => {
      if (controller.signal.aborted) return;
      completed = processed;
      total = count;
      publishSearchEmbeddingStatus(
        scope,
        { phase: 'running', processed, total: count },
        'extension'
      );
    })
      .then((revision) => {
        if (!controller.signal.aborted)
          publishSearchEmbeddingStatus(
            scope,
            { phase: 'completed', processed: completed, total, revision },
            'extension'
          );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        publishSearchEmbeddingStatus(
          scope,
          {
            phase: 'failed',
            processed: completed,
            total,
            error: error instanceof Error ? error.message : String(error),
          },
          'extension'
        );
        console.warn('Graph search embedding preparation failed', { scope, error });
      });
    return () => {
      controller.abort();
      publishSearchEmbeddingStatus(scope, { phase: 'idle', processed: 0, total: 0 }, 'extension');
    };
  }, [
    data.analysisScope,
    data.available,
    data.loading,
    data.sourceError,
    data.input,
    analysisCompleted,
  ]);
  return null;
}
