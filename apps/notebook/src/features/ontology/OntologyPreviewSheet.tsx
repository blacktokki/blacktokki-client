import { Text, useLangContext } from '@blacktokki/core';
import React from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { findDirectClassIds, findDirectSubclassIds } from './classInheritance';
import { OntologyEdge, OntologyNode } from './types';
import {
  isTopicVirtualNoteEligible,
  synthesizeTopicVirtualNote,
  TopicVirtualNote,
} from './virtualNotes';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

interface OntologyPreviewSheetProps {
  node: OntologyNode;
  edges: OntologyEdge[];
  allNodes: OntologyNode[];
  nhopDepth: number;
  onChangeNhopDepth: (depth: number) => void;
  onClose: () => void;
  onSelectNode: (node: OntologyNode) => void;
  onOpenNode: (node: OntologyNode, targetSection?: string) => void;
  onOpenVirtualNote?: (virtualNote: TopicVirtualNote) => void;
}

export const OntologyPreviewSheet: React.FC<OntologyPreviewSheetProps> = ({
  node,
  edges,
  allNodes,
  nhopDepth,
  onChangeNhopDepth,
  onClose,
  onSelectNode,
  onOpenNode,
  onOpenVirtualNote,
}) => {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';

  // Calculate incoming and outgoing relations
  const incomingEdges = edges.filter((e) => e.target === node.id);
  const outgoingEdges = edges.filter((e) => e.source === node.id);
  const hasValidationError = edges.some(
    (e) => (e.source === node.id || e.target === node.id) && e.isAxiomViolation
  );

  const badgeColor =
    node.role === 'CLASS'
      ? node.classCategory === 'BOARD'
        ? '#229954'
        : node.classCategory === 'TOPIC'
        ? '#AD3D76'
        : '#5588CC'
      : node.role === 'LITERAL'
      ? '#D4AC0D'
      : node.instanceKind === 'NOTE'
      ? '#3060C0'
      : node.instanceKind === 'CONNECTED_PARAGRAPH'
      ? '#CA6F1E'
      : node.instanceKind === 'PARAGRAPH'
      ? '#8E44AD'
      : '#27AE60';

  const typeLabel =
    node.role === 'CLASS'
      ? lang(
          node.classCategory === 'BOARD'
            ? 'Board Class'
            : node.classCategory === 'TOPIC'
            ? 'Topic Class'
            : 'Built-in Class'
        )
      : node.role === 'LITERAL'
      ? lang('Literal')
      : node.instanceKind === 'NOTE'
      ? lang('Instance (Note)')
      : node.instanceKind === 'CONNECTED_PARAGRAPH'
      ? lang('Instance (Connected Paragraph)')
      : node.instanceKind === 'PARAGRAPH'
      ? lang('Instance (Paragraph)')
      : lang('Instance (Card)');

  const typeIcon =
    node.role === 'CLASS'
      ? 'sitemap'
      : node.role === 'LITERAL'
      ? 'square-o'
      : node.instanceKind === 'NOTE'
      ? 'file-text-o'
      : node.instanceKind === 'CONNECTED_PARAGRAPH'
      ? 'link'
      : node.instanceKind === 'PARAGRAPH'
      ? 'align-left'
      : 'id-badge';

  const { schedule, sections = [] } = node.properties || {};
  const directClasses =
    node.role !== 'LITERAL'
      ? findDirectClassIds(node.id, edges)
          .map((classId) => allNodes.find((candidate) => candidate.id === classId))
          .filter((candidate): candidate is OntologyNode => candidate?.role === 'CLASS')
      : [];
  const directSubclasses =
    node.role === 'CLASS'
      ? findDirectSubclassIds(node.id, edges)
          .map((classId) => allNodes.find((candidate) => candidate.id === classId))
          .filter((candidate): candidate is OntologyNode => candidate?.role === 'CLASS')
      : [];
  const classChipBackground = (classNode: OntologyNode): string => {
    if (classNode.classCategory === 'BOARD') {
      return isDark ? 'rgba(130, 224, 170, 0.16)' : 'rgba(34, 153, 84, 0.12)';
    }
    if (classNode.classCategory === 'TOPIC') {
      return isDark ? 'rgba(241, 139, 184, 0.16)' : 'rgba(173, 61, 118, 0.12)';
    }
    return isDark ? 'rgba(170, 204, 255, 0.14)' : 'rgba(85, 136, 204, 0.1)';
  };

  const isVirtualEligible = React.useMemo(
    () => isTopicVirtualNoteEligible(node, edges, allNodes),
    [node, edges, allNodes]
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
        {/* Header */}
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

        {/* Sub-info Breadcrumb */}
        {node.boardTitle && (
          <Text style={[styles.subText, { color: commonStyles.smallText?.color }]}>
            {lang('Notebook:')} {node.boardTitle}
            {node.noteTitle && node.noteTitle !== node.boardTitle
              ? ` ▶ ${node.noteTitle.slice(node.boardTitle.length + 1)}`
              : ''}
          </Text>
        )}

        {/* Validation Error Alert Banner */}
        {hasValidationError && (
          <View style={styles.violationBanner}>
            <Icon
              name="exclamation-triangle"
              size={11}
              color="#E74C3C"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.violationBannerText}>
              {lang('Involved in an ontology validation error')}
            </Text>
          </View>
        )}

        {/* Data Properties Badges Row */}
        {schedule && (
          <View style={styles.propertiesRow}>
            <View
              style={[
                styles.propertyChip,
                {
                  backgroundColor: isDark ? 'rgba(230, 126, 34, 0.2)' : 'rgba(230, 126, 34, 0.12)',
                },
              ]}
            >
              <Icon name="calendar" size={9.5} color="#E67E22" style={{ marginRight: 4 }} />
              <Text style={[styles.propertyChipText, { color: '#E67E22' }]}>{schedule}</Text>
            </View>
          </View>
        )}

        {/* Note instances omit their internal table of contents from ontology details. */}
        {node.instanceKind !== 'NOTE' && sections.length > 0 && (
          <View style={styles.sectionsContainer}>
            <View style={styles.sectionsHeader}>
              <Icon
                name="list-ul"
                size={10}
                color={commonStyles.smallText?.color}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.sectionsLabelText, { color: commonStyles.smallText?.color }]}>
                {lang('Sub-sections')} ({sections.length})
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.sectionsScrollView}
              contentContainerStyle={styles.sectionsChips}
            >
              {sections.map((sec, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.sectionChip,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                    },
                  ]}
                  onPress={() => onOpenNode(node, sec.title)}
                >
                  <Text style={[styles.sectionChipText, { color: commonStyles.text?.color }]}>
                    {`H${sec.level}`} · {sec.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {node.role !== 'LITERAL' && (
          <View style={styles.classesContainer}>
            <View style={styles.sectionsHeader}>
              <Icon
                name="sitemap"
                size={10}
                color={commonStyles.smallText?.color}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.sectionsLabelText, { color: commonStyles.smallText?.color }]}>
                {lang('Direct Classes')} ({directClasses.length})
              </Text>
            </View>
            <View style={styles.classChips}>
              {directClasses.length > 0 ? (
                directClasses.map((directClass) => (
                  <TouchableOpacity
                    key={directClass.id}
                    style={[
                      styles.classChip,
                      {
                        backgroundColor: classChipBackground(directClass),
                      },
                      Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {},
                    ]}
                    onPress={() => onSelectNode(directClass)}
                  >
                    <Text style={[styles.sectionChipText, { color: commonStyles.text?.color }]}>
                      {directClass.name}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={[styles.sectionChipText, { color: commonStyles.smallText?.color }]}>
                  {lang('None')}
                </Text>
              )}
            </View>
          </View>
        )}

        {node.role === 'CLASS' && (
          <View style={styles.classesContainer}>
            <View style={styles.sectionsHeader}>
              <Icon
                name="sitemap"
                size={10}
                color={commonStyles.smallText?.color}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.sectionsLabelText, { color: commonStyles.smallText?.color }]}>
                {lang('Direct Subclasses')} ({directSubclasses.length})
              </Text>
            </View>
            <View style={styles.classChips}>
              {directSubclasses.length > 0 ? (
                directSubclasses.map((directSubclass) => (
                  <TouchableOpacity
                    key={directSubclass.id}
                    style={[
                      styles.classChip,
                      { backgroundColor: classChipBackground(directSubclass) },
                      Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {},
                    ]}
                    onPress={() => onSelectNode(directSubclass)}
                  >
                    <Text style={[styles.sectionChipText, { color: commonStyles.text?.color }]}>
                      {directSubclass.name}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={[styles.sectionChipText, { color: commonStyles.smallText?.color }]}>
                  {lang('None')}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Relations & N-hop Controls & Action Button */}
        <View style={styles.bottomRow}>
          {/* Relation Counters */}
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

          {/* N-hop Range Selector */}
          <View style={styles.nhopGroup}>
            <Text style={[styles.nhopLabel, { color: commonStyles.smallText?.color }]}>
              {lang('N-hop Range')}:
            </Text>
            {[1, 2, 99].map((depth) => {
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

          {/* Title-keyword classes are generated concepts without a source note to open. */}
          {node.role !== 'LITERAL' && node.classKind !== 'TITLE_KEYWORD' && (
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

          {/* Virtual Note action button for eligible topic classes */}
          {isVirtualEligible && (
            <TouchableOpacity
              style={[styles.openButton, { backgroundColor: '#AD3D76' }]}
              onPress={() => {
                const virtualNote = synthesizeTopicVirtualNote(node, allNodes, edges, lang);
                onOpenVirtualNote?.(virtualNote);
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
  violationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  violationBannerText: {
    color: '#E74C3C',
    fontSize: 11,
    fontWeight: '600',
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
  classChip: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
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
