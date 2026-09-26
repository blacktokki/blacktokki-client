import { useModalsContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import LoadingView from '../../../components/LoadingView';
import { ResponsiveSearchBar, toNoteParams } from '../../../components/SearchBar';
import { useEffectExtensionScreen } from '../../../hooks/useExtension';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { useUsageMode } from '../../../hooks/useUsageMode';
import OntologyVirtualNoteModal from '../../../modals/OntologyVirtualNoteModal';
import { NavigationParamList } from '../../../types';
import { KnowledgeGraphNavToolbar } from '../components/KnowledgeGraphNavToolbar';
import { OntologyGraphView } from '../components/OntologyGraphView';
import { OntologyPreviewSheet } from '../components/OntologyPreviewSheet';
import { OntologyNode } from '../types';
import { useOntologyData } from '../useOntologyData';
import { normalizeNhopDepth } from '../utils/nhop';
import { OntologyRelationLabelMode } from '../utils/relations';

export const KnowledgeGraphScreen: React.FC = () => {
  useEffectExtensionScreen('knowledgeGraph');
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { setModal } = useModalsContext();
  const { commonStyles } = useNotebookTheme();
  const { usageMode, notebook } = useUsageMode();

  const { nodes, edges, datatypeNodes, datatypeEdges, axioms, isLoading, getNeighbors } =
    useOntologyData();
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null);
  const [nhopDepth, setNhopDepth] = useState<number>(1);
  const [labelMode, setLabelMode] = useState<OntologyRelationLabelMode>('intuitive');
  const graphScope = `${usageMode || 'loading'}:${notebook?.id ?? ''}`;
  useEffect(() => {
    setSelectedNode(null);
    setNhopDepth(1);
  }, [graphScope]);
  const handleSelectNode = useCallback(
    (node: OntologyNode | null) => {
      setSelectedNode(node);
      if (!node) return;
      setNhopDepth((currentDepth) => normalizeNhopDepth(node, edges, currentDepth));
    },
    [edges]
  );

  // Compute N-hop focused nodes
  const focusedNodeIds = useMemo(() => {
    if (!selectedNode) return null;
    return getNeighbors(selectedNode.id, nhopDepth);
  }, [selectedNode, nhopDepth, getNeighbors]);

  // Navigate to target note or paragraph/section
  const handleOpenNode = useCallback(
    (node: OntologyNode, targetSection?: string) => {
      if (node.role === 'LITERAL') return;
      if (
        node.instanceKind === 'EXTERNAL_LINK' ||
        node.instanceKind === 'CONNECTED_EXTERNAL_LINK'
      ) {
        if (node.description) {
          Linking.openURL(
            node.description.startsWith('//') ? `https:${node.description}` : node.description
          );
        }
        return;
      }
      if (targetSection) {
        const sec = node.properties?.sections?.find((s) => s.title === targetSection);
        navigation.push('NotePage', {
          ...toNoteParams(
            node.paragraph?.origin || node.noteTitle,
            targetSection,
            sec?.autoSection
          ),
          board: node.boardTitle,
        });
      } else if (node.role === 'INSTANCE' && node.paragraph) {
        navigation.push('NotePage', {
          ...toNoteParams(
            node.paragraph.origin || node.noteTitle,
            node.name,
            node.paragraph.autoSection || node.paragraph.section
          ),
          board: node.boardTitle,
        });
      } else {
        navigation.push('NotePage', { title: node.noteTitle });
      }
    },
    [navigation]
  );

  const allDisplayNodes = useMemo(
    () => [...nodes, ...(datatypeNodes || [])],
    [nodes, datatypeNodes]
  );
  const rdfSource = useMemo(
    () => ({ nodes, edges, datatypeNodes, datatypeEdges, axioms }),
    [nodes, edges, datatypeNodes, datatypeEdges, axioms]
  );
  const exportTitle = notebook?.title || 'notebook';
  const exportScope = notebook ? `notebook:${notebook.id}` : 'notes';

  return (
    <View style={[styles.container, { backgroundColor: commonStyles.container?.backgroundColor }]}>
      <ResponsiveSearchBar />
      <KnowledgeGraphNavToolbar
        current="graph"
        rdfSource={!isLoading ? rdfSource : undefined}
        exportScope={exportScope}
        exportTitle={exportTitle}
      />

      {isLoading ? (
        <LoadingView />
      ) : (
        <View style={styles.graphContainer}>
          <OntologyGraphView
            key={graphScope}
            nodes={nodes}
            edges={edges}
            datatypeNodes={datatypeNodes}
            datatypeEdges={datatypeEdges}
            axioms={axioms}
            selectedNode={selectedNode}
            focusedNodeIds={focusedNodeIds}
            labelMode={labelMode}
            onChangeLabelMode={setLabelMode}
            onSelectNode={handleSelectNode}
          />
          {selectedNode && (
            <OntologyPreviewSheet
              node={selectedNode}
              edges={edges}
              allNodes={allDisplayNodes}
              nhopDepth={nhopDepth}
              labelMode={labelMode}
              onChangeNhopDepth={setNhopDepth}
              onClose={() => setSelectedNode(null)}
              onSelectNode={handleSelectNode}
              onOpenNode={handleOpenNode}
              onOpenVirtualNote={(topicNodeId) =>
                setModal(OntologyVirtualNoteModal, { topicNodeId, navigation })
              }
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  graphContainer: {
    flex: 1,
    position: 'relative',
  },
});

export default KnowledgeGraphScreen;
