import {
  buildGenericTitleKeywordGroups,
  extractUrlDomainKeyword,
  GenericTitleKeywordCandidate,
  noteTitleForKeywordComparison,
} from './titleKeywordClasses';
import { KnowledgeGraphData, KnowledgeGraphEdge } from '../../knowledgeGraph/types';
import { stableKnowledgeGraphId } from '../../knowledgeGraph/useKnowledgeGraphData';
import { findConnectedExternalLinkIds } from '../../knowledgeGraph/utils/externalLinkClassification';
import { getKnowledgeGraphPalette } from '../../knowledgeGraph/utils/palette';
import { findConnectedParagraphIds } from '../../knowledgeGraph/utils/paragraphClassification';
import { TOPIC_CLASS_CATEGORY, TOPIC_CLASS_KIND, TopicClassNode } from '../types';

/** Add topic classes to an existing graph without changing its source entities. */
export const addTopicNodes = (
  source: KnowledgeGraphData,
  isDark: boolean,
  lang: (key: string) => string
): KnowledgeGraphData => {
  const nodes = source.nodes.map((node) => ({ ...node }));
  const edges = [...source.edges];
  const candidates: GenericTitleKeywordCandidate[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const noteNodeIdByTitle = new Map(
    nodes.filter((node) => node.instanceKind === 'NOTE').map((node) => [node.noteTitle, node.id])
  );

  for (const node of source.nodes) {
    if (node.role !== 'INSTANCE') continue;
    if (node.instanceKind === 'NOTE' && node.description?.trim()) {
      candidates.push({
        nodeId: node.id,
        occurrenceId: node.id,
        title: noteTitleForKeywordComparison(node.name),
        noteId: node.noteTitle,
      });
    } else if (
      (node.instanceKind === 'CARD' || node.instanceKind === 'PARAGRAPH') &&
      node.paragraph?.level
    ) {
      candidates.push({
        nodeId: node.id,
        occurrenceId: node.id,
        title: node.name,
        noteId: node.noteTitle,
      });
    } else if (node.instanceKind === 'BOARD_PARAGRAPH') {
      for (const occurrence of node.paragraphOccurrences || []) {
        if (!occurrence.origin) continue;
        candidates.push({
          nodeId: node.id,
          occurrenceId: `${node.id}:${occurrence.origin}:${occurrence.path}`,
          title: node.name,
          noteId: occurrence.origin,
        });
      }
    }
  }

  for (const heading of source.cardSubheadings || []) {
    candidates.push({
      nodeId: heading.cardNodeId,
      occurrenceId: heading.occurrenceId,
      title: heading.title,
      noteId: heading.noteTitle,
    });
  }
  for (const edge of source.edges) {
    if (edge.type !== 'EXTERNAL_REFERENCE') continue;
    const link = nodeById.get(edge.target);
    const referringNode = nodeById.get(edge.source);
    if (!link || !referringNode) continue;
    const domainKeyword = extractUrlDomainKeyword(link.name);
    candidates.push({
      nodeId: link.id,
      occurrenceId: `${link.id}:${referringNode.noteTitle}:${edge.source}`,
      title: domainKeyword || link.name,
      noteId: referringNode.noteTitle,
      singleKeyword: Boolean(domainKeyword),
    });
  }

  const sourceNoteIdsByMemberId = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const sourceNotes = sourceNoteIdsByMemberId.get(candidate.nodeId) || new Set<string>();
    sourceNotes.add(candidate.noteId);
    sourceNoteIdsByMemberId.set(candidate.nodeId, sourceNotes);
  }

  const palette = getKnowledgeGraphPalette(isDark);
  const topicClasses: { id: string; sourceNotes: Set<string> }[] = [];
  for (const group of buildGenericTitleKeywordGroups(candidates)) {
    const sourceNotes = new Set(
      group.memberNodeIds.flatMap((memberNodeId) => [
        ...(sourceNoteIdsByMemberId.get(memberNodeId) || []),
      ])
    );
    if (sourceNotes.size < 3) continue;
    const className = `${lang('Topic Class Prefix') || '주제'}: ${group.keyword}`;
    const classId = `class:titleKeyword:generic:${stableKnowledgeGraphId(group.keyword)}`;
    const node: TopicClassNode = {
      id: classId,
      name: className,
      role: 'CLASS',
      classKind: TOPIC_CLASS_KIND,
      classCategory: TOPIC_CLASS_CATEGORY,
      matchLabel: group.keyword,
      noteTitle: className,
      properties: {},
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      color: palette.extensionClass.fill,
      strokeColor: palette.extensionClass.stroke,
      radius: 15,
    };
    nodes.push(node);
    topicClasses.push({ id: classId, sourceNotes });
    for (const memberNodeId of group.memberNodeIds) {
      edges.push({
        id: `edge:topic:${memberNodeId}->${classId}`,
        source: memberNodeId,
        target: classId,
        type: 'INSTANCE_OF',
        propertyLabel: 'instanceOf',
        color: isDark ? '#7F8C8D' : '#BDC3C7',
        dashed: true,
      });
    }
  }

  const topicsBySourceNote = new Map<string, typeof topicClasses>();
  for (const topic of topicClasses) {
    for (const noteId of topic.sourceNotes) {
      const topics = topicsBySourceNote.get(noteId) || [];
      topics.push(topic);
      topicsBySourceNote.set(noteId, topics);
    }
  }
  const childrenByParent = new Map<string, typeof topicClasses>();
  for (const child of topicClasses) {
    const rarestSourceNote = [...child.sourceNotes].reduce((rarest, noteId) =>
      (topicsBySourceNote.get(noteId)?.length || 0) < (topicsBySourceNote.get(rarest)?.length || 0)
        ? noteId
        : rarest
    );
    for (const parent of topicsBySourceNote.get(rarestSourceNote) || []) {
      if (
        child.sourceNotes.size >= parent.sourceNotes.size ||
        ![...child.sourceNotes].every((noteId) => parent.sourceNotes.has(noteId))
      ) {
        continue;
      }
      const children = childrenByParent.get(parent.id) || [];
      children.push(child);
      childrenByParent.set(parent.id, children);
    }
  }
  for (const parent of topicClasses) {
    const children = childrenByParent.get(parent.id) || [];
    if (children.length < 2) continue;
    for (const child of children) {
      const edge: KnowledgeGraphEdge = {
        id: `edge:topicSubclass:${child.id}->${parent.id}`,
        source: child.id,
        target: parent.id,
        type: 'SUBCLASS_OF',
        propertyLabel: 'subClassOf',
        color: isDark ? '#AACCFF' : '#5588CC',
      };
      edges.push(edge);
    }
  }
  const parentEdgeBySource = new Map(
    edges.filter((edge) => edge.type === 'PART_OF').map((edge) => [edge.source, edge])
  );
  const edgeIds = new Set(edges.map((edge) => edge.id));
  for (const paragraphId of findConnectedParagraphIds(
    nodes,
    edges,
    new Set(topicClasses.map((topic) => topic.id))
  )) {
    const paragraph = nodeById.get(paragraphId);
    if (!paragraph || paragraph.instanceKind !== 'PARAGRAPH') continue;
    paragraph.instanceKind = 'CONNECTED_PARAGRAPH';
    paragraph.color = palette.connectedParagraph.fill;
    paragraph.strokeColor = palette.connectedParagraph.stroke;
    const parentEdge = parentEdgeBySource.get(paragraphId);
    const parentNode = parentEdge && nodeById.get(parentEdge.target);
    if (!parentNode?.paragraph) continue;
    const containingNoteId = noteNodeIdByTitle.get(paragraph.noteTitle);
    if (!containingNoteId) continue;
    const id = `edge:connectedPart:${paragraphId}->${containingNoteId}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      source: paragraphId,
      target: containingNoteId,
      type: 'PART_OF',
      propertyLabel: 'connectedPartOf',
      color: isDark ? '#F2A2A8' : '#B84B56',
      dashed: true,
    });
  }
  for (const linkId of findConnectedExternalLinkIds(nodes, edges, 'class:externalLink')) {
    const link = nodeById.get(linkId);
    if (!link) continue;
    link.instanceKind = 'CONNECTED_EXTERNAL_LINK';
    link.color = palette.connectedExternalLink.fill;
    link.strokeColor = palette.connectedExternalLink.stroke;
  }
  return { ...source, nodes, edges };
};
