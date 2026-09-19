import { useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OntologyNavToolbar } from './OntologyNavToolbar';
import { VirtualNoteModal } from './VirtualNoteModal';
import { useOntologyData } from './useOntologyData';
import {
  buildTopicListItemData,
  extractTopicKeyword,
  findMatchingPhysicalNote,
  isTopLevelTopicClass,
  synthesizeTopicVirtualNote,
  TopicListItemData,
  TopicVirtualNote,
} from './virtualNotes';
import { ResponsiveSearchBar } from '../../components/SearchBar';
import { useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NoteListSection } from '../../screens/main/NoteListSection';
import { NavigationParamList } from '../../types';

export const OntologyTopicScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { nodes, edges, isLoading } = useOntologyData();
  const createOrUpdatePage = useCreateOrUpdatePage();

  const [activeVirtualNote, setActiveVirtualNote] = useState<TopicVirtualNote | null>(null);

  // Filter and build top-level and standalone topic class list items sorted by relation count descending
  const topicItems: TopicListItemData[] = useMemo(() => {
    return nodes
      .filter((node) => isTopLevelTopicClass(node, edges))
      .map((node) => buildTopicListItemData(node, nodes, edges, lang))
      .sort((a, b) => {
        if (b.relationCount !== a.relationCount) {
          return b.relationCount - a.relationCount;
        }
        return a.title.localeCompare(b.title);
      });
  }, [nodes, edges, lang]);

  // Handle press: navigate to real note if exists, or open virtual note modal
  const handlePress = useCallback(
    (item: TopicListItemData) => {
      if (item.hasMatchingNote) {
        navigation.push('NotePage', {
          title: item.matchingNoteTitle || item.keyword,
        });
      } else {
        const virtualNote = synthesizeTopicVirtualNote(item.topicNode, nodes, edges, lang);
        setActiveVirtualNote(virtualNote);
      }
    },
    [navigation, nodes, edges, lang]
  );

  // Materialize virtual note into a real note and navigate to it
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

  return (
    <View style={[styles.container, { backgroundColor: commonStyles.container?.backgroundColor }]}>
      <ResponsiveSearchBar />
      <OntologyNavToolbar current="topic" />

      <NoteListSection
        contents={topicItems as any}
        isLoading={isLoading}
        emptyMessage="There are no topics."
        onPress={(_title, _p, _s, item) => handlePress(item as unknown as TopicListItemData)}
      />

      <VirtualNoteModal
        visible={!!activeVirtualNote}
        virtualNote={activeVirtualNote}
        navigation={navigation}
        onClose={() => setActiveVirtualNote(null)}
        onSaveAsNote={handleSaveVirtualNote}
        onOpenRelatedTopic={handleOpenRelatedTopic}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default OntologyTopicScreen;
