import { useLangContext, useModalsContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useCallback, useMemo } from 'react';

import TopicVirtualNoteModal from './TopicVirtualNoteModal';
import { useTopicGraphDataFromBase } from './useTopicGraphData';
import { getTopicVirtualNoteEligibleSet, isTopicVirtualNoteEligible } from './utils/virtualNotes';
import { NavigationParamList } from '../../types';
import type { useOwlRdfGraphData } from '../knowledgeGraph/owlrdf/useOwlRdfGraphData';
import { registerKnowledgeGraphScreenExtension } from '../knowledgeGraph/useKnowledgeGraphScreenExtension';
import type { KnowledgeGraphScreenExtension } from '../knowledgeGraph/useKnowledgeGraphScreenExtension';

const classLabels = ['Topic category', 'Topic Class'] as const;

const useTopicKnowledgeGraphExtension = (
  base: ReturnType<typeof useOwlRdfGraphData>,
  active: boolean
): KnowledgeGraphScreenExtension => {
  const { lang } = useLangContext();
  const { setModal } = useModalsContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const graph = useTopicGraphDataFromBase(base, active);
  const highlightedNodeIds = useMemo(
    () => (active ? getTopicVirtualNoteEligibleSet(graph.nodes) : undefined),
    [active, graph.nodes]
  );
  const clusterClassIds = useMemo(
    () =>
      active
        ? new Set(
            graph.nodes
              .filter((node) => node.role === 'CLASS' && node.classCategory === 'TOPIC')
              .map((node) => node.id)
          )
        : undefined,
    [active, graph.nodes]
  );
  const getNodeAction = useCallback(
    (node: (typeof graph.nodes)[number]) => {
      if (!isTopicVirtualNoteEligible(node)) return undefined;
      return {
        label: lang('Open Virtual Note') || '가상노트 열기',
        onPress: () => setModal(TopicVirtualNoteModal, { topicNodeId: node.id, navigation }),
      };
    },
    [lang, navigation, setModal]
  );
  const canOpenNode = useCallback(
    (node: (typeof graph.nodes)[number]) => node.classKind !== 'TITLE_KEYWORD',
    []
  );

  return {
    graph,
    highlightedNodeIds,
    clusterClassIds,
    extensionClassLabels: active ? classLabels : undefined,
    getNodeAction: active ? getNodeAction : undefined,
    canOpenNode: active ? canOpenNode : undefined,
  };
};

export const registerTopicKnowledgeGraphExtension = () =>
  registerKnowledgeGraphScreenExtension('topicNotes', useTopicKnowledgeGraphExtension);
