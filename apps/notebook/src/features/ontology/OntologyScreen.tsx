import { useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OntologyGraphView } from './OntologyGraphView';
import { OntologyNavToolbar } from './OntologyNavToolbar';
import { OntologyPreviewSheet } from './OntologyPreviewSheet';
import { VirtualNoteModal } from './VirtualNoteModal';
import { OntologyNode } from './types';
import { useOntologyData } from './useOntologyData';
import {
  extractTopicKeyword,
  findMatchingPhysicalNote,
  synthesizeTopicVirtualNote,
  TopicVirtualNote,
} from './virtualNotes';
import LoadingView from '../../components/LoadingView';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import { useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import { NavigationParamList } from '../../types';

export const OntologyScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { notebook } = useUsageMode();

  const { nodes, edges, datatypeNodes, datatypeEdges, axioms, isLoading, getNeighbors } =
    useOntologyData();
  const createOrUpdatePage = useCreateOrUpdatePage();
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null);
  const [nhopDepth, setNhopDepth] = useState<number>(1);
  const [activeVirtualNote, setActiveVirtualNote] = useState<TopicVirtualNote | null>(null);

  const handleSaveVirtualNote = useCallback(
    async (title: string, content: string) => {
      await createOrUpdatePage.mutateAsync({ title, description: content });
      setActiveVirtualNote(null);
      navigation.push('NotePage', { title });
    },
    [createOrUpdatePage, navigation]
  );

  const handleOpenRelatedTopic = useCallback(
    (topicNodeId: string) => {
      const topicNode = nodes.find((node) => node.id === topicNodeId);
      if (!topicNode || topicNode.role !== 'CLASS' || topicNode.classCategory !== 'TOPIC') return;
      const matchingNote = findMatchingPhysicalNote(extractTopicKeyword(topicNode), nodes);
      if (matchingNote) {
        setActiveVirtualNote(null);
        navigation.push('NotePage', { title: matchingNote.noteTitle || matchingNote.name });
        return;
      }
      setActiveVirtualNote(synthesizeTopicVirtualNote(topicNode, nodes, edges, lang));
    },
    [edges, lang, navigation, nodes]
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
      <OntologyNavToolbar
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
            nodes={nodes}
            edges={edges}
            datatypeNodes={datatypeNodes}
            datatypeEdges={datatypeEdges}
            axioms={axioms}
            selectedNode={selectedNode}
            focusedNodeIds={focusedNodeIds}
            onSelectNode={setSelectedNode}
          />
          {selectedNode && (
            <OntologyPreviewSheet
              node={selectedNode}
              edges={edges}
              allNodes={allDisplayNodes}
              nhopDepth={nhopDepth}
              onChangeNhopDepth={setNhopDepth}
              onClose={() => setSelectedNode(null)}
              onSelectNode={setSelectedNode}
              onOpenNode={handleOpenNode}
              onOpenVirtualNote={setActiveVirtualNote}
            />
          )}
          <VirtualNoteModal
            visible={!!activeVirtualNote}
            virtualNote={activeVirtualNote}
            navigation={navigation}
            onClose={() => setActiveVirtualNote(null)}
            onSaveAsNote={handleSaveVirtualNote}
            onOpenRelatedTopic={handleOpenRelatedTopic}
          />
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
