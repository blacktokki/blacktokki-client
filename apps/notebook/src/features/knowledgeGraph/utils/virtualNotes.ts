import { isNumericOnlyKeyword, normalizeTitle } from './titleKeywordClasses';
import { OntologyEdge, OntologyLinkEvidence, OntologyNode } from '../types';

export interface TopicVirtualNote {
  title: string;
  topicKeyword: string;
  linkCount: number;
  paragraphCount: number;
  cardCount: number;
  relatedTopicCount: number;
  sourceNoteTitles: string[];
  content: string;
}

export interface RelatedTopicSummary {
  topicNode: OntologyNode;
  keyword: string;
  sharedSourceNoteCount: number;
  referenceCount: number;
  matchingNoteTitle?: string;
}

/** Prefer the canonical match label when a topic has one. */
export const extractTopicKeyword = (node: OntologyNode): string => {
  const raw = (node.matchLabel && node.matchLabel.trim()) || node.name;
  return raw
    .replace(/^(?:주제|Topic|노트\s*제목|Note\s*Title|H\d+\s*제목|H\d+)\s*:\s*/i, '')
    .trim();
};

export const isTopicClass = (node: OntologyNode): boolean =>
  node.role === 'CLASS' && node.classCategory === 'TOPIC';

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

export const findMatchingPhysicalNote = (
  keyword: string,
  allNodes: OntologyNode[]
): OntologyNode | undefined => {
  const normalizedKeyword = normalizeTitle(keyword);
  return allNodes.find((candidate) => {
    if (candidate.role !== 'INSTANCE' || candidate.instanceKind !== 'NOTE') {
      return false;
    }

    return (
      normalizeTitle(candidate.name) === normalizedKeyword ||
      (candidate.noteTitle ? normalizeTitle(candidate.noteTitle) === normalizedKeyword : false)
    );
  });
};

export interface TopicStats {
  keyword: string;
  linkCount: number;
  paragraphCount: number;
  cardCount: number;
  sourceNoteCount: number;
  sourceNoteTitles: string[];
  allInstances: OntologyNode[];
  linkEvidence: OntologyLinkEvidence[];
}

export const collectTopicStats = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[]
): TopicStats => {
  const keyword = extractTopicKeyword(topicNode);
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const allInstancesMap = new Map<string, OntologyNode>();
  const linkSourceInstancesMap = new Map<string, OntologyNode>();
  const linkEvidence: OntologyLinkEvidence[] = [];
  let linkCount = 0;

  const directInstances = edges
    .filter(
      (edge) =>
        edge.target === topicNode.id &&
        (edge.type === 'INSTANCE_OF' || edge.type === 'INFERRED_INSTANCE_OF')
    )
    .map((edge) => nodeMap.get(edge.source))
    .filter((n): n is OntologyNode => n !== undefined && n.role === 'INSTANCE');
  directInstances.sort((a, b) => a.name.localeCompare(b.name));
  const linkIds = new Set<string>();
  for (const member of directInstances) {
    if (
      member.instanceKind === 'EXTERNAL_LINK' ||
      member.instanceKind === 'CONNECTED_EXTERNAL_LINK'
    ) {
      linkIds.add(member.id);
    } else {
      allInstancesMap.set(member.id, member);
    }
  }
  if (linkIds.size > 0) {
    for (const edge of edges) {
      if (edge.type !== 'EXTERNAL_REFERENCE' || !linkIds.has(edge.target)) continue;
      const link = nodeMap.get(edge.target);
      const source = nodeMap.get(edge.source);
      if (!link || !source) continue;
      linkCount++;
      linkEvidence.push({ label: link.name, url: link.description || '' });
      linkSourceInstancesMap.set(source.id, source);
    }
  }

  const allInstances = [...allInstancesMap.values()];
  let paragraphCount = 0;
  let cardCount = 0;
  const sourceNotesSet = new Set<string>();
  const addSourceNotes = (instance: OntologyNode, preferNoteTitle = false) => {
    if (instance.instanceKind === 'BOARD_PARAGRAPH' && instance.paragraphOccurrences?.length) {
      for (const occurrence of instance.paragraphOccurrences) {
        if (occurrence.origin) sourceNotesSet.add(occurrence.origin);
      }
      return;
    }
    const origin = preferNoteTitle
      ? instance.noteTitle
      : instance.paragraph?.origin || instance.noteTitle;
    if (origin) sourceNotesSet.add(origin);
  };

  for (const inst of allInstances) {
    if (inst.instanceKind === 'CARD') {
      cardCount++;
      addSourceNotes(inst, true);
    } else if (
      inst.instanceKind === 'PARAGRAPH' ||
      inst.instanceKind === 'BOARD_PARAGRAPH' ||
      inst.instanceKind === 'CONNECTED_PARAGRAPH' ||
      inst.paragraph
    ) {
      paragraphCount++;
      addSourceNotes(inst);
    } else {
      addSourceNotes(inst, true);
    }
  }
  for (const linkSource of linkSourceInstancesMap.values()) {
    addSourceNotes(linkSource);
  }

  const sourceNoteTitles = [...sourceNotesSet].sort((a, b) => a.localeCompare(b));

  return {
    keyword,
    linkCount,
    paragraphCount,
    cardCount,
    sourceNoteCount: sourceNoteTitles.length,
    sourceNoteTitles,
    allInstances,
    linkEvidence,
  };
};

/** Find topics sharing at least three distinct source notes. */
export const findRelatedTopics = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[]
): RelatedTopicSummary[] => {
  const currentStats = collectTopicStats(topicNode, allNodes, edges);
  const currentInstanceIds = new Set(currentStats.allInstances.map((node) => node.id));
  const currentSourceNotes = new Set(currentStats.sourceNoteTitles.map(normalizeTitle));

  return allNodes
    .filter((candidate) => candidate.id !== topicNode.id && isTopicClass(candidate))
    .map((candidate) => {
      const candidateStats = collectTopicStats(candidate, allNodes, edges);
      const candidateInstanceIds = new Set(candidateStats.allInstances.map((node) => node.id));
      const candidateSourceNotes = new Set(candidateStats.sourceNoteTitles.map(normalizeTitle));
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
        sharedSourceNoteCount,
        referenceCount,
        matchingNoteTitle: matchingNote?.noteTitle || matchingNote?.name,
      };
    })
    .filter((candidate) => candidate.sharedSourceNoteCount >= 3)
    .sort(
      (left, right) =>
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
  linkCount: number;
  paragraphCount: number;
  cardCount: number;
  sourceNoteCount: number;
  relatedTopicCount: number;
  instanceCount: number;
  relationCount: number;
  subtitles: string[];
  link?: string;
}

export const getTopicRelationCount = (stats: TopicStats): number => {
  const instanceCount = Math.max(stats.allInstances.length, stats.paragraphCount + stats.cardCount);
  return instanceCount + stats.sourceNoteCount;
};

type TopicListSortItem = Pick<
  TopicListItemData,
  'title' | 'linkCount' | 'paragraphCount' | 'cardCount' | 'sourceNoteCount'
>;

export const compareTopicListItems = (a: TopicListSortItem, b: TopicListSortItem): number => {
  const aCount = a.linkCount + a.paragraphCount + a.cardCount + a.sourceNoteCount;
  const bCount = b.linkCount + b.paragraphCount + b.cardCount + b.sourceNoteCount;
  return bCount - aCount || a.title.localeCompare(b.title);
};

const getChildTopicCounts = (
  topicNodes: OntologyNode[],
  edges: OntologyEdge[]
): Map<string, number> => {
  const topicIds = new Set(topicNodes.map((node) => node.id));
  const childIdsByParent = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type !== 'SUBCLASS_OF' || !topicIds.has(edge.source) || !topicIds.has(edge.target)) {
      continue;
    }
    const childIds = childIdsByParent.get(edge.target) || new Set<string>();
    childIds.add(edge.source);
    childIdsByParent.set(edge.target, childIds);
  }
  return new Map([...childIdsByParent].map(([parentId, childIds]) => [parentId, childIds.size]));
};

const buildTopicListItemFromStats = (
  topicNode: OntologyNode,
  stats: TopicStats,
  matchingNote: OntologyNode | undefined,
  relatedTopicCount: number,
  childTopicCount: number,
  langFn?: (key: string) => string
): TopicListItemData => {
  const keyword = stats.keyword;
  const hasMatchingNote = !!matchingNote;
  const matchingNoteTitle = matchingNote?.noteTitle || matchingNote?.name;
  const relationCount = getTopicRelationCount(stats);

  const linkLabel = langFn ? langFn('Links') : '링크';
  const paragraphLabel = langFn ? langFn('Paragraphs') : '문단';
  const cardLabel = langFn ? langFn('Cards') : '카드';
  const sourceNoteLabel = langFn ? langFn('Source Notes') : '출처 노트';
  const relatedTopicLabel = langFn ? langFn('Related Topics') : '연관 주제';
  const childTopicLabel = langFn ? langFn('Child Topics') : '하위 주제';
  const childTopicSuffix = childTopicCount > 0 ? ` (${childTopicLabel} ${childTopicCount})` : '';

  const statsSubtitle = `${linkLabel} ${stats.linkCount} · ${paragraphLabel} ${stats.paragraphCount} · ${cardLabel} ${stats.cardCount} · ${sourceNoteLabel} ${stats.sourceNoteCount} · ${relatedTopicLabel} ${relatedTopicCount}${childTopicSuffix}`;

  return {
    id: topicNode.id,
    title: keyword,
    keyword,
    topicNode,
    hasMatchingNote,
    matchingNoteTitle,
    linkCount: stats.linkCount,
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

export const buildTopicListItemData = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[],
  langFn?: (key: string) => string
): TopicListItemData => {
  const stats = collectTopicStats(topicNode, allNodes, edges);
  const matchingNote = findMatchingPhysicalNote(stats.keyword, allNodes);
  const relatedTopicCount = findRelatedTopics(topicNode, allNodes, edges).length;
  const childTopicCount =
    getChildTopicCounts(allNodes.filter(isTopicClass), edges).get(topicNode.id) || 0;
  return buildTopicListItemFromStats(
    topicNode,
    stats,
    matchingNote,
    relatedTopicCount,
    childTopicCount,
    langFn
  );
};

/** Build topic rows with shared indexes for source-note overlap. */
export const buildTopicListItemsData = (
  allNodes: OntologyNode[],
  edges: OntologyEdge[],
  langFn?: (key: string) => string
): TopicListItemData[] => {
  const topicNodes = allNodes.filter(isTopicClass);
  const childTopicCounts = getChildTopicCounts(topicNodes, edges);
  const statsByTopicId = new Map(
    topicNodes.map((topicNode) => [topicNode.id, collectTopicStats(topicNode, allNodes, edges)])
  );

  const topicsBySourceNote = new Map<string, number[]>();
  topicNodes.forEach((topicNode, index) => {
    for (const sourceNoteTitle of statsByTopicId.get(topicNode.id)!.sourceNoteTitles) {
      const normalizedSourceNote = normalizeTitle(sourceNoteTitle);
      const topicIds = topicsBySourceNote.get(normalizedSourceNote) || [];
      topicIds.push(index);
      topicsBySourceNote.set(normalizedSourceNote, topicIds);
    }
  });

  const sharedNoteCountByPair = new Map<number, number>();
  for (const topicIds of topicsBySourceNote.values()) {
    const uniqueIds = [...new Set(topicIds)];
    for (let left = 0; left < uniqueIds.length; left++) {
      for (let right = left + 1; right < uniqueIds.length; right++) {
        const key = uniqueIds[left] * topicNodes.length + uniqueIds[right];
        sharedNoteCountByPair.set(key, (sharedNoteCountByPair.get(key) || 0) + 1);
      }
    }
  }

  const relatedTopicCounts = new Array<number>(topicNodes.length).fill(0);
  for (const [key, count] of sharedNoteCountByPair) {
    if (count < 3) continue;
    relatedTopicCounts[Math.floor(key / topicNodes.length)]++;
    relatedTopicCounts[key % topicNodes.length]++;
  }

  const physicalNotesByKeyword = new Map<string, OntologyNode>();
  for (const node of allNodes) {
    if (node.role !== 'INSTANCE' || node.instanceKind !== 'NOTE') continue;
    const keys = [normalizeTitle(node.name), normalizeTitle(node.noteTitle)];
    keys.forEach((key) => {
      if (key && !physicalNotesByKeyword.has(key)) physicalNotesByKeyword.set(key, node);
    });
  }

  return topicNodes.map((topicNode, index) => {
    const stats = statsByTopicId.get(topicNode.id) as TopicStats;
    const matchingNote = physicalNotesByKeyword.get(normalizeTitle(stats.keyword));
    return buildTopicListItemFromStats(
      topicNode,
      stats,
      matchingNote,
      relatedTopicCounts[index],
      childTopicCounts.get(topicNode.id) || 0,
      langFn
    );
  });
};

/** A matching physical note does not hide its generated topic index. */
export const isTopicVirtualNoteEligible = (node: OntologyNode): boolean => {
  if (!isTopicClass(node)) return false;
  const keyword = extractTopicKeyword(node);
  return keyword.length >= 2 && !isNumericOnlyKeyword(keyword);
};

export const getTopicVirtualNoteEligibleSet = (nodes: OntologyNode[]): Set<string> => {
  const eligibleSet = new Set<string>();
  for (const node of nodes) {
    if (isTopicVirtualNoteEligible(node)) eligibleSet.add(node.id);
  }

  return eligibleSet;
};

export const makeNoteUrl = (noteTitle: string, paragraphTitle?: string): string => {
  const params = new URLSearchParams();
  params.append('title', noteTitle);
  const hash = paragraphTitle ? `#${encodeURIComponent(paragraphTitle)}` : '';
  return `?${params.toString()}${hash}`;
};

export const makeNoteMarkdownLink = (
  text: string,
  noteTitle: string,
  paragraphTitle?: string
): string => {
  const url = makeNoteUrl(noteTitle, paragraphTitle);
  return `[${text}](${url})`;
};

const makeLinkEvidenceMarkdownLink = (evidence: OntologyLinkEvidence): string => {
  const label = evidence.label
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
  const url = evidence.url.replace(/>/g, '%3E');
  return `[${label}](<${url}>)`;
};

export const synthesizeTopicVirtualNote = (
  topicNode: OntologyNode,
  allNodes: OntologyNode[],
  edges: OntologyEdge[],
  langFn?: (key: string) => string,
  physicalNoteTitle?: string
): TopicVirtualNote => {
  const t = (key: string, fallback?: string): string =>
    (langFn ? langFn(key) : undefined) || fallback || key;

  const stats = collectTopicStats(topicNode, allNodes, edges);
  const relatedTopics = findRelatedTopics(topicNode, allNodes, edges);
  const hasMatchingNote =
    !!physicalNoteTitle || !!findMatchingPhysicalNote(stats.keyword, allNodes);
  const { keyword, linkCount, paragraphCount, cardCount, sourceNoteTitles } = stats;
  const lines: string[] = [];

  lines.push(`# [${t('Virtual Note', '가상노트')}] ${keyword}`);
  lines.push('');
  lines.push(`> 💡 **${t('Topic Virtual Note Title', '주제 가상노트 (Topic Virtual Note)')}**`);
  lines.push(
    `> ${t(
      'Topic Virtual Note Desc',
      "이 문서는 지식 그래프에서 '{keyword}' 주제와 관련된 분산된 문단과 카드를 실시간 종합하여 도출한 가상 문서입니다."
    ).replace('{keyword}', keyword)}`
  );
  lines.push(
    `> ${t(
      hasMatchingNote ? 'Topic Virtual Note Open Real Hint' : 'Topic Virtual Note Save Hint',
      hasMatchingNote
        ? '하단의 [실제 노트로 이동]을 클릭하면 원본 노트를 열 수 있습니다.'
        : '하단의 [실제 일반 노트로 저장]을 클릭하면 정식 일반 노트로 저장됩니다.'
    )}`
  );
  lines.push('');

  lines.push(`## 🗂️ ${t('Topic Index', '주제 색인')}`);

  if (linkCount > 0) {
    lines.push(`- **${t('Links', '링크')} (${linkCount})**:`);
    for (const evidence of stats.linkEvidence) {
      lines.push(`  - ${makeLinkEvidenceMarkdownLink(evidence)}`);
    }
  } else {
    lines.push(`- **${t('Links', '링크')}**: ${t('None', '없음')}`);
  }

  const allParagraphInsts = stats.allInstances.filter(
    (inst) =>
      inst.instanceKind !== 'CARD' &&
      (inst.instanceKind === 'PARAGRAPH' ||
        inst.instanceKind === 'BOARD_PARAGRAPH' ||
        inst.instanceKind === 'CONNECTED_PARAGRAPH' ||
        Boolean(inst.paragraph))
  );
  if (allParagraphInsts.length > 0) {
    lines.push(`- **${t('Paragraphs', '문단')} (${allParagraphInsts.length})**:`);
    for (const inst of allParagraphInsts) {
      if (inst.instanceKind === 'BOARD_PARAGRAPH' && inst.paragraphOccurrences?.length) {
        lines.push(`  - **${inst.name}**`);
        for (const occurrence of inst.paragraphOccurrences) {
          if (!occurrence.origin) continue;
          lines.push(
            `    - ${makeNoteMarkdownLink(
              `${occurrence.origin}#${inst.name}`,
              occurrence.origin,
              inst.name
            )}`
          );
        }
        continue;
      }
      const originNote = inst.paragraph?.origin || inst.noteTitle || '';
      const pTitle = inst.name || inst.paragraph?.title || '';
      if (originNote) {
        lines.push(`  - ${makeNoteMarkdownLink(`${originNote}#${pTitle}`, originNote, pTitle)}`);
      } else {
        lines.push(`  - **${pTitle}**`);
      }
    }
  } else {
    lines.push(`- **${t('Paragraphs', '문단')}**: ${t('None', '없음')}`);
  }

  const allCardInsts = stats.allInstances.filter((inst) => inst.instanceKind === 'CARD');
  if (allCardInsts.length > 0) {
    lines.push(`- **${t('Board Cards', '보드 카드')} (${allCardInsts.length})**:`);
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
    lines.push(`- **${t('Board Cards', '보드 카드')}**: ${t('None', '없음')}`);
  }

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
    const parentIds = new Set(
      edges
        .filter((edge) => edge.type === 'SUBCLASS_OF' && edge.source === topicNode.id)
        .map((edge) => edge.target)
    );
    const childIds = new Set(
      edges
        .filter((edge) => edge.type === 'SUBCLASS_OF' && edge.target === topicNode.id)
        .map((edge) => edge.source)
    );
    const groups = [
      {
        label: t('Parent Topics', '상위 주제'),
        topics: relatedTopics.filter((related) => parentIds.has(related.topicNode.id)),
      },
      {
        label: t('Child Topics', '하위 주제'),
        topics: relatedTopics.filter(
          (related) => !parentIds.has(related.topicNode.id) && childIds.has(related.topicNode.id)
        ),
      },
      {
        label: t('Other Related Topics', '그 외 연관 주제'),
        topics: relatedTopics.filter(
          (related) => !parentIds.has(related.topicNode.id) && !childIds.has(related.topicNode.id)
        ),
      },
    ];
    for (const group of groups) {
      lines.push(
        group.topics.length
          ? `- **${group.label} (${group.topics.length})**:`
          : `- **${group.label}**: ${t('None', '없음')}`
      );
      for (const relatedTopic of group.topics) {
        const linkLabel = `${relatedTopic.matchingNoteTitle ? '📝 ' : ''}${relatedTopic.keyword}`;
        const link = `[${linkLabel}](${makeTopicVirtualNoteUrl(
          relatedTopic.topicNode.id,
          relatedTopic.keyword
        )})`;
        const evidence = [
          relatedTopic.sharedSourceNoteCount > 0
            ? `${t('Common Source Notes', '공통 출처 노트')} ${relatedTopic.sharedSourceNoteCount}`
            : undefined,
          relatedTopic.referenceCount > 0
            ? `${t('References', '참조')} ${relatedTopic.referenceCount}`
            : undefined,
        ].filter((value): value is string => Boolean(value));
        lines.push(`  - ${link}${evidence.length > 0 ? ` — ${evidence.join(' · ')}` : ''}`);
      }
    }
    lines.push('');
  }

  return {
    title: keyword,
    topicKeyword: keyword,
    linkCount,
    paragraphCount,
    cardCount,
    relatedTopicCount: relatedTopics.length,
    sourceNoteTitles,
    content: lines.join('\n').trim(),
  };
};
