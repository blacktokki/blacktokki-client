import { useLangContext, useModalsContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ResponsiveSearchBar } from '../../components/SearchBar';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useNotePages } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import OntologyVirtualNoteModal from '../../modals/OntologyVirtualNoteModal';
import { NoteListSection } from '../../screens/main/NoteListSection';
import { NavigationParamList } from '../../types';
import { KnowledgeGraphNavToolbar } from '../knowledgeGraph/components/KnowledgeGraphNavToolbar';
import { useOntologyData } from '../knowledgeGraph/useOntologyData';
import { normalizeTitle } from '../knowledgeGraph/utils/titleKeywordClasses';
import {
  buildTopicListItemsData,
  compareTopicListItems,
  TopicListItemData,
} from '../knowledgeGraph/utils/virtualNotes';

export const TopicNotesScreen: React.FC = () => {
  useEffectExtensionScreen('topicNotes');
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { setModal } = useModalsContext();
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { nodes, edges, isLoading } = useOntologyData();
  const { data: notePages = [], isLoading: isNoteLoading } = useNotePages();
  const [topicFilter, setTopicFilter] = useState<'all' | 'real' | 'virtual'>('all');

  // Sort topics by the sum of links, paragraphs, cards, and source notes.
  const topicItems: TopicListItemData[] = useMemo(() => {
    const pagesByTitle = new Map(notePages.map((page) => [normalizeTitle(page.title), page.title]));
    return buildTopicListItemsData(nodes, edges, lang)
      .map((item) => {
        const matchingNoteTitle = pagesByTitle.get(normalizeTitle(item.keyword));
        return matchingNoteTitle
          ? { ...item, hasMatchingNote: true, matchingNoteTitle, link: undefined }
          : item;
      })
      .sort(compareTopicListItems);
  }, [nodes, edges, lang, notePages]);
  const visibleTopicItems = useMemo(
    () =>
      topicItems.filter(
        (item) => topicFilter === 'all' || item.hasMatchingNote === (topicFilter === 'real')
      ),
    [topicItems, topicFilter]
  );
  const realTopicCount = topicItems.filter((item) => item.hasMatchingNote).length;
  const topicCounts = {
    all: topicItems.length,
    real: realTopicCount,
    virtual: topicItems.length - realTopicCount,
  };

  // Every topic opens its generated note; a topic with a physical note can navigate there.
  const handlePress = useCallback(
    (item: TopicListItemData) => {
      setModal(OntologyVirtualNoteModal, { topicNodeId: item.topicNode.id, navigation });
    },
    [navigation, setModal]
  );

  return (
    <View style={[styles.container, { backgroundColor: commonStyles.container?.backgroundColor }]}>
      <ResponsiveSearchBar />
      <KnowledgeGraphNavToolbar current="topic" />

      {!isLoading && !isNoteLoading && (
        <View
          style={[
            styles.filterBar,
            {
              backgroundColor: commonStyles.card?.backgroundColor,
              borderColor: commonStyles.card?.borderColor,
            },
          ]}
        >
          {(['all', 'real', 'virtual'] as const).map((filter) => {
            const selected = topicFilter === filter;
            const label = lang(
              filter === 'all'
                ? 'All topics'
                : filter === 'real'
                ? 'Real notes only'
                : 'Virtual notes only'
            );
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  selected && { backgroundColor: commonStyles.button?.backgroundColor },
                ]}
                onPress={() => setTopicFilter(filter)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: selected ? commonStyles.buttonText?.color : commonStyles.text?.color },
                  ]}
                >
                  {label} ({topicCounts[filter]})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <NoteListSection
        contents={visibleTopicItems as any}
        isLoading={isLoading || isNoteLoading}
        emptyMessage={
          topicFilter === 'real'
            ? 'No real topic notes.'
            : topicFilter === 'virtual'
            ? 'No virtual topic notes.'
            : 'There are no topics.'
        }
        onPress={(_title, _p, _s, item) => handlePress(item as unknown as TopicListItemData)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 4,
    borderWidth: 1,
    borderRadius: 8,
  },
  filterButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default TopicNotesScreen;
