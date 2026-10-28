import { toRaw } from '@blacktokki/editor';

import {
  graphSourceStructure,
  graphSourceRanges,
  createEvidenceText,
  graphSourceMetadataIdentity,
} from './evidence';
import { base64Decode, parseHtmlToParagraphs } from '../../../../components/HeaderSelectBar';
import type { KnowledgeGraphData, KnowledgeGraphNode } from '../../types';
import {
  getKnowledgeGraphNodeKind,
  getKnowledgeGraphNodeKindLabel,
  getKnowledgeGraphRelationDisplayLabel,
} from '../../utils/relations';
import {
  relationKeywordKey,
  checkRelationCancelled,
  yieldRelationWork,
} from '../keyword/keywordUtils';
import { relationCacheHash } from '../keywordRelationCache';
import { relationAssociationType } from '../relationResults';
import type {
  GraphSearchSnapshot,
  GraphSource,
  SearchNode,
  SearchEdge,
  InductiveRelationCandidate,
  RelationObservation,
} from '../types';

export const yieldGraphSearch = async (signal?: AbortSignal) => {
  await yieldRelationWork(signal);
  checkRelationCancelled(signal);
};

/** Bump the identity version when snapshot construction or search document formatting changes. */
export async function graphSearchInputRevision(
  input: Parameters<typeof createGraphSearchSnapshot>[0]
) {
  checkRelationCancelled(input.signal);
  const evidenceRefs = new Map<RelationObservation, string>();
  for (const edge of input.graph.edges)
    for (const observation of edge.keywordTypeRelation?.evidence || [])
      evidenceRefs.set(observation, '');
  if (evidenceRefs.size)
    for (const [candidateIndex, candidate] of (input.candidates || []).entries())
      for (const [index, observation] of candidate.observations.entries())
        if (evidenceRefs.has(observation))
          evidenceRefs.set(observation, `${candidateIndex}:${index}`);
  const extraEvidence: RelationObservation[] = [];
  const evidenceRef = (observation: RelationObservation) => {
    let key = evidenceRefs.get(observation);
    if (!key) {
      key = `extra:${extraEvidence.length}`;
      evidenceRefs.set(observation, key);
      extraEvidence.push(observation);
    }
    return key;
  };
  const revision = await relationCacheHash(
    JSON.stringify([
      'search-input-v9',
      input.scope,
      input.coverage,
      input.graph.nodes.map((node) => {
        const kind = getKnowledgeGraphNodeKind(node);
        return [
          node.id,
          node.name,
          kind,
          getKnowledgeGraphNodeKindLabel(kind, input.translate, input.usageMode),
          node.noteTitle,
          node.paragraph,
          node.paragraphOccurrences,
          node.properties,
          node.keyword?.sources,
          node.keywordType?.sources,
          node.template?.sourceTitles,
          node.description,
        ];
      }),
      input.graph.edges.map((edge) => [
        edge.id,
        edge.source,
        edge.target,
        edge.type,
        getKnowledgeGraphRelationDisplayLabel(edge, input.translate),
        edge.directed !== false,
        edge.keywordRelation?.candidateId,
        edge.keywordRelation?.candidateIds,
        edge.keywordRelation?.associationContext,
        edge.keywordRelation?.score,
        edge.keywordTypeRelation?.score,
        edge.keywordTypeRelation?.evidence.map(evidenceRef),
      ]),
      input.notes.map((note) => [note.title, note.description]),
      (input.boards || []).map((board) => [board.title, board.description]),
      (input.candidates || []).map((candidate) => [candidate.id, candidate.observations]),
      extraEvidence,
    ])
  );
  checkRelationCancelled(input.signal);
  return revision;
}

/** Build a text-only, scoped inventory. Rendering flags and layout coordinates never enter it. */
export async function createGraphSearchSnapshot({
  graph,
  scope,
  notes,
  boards = [],
  candidates = [],
  coverage,
  translate,
  usageMode,
  signal,
  onProgress,
}: {
  graph: Pick<KnowledgeGraphData, 'nodes' | 'edges'>;
  scope: string;
  notes: { title: string; description?: string }[];
  boards?: { title: string; description?: string }[];
  candidates?: InductiveRelationCandidate[];
  coverage: GraphSearchSnapshot['coverage'];
  translate: (value: string) => string;
  usageMode?: string;
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
}): Promise<GraphSearchSnapshot> {
  checkRelationCancelled(signal);
  const documents = new Map([...notes, ...boards].map((note) => [note.title, note]));
  const sources = new Map<string, GraphSource>();
  const sourceKeys = new Map<string, string>();
  const originText = new Map<string, ReturnType<typeof createEvidenceText>>();
  const paragraphs = new Map<
    string,
    Map<string, ReturnType<typeof parseHtmlToParagraphs>[number]>
  >();
  const findParagraph = (title: string, path: string[]) => {
    if (!path.length || !documents.has(title)) return undefined;
    if (!paragraphs.has(title)) {
      const byPath = new Map<string, ReturnType<typeof parseHtmlToParagraphs>[number]>();
      for (const paragraph of parseHtmlToParagraphs(documents.get(title)?.description || '')) {
        const key = JSON.stringify(paragraph.path.split(',').filter(Boolean).map(base64Decode));
        if (!byPath.has(key)) byPath.set(key, paragraph);
      }
      paragraphs.set(title, byPath);
    }
    return paragraphs.get(title)!.get(JSON.stringify(path));
  };
  const plain = new Map<string, string>();
  const structures = new Map<string, ReturnType<typeof graphSourceStructure>>();
  const structure = (html: string, text: string) => {
    let value = structures.get(html);
    if (!value) structures.set(html, (value = graphSourceStructure(html, text)));
    return value;
  };
  const raw = (html: string) => {
    if (!plain.has(html)) plain.set(html, toRaw(html));
    return plain.get(html)!;
  };
  const addSource = (
    title: string,
    paragraph?: KnowledgeGraphNode['paragraph'],
    text?: string,
    href?: string
  ): string | undefined => {
    if (!documents.has(title)) return;
    const section = paragraph?.autoSection || paragraph?.section;
    const name = paragraph?.title;
    const key = JSON.stringify([
      title,
      paragraph?.path || name || '',
      section || '',
      href || '',
      text || '',
    ]);
    let id = sourceKeys.get(key);
    if (!id) {
      id = `source:${sources.size}`;
      sourceKeys.set(key, id);
      const html = paragraph
        ? paragraph.description || ''
        : documents.get(title)?.description || '';
      const sourceText = text ?? raw(html);
      const sourceStructure: Partial<GraphSource> =
        text === undefined ? structure(html, sourceText) : {};
      sources.set(id, {
        id,
        title,
        ...(name && { paragraph: name }),
        ...(section && { section }),
        ...(paragraph?.path && { path: paragraph.path }),
        ...(href && { href }),
        text: sourceText,
        ...sourceStructure,
        // The parsed layout is shared by equal HTML; relative destinations belong to each source note.
        ...(sourceStructure.references && {
          references: sourceStructure.references.map((reference) => ({ ...reference })),
        }),
      });
      if (text !== undefined || paragraph) {
        const originalId = addSource(title, text !== undefined ? paragraph : undefined);
        if (originalId && originalId !== id) {
          const original = sources.get(originalId)!;
          let search = originText.get(originalId);
          if (!search) originText.set(originalId, (search = createEvidenceText(original.text)));
          let ranges = graphSourceRanges(original.text, sourceText, search);
          if (!sourceText.trim() && paragraph?.title) {
            const path = paragraph.path
              .split(',')
              .filter(Boolean)
              .map(base64Decode)
              .map((name) => name.normalize('NFC').trim());
            ranges = (original.anchors || [])
              .filter(
                (anchor) =>
                  anchor.kind === 'heading' &&
                  anchor.name.normalize('NFC').trim() === paragraph.title.normalize('NFC').trim() &&
                  (!path.length ||
                    JSON.stringify(
                      [...(anchor.path || []), anchor.name].map((name) =>
                        name.normalize('NFC').trim()
                      )
                    ) === JSON.stringify(path))
              )
              .map((anchor) => ({
                start: anchor.start,
                end: Math.min(anchor.end, anchor.start + anchor.name.length),
              }));
          }
          sources.get(id)!.origin = {
            sourceId: originalId,
            ranges,
          };
        }
      }
    }
    return id;
  };
  const nodes: SearchNode[] = [];
  const total = graph.nodes.length + graph.edges.length + 1;
  onProgress?.(0, total);
  const rawNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const [index, node] of graph.nodes.entries()) {
    onProgress?.(index, total);
    if (index % 64 === 0) await yieldGraphSearch(signal);
    const kind = getKnowledgeGraphNodeKind(node);
    const sourceIds = new Set<string>();
    const add = (id?: string) => {
      if (id) sourceIds.add(id);
    };
    const external = kind === 'externalLink' || kind === 'connectedExternalLink';
    if (node.paragraphOccurrences?.length) {
      for (const paragraph of node.paragraphOccurrences)
        add(addSource(paragraph.origin || node.noteTitle, paragraph));
    } else if (!external) add(addSource(node.paragraph?.origin || node.noteTitle, node.paragraph));
    for (const source of node.keyword?.sources || node.keywordType?.sources || []) {
      const path = source.sectionPath || source.section.split(' / ').filter(Boolean);
      add(
        addSource(source.noteTitle, findParagraph(source.noteTitle, path), undefined, source.href)
      );
    }
    for (const title of node.template?.sourceTitles || []) add(addSource(title));
    // External nodes acquire accessible provenance from their reference edges below.
    if (
      !external &&
      kind !== 'builtInClass' &&
      kind !== 'templateGroup' &&
      kind !== 'keywordType' &&
      !sourceIds.size
    )
      continue;
    nodes.push({
      id: node.id,
      name: node.name,
      kind,
      typeLabel: getKnowledgeGraphNodeKindLabel(kind, translate, usageMode),
      noteTitle: [...sourceIds].map((id) => sources.get(id)?.title).find(Boolean) || '',
      body: Object.keys(node.properties || {}).length ? JSON.stringify(node.properties) : '',
      sourceIds: [...sourceIds],
      ...(external && node.description && { url: node.description }),
    });
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byCandidate = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const edges: SearchEdge[] = [];
  for (const [index, edge] of graph.edges.entries()) {
    onProgress?.(graph.nodes.length + index, total);
    if (index % 128 === 0) await yieldGraphSearch(signal);
    const source = byId.get(edge.source),
      target = byId.get(edge.target);
    if (!source || !target) continue;
    let sourceIds = source.sourceIds;
    const evidence: NonNullable<SearchEdge['evidence']> = [];
    if (edge.type === 'KEYWORD_RELATION' || edge.type === 'KEYWORD_TYPE_RELATION') {
      const evidenceSources = new Set<string>();
      const evidenceGroups: {
        candidate?: InductiveRelationCandidate;
        observations: RelationObservation[];
      }[] =
        edge.type === 'KEYWORD_TYPE_RELATION'
          ? [{ observations: edge.keywordTypeRelation?.evidence || [] }]
          : (
              edge.keywordRelation?.candidateIds || [edge.keywordRelation?.candidateId || '']
            ).flatMap((id) => {
              const candidate = byCandidate.get(id);
              return candidate ? [{ candidate, observations: candidate.observations }] : [];
            });
      for (const { candidate, observations } of evidenceGroups) {
        for (const [index, observation] of observations.entries()) {
          if (
            edge.keywordRelation?.associationContext &&
            candidate &&
            relationAssociationType({
              observation,
              measurement: candidate.measurements[index],
              associationContext: candidate.association?.context ?? candidate.associationContext,
            }) !== edge.keywordRelation.associationContext
          )
            continue;
          const originalSource = rawNodes.get(edge.source)?.name;
          const originalTarget = rawNodes.get(edge.target)?.name;
          if (
            edge.type === 'KEYWORD_RELATION' &&
            (!originalSource ||
              !originalTarget ||
              JSON.stringify(
                [observation.source, observation.target].map(relationKeywordKey).sort()
              ) !== JSON.stringify([originalSource, originalTarget].map(relationKeywordKey).sort()))
          )
            continue;
          const path = observation.sectionPath || observation.section.split(' / ').filter(Boolean);
          const id = addSource(
            observation.noteTitle,
            findParagraph(observation.noteTitle, path),
            observation.evidence
          );
          if (id && !evidenceSources.has(id)) {
            evidenceSources.add(id);
            evidence.push({ sourceId: id, start: 0, end: sources.get(id)!.text.length });
          }
        }
      }
      if (!evidenceSources.size) continue;
      sourceIds = [...evidenceSources];
    }
    if (
      edge.type === 'KEYWORD_SOURCE' ||
      edge.type === 'DERIVED_FROM' ||
      edge.type === 'REPRESENTED_BY_NOTE'
    )
      sourceIds = [...new Set([...sourceIds, ...target.sourceIds])];
    if (edge.type === 'EXTERNAL_REFERENCE') {
      if (!sourceIds.length) continue;
      target.sourceIds = [...new Set([...target.sourceIds, ...sourceIds])];
    }
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: getKnowledgeGraphRelationDisplayLabel(edge, translate),
      directed: edge.directed !== false,
      ...(edge.keywordRelation && { associationScore: edge.keywordRelation.score }),
      ...(edge.keywordTypeRelation && { associationScore: edge.keywordTypeRelation.score }),
      sourceIds,
      ...(evidence.length && { evidence }),
    });
  }
  // Resolving a reference may add another permitted note; Map iteration follows this closure once.
  for (const source of sources.values()) {
    resolveSourceReferences(source, (title) => {
      const id = addSource(title);
      return id ? sources.get(id) : undefined;
    });
    for (const metadata of [
      source.blocks,
      source.scopes,
      source.anchors,
      source.references,
      source.origin,
    ])
      graphSourceMetadataIdentity(metadata, true);
  }
  const keptNodes = nodes.filter((node) => !node.url || node.sourceIds.length);
  const ids = new Set(keptNodes.map((node) => node.id));
  const keptEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const usedSources = new Set<string>();
  for (const node of keptNodes) for (const id of node.sourceIds) usedSources.add(id);
  for (const edge of keptEdges) for (const id of edge.sourceIds) usedSources.add(id);
  for (const id of usedSources) {
    const origin = sources.get(id)?.origin;
    if (origin) usedSources.add(origin.sourceId);
    for (const reference of sources.get(id)?.references || [])
      for (const target of reference.targets || []) usedSources.add(target.sourceId);
  }
  const data = {
    version: 1 as const,
    scope,
    nodes: keptNodes,
    edges: keptEdges,
    sources: [...sources.values()].filter((source) => usedSources.has(source.id)),
    coverage,
  };
  const revision = await relationCacheHash(JSON.stringify(data));
  checkRelationCancelled(signal);
  onProgress?.(total, total);
  return { ...data, revision };
}

const normalize = (value: string) => value.normalize('NFC').toLowerCase();
const anchorName = (value: string) => normalize(value).trim().replace(/\s+/gu, '-');

/** Resolve notebook routes and Markdown file references inside the already permitted source inventory. */
function resolveSourceReferences(
  source: GraphSource,
  getSource: (title: string) => GraphSource | undefined
) {
  for (const reference of source.references || []) {
    let title: string | undefined;
    let paragraph: string | undefined;
    let section: string | undefined;
    let fragment = false;
    try {
      const base = new URL(
        '/' + source.title.split('/').map(encodeURIComponent).join('/') + '.md',
        typeof location === 'undefined' ? 'https://localhost/' : location.href
      );
      const target = new URL(reference.href, base);
      if (target.origin !== base.origin) continue;
      const relativeFile =
        !/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(reference.href) &&
        /\.(?:md|markdown)$/iu.test(target.pathname);
      title =
        target.searchParams.get('title') ||
        (relativeFile
          ? decodeURIComponent(target.pathname.slice(1)).replace(/\.(?:md|markdown)$/iu, '')
          : reference.href.startsWith('#')
          ? source.title
          : undefined);
      paragraph = target.hash
        ? decodeURIComponent(target.hash.slice(1))
        : target.searchParams.get('paragraph') || undefined;
      section = target.searchParams.get('section') || undefined;
      fragment = !!target.hash;
    } catch {
      continue;
    }
    if (!title) continue;
    reference.internal = true;
    const target = getSource(title);
    const scoped =
      target && paragraph
        ? (target.anchors || []).filter(
            (anchor) =>
              !section ||
              [anchor.section || '', ...(anchor.path || [])].some(
                (parent) => parent.normalize('NFC') === section!.normalize('NFC')
              )
          )
        : [];
    const exact = scoped.filter(
      (anchor) => anchor.name.normalize('NFC') === paragraph!.normalize('NFC')
    );
    const identities = exact.filter((anchor) => anchor.kind === (fragment ? 'id' : 'heading'));
    const matches = identities.length
      ? identities
      : exact.length
      ? exact
      : scoped.filter(
          (anchor) =>
            normalize(anchor.name) === normalize(paragraph!) ||
            anchorName(anchor.name) === normalize(paragraph!)
        );
    reference.targets = !target
      ? []
      : !paragraph
      ? [{ sourceId: target.id, start: 0, end: target.text.length }]
      : [
          ...new Map(
            (matches || []).map((anchor) => [
              anchor.start + ':' + anchor.end,
              { sourceId: target.id, start: anchor.start, end: anchor.end },
            ])
          ).values(),
        ];
    reference.unresolved = !reference.targets.length;
    if (!reference.unresolved)
      reference.resolvedHref =
        '?' +
        new URLSearchParams({
          title,
          ...(paragraph && { paragraph }),
          ...(section && { section }),
        }).toString();
  }
}
