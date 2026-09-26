import { useLangContext } from '@blacktokki/core';
import { extractHtmlLinks, toRaw } from '@blacktokki/editor';
import { useMemo, useCallback } from 'react';

import { OntologyEdge, OntologyGraphData, OntologyNode } from './types';
import { evaluateOntologyAxioms } from './utils/axioms';
import { findConnectedExternalLinkIds } from './utils/externalLinkClassification';
import { extractYamlFrontmatter } from './utils/frontmatter';
import { findOntologyLinkSourceNodeId, findOntologyLinkTargetNodeId } from './utils/links';
import { getOntologyPalette } from './utils/palette';
import {
  buildConnectedParagraphNotePartOfAssignments,
  buildParagraphPartOfAssignments,
  findConnectedParagraphIds,
} from './utils/paragraphClassification';
import {
  buildGenericTitleKeywordGroups,
  extractUrlDomainKeyword,
  findNearestParentHeader,
  normalizeTitle,
  noteTitleForKeywordComparison,
  GenericTitleKeywordCandidate,
} from './utils/titleKeywordClasses';
import {
  Paragraph,
  paragraphDescription,
  parseHtmlToParagraphs,
} from '../../components/HeaderSelectBar';
import { urlToNoteLink } from '../../components/SearchBar';
import { useBoardPages } from '../../hooks/useBoardStorage';
import { useNotePages } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
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

// ADR-2602: docs/decisions/2602-ontology-graph-view-extension.md
export const useOntologyData = (): OntologyGraphData & {
  isLoading: boolean;
  getNeighbors: (nodeId: string, depth?: number) => Set<string>;
} => {
  const { data: boardPages = [], isLoading: isBoardLoading } = useBoardPages();
  const { data: notePages = [], isLoading: isNoteLoading } = useNotePages();
  const { data: problemData = [], isLoading: isProblemLoading } = useProblem(1);
  const { colorScheme } = useNotebookTheme();
  const { usageMode, notebook } = useUsageMode();
  const { lang } = useLangContext();
  const isDark = colorScheme === 'dark';
  const noteClassName = lang('Note') || '노트';
  const notebookName = usageMode === 'NOTEBOOK' ? notebook?.title?.trim() : undefined;
  const noteClassLabel = notebookName ? `${noteClassName}: ${notebookName}` : noteClassName;

  const palette = useMemo(() => getOntologyPalette(isDark), [isDark]);

  const graphData: OntologyGraphData = useMemo(() => {
    const nodes: OntologyNode[] = [];
    const edges: OntologyEdge[] = [];
    const nodeIdMap = new Map<string, OntologyNode>();
    const titleToNodeMap = new Map<string, string>(); // noteTitle or boardTitle -> nodeId
    type NodeInput = Pick<OntologyNode, 'id' | 'name' | 'role' | 'noteTitle' | 'radius'> &
      Partial<OntologyNode>;
    const makeNode = (kind: keyof typeof palette, input: NodeInput): OntologyNode => ({
      properties: {},
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      color: palette[kind].fill,
      strokeColor: palette[kind].stroke,
      ...input,
    });
    const addNode = (kind: keyof typeof palette, input: NodeInput): OntologyNode => {
      const node = makeNode(kind, input);
      nodes.push(node);
      nodeIdMap.set(node.id, node);
      return node;
    };
    const edgeIds = new Set<string>();
    const addRelation = (
      id: string,
      source: string,
      target: string,
      type: OntologyEdge['type'],
      propertyLabel: string,
      color: string,
      options: Pick<OntologyEdge, 'dashed' | 'targetSection'> = {}
    ) => {
      if (edgeIds.has(id)) return;
      edgeIds.add(id);
      edges.push({ id, source, target, type, propertyLabel, color, ...options });
    };
    const addInstanceOf = (id: string, source: string, target: string) =>
      addRelation(id, source, target, 'INSTANCE_OF', 'instanceOf', isDark ? '#7F8C8D' : '#BDC3C7', {
        dashed: true,
      });

    const noteClassNode = addNode('builtInClass', {
      id: 'class:note',
      name: noteClassLabel,
      role: 'CLASS',
      classKind: 'NOTE',
      classCategory: 'BUILT_IN',
      noteTitle: noteClassName,
      radius: 17,
    });

    const boardTitles = new Set(boardPages.map((b) => b.title));
    const boardCardClassMap = new Map<string, string>(); // boardTitle -> classNodeId

    for (const board of boardPages) {
      const boardCardClassId = `class:boardCard:${board.id}`;
      boardCardClassMap.set(board.title, boardCardClassId);

      addNode('boardClass', {
        id: boardCardClassId,
        name: board.title,
        role: 'CLASS',
        classKind: 'BOARD_CARD',
        classCategory: 'BOARD',
        boardTitle: board.title,
        noteTitle: board.title,
        radius: 15,
      });
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
    const cardHeaderKeywordCandidates: GenericTitleKeywordCandidate[] = [];
    const boardParagraphIdByOccurrenceId = new Map<string, string>();
    const cardParagraphNodeIds = new Set<string>();

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

    const addNoteInstance = (
      note: (typeof notePages)[number],
      boardTitle?: string,
      boardClassId?: string
    ) => {
      const id = `note:content:${note.id}`;
      addNode(boardTitle ? 'boardNote' : 'note', {
        id,
        name: note.title,
        role: 'INSTANCE',
        instanceKind: 'NOTE',
        ...(boardTitle ? { boardTitle } : {}),
        noteTitle: note.title,
        description: note.description,
        properties: extractYamlFrontmatter(note.description || ''),
        radius: 9,
      });
      titleToNodeMap.set(note.title, id);
      if (isNotEmptyContent(note.description)) topicCandidateNoteIds.add(id);
      addInstanceOf(
        boardClassId ? `edge:inst:${id}->${boardClassId}` : `edge:inst:${id}->noteClass`,
        id,
        boardClassId || noteClassNode.id
      );
    };

    for (const note of ontologyNotePages) {
      if (boardTitles.has(note.title)) continue;
      if (isColumnNote(note.title)) continue;

      const paragraphs = parseHtmlToParagraphs(note.description || '');
      const noteHeaders = paragraphs.filter((p) => p.level > 0 && p.title.trim().length > 0);
      addNoteInstance(note);

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

    for (const board of boardPages) {
      const headerLevel =
        board.option && 'BOARD_HEADER_LEVEL' in board.option ? board.option.BOARD_HEADER_LEVEL : 3;
      const boardParagraphIdByName = new Map<string, string>();

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

        if (
          (isNotEmptyContent(col.description) || retainedEmptyNoteTitles.has(col.title)) &&
          !titleToNodeMap.has(col.title)
        ) {
          addNoteInstance(col, board.title, boardCardClassId);
        }

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
          cardParagraphNodeIds.add(paragraphNodeId(cp));
          const cardNodeId = `card:${col.id}:${stableOntologyId(
            `${cp.path}:${cp.autoSection || ''}`
          )}`;
          const cardDesc = paragraphDescription(paragraphs, cp.path, false).trim();

          const cardParentHeader = findNearestParentHeader(paragraphs, cp);
          const cardSubHeaders = paragraphs.filter(
            (p) =>
              p.level > headerLevel && p.path.startsWith(cp.path + ',') && p.title.trim().length > 0
          );

          addNode('card', {
            id: cardNodeId,
            name: cp.title,
            role: 'INSTANCE',
            instanceKind: 'CARD',
            boardTitle: board.title,
            noteTitle: col.title,
            paragraph: { ...cp, origin: col.title } as unknown as Paragraph,
            description: cardDesc,
            radius: 8.5,
          });

          for (const relatedHeader of cardSubHeaders) {
            cardHeaderKeywordCandidates.push({
              nodeId: cardNodeId,
              occurrenceId: paragraphNodeId(relatedHeader),
              title: relatedHeader.title,
              noteId: col.title,
            });
          }
          if (cardParentHeader) {
            boardParagraphIdByName.set(
              normalizeTitle(cardParentHeader.title),
              `boardParagraph:${board.id}:${stableOntologyId(
                normalizeTitle(cardParentHeader.title)
              )}`
            );
          }
        }
      }

      // A matching header in another column is the same board paragraph even
      // when that column has no card beneath it.
      for (const candidate of candidateParagraphs) {
        if (candidate.boardTitle !== board.title || candidate.paragraph.level >= headerLevel)
          continue;
        const boardParagraphId = boardParagraphIdByName.get(normalizeTitle(candidate.name));
        if (boardParagraphId) {
          boardParagraphIdByOccurrenceId.set(candidate.nodeId, boardParagraphId);
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
      addRelation(
        `edge:part:${noteNode.id}->${parentNodeId}`,
        noteNode.id,
        parentNodeId,
        'PART_OF',
        'notePartOf',
        isDark ? '#5D6D7E' : '#A6ACAF'
      );
    }

    const ensureParagraphNode = (candidate: CandidateParagraph): OntologyNode => {
      const boardParagraphId = boardParagraphIdByOccurrenceId.get(candidate.nodeId);
      const nodeId = boardParagraphId || candidate.nodeId;
      const existing = nodeIdMap.get(nodeId);
      if (existing) {
        if (
          boardParagraphId &&
          !existing.paragraphOccurrences?.some(
            (occurrence) =>
              occurrence.origin === candidate.noteTitle &&
              occurrence.path === candidate.paragraph.path &&
              occurrence.autoSection === candidate.paragraph.autoSection
          )
        ) {
          existing.paragraphOccurrences?.push(candidate.paragraph);
        }
        return existing;
      }
      const paraNode = addNode(boardParagraphId ? 'boardParagraph' : 'paragraph', {
        id: nodeId,
        name: candidate.name,
        role: 'INSTANCE',
        instanceKind: boardParagraphId ? 'BOARD_PARAGRAPH' : 'PARAGRAPH',
        boardTitle: candidate.boardTitle,
        noteTitle: candidate.noteTitle,
        paragraph: candidate.paragraph,
        paragraphOccurrences: boardParagraphId ? [candidate.paragraph] : undefined,
        radius: 6.5,
      });
      if (boardParagraphId && candidate.boardTitle) {
        const boardClassId = boardCardClassMap.get(candidate.boardTitle);
        if (boardClassId) {
          addInstanceOf(`edge:inst:${nodeId}->${boardClassId}`, nodeId, boardClassId);
        }
      }
      return paraNode;
    };

    // Card headings have CARD instances; their parent headings remain board paragraphs.
    const retainedCandidateParagraphs = candidateParagraphs.filter(
      (candidate) => !cardParagraphNodeIds.has(candidate.nodeId)
    );
    retainedCandidateParagraphs.forEach(ensureParagraphNode);
    for (const node of nodes) {
      if (node.instanceKind !== 'BOARD_PARAGRAPH' || !node.paragraphOccurrences?.length) continue;
      node.paragraphOccurrences.sort(
        (left, right) =>
          (left.origin || '').localeCompare(right.origin || '') ||
          left.path.localeCompare(right.path)
      );
      node.paragraph = node.paragraphOccurrences[0];
      node.noteTitle = node.paragraph.origin || node.noteTitle;
      node.name = node.paragraph.title;
    }

    const hierarchyCandidates = [
      ...retainedCandidateParagraphs.map((candidate) => ({
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
    ].flatMap((candidate) => {
      const containerNodeId = candidate.containerNodeId;
      if (!containerNodeId) {
        return [];
      }
      return [{ ...candidate, containerNodeId }];
    });
    const paragraphPartOfAssignments = buildParagraphPartOfAssignments(hierarchyCandidates);
    for (const assignment of paragraphPartOfAssignments) {
      const sourceNodeId =
        boardParagraphIdByOccurrenceId.get(assignment.sourceNodeId) || assignment.sourceNodeId;
      const targetNodeId =
        boardParagraphIdByOccurrenceId.get(assignment.targetNodeId) || assignment.targetNodeId;
      const sourceNode = nodeIdMap.get(sourceNodeId);
      if (sourceNodeId === targetNodeId) continue;
      if (!nodeIdMap.has(targetNodeId)) continue;
      const propertyLabel = sourceNode?.instanceKind === 'CARD' ? 'cardPartOf' : 'paragraphPartOf';
      addRelation(
        `edge:part:${sourceNodeId}->${targetNodeId}`,
        sourceNodeId,
        targetNodeId,
        'PART_OF',
        propertyLabel,
        isDark ? '#7D6608' : '#B7950B'
      );
    }

    interface OntologyLinkOccurrence {
      sourceNodeId: string;
      noteId: string;
      linkName: string;
      keywordName: string;
      singleKeyword: boolean;
      url: string;
      /** Present only for an internal note link that can form a references edge. */
      target?: NonNullable<ReturnType<typeof urlToNoteLink>>;
    }
    const ontologyLinkOccurrences: OntologyLinkOccurrence[] = [];
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
            // A link written inside a heading belongs to the heading node too.
            html: `${paragraph.header || ''}${paragraph.description || ''}`,
          })),
      ];

      for (const linkSource of linkSources) {
        if (!linkSource.sourceNodeId) continue;
        for (const link of extractHtmlLinks(linkSource.html)) {
          let target: ReturnType<typeof urlToNoteLink>;
          try {
            target = urlToNoteLink(link.url);
          } catch {
            target = undefined;
          }
          const linkName = link.text?.trim() || target?.title || link.url;
          if (!linkName) continue;
          const domainKeyword = extractUrlDomainKeyword(linkName);
          ontologyLinkOccurrences.push({
            sourceNodeId: linkSource.sourceNodeId,
            noteId: page.title,
            linkName,
            keywordName: domainKeyword || linkName,
            singleKeyword: Boolean(domainKeyword),
            url: link.url,
            target,
          });
        }
      }
    }

    const topicCandidates: GenericTitleKeywordCandidate[] = [...cardHeaderKeywordCandidates];
    for (const node of nodes) {
      if (node.role !== 'INSTANCE') continue;
      const isCandidateNote = node.instanceKind === 'NOTE' && topicCandidateNoteIds.has(node.id);
      if (
        isCandidateNote ||
        ((node.instanceKind === 'CARD' || node.instanceKind === 'PARAGRAPH') &&
          node.paragraph?.level)
      ) {
        topicCandidates.push({
          nodeId: node.id,
          occurrenceId: node.id,
          title: isCandidateNote ? noteTitleForKeywordComparison(node.name) : node.name,
          noteId: node.noteTitle,
        });
      } else if (node.instanceKind === 'BOARD_PARAGRAPH') {
        for (const occurrence of node.paragraphOccurrences || []) {
          if (!occurrence.origin) continue;
          topicCandidates.push({
            nodeId: node.id,
            occurrenceId: `${node.id}:${occurrence.origin}:${occurrence.path}`,
            title: node.name,
            noteId: occurrence.origin,
          });
        }
      }
    }

    // External links are individuals. Their visible names contribute to the
    // same topic classes as note titles and headings.
    const externalLinkOccurrences = ontologyLinkOccurrences.filter(
      (occurrence) =>
        !occurrence.target && /^(?:https?:\/\/|ftp:\/\/|mailto:|\/\/)/i.test(occurrence.url)
    );
    if (externalLinkOccurrences.length > 0) {
      addNode('builtInClass', {
        id: 'class:externalLink',
        name: lang('External Link Class') || '외부 링크',
        role: 'CLASS',
        classKind: 'EXTERNAL_LINK',
        classCategory: 'BUILT_IN',
        noteTitle: lang('External Link Class') || '외부 링크',
        radius: 17,
      });
    }
    const externalLinkNodeIdByKey = new Map<string, string>();
    for (const occurrence of externalLinkOccurrences) {
      const linkKey = JSON.stringify([normalizeTitle(occurrence.linkName), occurrence.url]);
      let linkNodeId = externalLinkNodeIdByKey.get(linkKey);
      if (!linkNodeId) {
        linkNodeId = `externalLink:${stableOntologyId(linkKey)}`;
        externalLinkNodeIdByKey.set(linkKey, linkNodeId);
        addNode('externalLink', {
          id: linkNodeId,
          name: occurrence.linkName,
          role: 'INSTANCE',
          instanceKind: 'EXTERNAL_LINK',
          noteTitle: occurrence.linkName,
          description: occurrence.url,
          radius: 6.5,
        });
        addInstanceOf(`edge:externalLinkType:${linkNodeId}`, linkNodeId, 'class:externalLink');
      }
      addRelation(
        `edge:externalReference:${occurrence.sourceNodeId}->${linkNodeId}`,
        occurrence.sourceNodeId,
        linkNodeId,
        'EXTERNAL_REFERENCE',
        'externalReference',
        isDark ? '#5DADE2' : '#2874A6'
      );
      topicCandidates.push({
        nodeId: linkNodeId,
        occurrenceId: `${linkNodeId}:${occurrence.noteId}:${occurrence.sourceNodeId}`,
        noteId: occurrence.noteId,
        title: occurrence.keywordName,
        singleKeyword: occurrence.singleKeyword,
      });
    }

    // A topic needs the same keyword in at least three distinct source notes,
    // regardless of whether each occurrence comes from a title, heading, or link.
    const sourceNoteIdsByMemberId = new Map<string, Set<string>>();
    for (const candidate of topicCandidates) {
      const sourceNotes = sourceNoteIdsByMemberId.get(candidate.nodeId) || new Set<string>();
      sourceNotes.add(candidate.noteId);
      sourceNoteIdsByMemberId.set(candidate.nodeId, sourceNotes);
    }
    const topicClasses: { id: string; sourceNotes: Set<string> }[] = [];
    for (const group of buildGenericTitleKeywordGroups(topicCandidates)) {
      const sourceNotes = new Set(
        group.memberNodeIds.flatMap((memberNodeId) => [
          ...(sourceNoteIdsByMemberId.get(memberNodeId) || []),
        ])
      );
      if (sourceNotes.size < 3) continue;
      const className = `${lang('Topic Class Prefix') || '주제'}: ${group.keyword}`;
      const classId = `class:titleKeyword:generic:${stableOntologyId(group.keyword)}`;
      addNode('topicClass', {
        id: classId,
        name: className,
        role: 'CLASS',
        classKind: 'TITLE_KEYWORD',
        classCategory: 'TOPIC',
        matchLabel: group.keyword,
        noteTitle: className,
        radius: 15,
      });
      topicClasses.push({ id: classId, sourceNotes });
      for (const memberNodeId of group.memberNodeIds) {
        addInstanceOf(`edge:topic:${memberNodeId}->${classId}`, memberNodeId, classId);
      }
    }

    // Compare only topics sharing a source note; a proper subset must share every note.
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
        (topicsBySourceNote.get(noteId)?.length || 0) <
        (topicsBySourceNote.get(rarest)?.length || 0)
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
        addRelation(
          `edge:topicSubclass:${child.id}->${parent.id}`,
          child.id,
          parent.id,
          'SUBCLASS_OF',
          'subClassOf',
          isDark ? '#AACCFF' : '#5588CC'
        );
      }
    }

    for (const occurrence of ontologyLinkOccurrences) {
      // External links are connected to their own individuals above.
      if (!occurrence.target) continue;
      const targetNodeId = findOntologyLinkTargetNodeId(nodes, titleToNodeMap, occurrence.target);
      if (!targetNodeId || occurrence.sourceNodeId === targetNodeId) continue;

      addRelation(
        `edge:reference:${occurrence.sourceNodeId}->${targetNodeId}`,
        occurrence.sourceNodeId,
        targetNodeId,
        'REFERENCES',
        'references',
        isDark ? '#E74C3C' : '#C0392B',
        { targetSection: occurrence.target.section }
      );
    }

    const connectedParagraphIds = findConnectedParagraphIds(nodes, edges);
    for (const assignment of buildConnectedParagraphNotePartOfAssignments(
      hierarchyCandidates,
      paragraphPartOfAssignments,
      connectedParagraphIds
    )) {
      addRelation(
        `edge:connectedPart:${assignment.sourceNodeId}->${assignment.targetNodeId}`,
        assignment.sourceNodeId,
        assignment.targetNodeId,
        'PART_OF',
        'connectedPartOf',
        isDark ? '#F2A2A8' : '#B84B56',
        { dashed: true }
      );
    }
    for (const paragraphId of connectedParagraphIds) {
      const paragraphNode = nodeIdMap.get(paragraphId);
      if (!paragraphNode || paragraphNode.instanceKind !== 'PARAGRAPH') continue;
      paragraphNode.instanceKind = 'CONNECTED_PARAGRAPH';
      paragraphNode.color = palette.connectedParagraph.fill;
      paragraphNode.strokeColor = palette.connectedParagraph.stroke;
    }

    for (const linkId of findConnectedExternalLinkIds(nodes, edges, 'class:externalLink')) {
      const linkNode = nodeIdMap.get(linkId);
      if (!linkNode) continue;
      linkNode.instanceKind = 'CONNECTED_EXTERNAL_LINK';
      linkNode.color = palette.connectedExternalLink.fill;
      linkNode.strokeColor = palette.connectedExternalLink.stroke;
    }

    const datatypeNodes: OntologyNode[] = [];
    const datatypeEdges: OntologyEdge[] = [];

    const createLiteralNode = (key: string, val: string, sourceId: string): OntologyNode => {
      const litId = `literal:${key}:${sourceId}:${stableOntologyId(val)}`;
      const textWidth = Math.max(44, val.length * 7 + 14);
      const litNode = makeNode('literal', {
        id: litId,
        name: val,
        role: 'LITERAL',
        datatypeKey: key,
        literalValue: val,
        noteTitle: val,
        radius: 8,
        width: textWidth,
        height: 19,
      });
      datatypeNodes.push(litNode);
      return litNode;
    };

    for (const node of nodes) {
      if (node.role === 'INSTANCE' && node.instanceKind === 'NOTE') {
        for (const [key, rawVal] of Object.entries(node.properties || {})) {
          if (rawVal === undefined || rawVal === null) continue;
          const val = typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal);
          if (!val.trim()) continue;
          const lit = createLiteralNode(key, val, node.id);
          const propLabel =
            key === 'schedule'
              ? 'hasSchedule'
              : key === 'updated'
              ? 'hasUpdated'
              : `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
          datatypeEdges.push({
            id: `edge:data:${node.id}:${key}->${lit.id}`,
            source: node.id,
            target: lit.id,
            type: 'DATATYPE_PROPERTY',
            propertyLabel: propLabel,
            color: isDark ? '#F39C12' : '#D35400',
          });
        }
      }
    }

    const axioms = evaluateOntologyAxioms(nodes, edges, problemData);

    return {
      nodes,
      edges,
      datatypeNodes,
      datatypeEdges,
      axioms,
    };
  }, [boardPages, notePages, problemData, isDark, lang, palette, noteClassLabel, noteClassName]);

  const edgeAdjacencyMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of graphData.edges) {
      let sourceList = map.get(edge.source);
      if (!sourceList) {
        sourceList = [];
        map.set(edge.source, sourceList);
      }
      sourceList.push(edge.target);

      let targetList = map.get(edge.target);
      if (!targetList) {
        targetList = [];
        map.set(edge.target, targetList);
      }
      targetList.push(edge.source);
    }
    return map;
  }, [graphData.edges]);

  // N-hop neighbors lookup function optimized with precomputed adjacency list
  const getNeighbors = useCallback(
    (nodeId: string, depth: number = 1): Set<string> => {
      const visited = new Set<string>([nodeId]);
      let currentLevel = [nodeId];

      for (let d = 0; d < depth && currentLevel.length > 0; d++) {
        const nextLevel: string[] = [];
        for (let i = 0; i < currentLevel.length; i++) {
          const neighbors = edgeAdjacencyMap.get(currentLevel[i]);
          if (!neighbors) continue;
          for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              nextLevel.push(neighbor);
            }
          }
        }
        currentLevel = nextLevel;
      }

      return visited;
    },
    [edgeAdjacencyMap]
  );

  return {
    ...graphData,
    isLoading: isBoardLoading || isNoteLoading || isProblemLoading,
    getNeighbors,
  };
};
