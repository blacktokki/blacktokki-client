import { useLangContext } from '@blacktokki/core';
import { extractHtmlLinks, toRaw } from '@blacktokki/editor';
import { useMemo, useCallback } from 'react';

import { evaluateOntologyAxioms } from './axioms';
import { findOntologyLinkSourceNodeId, findOntologyLinkTargetNodeId } from './links';
import {
  buildConnectedParagraphNotePartOfAssignments,
  buildParagraphPartOfAssignments,
  findConnectedParagraphIds,
  findLinkedParagraphIds,
} from './paragraphClassification';
import {
  assignGenericTitleKeywordGroup,
  buildCardTypeGroups,
  buildGenericTitleKeywordGroups,
  buildTitleKeywordGroups,
  CardTypeCandidate,
  findNearestParentHeader,
  noteTitleForKeywordComparison,
  SpecializedTitleKeywordClass,
  TitleKeywordCandidate,
} from './titleKeywordClasses';
import {
  OntologyDataProperties,
  OntologyEdge,
  OntologyGraphData,
  OntologyNode,
  OntologySectionProperty,
} from './types';
import {
  Paragraph,
  paragraphDescription,
  parseHtmlToParagraphs,
} from '../../components/HeaderSelectBar';
import { urlToNoteLink } from '../../components/SearchBar';
import { useBoardPages } from '../../hooks/useBoardStorage';
import { useNotePages } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import useProblem from '../problem/useProblem';

/** Deterministic opaque suffix for source records that do not have their own persistent ID. */
export const stableOntologyId = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const isNotEmptyContent = (description?: string): boolean => {
  if (!description || !description.trim()) return false;
  if (toRaw(description).trim().length > 0) return true;
  if (/<(img|svg|iframe|video|audio|canvas)[^>]*>/i.test(description)) return true;
  return false;
};

const extractSchedule = (text?: string): string | undefined => {
  if (!text) return undefined;
  const match = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return match ? match[0] : undefined;
};

// ADR-2602: docs/decisions/2602-ontology-graph-view-extension.md
export const useOntologyData = (): OntologyGraphData & {
  isLoading: boolean;
  getNeighbors: (nodeId: string, depth?: number) => Set<string>;
} => {
  const { data: boardPages = [], isLoading: isBoardLoading } = useBoardPages();
  const { data: notePages = [], isLoading: isNoteLoading } = useNotePages();
  const { data: problemData = [], isLoading: isProblemLoading } = useProblem(1);
  const { colorScheme } = useNotebookTheme();
  const { lang } = useLangContext();
  const isDark = colorScheme === 'dark';

  // VOWL Specification Color Palette
  const vowlClassColor = isDark ? '#2B5278' : '#AACCFF';
  const vowlClassStroke = isDark ? '#AACCFF' : '#5588CC';
  const vowlBoardClassColor = isDark ? '#196F3D' : '#ABEBC6';
  const vowlBoardClassStroke = isDark ? '#82E0AA' : '#229954';
  const vowlTopicClassColor = isDark ? '#4A2E3D' : '#EED9E3';
  const vowlTopicClassStroke = isDark ? '#F18BB8' : '#AD3D76';
  const vowlInstanceColor = isDark ? '#1E6B47' : '#48C78E';
  const vowlInstanceStroke = isDark ? '#48C78E' : '#27AE60';
  const vowlNoteColor = isDark ? '#3A6B9B' : '#70A1FF';
  const vowlNoteStroke = isDark ? '#70A1FF' : '#3060C0';
  const vowlParaColor = isDark ? '#5B2C6F' : '#BB8FCE';
  const vowlParaStroke = isDark ? '#BB8FCE' : '#8E44AD';
  const vowlConnectedParaColor = isDark ? '#784212' : '#F0B27A';
  const vowlConnectedParaStroke = isDark ? '#F0B27A' : '#CA6F1E';
  const vowlLiteralColor = isDark ? '#5C4E14' : '#FFEA80';
  const vowlLiteralStroke = isDark ? '#FFD700' : '#D4AC0D';

  const graphData: OntologyGraphData = useMemo(() => {
    const nodes: OntologyNode[] = [];
    const edges: OntologyEdge[] = [];
    const nodeIdMap = new Map<string, OntologyNode>();
    const titleToNodeMap = new Map<string, string>(); // noteTitle or boardTitle -> nodeId
    // -------------------------------------------------------------
    // 1. Create Core Note Class & Board Card Classes
    // -------------------------------------------------------------

    // 1-A. Note Class (Single class for general notes)
    const noteClassNode: OntologyNode = {
      id: 'class:note',
      name: lang('Note') || '노트',
      role: 'CLASS',
      classKind: 'NOTE',
      classCategory: 'BUILT_IN',
      type: 'CLASS',
      shape: 'circle',
      vowlType: 'class',
      noteTitle: lang('Note') || '노트',
      properties: { sections: [] },
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 17,
      color: vowlClassColor,
      strokeColor: vowlClassStroke,
    };
    nodes.push(noteClassNode);
    nodeIdMap.set(noteClassNode.id, noteClassNode);

    // 1-B. Board Card Classes (one per board)
    const boardTitles = new Set(boardPages.map((b) => b.title));
    const boardCardClassMap = new Map<string, string>(); // boardTitle -> classNodeId

    for (const board of boardPages) {
      const boardCardClassId = `class:boardCard:${board.id}`;
      boardCardClassMap.set(board.title, boardCardClassId);

      const boardCardClassNode: OntologyNode = {
        id: boardCardClassId,
        name: board.title,
        role: 'CLASS',
        classKind: 'BOARD_CARD',
        classCategory: 'BOARD',
        type: 'CLASS',
        shape: 'circle',
        vowlType: 'class',
        boardTitle: board.title,
        noteTitle: board.title,
        properties: { sections: [], updated: board.updated },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 15,
        color: vowlBoardClassColor,
        strokeColor: vowlBoardClassStroke,
      };
      nodes.push(boardCardClassNode);
      nodeIdMap.set(boardCardClassId, boardCardClassNode);
    }

    // Paragraphs used for hierarchy and title-keyword classification.
    interface CandidateParagraph {
      nodeId: string;
      name: string;
      noteTitle: string;
      boardTitle?: string;
      paragraph: Paragraph;
    }
    const candidateParagraphs: CandidateParagraph[] = [];
    const cardHeaderKeywordCandidates: TitleKeywordCandidate[] = [];
    const cardTypeCandidates: CardTypeCandidate[] = [];
    const cardTypeCauseNodeIds = new Set<string>();

    // -------------------------------------------------------------
    // 2. Create Note Instances (General Notes)
    // -------------------------------------------------------------
    const validNotePages = notePages.filter((p) => isNotEmptyContent(p.description));
    const notePageByTitle = new Map(notePages.map((page) => [page.title, page]));
    const retainedEmptyNoteTitles = new Set<string>();
    for (const page of validNotePages) {
      const titleParts = page.title.split('/');
      if (titleParts.length > 1) {
        const parentTitle = titleParts.slice(0, -1).join('/');
        const parentPage = notePageByTitle.get(parentTitle);
        if (parentPage && !isNotEmptyContent(parentPage.description)) {
          retainedEmptyNoteTitles.add(parentTitle);
        }
      }
      for (const link of extractHtmlLinks(page.description || '')) {
        const target = urlToNoteLink(link.url);
        const targetPage = target ? notePageByTitle.get(target.title) : undefined;
        if (targetPage && !isNotEmptyContent(targetPage.description)) {
          retainedEmptyNoteTitles.add(targetPage.title);
        }
      }
    }
    const ontologyNotePages = notePages.filter(
      (page) => isNotEmptyContent(page.description) || retainedEmptyNoteTitles.has(page.title)
    );
    const topicCandidateNoteIds = new Set<string>();
    const boardSubnotePrefixes = boardPages.map((b) => b.title + '/');

    const isColumnNote = (title: string): boolean => {
      for (const prefix of boardSubnotePrefixes) {
        if (title.startsWith(prefix)) {
          const rel = title.slice(prefix.length);
          if (rel.split('/').length === 1) return true;
        }
      }
      return false;
    };

    // Keep a board note when it has content or must contain non-empty column paragraphs.
    for (const board of boardPages) {
      const matchingNote = notePages.find((page) => page.title === board.title);
      const noteDescription = matchingNote?.description || '';
      const hasColumnContent = notePages.some(
        (page) =>
          page.title.startsWith(board.title + '/') &&
          page.title.slice(board.title.length + 1).split('/').length === 1 &&
          isNotEmptyContent(page.description)
      );
      const hasRetainedColumn = [...retainedEmptyNoteTitles].some(
        (title) =>
          title.startsWith(board.title + '/') &&
          title.slice(board.title.length + 1).split('/').length === 1
      );
      if (
        !isNotEmptyContent(noteDescription) &&
        !hasColumnContent &&
        !hasRetainedColumn &&
        !retainedEmptyNoteTitles.has(board.title)
      ) {
        continue;
      }

      const boardNoteId = matchingNote
        ? `note:content:${matchingNote.id}`
        : `note:board:${board.id}`;
      const paragraphs = parseHtmlToParagraphs(noteDescription);
      const noteHeaders = paragraphs.filter((p) => p.level > 0 && p.title.trim().length > 0);
      const sections: OntologySectionProperty[] = noteHeaders.map((hp) => ({
        title: hp.title,
        level: hp.level,
        path: hp.path,
        autoSection: hp.autoSection,
      }));

      const boardNoteInstance: OntologyNode = {
        id: boardNoteId,
        name: board.title,
        role: 'INSTANCE',
        instanceKind: 'NOTE',
        type: 'INSTANCE',
        shape: 'circle',
        vowlType: 'instance',
        boardTitle: board.title,
        noteTitle: board.title,
        description: noteDescription,
        properties: { sections, updated: matchingNote?.updated || board.updated },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 9.5,
        color: vowlNoteColor,
        strokeColor: vowlNoteStroke,
      };
      nodes.push(boardNoteInstance);
      nodeIdMap.set(boardNoteId, boardNoteInstance);
      titleToNodeMap.set(board.title, boardNoteId);
      if (isNotEmptyContent(noteDescription) || hasColumnContent) {
        topicCandidateNoteIds.add(boardNoteId);
      }

      // instanceOf Note class
      edges.push({
        id: `edge:inst:${boardNoteId}->noteClass`,
        source: boardNoteId,
        target: noteClassNode.id,
        type: 'INSTANCE_OF',
        propertyType: 'object',
        propertyLabel: 'instanceOf',
        label: 'instanceOf',
        dashed: true,
        color: isDark ? '#7F8C8D' : '#BDC3C7',
      });

      // Collect candidate paragraphs under this Board Note
      for (const hp of noteHeaders) {
        const paraNodeId = `paragraph:board:${board.id}:${stableOntologyId(
          `${hp.path}:${hp.autoSection || ''}`
        )}`;

        candidateParagraphs.push({
          nodeId: paraNodeId,
          name: hp.title,
          noteTitle: board.title,
          boardTitle: board.title,
          paragraph: { ...hp, origin: board.title } as unknown as Paragraph,
        });
      }
    }

    // General notes (excluding column notes) as Note instances
    for (const note of ontologyNotePages) {
      if (boardTitles.has(note.title)) continue;
      if (isColumnNote(note.title)) continue;

      const noteNodeId = `note:content:${note.id}`;
      const paragraphs = parseHtmlToParagraphs(note.description || '');
      const noteHeaders = paragraphs.filter((p) => p.level > 0 && p.title.trim().length > 0);
      const sections: OntologySectionProperty[] = noteHeaders.map((hp) => ({
        title: hp.title,
        level: hp.level,
        path: hp.path,
        autoSection: hp.autoSection,
      }));
      const schedule = extractSchedule(note.title + ' ' + (note.description || ''));

      const noteInstance: OntologyNode = {
        id: noteNodeId,
        name: note.title,
        role: 'INSTANCE',
        instanceKind: 'NOTE',
        type: 'INSTANCE',
        shape: 'circle',
        vowlType: 'instance',
        noteTitle: note.title,
        description: note.description,
        properties: { sections, schedule, updated: note.updated },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 9,
        color: vowlNoteColor,
        strokeColor: vowlNoteStroke,
      };
      nodes.push(noteInstance);
      nodeIdMap.set(noteNodeId, noteInstance);
      titleToNodeMap.set(note.title, noteNodeId);
      if (isNotEmptyContent(note.description)) {
        topicCandidateNoteIds.add(noteNodeId);
      }

      // instanceOf Note class
      edges.push({
        id: `edge:inst:${noteNodeId}->noteClass`,
        source: noteNodeId,
        target: noteClassNode.id,
        type: 'INSTANCE_OF',
        propertyType: 'object',
        propertyLabel: 'instanceOf',
        label: 'instanceOf',
        dashed: true,
        color: isDark ? '#7F8C8D' : '#BDC3C7',
      });

      // Collect candidate paragraphs under this Note
      for (const hp of noteHeaders) {
        const paraNodeId = `paragraph:note:${note.id}:${stableOntologyId(
          `${hp.path}:${hp.autoSection || ''}`
        )}`;

        candidateParagraphs.push({
          nodeId: paraNodeId,
          name: hp.title,
          noteTitle: note.title,
          paragraph: { ...hp, origin: note.title } as unknown as Paragraph,
        });
      }
    }

    // -------------------------------------------------------------
    // 3. Process Columns (BoardCard Status Subclasses) and Cards (Card Instances)
    // -------------------------------------------------------------
    for (const board of boardPages) {
      const headerLevel =
        board.option && 'BOARD_HEADER_LEVEL' in board.option ? board.option.BOARD_HEADER_LEVEL : 3;

      const columnPages = notePages.filter(
        (p) =>
          p.title !== board.title &&
          p.title.startsWith(board.title + '/') &&
          p.title.slice(board.title.length + 1).split('/').length === 1
      );

      const boardCardClassId = boardCardClassMap.get(board.title)!;

      for (const col of columnPages) {
        const colRelName = col.title.slice(board.title.length + 1);
        if (!colRelName.trim()) continue;

        let columnNoteId = titleToNodeMap.get(col.title);
        if (
          (isNotEmptyContent(col.description) || retainedEmptyNoteTitles.has(col.title)) &&
          !columnNoteId
        ) {
          columnNoteId = `note:content:${col.id}`;
          const columnParagraphs = parseHtmlToParagraphs(col.description || '');
          const columnSections: OntologySectionProperty[] = columnParagraphs
            .filter((paragraph) => paragraph.level > 0 && paragraph.title.trim().length > 0)
            .map((paragraph) => ({
              title: paragraph.title,
              level: paragraph.level,
              path: paragraph.path,
              autoSection: paragraph.autoSection,
            }));
          const columnNoteNode: OntologyNode = {
            id: columnNoteId,
            name: col.title,
            role: 'INSTANCE',
            instanceKind: 'NOTE',
            type: 'INSTANCE',
            shape: 'circle',
            vowlType: 'instance',
            boardTitle: board.title,
            noteTitle: col.title,
            description: col.description,
            properties: {
              sections: columnSections,
              schedule: extractSchedule(col.title + ' ' + (col.description || '')),
              updated: col.updated,
            },
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            radius: 9,
            color: vowlNoteColor,
            strokeColor: vowlNoteStroke,
          };
          nodes.push(columnNoteNode);
          nodeIdMap.set(columnNoteId, columnNoteNode);
          titleToNodeMap.set(col.title, columnNoteId);
          if (isNotEmptyContent(col.description)) {
            topicCandidateNoteIds.add(columnNoteId);
          }

          edges.push({
            id: `edge:inst:${columnNoteId}->noteClass`,
            source: columnNoteId,
            target: noteClassNode.id,
            type: 'INSTANCE_OF',
            propertyType: 'object',
            propertyLabel: 'instanceOf',
            label: 'instanceOf',
            dashed: true,
            color: isDark ? '#7F8C8D' : '#BDC3C7',
          });
        }

        const boardNoteId = titleToNodeMap.get(board.title);
        const notePartOfEdgeId = `edge:part:${columnNoteId}->${boardNoteId}`;
        if (
          columnNoteId &&
          boardNoteId &&
          columnNoteId !== boardNoteId &&
          !edges.some((edge) => edge.id === notePartOfEdgeId)
        ) {
          edges.push({
            id: notePartOfEdgeId,
            source: columnNoteId,
            target: boardNoteId,
            type: 'PART_OF',
            propertyType: 'object',
            propertyLabel: 'notePartOf',
            label: 'notePartOf',
            color: isDark ? '#5D6D7E' : '#A6ACAF',
          });
        }

        // 3-A. Board Card Status Subclass (subClassOf boardCardClass)
        const boardCardStatusClassId = `class:boardCardStatus:${col.id}`;
        const boardCardStatusClassNode: OntologyNode = {
          id: boardCardStatusClassId,
          name: `${board.title}: ${colRelName}`,
          role: 'CLASS',
          classKind: 'BOARD_STATUS',
          classCategory: 'BOARD',
          type: 'CLASS',
          shape: 'circle',
          vowlType: 'class',
          boardTitle: board.title,
          noteTitle: col.title,
          properties: { sections: [], updated: col.updated },
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          radius: 13,
          color: vowlBoardClassColor,
          strokeColor: vowlBoardClassStroke,
        };
        nodes.push(boardCardStatusClassNode);
        nodeIdMap.set(boardCardStatusClassId, boardCardStatusClassNode);

        // Subclass inherits from Board Card class
        edges.push({
          id: `edge:subclass:${boardCardStatusClassId}->${boardCardClassId}`,
          source: boardCardStatusClassId,
          target: boardCardClassId,
          type: 'SUBCLASS_OF',
          propertyType: 'object',
          propertyLabel: 'subClassOf',
          label: 'subClassOf',
          color: isDark ? '#AACCFF' : '#5588CC',
        });

        if (!col.description) continue;
        const paragraphs = parseHtmlToParagraphs(col.description);
        const paragraphNodeId = (paragraph: Paragraph): string =>
          `paragraph:column:${col.id}:${stableOntologyId(
            `${paragraph.path}:${paragraph.autoSection || ''}`
          )}`;
        const nonCardHeaders = paragraphs.filter(
          (paragraph) =>
            paragraph.level > 0 &&
            paragraph.level !== headerLevel &&
            paragraph.title.trim().length > 0
        );
        for (const hp of nonCardHeaders) {
          const paraNodeId = paragraphNodeId(hp);
          candidateParagraphs.push({
            nodeId: paraNodeId,
            name: hp.title,
            noteTitle: col.title,
            boardTitle: board.title,
            paragraph: { ...hp, origin: col.title } as unknown as Paragraph,
          });
        }
        const cardParagraphs = paragraphs.filter(
          (p) => p.level === headerLevel && p.title.trim().length > 0
        );

        for (const cp of cardParagraphs) {
          const cardNodeId = `card:${col.id}:${stableOntologyId(
            `${cp.path}:${cp.autoSection || ''}`
          )}`;
          const cardDesc = paragraphDescription(paragraphs, cp.path, false).trim();

          const schedule = extractSchedule(cp.title + ' ' + cardDesc);

          const cardParentHeader = findNearestParentHeader(paragraphs, cp);
          const cardSubHeaders = paragraphs.filter(
            (p) =>
              p.level > headerLevel && p.path.startsWith(cp.path + ',') && p.title.trim().length > 0
          );
          const sections: OntologySectionProperty[] = cardSubHeaders.map((sp) => ({
            title: sp.title,
            level: sp.level,
            path: sp.path,
            autoSection: sp.autoSection,
          }));

          const cardProperties: OntologyDataProperties = {
            schedule,
            sections,
            updated: col.updated,
          };

          const cardNode: OntologyNode = {
            id: cardNodeId,
            name: cp.title,
            role: 'INSTANCE',
            instanceKind: 'CARD',
            type: 'INSTANCE',
            shape: 'circle',
            vowlType: 'instance',
            boardTitle: board.title,
            noteTitle: col.title,
            paragraph: { ...cp, origin: col.title } as unknown as Paragraph,
            description: cardDesc,
            properties: cardProperties,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            radius: 8.5,
            color: vowlInstanceColor,
            strokeColor: vowlInstanceStroke,
          };
          nodes.push(cardNode);
          nodeIdMap.set(cardNodeId, cardNode);

          for (const relatedHeader of cardSubHeaders) {
            cardHeaderKeywordCandidates.push({
              nodeId: cardNodeId,
              occurrenceId: paragraphNodeId(relatedHeader),
              title: relatedHeader.title,
              scope: 'HEADER',
              level: relatedHeader.level,
              noteId: col.title,
            });
          }
          if (cardParentHeader) {
            cardTypeCauseNodeIds.add(paragraphNodeId(cardParentHeader));
            cardTypeCandidates.push({
              nodeId: cardNodeId,
              parentTitle: cardParentHeader.title,
            });
          }

          // Card instanceOf BoardCard Status Subclass
          edges.push({
            id: `edge:inst:${cardNodeId}->${boardCardStatusClassId}`,
            source: cardNodeId,
            target: boardCardStatusClassId,
            type: 'INSTANCE_OF',
            propertyType: 'object',
            propertyLabel: 'instanceOf',
            label: 'instanceOf',
            dashed: true,
            color: isDark ? '#7F8C8D' : '#BDC3C7',
          });
        }
      }
    }

    // Resolve note containment only after every note node is indexed so the
    // hierarchy does not depend on the storage/API result order.
    for (const noteNode of nodes) {
      if (noteNode.role !== 'INSTANCE' || noteNode.instanceKind !== 'NOTE') continue;
      const parts = noteNode.noteTitle.split('/');
      if (parts.length <= 1) continue;
      const parentTitle = parts.slice(0, -1).join('/');
      const parentNodeId = titleToNodeMap.get(parentTitle);
      if (!parentNodeId || parentNodeId === noteNode.id) continue;
      const edgeId = `edge:part:${noteNode.id}->${parentNodeId}`;
      if (edges.some((edge) => edge.id === edgeId)) continue;
      edges.push({
        id: edgeId,
        source: noteNode.id,
        target: parentNodeId,
        type: 'PART_OF',
        propertyType: 'object',
        propertyLabel: 'notePartOf',
        label: 'notePartOf',
        color: isDark ? '#5D6D7E' : '#A6ACAF',
      });
    }

    // -------------------------------------------------------------
    // 4. Create paragraph instances and their containment hierarchy.
    // -------------------------------------------------------------
    const ensureParagraphNode = (candidate: CandidateParagraph): OntologyNode => {
      const existing = nodeIdMap.get(candidate.nodeId);
      if (existing) return existing;
      const paraNode: OntologyNode = {
        id: candidate.nodeId,
        name: candidate.name,
        role: 'INSTANCE',
        instanceKind: 'PARAGRAPH',
        type: 'INSTANCE',
        shape: 'circle',
        vowlType: 'instance',
        boardTitle: candidate.boardTitle,
        noteTitle: candidate.noteTitle,
        paragraph: candidate.paragraph,
        properties: { sections: [] },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 6.5,
        color: vowlParaColor,
        strokeColor: vowlParaStroke,
      };
      nodes.push(paraNode);
      nodeIdMap.set(paraNode.id, paraNode);
      return paraNode;
    };

    candidateParagraphs.forEach(ensureParagraphNode);

    const hierarchyCandidates = [
      ...candidateParagraphs.map((candidate) => ({
        nodeId: candidate.nodeId,
        documentId: candidate.noteTitle,
        path: candidate.paragraph.path,
        containerNodeId:
          titleToNodeMap.get(candidate.noteTitle) ||
          (candidate.boardTitle ? titleToNodeMap.get(candidate.boardTitle) : undefined),
      })),
      ...nodes
        .filter(
          (node) =>
            node.role === 'INSTANCE' && node.instanceKind === 'CARD' && Boolean(node.paragraph)
        )
        .map((node) => ({
          nodeId: node.id,
          documentId: node.noteTitle,
          path: node.paragraph!.path,
          containerNodeId: titleToNodeMap.get(node.noteTitle),
        })),
    ].map((candidate) => {
      const containerNodeId = candidate.containerNodeId;
      if (!containerNodeId) {
        throw new Error(`Missing ontology note container for content: ${candidate.nodeId}`);
      }
      return { ...candidate, containerNodeId };
    });
    const paragraphPartOfAssignments = buildParagraphPartOfAssignments(hierarchyCandidates);
    for (const assignment of paragraphPartOfAssignments) {
      const sourceNode = nodeIdMap.get(assignment.sourceNodeId);
      const propertyLabel = sourceNode?.instanceKind === 'CARD' ? 'cardPartOf' : 'paragraphPartOf';
      edges.push({
        id: `edge:part:${assignment.sourceNodeId}->${assignment.targetNodeId}`,
        source: assignment.sourceNodeId,
        target: assignment.targetNodeId,
        type: 'PART_OF',
        propertyType: 'object',
        propertyLabel,
        label: propertyLabel,
        color: isDark ? '#7D6608' : '#B7950B',
      });
    }

    // -------------------------------------------------------------
    // 5. Create title-keyword classes for notes and same-level headings.
    // -------------------------------------------------------------
    const titleKeywordCandidates: TitleKeywordCandidate[] = [...cardHeaderKeywordCandidates];
    for (const node of nodes) {
      if (node.role !== 'INSTANCE') continue;
      if (node.instanceKind === 'NOTE' && topicCandidateNoteIds.has(node.id)) {
        titleKeywordCandidates.push({
          nodeId: node.id,
          occurrenceId: node.id,
          title: noteTitleForKeywordComparison(node.name),
          scope: 'NOTE',
        });
      } else if (
        (node.instanceKind === 'CARD' || node.instanceKind === 'PARAGRAPH') &&
        node.paragraph?.level &&
        !cardTypeCauseNodeIds.has(node.id)
      ) {
        titleKeywordCandidates.push({
          nodeId: node.id,
          occurrenceId: node.id,
          title: node.name,
          scope: 'HEADER',
          level: node.paragraph.level,
          noteId: node.noteTitle,
        });
      }
    }
    const titleKeywordGroups = buildTitleKeywordGroups(titleKeywordCandidates);
    const specializedTitleClasses: SpecializedTitleKeywordClass[] = [];

    for (const group of titleKeywordGroups) {
      const scopeKey = group.scope === 'NOTE' ? 'note' : `header:${group.level}`;
      const classId = `class:titleKeyword:${scopeKey}:${stableOntologyId(group.keyword)}`;
      const className =
        group.scope === 'NOTE'
          ? `${lang('Note Title Class Prefix') || '노트 제목'}: ${group.keyword}`
          : `H${group.level} ${lang('Header Title Class Suffix') || '제목'}: ${group.keyword}`;
      const classNode: OntologyNode = {
        id: classId,
        name: className,
        role: 'CLASS',
        classKind: 'TITLE_KEYWORD',
        classCategory: 'TOPIC',
        matchLabel: group.keyword,
        type: 'CLASS',
        shape: 'circle',
        vowlType: 'class',
        noteTitle: className,
        properties: { sections: [] },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 14,
        color: vowlTopicClassColor,
        strokeColor: vowlTopicClassStroke,
      };
      nodes.push(classNode);
      nodeIdMap.set(classNode.id, classNode);
      specializedTitleClasses.push({
        classId,
        keyword: group.keyword,
        memberNodeIds: group.memberNodeIds,
      });

      for (const memberNodeId of group.memberNodeIds) {
        edges.push({
          id: `edge:titleKeyword:${memberNodeId}->${classNode.id}`,
          source: memberNodeId,
          target: classNode.id,
          type: 'INSTANCE_OF',
          propertyType: 'object',
          propertyLabel: 'instanceOf',
          label: 'instanceOf',
          dashed: true,
          color: isDark ? '#7F8C8D' : '#BDC3C7',
        });
      }
    }

    const cardTypeGroups = buildCardTypeGroups(cardTypeCandidates);
    for (const group of cardTypeGroups) {
      const className = `${lang('Card Type Class Prefix') || '카드유형'}: ${group.title}`;
      const classId = `class:cardType:${stableOntologyId(group.normalizedTitle)}`;
      const classNode: OntologyNode = {
        id: classId,
        name: className,
        role: 'CLASS',
        classKind: 'TITLE_KEYWORD',
        classCategory: 'TOPIC',
        matchLabel: group.title,
        type: 'CLASS',
        shape: 'circle',
        vowlType: 'class',
        noteTitle: className,
        properties: { sections: [] },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 14,
        color: vowlTopicClassColor,
        strokeColor: vowlTopicClassStroke,
      };
      nodes.push(classNode);
      nodeIdMap.set(classNode.id, classNode);
      specializedTitleClasses.push({
        classId,
        keyword: group.normalizedTitle,
        memberNodeIds: group.memberNodeIds,
      });

      for (const memberNodeId of group.memberNodeIds) {
        edges.push({
          id: `edge:cardType:${memberNodeId}->${classNode.id}`,
          source: memberNodeId,
          target: classNode.id,
          type: 'INSTANCE_OF',
          propertyType: 'object',
          propertyLabel: 'instanceOf',
          label: 'instanceOf',
          dashed: true,
          color: isDark ? '#7F8C8D' : '#BDC3C7',
        });
      }
    }

    const genericTitleKeywordCandidates = [
      ...titleKeywordCandidates.map((candidate) => ({
        nodeId: candidate.nodeId,
        occurrenceId: candidate.occurrenceId,
        title: candidate.title,
        noteId: candidate.scope === 'HEADER' ? candidate.noteId : candidate.nodeId,
      })),
      ...cardTypeCandidates.map((candidate) => ({
        nodeId: candidate.nodeId,
        occurrenceId: `cardType:${candidate.nodeId}`,
        title: candidate.parentTitle,
        noteId: nodeIdMap.get(candidate.nodeId)?.noteTitle || candidate.nodeId,
      })),
    ];
    for (const group of buildGenericTitleKeywordGroups(genericTitleKeywordCandidates)) {
      const assignment = assignGenericTitleKeywordGroup(group, specializedTitleClasses);
      const subclassCount = assignment.subclassIds.length;
      // Multiple direct members from one note provide only one independent source.
      const directSourceNoteCount = new Set(
        assignment.directMemberNodeIds
          .map((memberNodeId) => nodeIdMap.get(memberNodeId)?.noteTitle)
          .filter((noteTitle): noteTitle is string => Boolean(noteTitle))
      ).size;
      const directSupportCount = subclassCount + directSourceNoteCount;
      if (directSupportCount < 3 && subclassCount < 2) continue;

      const className = `${lang('Topic Class Prefix') || '주제'}: ${group.keyword}`;
      const classId = `class:titleKeyword:generic:${stableOntologyId(group.keyword)}`;
      const classNode: OntologyNode = {
        id: classId,
        name: className,
        role: 'CLASS',
        classKind: 'TITLE_KEYWORD',
        classCategory: 'TOPIC',
        matchLabel: group.keyword,
        type: 'CLASS',
        shape: 'circle',
        vowlType: 'class',
        noteTitle: className,
        properties: { sections: [] },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 15,
        color: vowlTopicClassColor,
        strokeColor: vowlTopicClassStroke,
      };
      nodes.push(classNode);
      nodeIdMap.set(classId, classNode);

      for (const subclassId of assignment.subclassIds) {
        edges.push({
          id: `edge:titleKeywordSubclass:${subclassId}->${classId}`,
          source: subclassId,
          target: classId,
          type: 'SUBCLASS_OF',
          propertyType: 'object',
          propertyLabel: 'subClassOf',
          label: 'subClassOf',
          color: isDark ? '#AACCFF' : '#5588CC',
        });
      }
      for (const memberNodeId of assignment.directMemberNodeIds) {
        edges.push({
          id: `edge:genericTitleKeyword:${memberNodeId}->${classId}`,
          source: memberNodeId,
          target: classId,
          type: 'INSTANCE_OF',
          propertyType: 'object',
          propertyLabel: 'instanceOf',
          label: 'instanceOf',
          dashed: true,
          color: isDark ? '#7F8C8D' : '#BDC3C7',
        });
      }
    }

    // -------------------------------------------------------------
    // 6. Process document links as references.
    // -------------------------------------------------------------
    for (const page of validNotePages) {
      const defaultSourceNodeId =
        titleToNodeMap.get(page.title) ||
        boardPages
          .filter((board) => page.title.startsWith(board.title + '/'))
          .map((board) => titleToNodeMap.get(board.title))
          .find((nodeId): nodeId is string => Boolean(nodeId));
      const pageParagraphs = parseHtmlToParagraphs(page.description || '');
      const linkSources = [
        { sourceNodeId: defaultSourceNodeId, html: pageParagraphs[0]?.description || '' },
        ...pageParagraphs
          .filter((paragraph) => paragraph.level > 0)
          .map((paragraph) => ({
            sourceNodeId: findOntologyLinkSourceNodeId(
              nodes,
              page.title,
              paragraph,
              defaultSourceNodeId
            ),
            html: paragraph.description,
          })),
      ];

      for (const linkSource of linkSources) {
        if (!linkSource.sourceNodeId) continue;
        for (const link of extractHtmlLinks(linkSource.html)) {
          const noteLink = urlToNoteLink(link.url);
          if (!noteLink) continue;

          const targetNodeId = findOntologyLinkTargetNodeId(nodes, titleToNodeMap, noteLink);
          if (!targetNodeId || linkSource.sourceNodeId === targetNodeId) continue;

          const edgeId = `edge:reference:${linkSource.sourceNodeId}->${targetNodeId}`;
          if (edges.some((edge) => edge.id === edgeId)) continue;
          edges.push({
            id: edgeId,
            source: linkSource.sourceNodeId,
            target: targetNodeId,
            type: 'REFERENCES',
            propertyType: 'object',
            propertyLabel: 'references',
            label: 'references',
            targetSection: noteLink.section,
            color: isDark ? '#E74C3C' : '#C0392B',
          });
        }
      }
    }

    const connectedParagraphIds = findConnectedParagraphIds(nodes, edges);
    const linkedParagraphIds = findLinkedParagraphIds(nodes, edges);
    for (const assignment of buildConnectedParagraphNotePartOfAssignments(
      hierarchyCandidates,
      paragraphPartOfAssignments,
      connectedParagraphIds
    )) {
      edges.push({
        id: `edge:connectedPart:${assignment.sourceNodeId}->${assignment.targetNodeId}`,
        source: assignment.sourceNodeId,
        target: assignment.targetNodeId,
        type: 'PART_OF',
        propertyType: 'object',
        propertyLabel: 'connectedPartOf',
        label: 'connectedPartOf',
        dashed: true,
        color: isDark ? '#F0B27A' : '#CA6F1E',
      });
    }
    for (const paragraphId of connectedParagraphIds) {
      const paragraphNode = nodeIdMap.get(paragraphId);
      if (!paragraphNode || paragraphNode.instanceKind !== 'PARAGRAPH') continue;
      paragraphNode.instanceKind = 'CONNECTED_PARAGRAPH';
      paragraphNode.color = vowlConnectedParaColor;
      paragraphNode.strokeColor = vowlConnectedParaStroke;
    }

    if (linkedParagraphIds.length > 0) {
      const linkedParagraphClass: OntologyNode = {
        id: 'class:linkedParagraph',
        name: lang('Linked Paragraph Class') || '링크로 연결된 문단',
        role: 'CLASS',
        classKind: 'LINKED_PARAGRAPH',
        classCategory: 'BUILT_IN',
        type: 'CLASS',
        shape: 'circle',
        vowlType: 'class',
        noteTitle: lang('Linked Paragraph Class') || '링크로 연결된 문단',
        properties: { sections: [] },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 14,
        color: vowlClassColor,
        strokeColor: vowlClassStroke,
      };
      nodes.push(linkedParagraphClass);
      nodeIdMap.set(linkedParagraphClass.id, linkedParagraphClass);

      for (const paragraphId of linkedParagraphIds) {
        edges.push({
          id: `edge:linkedParagraph:${paragraphId}->${linkedParagraphClass.id}`,
          source: paragraphId,
          target: linkedParagraphClass.id,
          type: 'INSTANCE_OF',
          propertyType: 'object',
          propertyLabel: 'instanceOf',
          label: 'instanceOf',
          dashed: true,
          color: isDark ? '#7F8C8D' : '#BDC3C7',
        });
      }
    }

    // -------------------------------------------------------------
    // 7. Generate VOWL Datatype/Literal Nodes (Rectangles)
    // -------------------------------------------------------------
    const datatypeNodes: OntologyNode[] = [];
    const datatypeEdges: OntologyEdge[] = [];

    const createLiteralNode = (key: 'schedule', val: string, sourceId: string): OntologyNode => {
      const litId = `literal:${key}:${sourceId}:${val}`;
      const textWidth = Math.max(44, val.length * 7 + 14);
      const litNode: OntologyNode = {
        id: litId,
        name: val,
        role: 'LITERAL',
        type: 'LITERAL',
        shape: 'rect',
        vowlType: 'literal',
        datatypeKey: key,
        literalValue: val,
        noteTitle: val,
        properties: { sections: [] },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 8,
        width: textWidth,
        height: 19,
        color: vowlLiteralColor,
        strokeColor: vowlLiteralStroke,
      };
      datatypeNodes.push(litNode);
      return litNode;
    };

    for (const node of nodes) {
      if (node.role === 'INSTANCE' && node.instanceKind === 'CARD') {
        if (node.properties?.schedule) {
          const lit = createLiteralNode('schedule', node.properties.schedule, node.id);
          datatypeEdges.push({
            id: `edge:data:${node.id}->${lit.id}`,
            source: node.id,
            target: lit.id,
            type: 'DATATYPE_PROPERTY',
            propertyType: 'datatype',
            propertyLabel: 'hasSchedule',
            label: 'hasSchedule',
            color: isDark ? '#F39C12' : '#D35400',
          });
        }
      }
    }

    // -------------------------------------------------------------
    // 8. Evaluate application validation rules and logical inference
    // -------------------------------------------------------------
    const axioms = evaluateOntologyAxioms(nodes, edges, problemData);

    return {
      nodes,
      edges,
      datatypeNodes,
      datatypeEdges,
      axioms,
    };
  }, [
    boardPages,
    notePages,
    problemData,
    vowlClassColor,
    vowlClassStroke,
    vowlBoardClassColor,
    vowlBoardClassStroke,
    vowlTopicClassColor,
    vowlTopicClassStroke,
    vowlInstanceColor,
    vowlInstanceStroke,
    vowlNoteColor,
    vowlNoteStroke,
    vowlParaColor,
    vowlParaStroke,
    vowlConnectedParaColor,
    vowlConnectedParaStroke,
    vowlLiteralColor,
    vowlLiteralStroke,
    isDark,
    lang,
  ]);

  // N-hop neighbors lookup function
  const getNeighbors = useCallback(
    (nodeId: string, depth: number = 1): Set<string> => {
      const visited = new Set<string>([nodeId]);
      let currentLevel = new Set<string>([nodeId]);

      for (let d = 0; d < depth; d++) {
        const nextLevel = new Set<string>();
        for (const id of currentLevel) {
          for (const edge of graphData.edges) {
            if (edge.source === id && !visited.has(edge.target)) {
              nextLevel.add(edge.target);
              visited.add(edge.target);
            } else if (edge.target === id && !visited.has(edge.source)) {
              nextLevel.add(edge.source);
              visited.add(edge.source);
            }
          }
        }
        currentLevel = nextLevel;
      }

      return visited;
    },
    [graphData.edges]
  );

  return {
    ...graphData,
    isLoading: isBoardLoading || isNoteLoading || isProblemLoading,
    getNeighbors,
  };
};
