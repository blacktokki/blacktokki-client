import { useLangContext } from '@blacktokki/core';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { templateGraphStyles as styles } from './styles';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';

export const TemplateGraphDetails = ({
  node,
  nodes,
  edges,
  onSelectNode,
}: {
  node: KnowledgeGraphNode;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  onSelectNode: (node: KnowledgeGraphNode) => void;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const group = node.classKind === 'TEMPLATE_GROUP';
  const related = useMemo(() => {
    const ids = new Set(
      edges.flatMap((edge) =>
        group
          ? edge.type === 'INSTANCE_OF' && edge.target === node.id
            ? [edge.source]
            : []
          : edge.type === 'DERIVED_FROM' && edge.source === node.id
          ? [edge.target]
          : []
      )
    );
    return nodes.filter((candidate) => ids.has(candidate.id));
  }, [node.id, group, nodes, edges]);
  return (
    <View style={styles.related}>
      <Text style={[commonStyles.smallText, styles.label]}>
        {lang(group ? 'Discovered templates' : 'Similar notes') + ' · ' + related.length}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.list}>
          {related.map((candidate) => (
            <Pressable
              key={candidate.id}
              accessibilityRole="button"
              accessibilityLabel={group ? candidate.name : candidate.noteTitle || candidate.name}
              style={[commonStyles.backgroundContainer, styles.chip]}
              onPress={() => onSelectNode(candidate)}
            >
              <Text style={[commonStyles.text, styles.label]} numberOfLines={2}>
                {group ? '{{ }} ' + candidate.name : candidate.noteTitle || candidate.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};
