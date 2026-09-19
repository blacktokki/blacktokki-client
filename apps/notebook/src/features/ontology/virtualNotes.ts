import {
  isNumericOnlyKeyword,
  normalizeTitle,
  noteTitleForKeywordComparison,
} from './titleKeywordClasses';
import { OntologyEdge, OntologyNode } from './types';

export interface TopicVirtualNote {
  id: string;
  title: string;
  topicKeyword: string;
  topicNodeId: string;
  subclassCount: number;
  paragraphCount: number;
  cardCount: number;
  relatedTopicCount: number;
  sourceNoteTitles: string[];
  content: string;
}

export interface RelatedTopicSummary {
  topicNode: OntologyNode;
  keyword: string;
  sharedInstanceCount: number;
  sharedSourceNoteCount: number;
  referenceCount: number;
  matchingNoteTitle?: string;
}

/** Deterministic opaque suffix for source records that do not have their own persistent ID. */
export const stableOntologyId = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Extract canonical topic keyword from a topic class node.
 * Uses matchLabel if available, otherwise strips known prefixes.
 */
export const extractTopicKeyword = (node: OntologyNode): string => {
  const raw = (node.matchLabel && node.matchLabel.trim()) || node.name;
  return raw
    .replace(
      /^(?:주제|Topic|노트\s*제목|Note\s*Title|H\d+\s*제목|H\d+|카드유형|Card\s*Type)\s*:\s*/i,
      ''
    )
    .trim();
};

/**
 * Checks whether an ontology node is a top-level topic superclass
 * or a standalone topic class without any parent superclass.
 */
export const isTopLevelTopicClass = (node: OntologyNode, edges: OntologyEdge[]): boolean => {
  if (node.role !== 'CLASS' || node.classCategory !== 'TOPIC') {
    return false;
  }
  return !edges.some(
    (e) => e.source === node.id && (e.type === 'SUBCLASS_OF' || e.type === 'INFERRED_SUBCLASS_OF')
  );
};

export const makeTopicVirtualNoteUrl = (topicNodeId: string, keyword: string): string => {
  const params = new URLSearchParams();
  params.append('ontologyTopic', topicNodeId);
  params.append('title', keyword);
  return `?${params.toString()}`;
};

export const topicNodeIdFromUrl = (url: string): string | undefined => {
  try {
    return new URL(url, 'https://blacktokki.local/').searchParams.get('ontologyTopic') || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Finds an existing physical note instance with the same name as the given keyword.
 */
export const findMatchingPhysicalNote = (
  keyword: string,
  allNodes: OntologyNode[]
): OntologyNode | undefined => {
  const normalizedKeyword = normalizeTitle(keyword);
  return allNodes.find((candidate) => {
    if (candidate.role !== 'INSTANCE' || candidate.instanceKind !== 'NOTE') {
      return false;
    }

    const directName = normalizeTitle(candidate.name);
    if (directName === normalizedKeyword) return true;

    const leafTitle = normalizeTitle(noteTitleForKeywordComparison(candidate.name));
    if (leafTitle === normalizedKeyword) return true;

    if (candidate.noteTitle) {
      const leafNoteTitle = normalizeTitle(noteTitleForKeywordComparison(candidate.noteTitle));
      if (leafNoteTitle === normalizedKeyword) return true;
    }

    return false;
  });
};

export interface TopicStats {
  keyword: string;
  subclassCount: number;
  paragraphCount: number;
  cardCount: number;
  sourceNoteCount: number;
  sourceNoteTitles: string[];
  subclassNodes: OntologyNode[];
  instancesBySubclass: Map<string, OntologyNode[]>;
  directInstances: OntologyNode[];
  allInstances: OntologyNode[];
}

/**
 * Aggregate subclasses, paragraphs, cards, and source notes connected to a topic class.
 */
export const collectTopicStats = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[]
): TopicStats => {
  const keyword = extractTopicKeyword(topicNode);
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  // 1. Identify all subclasses targeting this topicNode
  const subclassEdges = edges.filter(
    (e) =>
      e.target === topicNode.id && (e.type === 'SUBCLASS_OF' || e.type === 'INFERRED_SUBCLASS_OF')
  );
  const subclassNodes: OntologyNode[] = subclassEdges
    .map((e) => nodeMap.get(e.source))
    .filter((n): n is OntologyNode => n !== undefined && n.role === 'CLASS');

  subclassNodes.sort((a, b) => a.name.localeCompare(b.name));

  // 2. Map of instances by subclass
  const instancesBySubclass = new Map<string, OntologyNode[]>();
  const allInstancesMap = new Map<string, OntologyNode>();

  for (const subclass of subclassNodes) {
    const memberEdges = edges.filter(
      (e) =>
        e.target === subclass.id && (e.type === 'INSTANCE_OF' || e.type === 'INFERRED_INSTANCE_OF')
    );
    const members = memberEdges
      .map((e) => nodeMap.get(e.source))
      .filter((n): n is OntologyNode => n !== undefined && n.role === 'INSTANCE');
    members.sort((a, b) => a.name.localeCompare(b.name));
    instancesBySubclass.set(subclass.id, members);
    members.forEach((m) => allInstancesMap.set(m.id, m));
  }

  // 3. Direct instances attached directly to topicNode
  const directEdges = edges.filter(
    (e) =>
      e.target === topicNode.id && (e.type === 'INSTANCE_OF' || e.type === 'INFERRED_INSTANCE_OF')
  );
  const directInstances = directEdges
    .map((e) => nodeMap.get(e.source))
    .filter((n): n is OntologyNode => n !== undefined && n.role === 'INSTANCE');
  directInstances.sort((a, b) => a.name.localeCompare(b.name));
  directInstances.forEach((m) => allInstancesMap.set(m.id, m));

  // 4. Statistics & related note titles
  const allInstances = [...allInstancesMap.values()];
  let paragraphCount = 0;
  let cardCount = 0;
  const sourceNotesSet = new Set<string>();

  for (const inst of allInstances) {
    if (inst.instanceKind === 'CARD') {
      cardCount++;
      if (inst.noteTitle) sourceNotesSet.add(inst.noteTitle);
    } else if (
      inst.instanceKind === 'PARAGRAPH' ||
      inst.instanceKind === 'CONNECTED_PARAGRAPH' ||
      inst.paragraph
    ) {
      paragraphCount++;
      const origin = inst.paragraph?.origin || inst.noteTitle;
      if (origin) sourceNotesSet.add(origin);
    } else {
      if (inst.noteTitle) sourceNotesSet.add(inst.noteTitle);
    }
  }

  const sourceNoteTitles = [...sourceNotesSet].sort((a, b) => a.localeCompare(b));

  return {
    keyword,
    subclassCount: subclassNodes.length,
    paragraphCount,
    cardCount,
    sourceNoteCount: sourceNoteTitles.length,
    sourceNoteTitles,
    subclassNodes,
    instancesBySubclass,
    directInstances,
    allInstances,
  };
};

/** Find top-level topics whose shared knowledge and source-note evidence totals at least three. */
export const findRelatedTopics = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[]
): RelatedTopicSummary[] => {
  const currentStats = collectTopicStats(topicNode, allNodes, edges);
  const currentInstanceIds = new Set(currentStats.allInstances.map((node) => node.id));
  const currentSourceNotes = new Set(currentStats.sourceNoteTitles.map(normalizeTitle));

  return allNodes
    .filter((candidate) => candidate.id !== topicNode.id && isTopLevelTopicClass(candidate, edges))
    .map((candidate) => {
      const candidateStats = collectTopicStats(candidate, allNodes, edges);
      const candidateInstanceIds = new Set(candidateStats.allInstances.map((node) => node.id));
      const candidateSourceNotes = new Set(candidateStats.sourceNoteTitles.map(normalizeTitle));
      const sharedInstanceCount = [...currentInstanceIds].filter((id) =>
        candidateInstanceIds.has(id)
      ).length;
      const sharedSourceNoteCount = [...currentSourceNotes].filter((title) =>
        candidateSourceNotes.has(title)
      ).length;
      const referenceCount = edges.filter(
        (edge) =>
          edge.type === 'REFERENCES' &&
          ((currentInstanceIds.has(edge.source) && candidateInstanceIds.has(edge.target)) ||
            (currentInstanceIds.has(edge.target) && candidateInstanceIds.has(edge.source)))
      ).length;
      const matchingNote = findMatchingPhysicalNote(candidateStats.keyword, allNodes);

      return {
        topicNode: candidate,
        keyword: candidateStats.keyword,
        sharedInstanceCount,
        sharedSourceNoteCount,
        referenceCount,
        matchingNoteTitle: matchingNote?.noteTitle || matchingNote?.name,
      };
    })
    .filter((candidate) => candidate.sharedInstanceCount + candidate.sharedSourceNoteCount >= 3)
    .sort(
      (left, right) =>
        right.sharedInstanceCount - left.sharedInstanceCount ||
        right.sharedSourceNoteCount - left.sharedSourceNoteCount ||
        right.referenceCount - left.referenceCount ||
        left.keyword.localeCompare(right.keyword)
    );
};

export interface TopicListItemData {
  id: string;
  title: string;
  keyword: string;
  topicNode: OntologyNode;
  hasMatchingNote: boolean;
  matchingNoteTitle?: string;
  subclassCount: number;
  paragraphCount: number;
  cardCount: number;
  sourceNoteCount: number;
  relatedTopicCount: number;
  instanceCount: number;
  relationCount: number;
  subtitles: string[];
  link?: string;
}

/**
 * Calculates the total number of relations for a topic class.
 * Sum of connected subclasses, instances (paragraphs, cards, notes), and distinct source notes.
 */
export const getTopicRelationCount = (stats: TopicStats): number => {
  const instanceCount = Math.max(stats.allInstances.length, stats.paragraphCount + stats.cardCount);
  return stats.subclassCount + instanceCount + stats.sourceNoteCount;
};

/**
 * Builds display item data for NoteListSection representing a top-level topic class.
 */
export const buildTopicListItemData = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[],
  langFn?: (key: string) => string
): TopicListItemData => {
  const stats = collectTopicStats(topicNode, allNodes, edges);
  const keyword = stats.keyword;
  const matchingNote = findMatchingPhysicalNote(keyword, allNodes);
  const hasMatchingNote = !!matchingNote;
  const matchingNoteTitle = matchingNote?.noteTitle || matchingNote?.name;
  const relationCount = getTopicRelationCount(stats);
  const relatedTopicCount = findRelatedTopics(topicNode, allNodes, edges).length;

  const subclassLabel = langFn ? langFn('Subclasses') : '하위 분류';
  const paragraphLabel = langFn ? langFn('Paragraphs') : '문단';
  const cardLabel = langFn ? langFn('Cards') : '카드';
  const sourceNoteLabel = langFn ? langFn('Source Notes') : '출처 노트';
  const relatedTopicLabel = langFn ? langFn('Related Topics') : '연관 주제';

  const statsSubtitle = `${subclassLabel} ${stats.subclassCount} · ${paragraphLabel} ${stats.paragraphCount} · ${cardLabel} ${stats.cardCount} · ${sourceNoteLabel} ${stats.sourceNoteCount} · ${relatedTopicLabel} ${relatedTopicCount}`;

  return {
    id: topicNode.id,
    title: keyword,
    keyword,
    topicNode,
    hasMatchingNote,
    matchingNoteTitle,
    subclassCount: stats.subclassCount,
    paragraphCount: stats.paragraphCount,
    cardCount: stats.cardCount,
    sourceNoteCount: stats.sourceNoteCount,
    relatedTopicCount,
    instanceCount: stats.allInstances.length,
    relationCount,
    subtitles: [statsSubtitle],
    link: hasMatchingNote ? undefined : 'virtual',
  };
};

/**
 * Determines whether an ontology node is eligible for generating a Topic Virtual Note.
 *
 * Eligibility rules:
 * 1. The node must be a topic class (role === 'CLASS' && classCategory === 'TOPIC').
 * 2. It must be a top-level or standalone topic class without any outgoing subClassOf relations.
 *    (Subordinate classes are aggregated under their parent topic superclass).
 * 3. The extracted keyword must be valid (length >= 2, not numeric-only).
 * 4. There must NOT exist any physical Note instance with the same title (exact, leaf path, case-insensitive).
 */
export const isTopicVirtualNoteEligible = (
  node: OntologyNode,
  edges: OntologyEdge[],
  allNodes: OntologyNode[]
): boolean => {
  if (!isTopLevelTopicClass(node, edges)) {
    return false;
  }

  const keyword = extractTopicKeyword(node);
  if (keyword.length < 2 || isNumericOnlyKeyword(keyword)) {
    return false;
  }

  return !findMatchingPhysicalNote(keyword, allNodes);
};

/**
 * Fast indexed batch computation of virtual note eligible node IDs.
 * Computes eligibility in O(N + E) instead of O(N * (N + E)).
 */
export const getTopicVirtualNoteEligibleSet = (
  nodes: OntologyNode[],
  edges: OntologyEdge[]
): Set<string> => {
  const eligibleSet = new Set<string>();
  if (nodes.length === 0) return eligibleSet;

  // 1. Index physical note titles
  const physicalNoteTitleSet = new Set<string>();
  for (const n of nodes) {
    if (n.role === 'INSTANCE' && n.instanceKind === 'NOTE') {
      const nameNorm = normalizeTitle(n.name);
      if (nameNorm) physicalNoteTitleSet.add(nameNorm);
      const leafNorm = normalizeTitle(noteTitleForKeywordComparison(n.name));
      if (leafNorm) physicalNoteTitleSet.add(leafNorm);
      if (n.noteTitle) {
        const noteTitleNorm = normalizeTitle(noteTitleForKeywordComparison(n.noteTitle));
        if (noteTitleNorm) physicalNoteTitleSet.add(noteTitleNorm);
      }
    }
  }

  // 2. Index nodes with outgoing subclass relations
  const nodesWithOutgoingSubclass = new Set<string>();
  for (const e of edges) {
    if (e.type === 'SUBCLASS_OF' || e.type === 'INFERRED_SUBCLASS_OF') {
      nodesWithOutgoingSubclass.add(e.source);
    }
  }

  // 3. Check each node in O(1)
  for (const node of nodes) {
    if (node.role !== 'CLASS' || node.classCategory !== 'TOPIC') {
      continue;
    }
    if (nodesWithOutgoingSubclass.has(node.id)) {
      continue;
    }
    const keyword = extractTopicKeyword(node);
    if (keyword.length < 2 || isNumericOnlyKeyword(keyword)) {
      continue;
    }
    if (physicalNoteTitleSet.has(normalizeTitle(keyword))) {
      continue;
    }
    eligibleSet.add(node.id);
  }

  return eligibleSet;
};

/**
 * Creates an internal notebook URL pointing to a note or a paragraph/card within a note.
 */
export const makeNoteUrl = (noteTitle: string, paragraphTitle?: string): string => {
  const params = new URLSearchParams();
  params.append('title', noteTitle);
  const hash = paragraphTitle ? `#${encodeURIComponent(paragraphTitle)}` : '';
  return `?${params.toString()}${hash}`;
};

/**
 * Creates an internal markdown link pointing to a note or a paragraph/card within a note.
 */
export const makeNoteMarkdownLink = (
  text: string,
  noteTitle: string,
  paragraphTitle?: string
): string => {
  const url = makeNoteUrl(noteTitle, paragraphTitle);
  return `[${text}](${url})`;
};

/**
 * Synthesize a linked Topic index and related-topic section in Markdown format.
 */
export const synthesizeTopicVirtualNote = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[],
  langFn?: (key: string) => string
): TopicVirtualNote => {
  const t = (key: string, fallback?: string): string =>
    (langFn ? langFn(key) : undefined) || fallback || key;

  const stats = collectTopicStats(topicNode, allNodes, edges);
  const relatedTopics = findRelatedTopics(topicNode, allNodes, edges);
  const { keyword, subclassCount, paragraphCount, cardCount, sourceNoteTitles, subclassNodes } =
    stats;
  // Build Markdown Content
  const lines: string[] = [];

  // Header
  lines.push(`# 🪐 [${t('Virtual Note', '가상노트')}] ${keyword}`);
  lines.push('');
  lines.push(
    `> 💡 **${t(
      'Topic Virtual Note Title',
      '온톨로지 추론 기반 주제 가상노트 (Topic Virtual Note)'
    )}**`
  );
  lines.push(
    `> ${t(
      'Topic Virtual Note Desc',
      "이 문서는 온톨로지 지식 그래프에서 '{keyword}' 주제와 관련된 분산된 문단, 카드, 하위 분류를 실시간 종합하여 도출한 가상 문서입니다."
    ).replace('{keyword}', keyword)}`
  );
  lines.push(
    `> ${t(
      'Topic Virtual Note Save Hint',
      '상단의 [실제 일반 노트로 저장]을 클릭하면 정식 일반 노트로 저장되어 영구 보관할 수 있습니다.'
    )}`
  );
  lines.push('');

  // Overview / Index
  lines.push(`## 🗂️ ${t('Topic Index', '주제 색인')}`);
  lines.push(`- **${t('Topic Keyword', '주제 키워드')}**: \`${keyword}\``);

  // 하위 분류 링크 리스트
  if (subclassNodes.length > 0) {
    lines.push(`- **${t('Subclasses', '하위 분류')} (${subclassNodes.length})**:`);
    for (const sub of subclassNodes) {
      lines.push(`  - 📁 ${sub.name}`);
    }
  } else {
    lines.push(`- **${t('Subclasses', '하위 분류')}**: ${t('None', '없음')}`);
  }

  // 종합 문단 링크 리스트
  const allParagraphInsts = stats.allInstances.filter(
    (inst) =>
      inst.instanceKind !== 'CARD' &&
      (inst.instanceKind === 'PARAGRAPH' ||
        inst.instanceKind === 'CONNECTED_PARAGRAPH' ||
        Boolean(inst.paragraph))
  );
  if (allParagraphInsts.length > 0) {
    lines.push(`- **${t('Aggregated Paragraphs', '종합 문단')} (${allParagraphInsts.length})**:`);
    for (const inst of allParagraphInsts) {
      const originNote = inst.paragraph?.origin || inst.noteTitle || '';
      const pTitle = inst.name || inst.paragraph?.title || '';
      if (originNote) {
        lines.push(`  - ${makeNoteMarkdownLink(`${originNote}#${pTitle}`, originNote, pTitle)}`);
      } else {
        lines.push(`  - **${pTitle}**`);
      }
    }
  } else {
    lines.push(`- **${t('Aggregated Paragraphs', '종합 문단')}**: ${t('None', '없음')}`);
  }

  // 종합 카드 링크 리스트
  const allCardInsts = stats.allInstances.filter((inst) => inst.instanceKind === 'CARD');
  if (allCardInsts.length > 0) {
    lines.push(`- **${t('Aggregated Cards', '종합 카드')} (${allCardInsts.length})**:`);
    for (const inst of allCardInsts) {
      const boardTitle = inst.boardTitle || inst.noteTitle || '';
      const cardTitle = inst.name || '';
      const targetNoteTitle = inst.noteTitle || boardTitle;
      const label = boardTitle ? `[${boardTitle}] ${cardTitle}` : cardTitle;
      if (targetNoteTitle) {
        lines.push(`  - ${makeNoteMarkdownLink(label, targetNoteTitle, cardTitle)}`);
      } else {
        lines.push(`  - **${cardTitle}**`);
      }
    }
  } else {
    lines.push(`- **${t('Aggregated Cards', '종합 카드')}**: ${t('None', '없음')}`);
  }

  // 출처 노트 링크 리스트
  if (sourceNoteTitles.length > 0) {
    lines.push(`- **${t('Source Notes', '출처 노트')} (${sourceNoteTitles.length})**:`);
    for (const title of sourceNoteTitles) {
      lines.push(`  - ${makeNoteMarkdownLink(title, title)}`);
    }
  }
  lines.push('');

  if (relatedTopics.length > 0) {
    lines.push(`## 🔗 ${t('Related Topics', '연관 주제')}`);
    lines.push('');
    for (const relatedTopic of relatedTopics) {
      const link = relatedTopic.matchingNoteTitle
        ? makeNoteMarkdownLink(relatedTopic.keyword, relatedTopic.matchingNoteTitle)
        : `[${relatedTopic.keyword}](${makeTopicVirtualNoteUrl(
            relatedTopic.topicNode.id,
            relatedTopic.keyword
          )})`;
      const evidence = [
        relatedTopic.sharedInstanceCount > 0
          ? `${t('Shared Knowledge', '공유 지식')} ${relatedTopic.sharedInstanceCount}`
          : undefined,
        relatedTopic.sharedSourceNoteCount > 0
          ? `${t('Shared Source Notes', '공유 출처 노트')} ${relatedTopic.sharedSourceNoteCount}`
          : undefined,
        relatedTopic.referenceCount > 0
          ? `${t('References', '참조')} ${relatedTopic.referenceCount}`
          : undefined,
      ].filter((value): value is string => Boolean(value));
      lines.push(`- ${link}${evidence.length > 0 ? ` — ${evidence.join(' · ')}` : ''}`);
    }
    lines.push('');
  }

  return {
    id: `virtual:topic:${stableOntologyId(keyword)}`,
    title: keyword,
    topicKeyword: keyword,
    topicNodeId: topicNode.id,
    subclassCount,
    paragraphCount,
    cardCount,
    relatedTopicCount: relatedTopics.length,
    sourceNoteTitles,
    content: lines.join('\n').trim(),
  };
};
