import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import LoadingView from '../../components/LoadingView';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import { NavigationParamList } from '../../types';
import { KnowledgeGraphNavToolbar } from './components/KnowledgeGraphNavToolbar';
import { KnowledgeGraphPreviewSheet } from './components/KnowledgeGraphPreviewSheet';
import { KnowledgeGraphView } from './components/KnowledgeGraphView';
import { TemplateGraphToggle } from './inductiveTemplate/TemplateGraphToggle';
import { isTemplateGraphNode } from './inductiveTemplate/graph';
import { useTemplateGraph } from './inductiveTemplate/useTemplateGraph';
import { KnowledgeGraphNode } from './types';
import { useKnowledgeGraphData } from './useKnowledgeGraphData';
import { normalizeNhopDepth } from './utils/nhop';

export const KnowledgeGraphScreen: React.FC = () => {
  useEffectExtensionScreen('knowledgeGraph');
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles } = useNotebookTheme();
  const { usageMode, notebook } = useUsageMode();
  const graph = useKnowledgeGraphData();
  const templates = useTemplateGraph(graph);
  const { nodes, edges, getNeighbors } = templates;
  const { axioms, isLoading } = graph;
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [selectionTrigger, setSelectionTrigger] = useState(0);
  const [previewSheetHeight, setPreviewSheetHeight] = useState(0);
  const [nhopDepth, setNhopDepth] = useState<number>(1);
  const graphScope = `${usageMode || 'loading'}:${notebook?.id ?? ''}`;
  useEffect(() => {
    setSelectedNode(null);
    setNhopDepth(1);
  }, [graphScope]);
  useEffect(() => {
    setSelectedNode((current) =>
      current ? nodes.find((node) => node.id === current.id) || null : null
    );
  }, [nodes]);
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
      if (isTemplateGraphNode(node)) return;
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

  return (
    <View style={[styles.container, { backgroundColor: commonStyles.container?.backgroundColor }]}>
      <ResponsiveSearchBar />
      <KnowledgeGraphNavToolbar />

      {isLoading ? (
        <LoadingView />
      ) : (
        <View style={styles.graphContainer}>
          <KnowledgeGraphView
            key={graphScope}
            nodes={nodes}
            edges={edges}
            axioms={axioms}
            selectedNode={selectedNode}
            selectionTrigger={selectionTrigger}
            reservedBottomHeight={selectedNode ? Math.max(200, previewSheetHeight + 28) : 0}
            focusedNodeIds={focusedNodeIds}
            focusDepth={nhopDepth}
            onSelectNode={handleSelectNode}
            extraToolbar={
              templates.available && (
                <TemplateGraphToggle
                  mode={templates.mode}
                  count={templates.count}
                  working={templates.working}
                  error={templates.error}
                  onToggle={templates.toggle}
                />
              )
            }
          />
          {selectedNode && (
            <KnowledgeGraphPreviewSheet
              node={selectedNode}
              edges={edges}
              allNodes={nodes}
              nhopDepth={nhopDepth}
              onChangeNhopDepth={setNhopDepth}
              onClose={() => setSelectedNode(null)}
              onSelectNode={handleSelectNode}
              onOpenNode={handleOpenNode}
              onHeightChange={handlePreviewSheetHeight}
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
