import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useMemo } from 'react';
import { Text } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '../../types';
import { relationVerdictLabels } from '../relationFilters';
import { relationSectionParams } from '../relationPresentation';
import { relationAnalysisStyles as styles } from '../styles';

/** Reuse the preview's compact sections for source navigation and graph exploration. */
export function KeywordGraphDetails({
  node,
  nodes,
  edges,
  onSelectNode,
  renderSection,
}: {
  node: KnowledgeGraphNode;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  onSelectNode: (node: KnowledgeGraphNode) => void;
  renderSection: (
    label: string,
    items: {
      key: string;
      label: string;
      accessibilityLabel?: string;
      color?: string;
      onPress: () => void;
    }[]
  ) => React.ReactNode;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const sources = useMemo(() => {
    const destinations = new Map<
      string,
      { key: string; label: string; accessibilityLabel: string; onPress: () => void }
    >();
    for (const source of node.keyword?.sources || []) {
      const destination = relationSectionParams(
        source.noteTitle,
        source.section,
        source.sectionPath
      );
      const key = JSON.stringify(destination);
      destinations.set(key, {
        key,
        label: [source.noteTitle.split('/').at(-1), destination.paragraph]
          .filter(Boolean)
          .join(' · '),
        accessibilityLabel: [source.noteTitle, source.section].filter(Boolean).join(' · '),
        onPress: () => push('NotePage', destination),
      });
    }
    return [...destinations.values()];
  }, [node.keyword]);
  const related = useMemo(() => {
    const byId = new Map(nodes.map((item) => [item.id, item]));
    return edges
      .flatMap((edge) => {
        const verdict = edge.keywordRelation?.verdict;
        if (
          edge.type !== 'KEYWORD_RELATION' ||
          (edge.source !== node.id && edge.target !== node.id) ||
          (verdict !== 'supported' && verdict !== 'contradicted')
        )
          return [];
        const other = byId.get(edge.source === node.id ? edge.target : edge.source);
        return other ? [{ edge, other, verdict }] : [];
      })
      .sort(
        (left, right) =>
          Number(left.verdict === 'contradicted') - Number(right.verdict === 'contradicted') ||
          (right.edge.keywordRelation?.observations || 0) -
            (left.edge.keywordRelation?.observations || 0) ||
          left.other.name.localeCompare(right.other.name)
      );
  }, [node.id, nodes, edges]);
  return (
    <>
      {node.keyword?.type && (
        <Text style={[commonStyles.smallText, styles.previewPattern]} numberOfLines={1}>
          {lang('Entity type')}: {node.keyword.type}
        </Text>
      )}
      {renderSection(lang('Keyword source'), sources)}
      {renderSection(
        lang('Related relationships'),
        related.map(({ edge, other, verdict }) => ({
          key: edge.id,
          label: `${other.name} · ${edge.label}`,
          accessibilityLabel: `${other.name} · ${edge.label} · ${lang(
            relationVerdictLabels[verdict]
          )}`,
          color: edge.color,
          onPress: () => onSelectNode(other),
        }))
      )}
    </>
  );
}
