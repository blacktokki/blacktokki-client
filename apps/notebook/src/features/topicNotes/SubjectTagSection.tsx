import { CommonButton, useLangContext, useModalsContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { NoteSectionProps } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import OntologyVirtualNoteModal from '../../modals/OntologyVirtualNoteModal';
import { NavigationParamList } from '../../types';
import { OntologyNode } from '../knowledgeGraph/types';
import { useOntologyData } from '../knowledgeGraph/useOntologyData';
import {
  normalizeTitle,
  noteTitleForKeywordComparison,
} from '../knowledgeGraph/utils/titleKeywordClasses';
import {
  collectTopicStats,
  extractTopicKeyword,
  getTopicRelationCount,
  isTopicClass,
  TopicStats,
} from '../knowledgeGraph/utils/virtualNotes';

interface SubjectTagItem {
  keyword: string;
  topicNode: OntologyNode;
  relationCount: number;
}

const SubjectTagSection = ({ title, paragraphs }: NoteSectionProps): React.JSX.Element => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { setModal } = useModalsContext();
  const { lang } = useLangContext();
  const { colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';

  const { nodes, edges } = useOntologyData();
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

  // Build topic tags that are related to the current note, sorted by relation count descending
  const topicTags = useMemo<SubjectTagItem[]>(() => {
    const topicNodes = nodes.filter(isTopicClass);
    if (topicNodes.length === 0) return [];

    const items: SubjectTagItem[] = topicNodes.flatMap((topicNode) => {
      const keyword = extractTopicKeyword(topicNode);
      const stats = collectTopicStats(topicNode, nodes, edges);
      if (!checkIsRelated(keyword, stats)) return [];
      const relationCount = getTopicRelationCount(stats);
      return [
        {
          keyword,
          topicNode,
          relationCount,
        },
      ];
    });

    return items.sort((a, b) => {
      if (b.relationCount !== a.relationCount) {
        return b.relationCount - a.relationCount;
      }
      return a.keyword.localeCompare(b.keyword);
    });
  }, [nodes, edges, checkIsRelated]);

  // Handle tag press
  const handleTagPress = useCallback(
    (tag: SubjectTagItem) => {
      setModal(OntologyVirtualNoteModal, { topicNodeId: tag.topicNode.id, navigation });
    },
    [navigation, setModal]
  );

  if (topicTags.length === 0) return <></>;

  const chipBg = isDark ? '#5B2C42' : '#F5D0E0';
  const chipTextColor = isDark ? '#FFAAD4' : '#8E285B';
  const buttonBg = isDark ? '#7A3B5C' : '#E8B6CE';
  const renderChip = (label: string, onPress: () => void, key?: string) => (
    <TouchableOpacity key={key} onPress={onPress}>
      <View style={{ backgroundColor: chipBg, borderRadius: 20, overflow: 'hidden', margin: 4 }}>
        <View style={{ paddingVertical: 4, paddingHorizontal: 8, flexDirection: 'row' }}>
          <Text selectable={false} style={{ color: chipTextColor }}>
            {label}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
                      key={tag.topicNode.id}
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
            renderChip(`${lang('Topic') || '주제'} ${topicTags.length}`, () => setIsExpand(true))
          )
        ) : (
          topicTags.map((tag) =>
            renderChip(tag.keyword, () => handleTagPress(tag), tag.topicNode.id)
          )
        )}
      </View>
    </View>
  );
};

export default SubjectTagSection;
