import { useEffect, useMemo, useRef, useState } from 'react';

import { urlToNoteLink } from '../../../components/SearchBar';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { templateGraphNeighbors } from '../inductiveTemplate/graph';
import type { KnowledgeGraphData } from '../types';
import { addKeywordRelationGraph } from './graph';
import { relationAnalysisDisplay } from './relationStatus';
import { useRelationAnalysisSession } from './useRelationAnalysisSession';
import { getKnowledgeGraphPalette, getKeywordRelationColors } from '../utils/palette';

/** Observe the existing background job; toggling never starts inference or reads another scope. */
export function useKeywordRelationGraph(
  graph: Pick<KnowledgeGraphData, 'nodes' | 'edges'>,
  requestedNodeId?: string
) {
  const { data, analysis } = useRelationAnalysisSession();
  const { colorScheme } = useNotebookTheme();
  const [selection, setSelection] = useState({ scope: data.scope, enabled: false });
  const ready = data.available && analysis.status === 'completed' && !!analysis.result;
  const enabled = ready && selection.scope === data.scope && selection.enabled;
  const display = relationAnalysisDisplay(analysis);
  useEffect(() => {
    setSelection({ scope: data.scope, enabled: false });
  }, [data.scope, ready]);
  const openedRequest = useRef('');
  useEffect(() => {
    const key = JSON.stringify([data.scope, requestedNodeId]);
    if (ready && requestedNodeId?.startsWith('keyword:') && openedRequest.current !== key) {
      openedRequest.current = key;
      setSelection({ scope: data.scope, enabled: true });
    }
  }, [data.scope, ready, requestedNodeId]);
  const extraction = analysis.entities || analysis.result?.entityExtraction;
  const augmented = useMemo(
    () =>
      enabled
        ? addKeywordRelationGraph(
            graph,
            extraction,
            analysis.result?.candidates || [],
            getKnowledgeGraphPalette(colorScheme === 'dark'),
            getKeywordRelationColors(colorScheme === 'dark'),
            urlToNoteLink
          )
        : graph,
    [graph.nodes, graph.edges, enabled, extraction, analysis.result, colorScheme]
  );
  const getNeighbors = useMemo(() => templateGraphNeighbors(augmented.edges), [augmented.edges]);
  return {
    ...augmented,
    getNeighbors,
    enabled,
    count: enabled ? augmented.nodes.length - graph.nodes.length : 0,
    disabled: !ready,
    progress: ready ? undefined : display.ratio,
    working: display.busy,
    statusLabel: display.statusLabel,
    toggle: () => {
      if (ready) setSelection({ scope: data.scope, enabled: !enabled });
    },
  };
}
