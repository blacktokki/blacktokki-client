import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import LoadingView from '../../components/LoadingView';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import { useEffectExtensionScreen, useExtension } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import { NavigationParamList } from '../../types';
import { KnowledgeGraphNavToolbar } from './components/KnowledgeGraphNavToolbar';
import { KnowledgeGraphPreviewSheet } from './components/KnowledgeGraphPreviewSheet';
import { KnowledgeGraphView } from './components/KnowledgeGraphView';
import { KnowledgeGraphRdfExportButton } from './owlrdf/KnowledgeGraphRdfExportButton';
import { KnowledgeGraphRelationLabelMode } from './owlrdf/relations';
import { useOwlRdfGraphData } from './owlrdf/useOwlRdfGraphData';
import { KnowledgeGraphNode } from './types';
import { useKnowledgeGraphScreenExtension } from './useKnowledgeGraphScreenExtension';
import { normalizeNhopDepth } from './utils/nhop';

export const KnowledgeGraphScreen: React.FC = () => {
  useEffectExtensionScreen('knowledgeGraph');
  const { data: extension, isLoading: isExtensionLoading } = useExtension();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles } = useNotebookTheme();
  const { usageMode, notebook } = useUsageMode();

  const activeKeys = useMemo(
    () => new Set(extension?.info?.filter((item) => item.active).map((item) => item.key) || []),
    [extension]
  );
  const baseGraph = useOwlRdfGraphData();
  const {
    graph,
    scopeKey,
    highlightedNodeIds,
    clusterClassIds,
    extensionClassLabels,
    getNodeAction,
    canOpenNode,
  } = useKnowledgeGraphScreenExtension(baseGraph, activeKeys);
  const { nodes, edges, datatypeNodes, datatypeEdges, axioms, getNeighbors } = graph;
  const isLoading = graph.isLoading || isExtensionLoading;
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [selectionTrigger, setSelectionTrigger] = useState(0);
  const [previewSheetHeight, setPreviewSheetHeight] = useState(0);
  const [nhopDepth, setNhopDepth] = useState<number>(1);
  const [labelMode, setLabelMode] = useState<KnowledgeGraphRelationLabelMode>('intuitive');
  const graphScope = `${usageMode || 'loading'}:${notebook?.id ?? ''}:${scopeKey}`;
  useEffect(() => {
    setSelectedNode(null);
    setNhopDepth(1);
  }, [graphScope]);
  const handleSelectNode = useCallback(
    (node: KnowledgeGraphNode | null) => {
      setSelectedNode(node);
      if (!node) return;
      setSelectionTrigger((trigger) => trigger + 1);
      setNhopDepth((currentDepth) => normalizeNhopDepth(node, edges, currentDepth));
    },
    [edges]
  );
  const handlePreviewSheetHeight = useCallback((height: number) => {
    setPreviewSheetHeight((previous) => (Math.abs(previous - height) < 1 ? previous : height));
  }, []);

  // Compute N-hop focused nodes
  const focusedNodeIds = useMemo(() => {
    if (!selectedNode) return null;
    return getNeighbors(selectedNode.id, nhopDepth);
  }, [selectedNode, nhopDepth, getNeighbors]);

  // Navigate to target note or paragraph/section
  const handleOpenNode = useCallback(
    (node: KnowledgeGraphNode, targetSection?: string) => {
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

  const allDisplayNodes = useMemo(() => [...nodes, ...datatypeNodes], [nodes, datatypeNodes]);
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
        action={
          !isLoading ? (
            <KnowledgeGraphRdfExportButton
              source={rdfSource}
              scopeId={exportScope}
              title={exportTitle}
            />
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingView />
      ) : (
        <View style={styles.graphContainer}>
          <KnowledgeGraphView
            key={graphScope}
            nodes={nodes}
            edges={edges}
            datatypeNodes={datatypeNodes}
            datatypeEdges={datatypeEdges}
            inferredEdges={axioms.inferredEdges}
            axioms={axioms}
            selectedNode={selectedNode}
            selectionTrigger={selectionTrigger}
            reservedBottomHeight={selectedNode ? Math.max(200, previewSheetHeight + 28) : 0}
            focusedNodeIds={focusedNodeIds}
            labelMode={labelMode}
            onChangeLabelMode={setLabelMode}
            onSelectNode={handleSelectNode}
            highlightedNodeIds={highlightedNodeIds}
            clusterClassIds={clusterClassIds}
            extensionClassLabels={extensionClassLabels}
          />
          {selectedNode && (
            <KnowledgeGraphPreviewSheet
              node={selectedNode}
              edges={edges}
              allNodes={allDisplayNodes}
              nhopDepth={nhopDepth}
              labelMode={labelMode}
              onChangeNhopDepth={setNhopDepth}
              onClose={() => setSelectedNode(null)}
              onSelectNode={handleSelectNode}
              onOpenNode={handleOpenNode}
              onHeightChange={handlePreviewSheetHeight}
              nodeAction={getNodeAction?.(selectedNode)}
              canOpenNode={canOpenNode?.(selectedNode)}
              extensionClassLabels={extensionClassLabels}
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
