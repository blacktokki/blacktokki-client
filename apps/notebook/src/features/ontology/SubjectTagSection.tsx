import { CommonButton, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { VirtualNoteModal } from './VirtualNoteModal';
import { normalizeTitle, noteTitleForKeywordComparison } from './titleKeywordClasses';
import { OntologyNode } from './types';
import { useOntologyData } from './useOntologyData';
import {
  collectTopicStats,
  extractTopicKeyword,
  findMatchingPhysicalNote,
  getTopicRelationCount,
  isTopLevelTopicClass,
  synthesizeTopicVirtualNote,
  TopicStats,
  TopicVirtualNote,
} from './virtualNotes';
import { NoteSectionProps } from '../../hooks/useExtension';
import { useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NavigationParamList } from '../../types';

interface SubjectTagItem {
  id: string;
  keyword: string;
  topicNode: OntologyNode;
  hasMatchingNote: boolean;
  matchingNoteTitle?: string;
  isRelated: boolean;
  isCurrentNote: boolean;
  relationCount: number;
}

export const SubjectTagSection = ({ title, paragraphs }: NoteSectionProps): React.JSX.Element => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { lang } = useLangContext();
  const { colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';

  const { nodes, edges } = useOntologyData();
  const createOrUpdatePage = useCreateOrUpdatePage();

  const [activeVirtualNote, setActiveVirtualNote] = useState<TopicVirtualNote | null>(null);
  const [isExpand, setIsExpand] = useState<boolean>(false);

  useEffect(() => {
    setIsExpand(false);
  }, [title]);

  const normalizedCurrentTitle = useMemo(() => normalizeTitle(title), [title]);
  const leafCurrentTitle = useMemo(
    () => normalizeTitle(noteTitleForKeywordComparison(title)),
    [title]
  );

  // Determine if a topic is related to the current note
  const checkIsRelated = useCallback(
    (keyword: string, stats: TopicStats): boolean => {
      const normalizedKeyword = normalizeTitle(keyword);
      if (normalizedKeyword === normalizedCurrentTitle || normalizedKeyword === leafCurrentTitle) {
        return true;
      }

      // Check if current note is in the topic's related notes
      const isOriginRelated = stats.sourceNoteTitles.some((origin) => {
        const normOrigin = normalizeTitle(origin);
        const leafOrigin = normalizeTitle(noteTitleForKeywordComparison(origin));
        return normOrigin === normalizedCurrentTitle || leafOrigin === leafCurrentTitle;
      });
      if (isOriginRelated) return true;

      // Check if keyword appears in current note paragraphs
      if (normalizedKeyword.length >= 2) {
        for (const p of paragraphs) {
          const headerText = normalizeTitle(p.header || '');
          if (headerText.includes(normalizedKeyword)) return true;
          const descText = normalizeTitle(p.description || '');
          if (descText.includes(normalizedKeyword)) return true;
        }
      }

      return false;
    },
    [normalizedCurrentTitle, leafCurrentTitle, paragraphs]
  );

  // Build top-level topic tags that are strictly related to the current note, sorted by relation count descending
  const topicTags = useMemo<SubjectTagItem[]>(() => {
    const topLevelNodes = nodes.filter((node) => isTopLevelTopicClass(node, edges));
    if (topLevelNodes.length === 0) return [];

    const items: SubjectTagItem[] = topLevelNodes
      .map((topicNode) => {
        const keyword = extractTopicKeyword(topicNode);
        const stats = collectTopicStats(topicNode, nodes, edges);
        const relationCount = getTopicRelationCount(stats);
        const matchingNote = findMatchingPhysicalNote(keyword, nodes);
        const hasMatchingNote = !!matchingNote;
        const matchingNoteTitle = matchingNote?.noteTitle || matchingNote?.name;
        const isRelated = checkIsRelated(keyword, stats);
        const normKw = normalizeTitle(keyword);
        const isCurrentNote = normKw === normalizedCurrentTitle || normKw === leafCurrentTitle;

        return {
          id: topicNode.id,
          keyword,
          topicNode,
          hasMatchingNote,
          matchingNoteTitle,
          isRelated,
          isCurrentNote,
          relationCount,
        };
      })
      .filter((item) => item.isRelated || item.isCurrentNote);

    return items.sort((a, b) => {
      if (b.relationCount !== a.relationCount) {
        return b.relationCount - a.relationCount;
      }
      return a.keyword.localeCompare(b.keyword);
    });
  }, [nodes, edges, checkIsRelated, normalizedCurrentTitle, leafCurrentTitle]);

  // Handle tag press
  const handleTagPress = useCallback(
    (tag: SubjectTagItem) => {
      if (tag.hasMatchingNote) {
        const targetTitle = tag.matchingNoteTitle || tag.keyword;
        if (
          normalizeTitle(targetTitle) === normalizedCurrentTitle ||
          normalizeTitle(noteTitleForKeywordComparison(targetTitle)) === leafCurrentTitle
        ) {
          // Already on this note
          return;
        }
        if (typeof navigation.push === 'function') {
          navigation.push('NotePage', { title: targetTitle });
        } else {
          navigation.navigate('NotePage', { title: targetTitle });
        }
      } else {
        const virtualNote = synthesizeTopicVirtualNote(tag.topicNode, nodes, edges, lang);
        setActiveVirtualNote(virtualNote);
      }
    },
    [navigation, nodes, edges, lang, normalizedCurrentTitle, leafCurrentTitle]
  );

  // Materialize virtual note into a real note
  const handleSaveVirtualNote = useCallback(
    async (noteTitle: string, content: string) => {
      await createOrUpdatePage.mutateAsync({ title: noteTitle, description: content });
      setActiveVirtualNote(null);
      if (typeof navigation.push === 'function') {
        navigation.push('NotePage', { title: noteTitle });
      } else {
        navigation.navigate('NotePage', { title: noteTitle });
      }
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
        const targetTitle = matchingNote.noteTitle || matchingNote.name;
        if (typeof navigation.push === 'function') {
          navigation.push('NotePage', { title: targetTitle });
        } else {
          navigation.navigate('NotePage', { title: targetTitle });
        }
        return;
      }
      setActiveVirtualNote(synthesizeTopicVirtualNote(topicNode, nodes, edges, lang));
    },
    [edges, lang, navigation, nodes]
  );

  if (topicTags.length === 0 && !activeVirtualNote) return <></>;

  const chipBg = isDark ? '#5B2C42' : '#F5D0E0';
  const chipTextColor = isDark ? '#FFAAD4' : '#8E285B';
  const buttonBg = isDark ? '#7A3B5C' : '#E8B6CE';

  return (
    <View style={{ height: 0, zIndex: isExpand ? 9999 : 1 }}>
      <View style={{ flexDirection: 'row', overflow: isExpand ? 'visible' : 'hidden' }}>
        {topicTags.length >= 3 ? (
          isExpand ? (
            <View
              style={{
                backgroundColor: chipBg,
                borderRadius: 20,
                overflow: 'hidden',
                margin: 4,
              }}
            >
              <View style={{ paddingVertical: 4, paddingHorizontal: 4, maxWidth: 270 }}>
                <TouchableOpacity
                  onPress={() => setIsExpand(false)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    justifyContent: 'space-between',
                    paddingHorizontal: 4,
                    paddingBottom: 2,
                  }}
                >
                  <Text selectable={false} style={{ color: chipTextColor, fontWeight: 'bold' }}>
                    {`${lang('Topic') || '주제'} (${topicTags.length})`}
                  </Text>
                  <Text selectable={false} style={{ color: chipTextColor, marginLeft: 8 }}>
                    ▲
                  </Text>
                </TouchableOpacity>
                <View style={{ width: '100%', alignItems: 'center' }}>
                  {topicTags.map((tag) => (
                    <CommonButton
                      key={tag.id}
                      title={tag.keyword}
                      onPress={() => {
                        handleTagPress(tag);
                        setIsExpand(false);
                      }}
                      style={{
                        width: '100%',
                        backgroundColor: buttonBg,
                        margin: 3,
                        maxWidth: 240,
                      }}
                    />
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setIsExpand(true)}>
              <View
                style={{
                  backgroundColor: chipBg,
                  borderRadius: 20,
                  overflow: 'hidden',
                  margin: 4,
                }}
              >
                <View style={{ paddingVertical: 4, paddingHorizontal: 4, flexDirection: 'row' }}>
                  <View style={{ paddingHorizontal: 4 }}>
                    <Text selectable={false} style={{ color: chipTextColor }}>
                      {`${lang('Topic') || '주제'} ${topicTags.length}`}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )
        ) : (
          topicTags.map((tag) => (
            <TouchableOpacity key={tag.id} onPress={() => handleTagPress(tag)}>
              <View
                style={{
                  backgroundColor: chipBg,
                  borderRadius: 20,
                  overflow: 'hidden',
                  margin: 4,
                }}
              >
                <View style={{ paddingVertical: 4, paddingHorizontal: 4, flexDirection: 'row' }}>
                  <View style={{ paddingHorizontal: 4 }}>
                    <Text selectable={false} style={{ color: chipTextColor }}>
                      {tag.keyword}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
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

export default SubjectTagSection;
