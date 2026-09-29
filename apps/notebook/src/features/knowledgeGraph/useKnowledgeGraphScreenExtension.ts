import type { useOwlRdfGraphData } from './owlrdf/useOwlRdfGraphData';
import type { KnowledgeGraphNode } from './types';

type GraphData = ReturnType<typeof useOwlRdfGraphData>;

export interface KnowledgeGraphScreenExtension {
  graph: GraphData;
  highlightedNodeIds?: Set<string>;
  clusterClassIds?: Set<string>;
  extensionClassLabels?: readonly [string, string];
  getNodeAction?: (node: KnowledgeGraphNode) => { label: string; onPress: () => void } | undefined;
  canOpenNode?: (node: KnowledgeGraphNode) => boolean;
}

type UseKnowledgeGraphScreenExtension = (
  graph: GraphData,
  active: boolean
) => KnowledgeGraphScreenExtension;

let extensionKey: string | undefined;
let useRegisteredExtension: UseKnowledgeGraphScreenExtension = (graph) => ({ graph });
let hasRendered = false;

/** Register once during feature setup so the screen always calls the same hook. */
export const registerKnowledgeGraphScreenExtension = (
  key: string,
  useExtension: UseKnowledgeGraphScreenExtension
) => {
  if (hasRendered) {
    throw new Error('Knowledge graph screen extensions must be registered before rendering');
  }
  if (extensionKey && extensionKey !== key) {
    throw new Error(`Knowledge graph screen extension already registered: ${extensionKey}`);
  }
  extensionKey = key;
  useRegisteredExtension = useExtension;
};

export const useKnowledgeGraphScreenExtension = (
  graph: GraphData,
  activeKeys: ReadonlySet<string>
): KnowledgeGraphScreenExtension & { scopeKey: string } => {
  hasRendered = true;
  const active = extensionKey !== undefined && activeKeys.has(extensionKey);
  return {
    ...useRegisteredExtension(graph, active),
    scopeKey: active ? extensionKey! : '',
  };
};
