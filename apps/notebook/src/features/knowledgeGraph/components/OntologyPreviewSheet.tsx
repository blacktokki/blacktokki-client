import { Text, useLangContext } from '@blacktokki/core';
import React from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { parseHtmlToParagraphs } from '../../../components/HeaderSelectBar';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { OntologyEdge, OntologyNode } from '../types';
import { findInstanceClassIds } from '../utils/classMembership';
import { getNhopDepthOptions } from '../utils/nhop';
import { getOntologyPalette } from '../utils/palette';
import { getBoardParagraphSourceNotes } from '../utils/paragraphClassification';
import {
  getOntologyNodeKind,
  getOntologyNodeKindLabel,
  OntologyRelationLabelMode,
} from '../utils/relations';
import { isTopicVirtualNoteEligible } from '../utils/virtualNotes';

interface OntologyPreviewSheetProps {
  node: OntologyNode;
  edges: OntologyEdge[];
  allNodes: OntologyNode[];
  nhopDepth: number;
  labelMode: OntologyRelationLabelMode;
  onChangeNhopDepth: (depth: number) => void;
  onClose: () => void;
  onSelectNode: (node: OntologyNode) => void;
  onOpenNode: (node: OntologyNode, targetSection?: string) => void;
  onOpenVirtualNote?: (topicNodeId: string) => void;
}

const PreviewChip: React.FC<{
  label: string;
  backgroundColor: string;
  textColor: string | undefined;
  onPress: () => void;
}> = ({ label, backgroundColor, textColor, onPress }) => (
  <TouchableOpacity style={[styles.sectionChip, { backgroundColor }]} onPress={onPress}>
    <Text style={[styles.sectionChipText, { color: textColor }]}>{label}</Text>
  </TouchableOpacity>
);

export const OntologyPreviewSheet: React.FC<OntologyPreviewSheetProps> = ({
  node,
  edges,
  allNodes,
  nhopDepth,
  labelMode,
  onChangeNhopDepth,
  onClose,
  onSelectNode,
  onOpenNode,
  onOpenVirtualNote,
}) => {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const palette = getOntologyPalette(isDark);

  const incomingEdges = edges.filter((e) => e.target === node.id);
  const outgoingEdges = edges.filter((e) => e.source === node.id);
  const nhopDepthOptions = getNhopDepthOptions(node, edges);

  const nodeKind = getOntologyNodeKind(node);
  const badgeColor = palette[nodeKind].stroke;
  const typeLabel = getOntologyNodeKindLabel(nodeKind, labelMode, lang);

  const typeIcon = {
    builtInClass: 'sitemap',
    boardClass: 'sitemap',
    topicClass: 'sitemap',
    literal: 'square-o',
    externalLink: 'external-link',
    connectedExternalLink: 'external-link',
    note: 'file-text-o',
    boardNote: 'file-text-o',
    connectedParagraph: 'link',
    boardParagraph: 'align-left',
    paragraph: 'align-left',
    card: 'id-badge',
  }[nodeKind];

  const propertyEntries = React.useMemo(() => {
    return Object.entries(node.properties || {}).filter(
      ([, v]) => v !== undefined && v !== null && String(v).trim().length > 0
    );
  }, [node.properties]);

  const cardSections = React.useMemo(() => {
    if (node.role !== 'INSTANCE' || node.instanceKind !== 'CARD' || !node.description) return [];
    const paragraphs = parseHtmlToParagraphs(node.description);
    return paragraphs.filter(
      (p) => p.level > (node.paragraph?.level ?? 0) && p.title.trim().length > 0
    );
  }, [node]);
  const boardParagraphSourceNotes = React.useMemo(() => getBoardParagraphSourceNotes(node), [node]);
  const directClasses =
    node.role === 'INSTANCE'
      ? findInstanceClassIds(node.id, edges)
          .map((classId) => allNodes.find((candidate) => candidate.id === classId))
          .filter((candidate): candidate is OntologyNode => candidate?.role === 'CLASS')
      : [];
  const topicClassById = new Map(
    allNodes
      .filter((candidate) => candidate.role === 'CLASS' && candidate.classCategory === 'TOPIC')
      .map((candidate) => [candidate.id, candidate])
  );
  const parentTopicClasses = edges
    .filter((edge) => edge.type === 'SUBCLASS_OF' && edge.source === node.id)
    .map((edge) => topicClassById.get(edge.target))
    .filter((candidate): candidate is OntologyNode => !!candidate);
  const childTopicClasses = edges
    .filter((edge) => edge.type === 'SUBCLASS_OF' && edge.target === node.id)
    .map((edge) => topicClassById.get(edge.source))
    .filter((candidate): candidate is OntologyNode => !!candidate);
  const classChipBackground = (classNode: OntologyNode): string => {
    if (classNode.classCategory === 'BOARD') {
      return isDark ? 'rgba(130, 224, 170, 0.16)' : 'rgba(34, 153, 84, 0.12)';
    }
    if (classNode.classCategory === 'TOPIC') {
      return isDark ? 'rgba(241, 139, 184, 0.16)' : 'rgba(173, 61, 118, 0.12)';
    }
    return isDark ? 'rgba(170, 204, 255, 0.14)' : 'rgba(85, 136, 204, 0.1)';
  };

  const isVirtualEligible = React.useMemo(() => isTopicVirtualNoteEligible(node), [node]);

  const renderSections = (
    label: string,
    items: { key: string | number; label: string; onPress: () => void }[],
    icon?: string
  ) => (
    <View style={styles.sectionsContainer}>
      {icon ? (
        <View style={styles.sectionsHeader}>
          <Icon
            name={icon}
            size={10}
            color={commonStyles.smallText?.color}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.sectionsLabelText, { color: commonStyles.smallText?.color }]}>
            {label} ({items.length})
          </Text>
        </View>
      ) : (
        <Text style={[styles.sectionsLabelText, { color: commonStyles.smallText?.color }]}>
          {label} ({items.length})
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={icon ? styles.sectionsScrollView : undefined}
      >
        <View style={styles.sectionsChips}>
          {items.map((item) => (
            <PreviewChip
              key={item.key}
              label={item.label}
              backgroundColor={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'}
              textColor={commonStyles.text?.color}
              onPress={item.onPress}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.sheetWrapper} pointerEvents="box-none">
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: isDark ? 'rgba(28, 32, 38, 0.94)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          },
          Platform.OS === 'web'
            ? ({
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              } as any)
            : {},
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={[styles.badge, { backgroundColor: badgeColor }]}>
              <Icon name={typeIcon} size={9.5} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.badgeText}>{typeLabel}</Text>
            </View>
            {isVirtualEligible && (
              <View style={[styles.badge, { backgroundColor: '#AD3D76' }]}>
                <Icon name="globe" size={9.5} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.badgeText}>{lang('Virtual Note') || '가상노트'}</Text>
              </View>
            )}
            <Text style={[styles.title, { color: commonStyles.title?.color }]} numberOfLines={1}>
              {node.name}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityLabel="Close preview"
          >
            <Icon name="times" size={14} color={commonStyles.text?.color} />
          </TouchableOpacity>
        </View>

        {node.boardTitle && (
          <Text style={[styles.subText, { color: commonStyles.smallText?.color }]}>
            {lang('Notebook:')} {node.boardTitle}
            {node.instanceKind !== 'BOARD_PARAGRAPH' &&
            node.noteTitle &&
            node.noteTitle !== node.boardTitle
              ? ` ▶ ${node.noteTitle.slice(node.boardTitle.length + 1)}`
              : ''}
          </Text>
        )}

        {node.role === 'INSTANCE' && (
          <View style={styles.classesContainer}>
            <View style={styles.sectionsHeader}>
              <Icon
                name="sitemap"
                size={10}
                color={commonStyles.smallText?.color}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.sectionsLabelText, { color: commonStyles.smallText?.color }]}>
                {labelMode === 'rdf' ? 'rdf:type' : lang('Category')} ({directClasses.length})
              </Text>
            </View>
            <View style={styles.classChips}>
              {directClasses.length > 0 ? (
                directClasses.map((directClass) => (
                  <PreviewChip
                    key={directClass.id}
                    label={directClass.name}
                    backgroundColor={classChipBackground(directClass)}
                    textColor={commonStyles.text?.color}
                    onPress={() => onSelectNode(directClass)}
                  />
                ))
              ) : (
                <Text style={[styles.sectionChipText, { color: commonStyles.smallText?.color }]}>
                  {lang('None')}
                </Text>
              )}
            </View>
          </View>
        )}

        {node.role === 'CLASS' && node.classCategory === 'TOPIC' && (
          <>
            {renderSections(
              lang('Parent Categories'),
              parentTopicClasses.map((parent) => ({
                key: parent.id,
                label: parent.name,
                onPress: () => onSelectNode(parent),
              })),
              'level-up'
            )}
            {renderSections(
              lang('Child Categories'),
              childTopicClasses.map((child) => ({
                key: child.id,
                label: child.name,
                onPress: () => onSelectNode(child),
              })),
              'level-down'
            )}
          </>
        )}

        {boardParagraphSourceNotes.length > 0 &&
          renderSections(
            lang('Source Notes'),
            boardParagraphSourceNotes.map(({ noteTitle, paragraph }) => ({
              key: noteTitle,
              label: noteTitle,
              onPress: () => onOpenNode({ ...node, noteTitle, paragraph }),
            }))
          )}

        {propertyEntries.length > 0 && (
          <View style={styles.propertiesRow}>
            {propertyEntries.map(([key, val]) => {
              const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
              const iconName =
                key === 'schedule' ? 'calendar' : key === 'updated' ? 'clock-o' : 'tag';
              const chipColor =
                key === 'schedule'
                  ? '#E67E22'
                  : key === 'updated'
                  ? isDark
                    ? '#AAB7B8'
                    : '#7F8C8D'
                  : isDark
                  ? '#5DADE2'
                  : '#2980B9';
              const chipBg =
                key === 'schedule'
                  ? isDark
                    ? 'rgba(230, 126, 34, 0.2)'
                    : 'rgba(230, 126, 34, 0.12)'
                  : key === 'updated'
                  ? isDark
                    ? 'rgba(170, 183, 184, 0.16)'
                    : 'rgba(127, 140, 141, 0.12)'
                  : isDark
                  ? 'rgba(93, 173, 226, 0.16)'
                  : 'rgba(41, 128, 185, 0.12)';
              return (
                <View key={key} style={[styles.propertyChip, { backgroundColor: chipBg }]}>
                  <Icon name={iconName} size={9.5} color={chipColor} style={{ marginRight: 4 }} />
                  <Text style={[styles.propertyChipText, { color: chipColor }]}>
                    {key === 'schedule' || key === 'updated' ? strVal : `${key}: ${strVal}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {cardSections.length > 0 &&
          renderSections(
            lang('Sub-sections'),
            cardSections.map((sec, idx) => ({
              key: idx,
              label: `H${sec.level} · ${sec.title}`,
              onPress: () => onOpenNode(node, sec.title),
            })),
            'list-ul'
          )}

        <View style={styles.bottomRow}>
          <View style={styles.relationCounts}>
            <View
              style={[
                styles.chip,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
              ]}
            >
              <Text style={[styles.relationText, { color: commonStyles.smallText?.color }]}>
                {lang('Relation')} ↑{incomingEdges.length} · ↓{outgoingEdges.length}
              </Text>
            </View>
          </View>

          <View style={styles.nhopGroup}>
            <Text style={[styles.nhopLabel, { color: commonStyles.smallText?.color }]}>
              {lang('N-hop Range')}:
            </Text>
            {nhopDepthOptions.map((depth) => {
              const isActive = nhopDepth === depth;
              return (
                <TouchableOpacity
                  key={depth}
                  style={[
                    styles.nhopButton,
                    {
                      backgroundColor: isActive
                        ? commonStyles.button?.backgroundColor || '#3498DB'
                        : isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.05)',
                    },
                  ]}
                  onPress={() => onChangeNhopDepth(depth)}
                >
                  <Text
                    style={[
                      styles.nhopButtonText,
                      {
                        color: isActive ? '#FFFFFF' : commonStyles.text?.color,
                        fontWeight: isActive ? 'bold' : 'normal',
                      },
                    ]}
                  >
                    {depth === 99 ? lang('All') : `${depth}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Generated topic classes do not have a source note to open. */}
          {node.role !== 'LITERAL' &&
            node.classKind !== 'TITLE_KEYWORD' &&
            node.classKind !== 'EXTERNAL_LINK' &&
            !(node.instanceKind === 'BOARD_PARAGRAPH' && boardParagraphSourceNotes.length > 1) && (
              <TouchableOpacity
                style={[
                  styles.openButton,
                  { backgroundColor: commonStyles.button?.backgroundColor || '#3498DB' },
                ]}
                onPress={() => onOpenNode(node)}
              >
                <Icon name="external-link" size={11} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.openButtonText}>{lang('move')}</Text>
              </TouchableOpacity>
            )}

          {isVirtualEligible && (
            <TouchableOpacity
              style={[styles.openButton, { backgroundColor: '#AD3D76' }]}
              onPress={() => {
                onOpenVirtualNote?.(node.id);
              }}
            >
              <Icon name="book" size={11} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.openButtonText}>
                {lang('Open Virtual Note') || '가상노트 열기'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetWrapper: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 14,
    zIndex: 10,
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  closeButton: {
    padding: 6,
  },
  subText: {
    fontSize: 11.5,
    marginBottom: 6,
  },
  propertiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  propertyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  propertyChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionsContainer: {
    marginBottom: 10,
  },
  classesContainer: {
    marginBottom: 10,
  },
  sectionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionsLabelText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionsScrollView: {
    marginTop: 2,
  },
  sectionsChips: {
    flexDirection: 'row',
    gap: 6,
  },
  sectionChip: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  sectionChipText: {
    fontSize: 10.5,
  },
  classChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  relationCounts: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  relationText: {
    fontSize: 11.5,
  },
  nhopGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nhopLabel: {
    fontSize: 11.5,
  },
  nhopButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nhopButtonText: {
    fontSize: 11,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  openButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
