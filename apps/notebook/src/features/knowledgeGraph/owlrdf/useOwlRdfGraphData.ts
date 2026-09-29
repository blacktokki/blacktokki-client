import { useMemo } from 'react';

import { buildKnowledgeGraphDatatypeGraph } from './datatypeGraph';
import { inferKnowledgeGraphRelations } from './inference';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { stableKnowledgeGraphId, useKnowledgeGraphData } from '../useKnowledgeGraphData';

export const useOwlRdfGraphData = () => {
  const base = useKnowledgeGraphData();
  const { colorScheme } = useNotebookTheme();
  const datatypeGraph = useMemo(
    () =>
      buildKnowledgeGraphDatatypeGraph(base.nodes, colorScheme === 'dark', stableKnowledgeGraphId),
    [base.nodes, colorScheme]
  );
  const inferredEdges = useMemo(
    () => inferKnowledgeGraphRelations(base.nodes, base.edges),
    [base.nodes, base.edges]
  );
  return { ...base, ...datatypeGraph, axioms: { ...base.axioms, inferredEdges } };
};
