/** Keyword graph controls and selected keyword details. */
import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';

import { urlToNoteLink } from '../../../../components/SearchBar';
import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { KnowledgeGraphToggle } from '../../components/KnowledgeGraphToggle';
import { templateGraphNeighbors } from '../../inductiveTemplate/graph';
import type { KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode } from '../../types';
import { getKnowledgeGraphPalette, getKeywordRelationColors } from '../../utils/palette';
import { addKeywordRelationGraph } from '../graph';
import { relationSectionParams } from '../relationPresentation';
import { relationAnalysisStyles as styles } from '../styles';
import { relationAnalysisDisplay } from '../useRelationAnalysis';
import { useRelationAnalysisSession } from '../useRelationAnalysisSession';

/** Observe the existing background job; toggling never starts inference or reads another scope. */
export function useKeywordRelationGraph(graph: Pick<KnowledgeGraphData, 'nodes' | 'edges'>) {
  const { data, analysis } = useRelationAnalysisSession();
  const { colorScheme } = useNotebookTheme();
  const [selection, setSelection] = useState({ scope: data.scope, enabled: false });
  const ready = data.available && analysis.status === 'completed' && !!analysis.result;
  const enabled = ready && selection.scope === data.scope && selection.enabled;
  const display = relationAnalysisDisplay(analysis);
  useEffect(() => {
    setSelection({ scope: data.scope, enabled: false });
  }, [data.scope, ready]);
  const extraction = analysis.entities || analysis.result?.entityExtraction;
  const augmented = useMemo(
    () =>
      enabled
        ? addKeywordRelationGraph(
            graph,
            extraction,
            analysis.result?.candidates || [],
            getKnowledgeGraphPalette(colorScheme === 'dark'),
            getKeywordRelationColors(colorScheme === 'dark'),
            urlToNoteLink
          )
        : graph,
    [graph.nodes, graph.edges, enabled, extraction, analysis.result, colorScheme]
  );
  const getNeighbors = useMemo(() => templateGraphNeighbors(augmented.edges), [augmented.edges]);
  return {
    ...augmented,
    getNeighbors,
    enabled,
    count: enabled ? augmented.nodes.filter((node) => node.instanceKind === 'KEYWORD').length : 0,
    disabled: !ready,
    progress: ready ? undefined : display.ratio,
    working: display.busy,
    statusLabel: display.statusLabel,
    toggle: () => {
      if (ready) setSelection({ scope: data.scope, enabled: !enabled });
    },
  };
}

export function KeywordGraphToggle({
  enabled,
  count,
  working,
  disabled,
  progress,
  statusLabel,
  onToggle,
}: {
  enabled: boolean;
  count: number;
  working: boolean;
  disabled: boolean;
  progress?: number;
  statusLabel: string;
  onToggle: () => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const palette = getKnowledgeGraphPalette(isDark);
  return (
    <KnowledgeGraphToggle
      active={enabled}
      label={lang('Keywords and Relationships') + (enabled ? ` (${count})` : '')}
      icon="tags"
      activeBackgroundColor={palette.keyword.fill}
      activeBorderColor={palette.keyword.stroke}
      activeTextColor={
        isDark ? commonStyles.container.backgroundColor : commonStyles.buttonText.color
      }
      inactiveTextColor={commonStyles.text.color}
      working={working}
      disabled={disabled}
      progress={progress}
      accessibilityLabel={
        lang('Keywords and Relationships') + (disabled ? `: ${lang(statusLabel)}` : '')
      }
      onToggle={onToggle}
    />
  );
}

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
    for (const source of node.keyword?.sources || node.keywordType?.sources || []) {
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
  }, [node.keyword, node.keywordType]);
  const typeLinks = useMemo(() => {
    const byId = new Map(nodes.map((item) => [item.id, item]));
    const groups: Record<string, Map<string, KnowledgeGraphNode>> = {};
    for (const edge of edges) {
      let label: string;
      let id: string;
      if (edge.type === 'INSTANCE_OF' && edge.propertyLabel === 'keywordType') {
        if (edge.source === node.id) {
          label = 'Keyword type';
          id = edge.target;
        } else if (edge.target === node.id) {
          label = 'Keyword';
          id = edge.source;
        } else continue;
      } else if (edge.type === 'SUBCLASS_OF' && edge.propertyLabel === 'keywordTypeHierarchy') {
        if (edge.source === node.id) {
          label = 'Parent keyword types';
          id = edge.target;
        } else if (edge.target === node.id) {
          label = 'Child keyword types';
          id = edge.source;
        } else continue;
      } else continue;
      const other = byId.get(id);
      if (other) (groups[label] ||= new Map()).set(id, other);
    }
    return Object.entries(groups).map(([label, members]) => ({
      label,
      members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [node.id, nodes, edges]);
  const general = useMemo(() => {
    const byId = new Map(nodes.map((item) => [item.id, item]));
    return edges
      .flatMap((edge) => {
        if (edge.type !== 'KEYWORD_GENERAL' || (edge.source !== node.id && edge.target !== node.id))
          return [];
        const owns = edge.source === node.id;
        const other = byId.get(owns ? edge.target : edge.source);
        const constituent = edge.propertyLabel === 'Synthetic / constituent keyword relationships';
        const role = constituent
          ? owns
            ? 'Constituent keyword'
            : 'Synthetic keyword'
          : owns
          ? 'Contained keyword'
          : 'Compound keyword';
        return other ? [{ edge, other, role }] : [];
      })
      .sort((a, b) => a.other.name.localeCompare(b.other.name) || a.role.localeCompare(b.role));
  }, [node.id, nodes, edges]);
  const related = useMemo(() => {
    const byId = new Map(nodes.map((item) => [item.id, item]));
    return edges
      .flatMap((edge) => {
        if (
          (edge.type !== 'KEYWORD_RELATION' && edge.type !== 'KEYWORD_TYPE_RELATION') ||
          (edge.source !== node.id && edge.target !== node.id)
        )
          return [];
        const other = byId.get(edge.source === node.id ? edge.target : edge.source);
        return other ? [{ edge, other }] : [];
      })
      .sort(
        (left, right) =>
          (right.edge.keywordRelation?.score ?? right.edge.keywordTypeRelation?.score ?? 0) -
            (left.edge.keywordRelation?.score ?? left.edge.keywordTypeRelation?.score ?? 0) ||
          (right.edge.keywordRelation?.observations || 0) -
            (left.edge.keywordRelation?.observations || 0) ||
          left.other.name.localeCompare(right.other.name)
      );
  }, [node.id, nodes, edges]);
  return (
    <>
      {node.keywordType && (
        <Text style={[commonStyles.smallText, styles.previewPattern]} numberOfLines={1}>
          {lang(node.keywordType.kind === 'entity-type' ? 'Entity type' : 'Entity pattern')}
        </Text>
      )}
      {typeLinks.map(({ label, members }) => (
        <React.Fragment key={label}>
          {renderSection(
            lang(label),
            members.map((other) => ({
              key: other.id,
              label: other.name,
              color: other.strokeColor,
              onPress: () => onSelectNode(other),
            }))
          )}
        </React.Fragment>
      ))}
      {renderSection(lang('Keyword source'), sources)}
      {renderSection(
        lang('General relationships'),
        general.map(({ edge, other, role }) => ({
          key: edge.id,
          label: `${other.name} · ${lang(role)}`,
          color: edge.color,
          onPress: () => onSelectNode(other),
        }))
      )}
      {renderSection(
        lang('Associations'),
        related.map(({ edge, other }) => ({
          key: edge.id,
          label: `${other.name} · ${lang(edge.label || '')}`,
          accessibilityLabel: `${other.name} · ${lang(edge.label || '')}`,
          color: edge.color,
          onPress: () => onSelectNode(other),
        }))
      )}
    </>
  );
}
