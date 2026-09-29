import { useLangContext } from '@blacktokki/core';
import { useCallback, useMemo } from 'react';

import { addTopicNodes } from './utils/topicNodes';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { inferKnowledgeGraphRelations } from '../knowledgeGraph/owlrdf/inference';
import { useOwlRdfGraphData } from '../knowledgeGraph/owlrdf/useOwlRdfGraphData';

export const useTopicGraphDataFromBase = (
  base: ReturnType<typeof useOwlRdfGraphData>,
  active: boolean
): ReturnType<typeof useOwlRdfGraphData> => {
  const { lang } = useLangContext();
  const { colorScheme } = useNotebookTheme();
  const graph = useMemo(() => {
    if (!active) return base;
    const result = addTopicNodes(base, colorScheme === 'dark', lang);
    return {
      ...result,
      axioms: {
        ...base.axioms,
        inferredEdges: inferKnowledgeGraphRelations(result.nodes, result.edges),
      },
    };
  }, [active, base.nodes, base.edges, base.cardSubheadings, base.axioms, colorScheme, lang]);
  const adjacency = useMemo(() => {
    if (!active) return null;
    const map = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const outgoing = map.get(edge.source) || [];
      outgoing.push(edge.target);
      map.set(edge.source, outgoing);
      const incoming = map.get(edge.target) || [];
      incoming.push(edge.source);
      map.set(edge.target, incoming);
    }
    return map;
  }, [active, graph.edges]);
  const getNeighbors = useCallback(
    (nodeId: string, depth = 1): Set<string> => {
      if (!adjacency) return base.getNeighbors(nodeId, depth);
      const visited = new Set([nodeId]);
      let current = [nodeId];
      for (let d = 0; d < depth && current.length; d++) {
        const next: string[] = [];
        for (const id of current) {
          for (const neighbor of adjacency.get(id) || []) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
        current = next;
      }
      return visited;
    },
    [adjacency, base.getNeighbors]
  );
  return {
    ...graph,
    datatypeNodes: base.datatypeNodes,
    datatypeEdges: base.datatypeEdges,
    isLoading: base.isLoading,
    getNeighbors,
  };
};

export const useTopicGraphData = (): ReturnType<typeof useOwlRdfGraphData> =>
  useTopicGraphDataFromBase(useOwlRdfGraphData(), true);
