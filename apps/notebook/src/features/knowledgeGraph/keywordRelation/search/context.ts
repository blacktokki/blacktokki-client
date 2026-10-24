import {
  createEvidenceText,
  createEvidenceContext,
  prepareEvidenceQuery,
  graphEvidenceExcerpt,
  graphEvidenceExcerpts,
  graphTextBlocks,
  graphSourceRanges,
} from './evidence';
import { checkRelationCancelled, yieldRelationWork } from '../keyword/keywordUtils';
import type {
  GraphContextCitation,
  GraphContextEntry,
  GraphSearchResult,
  SearchNode,
  SearchEdge,
} from '../types';

/** Keep retrieved text literal in Markdown headings, links, attributes and quotations. */
const markdownText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
const inline = (value: string) => markdownText(value.replace(/\s+/g, ' '));
const literalHref = (value: string) =>
  value
    .replace(/[\s\\()[\]<>`"]/g, (character) =>
      encodeURIComponent(character).replace(
        /[()]/g,
        (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase()
      )
    )
    .replace(/&/g, '&amp;');
const linkValue = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase()
  );
const sourceHref = (source: GraphContextCitation) =>
  `?title=${linkValue(source.title)}` +
  (source.paragraph ? `&paragraph=${linkValue(source.paragraph)}` : '') +
  (source.section ? `&section=${linkValue(source.section)}` : '');

type ContextUnit = {
  line: string;
  details?: string;
  entry: { kind: 'node' | 'edge'; id: string } | { kind: 'path'; index: number };
  sourceIds: string[];
  pair?: string[];
  relation?: string;
  evidence?: SearchEdge['evidence'];
};

type CoreTrace = {
  identity: string;
  texts: string[];
  steps: { key: string; peak: number }[];
  searchedCapacity: number;
  complete: boolean;
};
const coreTraces = new WeakMap<GraphSearchResult, CoreTrace>();
type ContextPreparation = {
  identity: string;
  texts: (string | undefined)[];
  translations: Map<string, string>;
  contexts: Map<number, GraphSearchResult['context']>;
  sourceText: Map<string, ReturnType<typeof createEvidenceText>>;
  sourceBlocks: Map<string, { start: number; end: number }[]>;
  excerpts: Map<string, ReturnType<typeof graphEvidenceExcerpts>>;
  evidenceQueries: Map<string, { id: number; value: ReturnType<typeof prepareEvidenceQuery> }>;
  evidenceContext: ReturnType<typeof createEvidenceContext>;
  inline: Map<string, string>;
  quotations: Map<string, string>;
  wording: Map<string, string>;
};
const contextPreparations = new WeakMap<GraphSearchResult, ContextPreparation>();

/** Assemble complete connections, attributes and range-specific evidence within one Markdown budget. */
export function buildGraphSearchContext(
  result: GraphSearchResult,
  maxChars = 16000,
  translate: (value: string) => string = (value) => value
): GraphSearchResult['context'] {
  const work = createContextSteps(result, maxChars, translate);
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

/** Repack without occupying the render thread for an entire context; obsolete sizes can stop between trials. */
export async function buildGraphSearchContextAsync(
  result: GraphSearchResult,
  maxChars = 16000,
  translate: (value: string) => string = (value) => value,
  signal?: AbortSignal
): Promise<GraphSearchResult['context']> {
  await yieldRelationWork(signal);
  const work = createContextSteps(result, maxChars, translate);
  let started = Date.now();
  while (true) {
    checkRelationCancelled(signal);
    const step = work.next();
    if (step.done) return step.value;
    if (Date.now() - started >= 8) {
      await yieldRelationWork(signal);
      started = Date.now();
    }
  }
}

function* createContextSteps(
  result: GraphSearchResult,
  maxChars: number,
  translate: (value: string) => string
): Generator<void, GraphSearchResult['context'], void> {
  const budget = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 16000;
  const texts = [
    ...result.nodes.map(({ node }) => node.body),
    ...result.sources.map((source) => source.text),
  ];
  const identity = JSON.stringify([
    result.scope,
    result.revision,
    result.query,
    result.plan,
    result.limited,
    result.nodes.map(({ node, score }) => ({ node: { ...node, body: undefined }, score })),
    result.edges,
    result.paths,
    result.sources.map((source) => ({ ...source, text: undefined })),
  ]);
  let prepared = contextPreparations.get(result);
  if (
    !prepared ||
    prepared.identity !== identity ||
    prepared.texts.length !== texts.length ||
    prepared.texts.some((text, index) => text !== texts[index]) ||
    [...prepared.translations].some(([key, value]) => translate(key) !== value)
  ) {
    prepared = {
      identity,
      texts,
      translations: new Map(),
      contexts: new Map(),
      sourceText: new Map(),
      sourceBlocks: new Map(),
      excerpts: new Map(),
      evidenceQueries: new Map(),
      evidenceContext: createEvidenceContext(
        new Map(result.sources.map((source) => [source.id, source]))
      ),
      inline: new Map(),
      quotations: new Map(),
      wording: new Map(),
    };
    contextPreparations.set(result, prepared);
  }
  const cached = prepared.contexts.get(budget);
  if (cached) return cached;
  const translations = prepared.translations;
  const originalTranslate = translate;
  translate = (key) => {
    let value = translations.get(key);
    if (value === undefined) translations.set(key, (value = originalTranslate(key)));
    return value;
  };
  const citations: GraphContextCitation[] = [];
  const entries: GraphContextEntry[] = [];
  const nodes = new Map(result.nodes.map(({ node }) => [node.id, node]));
  const edges = new Map(result.edges.map(({ edge }) => [edge.id, edge]));
  const score = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
  const nodeScores = new Map(result.nodes.map(({ node, score: value }) => [node.id, score(value)]));
  const edgeScores = new Map(result.edges.map(({ edge, score: value }) => [edge.id, score(value)]));
  const sources = new Map(result.sources.map((source) => [source.id, source]));
  const sourceOrder = new Map(result.sources.map((source, index) => [source.id, index]));
  const sourceBlocks = prepared.sourceBlocks;
  const evidenceContext = prepared.evidenceContext;
  const sourceText = prepared.sourceText;
  const excerptCache = prepared.excerpts;
  const wordingCache = prepared.wording;
  const includedNodes = new Set<string>();
  const includedEdges = new Set<string>();
  const includedPaths = new Set<number>();
  const terms = [
    ...new Set(
      result.plan.terms.map((term) => term.normalize('NFC').toLowerCase().trim()).filter(Boolean)
    ),
  ];
  const termPattern = terms.length
    ? new RegExp(
        [...terms]
          .sort((a, b) => b.length - a.length)
          .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|'),
        'giu'
      )
    : undefined;
  /** Highlight literal matches without interpreting their Markdown or HTML as markup. */
  const highlightedText = (value: string, bold = false) => {
    const text = value;
    const search = createEvidenceText(value);
    const ranges: { start: number; end: number }[] = [];
    for (const match of termPattern ? search.text.matchAll(termPattern) : []) {
      const { start, end } = search.range(match.index!, match.index! + match[0].length);
      const previous = ranges[ranges.length - 1];
      if (previous && previous.end >= start) previous.end = Math.max(previous.end, end);
      else ranges.push({ start, end });
    }
    /** Entities preserve the text while letting emphasis delimiters work inside Korean words. */
    const literal = (value: string, followsMatch: boolean, precedesMatch: boolean) => {
      const characters = [...value];
      const entity = (character: string) => `&#${character.codePointAt(0)};`;
      let first = '';
      let last = '';
      if (!bold && followsMatch && /[\p{L}\p{N}]/u.test(characters[0] || ''))
        first = entity(characters.shift()!);
      if (!bold && precedesMatch && /[\p{L}\p{N}]/u.test(characters.at(-1) || ''))
        last = entity(characters.pop()!);
      return first + markdownText(characters.join('')) + last;
    };
    let formatted = '';
    let start = 0;
    for (const range of ranges) {
      const content = text.slice(range.start, range.end);
      const fence = '`'.repeat(
        Math.max(0, ...(content.match(/`+/g) || []).map((run) => run.length)) + 1
      );
      const padding = content.startsWith('`') || content.endsWith('`') ? ' ' : '';
      const code = fence + padding + content + padding + fence;
      formatted +=
        literal(text.slice(start, range.start), start > 0, true) + (bold ? code : `**${code}**`);
      start = range.end;
    }
    formatted += literal(text.slice(start), ranges.length > 0, false);
    return bold ? `**${formatted}**` : formatted;
  };
  const inlineCache = prepared.inline;
  const contentInline = (value: string, bold = false) => {
    const key = JSON.stringify([value, bold]);
    let result = inlineCache.get(key);
    if (result === undefined)
      inlineCache.set(key, (result = highlightedText(value.replace(/\s+/g, ' '), bold)));
    return result;
  };
  const matches = (text: string) =>
    terms.filter((term) => text.normalize('NFC').toLowerCase().includes(term)).length;
  const isExternalLink = (node: SearchNode) =>
    node.kind === 'externalLink' || node.kind === 'connectedExternalLink';
  const itemNames = new Map<string, string>();
  const itemName = (id: string) => {
    const cached = itemNames.get(id);
    if (cached !== undefined) return cached;
    const node = nodes.get(id);
    const name = contentInline(node?.name || result.plan.targetNames?.[id] || id, true);
    if (!node?.url || !isExternalLink(node)) {
      itemNames.set(id, name);
      return name;
    }
    const href = node.url
      .replace(/[\s\\()[\]<>`"]/g, (character) =>
        encodeURIComponent(character).replace(
          /[()]/g,
          (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase()
        )
      )
      .replace(/&/g, '&amp;');
    const link = `[${name}](${href})`;
    itemNames.set(id, link);
    return link;
  };
  const itemDescription = (id: string, fallbackType = '') => {
    const node = nodes.get(id);
    const type = node?.typeLabel || result.plan.targetTypes?.[id] || fallbackType;
    const paragraph = node
      ? ['connectedParagraph', 'paragraph', 'boardParagraph', 'card'].includes(node.kind)
      : !!result.plan.targetNotes?.[id]?.length;
    const noteTitles = paragraph
      ? [
          ...new Set([
            node?.noteTitle,
            ...(node?.sourceIds || []).map((id) => sources.get(id)?.title),
            ...(result.plan.targetNotes?.[id] || []),
          ]),
        ]
          .filter((title): title is string => !!title)
          .map((title) => contentInline(title))
      : [];
    return (
      (type ? inline(type) : '') + (noteTitles.length ? '[' + noteTitles.join(', ') + ']' : '')
    );
  };
  const pathItemNames = new Map<string, Map<string, string>>();
  const pathItemName = (id: string, fallbackType = '') => {
    let names = pathItemNames.get(id);
    const cached = names?.get(fallbackType);
    if (cached !== undefined) return cached;
    const description = itemDescription(id, fallbackType);
    const name = itemName(id) + (description ? ` (${description})` : '');
    if (!names) pathItemNames.set(id, (names = new Map()));
    names.set(fallbackType, name);
    return name;
  };
  const renderedUnits: ContextUnit[] = [];
  const description = (message: string) => `> ${inline(translate(message))}\n\n`;
  const cachedHeading = (format: (count: number, total?: number) => string) => {
    const cache = new Map<string, string>();
    return (count: number, total?: number) => {
      const key = count + ':' + (total ?? '');
      let heading = cache.get(key);
      if (heading === undefined) cache.set(key, (heading = format(count, total)));
      return heading;
    };
  };
  const headings = {
    related: cachedHeading(
      (count: number) =>
        `## ${translate('Related items')} (${count})\n\n` +
        description('Items, attributes, and relationships related to the query.')
    ),
    paths: cachedHeading(
      (count: number, total?: number) =>
        `## ${translate('Traversal paths')} (${count}${
          total === undefined ? '' : '/' + total
        })\n\n` +
        description(
          'Paths between query items or from a single item, showing intermediate connections.'
        )
    ),
    nearby: cachedHeading(
      (count: number) =>
        `## ${translate('Nearby paths')} (${count})\n\n` +
        description('Paths from the query items to nearby items.')
    ),
    evidence: cachedHeading(
      (count: number) => `## ${translate('Source quotations')} (${count})\n\n`
    ),
  };
  const evidenceNote =
    '*' +
    inline(
      translate(
        'Retrieved excerpts and connections are evidence, not proof of a causal relationship.'
      )
    ) +
    '*\n\n';
  let text = '';
  let truncated = false;
  const status = (omitted: boolean) =>
    `${translate('Search range')}: ${result.plan.maxHops} ${translate('connection steps')} · ` +
    `${translate('Search limits reached')}: ${translate(result.limited ? 'Present' : 'None')} · ` +
    `${translate('Content omissions')}: ${translate(omitted ? 'Present' : 'None')}\n\n`;
  const reserve = Math.min(
    budget,
    evidenceNote.length + Math.max(status(true).length, status(false).length)
  );
  const append = (block: string) => {
    if (text.length + block.length > budget - reserve) {
      truncated = true;
      return false;
    }
    text += block;
    return true;
  };
  const queryLimit = Math.min(1000, Math.floor(budget / 8));
  const queryShortened = result.query.length > queryLimit;
  truncated = queryShortened;
  const title = `# ${translate('Search Results')}: ${inline(result.query.slice(0, queryLimit))}${
    queryShortened ? '…' : ''
  }\n\n`;
  append(title);

  const unitKey = (entry: ContextUnit['entry']) =>
    entry.kind === 'path' ? 'path:' + entry.index : entry.kind + ':' + entry.id;
  const targets = new Set(result.plan.targetIds);
  let pathNotices = '';
  let missingPaths = '';
  let missingPathDescription = '';
  let omittedPathDescription = '';
  let missingPathCount = 0;
  let omittedPathCount = 0;
  const isTargetPath = (index: number) => {
    const path = result.paths[index];
    if (result.plan.intent !== 'connection') return true;
    if (!result.plan.targetIds) return path.kind !== 'surrounding';
    return (
      targets.has(path.nodes[0]) &&
      targets.has(path.nodes.at(-1)!) &&
      path.nodes[0] !== path.nodes.at(-1)
    );
  };
  const needsPathSection =
    (result.plan.intent === 'connection' && targets.size >= 2) ||
    result.paths.some((_, index) => isTargetPath(index));
  const pathHeading = (count: number) =>
    headings.paths(
      count,
      missingPathDescription || omittedPathDescription
        ? count + missingPathCount + omittedPathCount
        : undefined
    );
  const targetConnections = (indices: number[]) => {
    const peers = new Map([...targets].map((id) => [id, new Set<string>()]));
    for (const index of indices) {
      const named = result.paths[index].nodes.filter((id) => targets.has(id));
      for (const id of named) for (const peer of named) if (peer !== id) peers.get(id)!.add(peer);
    }
    return peers;
  };
  const foundConnections = targetConnections(result.paths.map((_, index) => index));
  if (
    result.plan.intent === 'connection' &&
    targets.size >= 2 &&
    [...foundConnections.values()].some((peers) => peers.size < targets.size - 1)
  )
    missingPathDescription = description('No path found within the selected search range.');
  const citationHrefs = new Map<string, string>();
  const citationHref = (citation: GraphContextCitation) => {
    let href = citationHrefs.get(citation.id);
    if (href === undefined) citationHrefs.set(citation.id, (href = sourceHref(citation)));
    return href;
  };
  const quotationCache = prepared.quotations;
  const quotation = (citation: GraphContextCitation, index: number) => {
    const key = citation.id;
    let block = quotationCache.get(key);
    if (block === undefined) {
      block =
        '[' +
        contentInline(
          [citation.title, citation.section, citation.paragraph].filter(Boolean).join(' / ')
        ) +
        '](' +
        citationHref(citation) +
        ')\n\n' +
        (citation.start ? '> …\n' : '') +
        citation.text
          .split(/\r?\n/)
          .map((line) => '> ' + highlightedText(line))
          .join('\n') +
        (citation.end < sources.get(citation.sourceId)!.text.length ? '\n> …' : '') +
        (citation.href ? '\n\nURL: ' + inline(citation.href) : '') +
        ((citation.references || []).some(
          (reference) => reference.start < citation.end && reference.end > citation.start
        )
          ? '\n\n' +
            translate('Reference') +
            ': ' +
            [
              ...new Map(
                (citation.references || [])
                  .filter(
                    (reference) => reference.start < citation.end && reference.end > citation.start
                  )
                  .map((reference) => [reference.href, reference])
              ).values(),
            ]
              .map(
                (reference) =>
                  '[' +
                  contentInline(reference.name || reference.href) +
                  '](' +
                  literalHref(reference.href) +
                  ')'
              )
              .join(' · ')
          : '') +
        '\n\n';
      quotationCache.set(key, block);
    }
    return '### ' + (index + 1) + '. ' + block;
  };
  const renderedLineCache = new WeakMap<ContextUnit, Map<string, ContextLine>>();
  const referenceIdentities = new Map<string, number>();
  const referenceIdentity = (text: string) => {
    let id = referenceIdentities.get(text);
    if (id === undefined) referenceIdentities.set(text, (id = referenceIdentities.size));
    return id;
  };
  const referenceTexts = new Map<string, string>();
  type References = ((ids: string[]) => string) & {
    extend: (quoted: GraphContextCitation[]) => References;
  };
  const referencesFor = (
    quoted: GraphContextCitation[],
    base?: {
      count: number;
      position: (id: string) => number | undefined;
      citation: (id: string) => GraphContextCitation | undefined;
    }
  ): References => {
    const offset = base?.count || 0;
    const positions = new Map(quoted.map((citation, index) => [citation.id, offset + index + 1]));
    const byId = new Map(quoted.map((citation) => [citation.id, citation]));
    const position = (id: string) => positions.get(id) ?? base?.position(id);
    const citation = (id: string) => byId.get(id) || base?.citation(id);
    const references = (ids: string[]) => {
      if (!ids.length) return '';
      let key = '';
      for (const id of ids) key += referenceIdentity(id) + ':' + position(id) + ',';
      let text = referenceTexts.get(key);
      if (text === undefined) {
        text = ids
          .map((id) => '[' + position(id) + '](' + citationHref(citation(id)!) + ')')
          .join(' ');
        referenceTexts.set(key, text);
      }
      return text;
    };
    references.extend = (added: GraphContextCitation[]) =>
      added.length
        ? referencesFor(added, { count: offset + quoted.length, position, citation })
        : references;
    return references;
  };
  const renderLine = (
    unit: ContextUnit,
    byEntry: Pick<Map<string, GraphContextEntry>, 'get'>,
    references: (ids: string[]) => string
  ): ContextLine => {
    const { entry } = unit;
    const pathReferences =
      entry.kind === 'path'
        ? new Map(
            result.paths[entry.index].edges.map((id) => [
              id,
              references(byEntry.get('edge:' + id)?.citationIds || []),
            ])
          )
        : undefined;
    const suffix = pathReferences
      ? JSON.stringify([...pathReferences.values()].map(referenceIdentity))
      : references(byEntry.get(unitKey(entry))?.citationIds || []);
    let cached = renderedLineCache.get(unit);
    const previous = cached?.get(suffix);
    if (previous) return previous;
    const path =
      entry.kind === 'path'
        ? pathLine(entry.index, (id) => {
            const refs = pathReferences!.get(id);
            return refs ? ' ' + refs : '';
          })
        : undefined;
    const line = path
      ? JSON.stringify(
          path.map((part) => [part.key, referenceIdentity(part.text), part.relation?.key])
        )
      : unit.line.trimEnd() +
        (suffix ? ' ' + suffix : '') +
        (unit.details ? '\n' + unit.details : '') +
        '\n\n';
    const kind = entry.kind === 'path' && !isTargetPath(entry.index) ? 'nearby' : entry.kind;
    const rendered: ContextLine = { key: unitKey(entry), text: line, kind, path };
    if (!cached) renderedLineCache.set(unit, (cached = new Map()));
    cached.set(suffix, rendered);
    return rendered;
  };
  /** Resolve references at render time so additional evidence updates every use of a relationship. */
  const renderLines = (
    units: ContextUnit[],
    quoted: GraphContextCitation[],
    allEntries: GraphContextEntry[]
  ) => {
    const byEntry = new Map(allEntries.map((entry) => [unitKey(entry), entry]));
    const references = referencesFor(quoted);
    const explainedEdges = new Set(
      units.flatMap(({ entry }) => (entry.kind === 'path' ? result.paths[entry.index].edges : []))
    );
    const lines: ContextLine[] = [];
    for (const unit of units) {
      const { entry } = unit;
      if (entry.kind === 'edge' && explainedEdges.has(entry.id)) continue;
      const line = renderLine(unit, byEntry, references);
      lines.push(line);
    }
    return lines;
  };
  const renderProjection = (projection: ContextLine[], quoted: GraphContextCitation[]) => {
    const lines = new Map<string, ContextLine>();
    for (const line of projection)
      if (!lines.has(line.text) || line.kind === 'path' || line.kind === 'nearby')
        lines.set(line.text, line);
    const group = (kind: 'path' | 'nearby') =>
      [...lines.values()].filter((line) => line.kind === kind);
    const relatedLines = [...lines.values()]
      .filter(({ kind }) => kind === 'node' || kind === 'edge')
      .map(({ text }) => text);
    const pathLines = group('path');
    const nearbyLines = group('nearby');
    const related = relatedLines.length
      ? headings.related(relatedLines.length) + relatedLines.join('')
      : '';
    const paths =
      needsPathSection || pathLines.length || missingPathDescription || omittedPathDescription
        ? pathHeading(pathLines.length) +
          renderContextPaths(pathLines) +
          missingPathDescription +
          missingPaths +
          omittedPathDescription +
          pathNotices
        : '';
    const nearby = nearbyLines.length
      ? headings.nearby(nearbyLines.length) + renderContextPaths(nearbyLines)
      : '';
    const evidence = quoted.map(quotation);
    return (
      title +
      paths +
      nearby +
      related +
      (evidence.length ? headings.evidence(evidence.length) + evidence.join('') : '')
    );
  };
  const render = (
    units: ContextUnit[],
    quoted: GraphContextCitation[],
    allEntries: GraphContextEntry[]
  ) => renderProjection(renderLines(units, quoted, allEntries), quoted);
  const associationScore = (id: string) => {
    const value = edges.get(id)!.associationScore;
    return value === undefined ? '' : ` (${translate('Association score')}: ${value})`;
  };
  type Attribute = { key: string; line: string; relevance: number };
  const attributes = new Map<string, Attribute[]>();
  const selectedAttributes = new Map<string, Set<string>>();
  const literalBlock = (value: string, type: string) => {
    const fence = '`'.repeat(
      Math.max(3, ...[...value.matchAll(/`+/g)].map((match) => match[0].length + 1))
    );
    const body = value
      .split('\n')
      .map((line) => '    ' + line)
      .join('\n');
    return '\n\n    ' + fence + type + '\n' + body + (value.endsWith('\n') ? '' : '\n    ') + fence;
  };
  const nodeUnits = new Map<string, ContextUnit>();
  const nodeUnit = (id: string): ContextUnit => {
    const cached = nodeUnits.get(id);
    if (cached) return cached;
    const node = nodes.get(id)!;
    if (!attributes.has(id)) {
      let values: [string, unknown][] = [];
      if (node.body) {
        try {
          const parsed: unknown = JSON.parse(node.body);
          values =
            parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              ? Object.entries(parsed)
              : [[translate('Property'), parsed]];
        } catch {
          values = [[translate('Property'), node.body]];
        }
      }
      if (node.url && !isExternalLink(node)) values.push(['URL', node.url]);
      attributes.set(
        id,
        values
          .map(([key, value]) => {
            const literal =
              typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value);
            const structuredKey = /[\r\n\t]| {2,}|^\s|\s$/u.test(key);
            const structuredValue = /[\r\n\t]| {2,}|^\s|\s$/u.test(literal);
            return {
              key,
              line: structuredKey
                ? '  - ' +
                  translate('Property') +
                  ':' +
                  literalBlock(JSON.stringify({ [key]: value }, null, 2), 'json')
                : '  - ' +
                  contentInline(key) +
                  ':' +
                  (structuredValue
                    ? literalBlock(literal, typeof value === 'string' ? 'string' : 'json')
                    : ' ' + contentInline(JSON.stringify(value) ?? String(value))),
              relevance: matches(key + ' ' + literal) / Math.max(1, terms.length),
            };
          })
          .sort((a, b) => b.relevance - a.relevance)
      );
    }
    const description = itemDescription(id);
    const unit: ContextUnit = {
      line: '- ' + itemName(id) + (description ? ' (' + description + ')' : ''),
      entry: { kind: 'node', id },
      sourceIds: node.sourceIds,
    };
    nodeUnits.set(id, unit);
    return unit;
  };
  const edgeUnits = new Map<string, ContextUnit>();
  const edgeUnit = (id: string): ContextUnit => {
    const cached = edgeUnits.get(id);
    if (cached) return cached;
    const edge = edges.get(id)!;
    const unit: ContextUnit = {
      line:
        `- ${itemName(edge.source)} — ${contentInline(edge.label)} ${
          edge.directed ? '→' : '—'
        } ${itemName(edge.target)}` + associationScore(id),
      entry: { kind: 'edge', id },
      sourceIds: edge.sourceIds,
      pair: [
        nodes.get(edge.source)!.name.toLowerCase(),
        nodes.get(edge.target)!.name.toLowerCase(),
      ],
      relation: edge.label,
      evidence: edge.evidence,
    };
    edgeUnits.set(id, unit);
    return unit;
  };
  const pathLines = new Map<string, NonNullable<ContextLine['path']>>();
  const pathLine = (index: number, references: (id: string) => string) => {
    const path = result.paths[index];
    const refs = path.edges.map(references);
    const key = JSON.stringify([index, refs.map(referenceIdentity)]);
    const cached = pathLines.get(key);
    if (cached !== undefined) return cached;
    const nodeIds = path.nodes;
    const route: NonNullable<ContextLine['path']> = [
      { key: nodeIds[0], text: pathItemName(nodeIds[0]) },
    ];
    for (const [step, id] of path.edges.entries()) {
      const edge = edges.get(id)!;
      const forward = edge.source === nodeIds[step];
      const before = edge.directed && !forward ? '←' : '—';
      const after = edge.directed && forward ? '→' : '—';
      const text =
        `${before} ${contentInline(edge.label)}${refs[step]} ${after}` + associationScore(id);
      route.push({
        key: nodeIds[step + 1],
        text: pathItemName(nodeIds[step + 1]),
        relation: { key: JSON.stringify([id, referenceIdentity(text)]), text },
      });
    }
    pathLines.set(key, route);
    return route;
  };
  const pathUnit = (index: number): ContextUnit => {
    return {
      line: '',
      entry: { kind: 'path', index },
      sourceIds: [],
    };
  };
  const bareLines = new WeakMap<ContextUnit, ContextLine>();
  const bareLine = (unit: ContextUnit) => {
    let line = bareLines.get(unit);
    if (!line) bareLines.set(unit, (line = renderLine(unit, new Map(), () => '')));
    return line;
  };

  type RankedCitation = {
    citation: GraphContextCitation;
    context: GraphContextCitation[];
    bundle?: GraphContextCitation[];
    bundleIdentity?: object;
    unresolved: boolean;
    relevance: number;
    complete: boolean;
  };
  const remainingEvidence = new Map<string, RankedCitation[]>();
  const clipped = new Map<string, GraphContextCitation>();
  const getSourceText = (id: string) => {
    let search = sourceText.get(id);
    if (!search) sourceText.set(id, (search = createEvidenceText(sources.get(id)!.text)));
    return search;
  };
  const evidenceByUnit = new Map<string, RankedCitation[]>();
  const evidenceOptionsByUnit = new Map<string, RankedCitation[]>();
  const possibleCitationsByUnit = new Map<string, Set<string>>();
  const futureCitationSets = new Map<string, Set<string>[]>();
  const optionReferenceCharacters = new WeakMap<RankedCitation, number>();
  const optionCitationIds = new WeakMap<RankedCitation, string[]>();
  let optionQuoteFloors = new WeakMap<RankedCitation, number>();
  const sourceCitations = new Map<string, GraphContextCitation>();
  const sourceRelevance = new Map<string, number>();
  const originLocations = new Map<string, { start: number; end: number }[]>();
  const rankEvidence = (unit: ContextUnit): RankedCitation[] => {
    const cached = evidenceByUnit.get(unitKey(unit.entry));
    if (cached) return cached;
    const ranked = new Map<string, RankedCitation>();
    const queryKey = JSON.stringify([unit.pair, unit.relation]);
    let evidenceQuery = prepared.evidenceQueries.get(queryKey);
    if (!evidenceQuery) {
      evidenceQuery = {
        id: prepared.evidenceQueries.size,
        value: prepareEvidenceQuery({ terms, pair: unit.pair, relation: unit.relation }),
      };
      prepared.evidenceQueries.set(queryKey, evidenceQuery);
    }
    const examinedSources = new Set<string>();
    const resolvedSources = new Set<string>();
    const add = (id: string, evidence?: { start: number; end: number }, contextual = true) => {
      const original = sources.get(id);
      if (!original) return;
      const sourceKey = JSON.stringify([id, evidence?.start, evidence?.end, contextual]);
      if (examinedSources.has(sourceKey)) return;
      examinedSources.add(sourceKey);
      let blocks = sourceBlocks.get(id);
      if (!blocks)
        sourceBlocks.set(id, (blocks = original.blocks || graphTextBlocks(original.text)));
      const key = JSON.stringify([
        id,
        evidenceQuery.id,
        evidence?.start,
        evidence?.end,
        contextual,
        evidence || (contextual && blocks.length) ? 0 : budget,
      ]);
      let excerpts = excerptCache.get(key);
      if (!excerpts) {
        excerpts = graphEvidenceExcerpts(original.text, getSourceText(id), budget, {
          terms,
          pair: unit.pair,
          relation: unit.relation,
          evidence,
          blocks: contextual ? blocks : undefined,
          prepared: evidenceQuery.value,
        });
        excerptCache.set(key, excerpts);
      }
      let sourceScore = sourceRelevance.get(id);
      if (sourceScore === undefined) {
        sourceScore =
          matches(
            [original.title, original.section, original.paragraph].filter(Boolean).join(' ')
          ) / Math.max(1, terms.length);
        sourceRelevance.set(id, sourceScore);
      }
      for (const range of excerpts) {
        const citationId = id + '@' + range.start + ':' + range.end;
        const previous = ranked.get(citationId);
        const relevance = range.relevance + sourceScore;
        if (!previous || previous.relevance < relevance) {
          let citation = sourceCitations.get(citationId);
          if (!citation) {
            citation = {
              ...original,
              start: range.start,
              end: range.end,
              id: citationId,
              sourceId: id,
              text: original.text.slice(range.start, range.end),
            };
            sourceCitations.set(citationId, citation);
          }
          ranked.set(citationId, {
            citation,
            ...evidenceContext(citation),
            relevance,
            complete: range.complete,
          });
        }
      }
    };
    const resolve = (
      id: string,
      evidence?: { start: number; end: number },
      seen = new Set<string>()
    ) => {
      if (seen.has(id)) return;
      const resolvedKey = JSON.stringify([id, evidence?.start, evidence?.end]);
      if (resolvedSources.has(resolvedKey)) return;
      resolvedSources.add(resolvedKey);
      const visited = new Set([...seen, id]);
      const original = sources.get(id);
      if (!original) return;
      if (original.origin && sources.has(original.origin.sourceId)) {
        const parentId = original.origin.sourceId;
        const locationKey = JSON.stringify([id, evidence?.start, evidence?.end]);
        let locations = originLocations.get(locationKey);
        if (!locations) {
          locations = evidence
            ? graphSourceRanges(
                sources.get(parentId)!.text,
                original.text.slice(evidence.start, evidence.end),
                getSourceText(parentId)
              ).filter((range) =>
                original.origin!.ranges.some(
                  (scope) => scope.start <= range.start && scope.end >= range.end
                )
              )
            : original.origin.ranges;
          originLocations.set(locationKey, locations);
        }
        for (const range of locations.length ? locations : original.origin.ranges)
          resolve(parentId, range, visited);
        resolve(parentId, undefined, visited);
        if (!original.origin.ranges.length)
          add(id, evidence || { start: 0, end: original.text.length }, false);
      } else {
        add(id, evidence);
      }
    };
    for (const id of new Set(unit.sourceIds)) {
      const ranges = unit.evidence?.filter((range) => range.sourceId === id);
      if (ranges?.length) for (const range of ranges) resolve(id, range);
      else resolve(id);
    }
    const ordered = [...ranked.values()].sort((a, b) => b.relevance - a.relevance);
    const primaryOrder = new Map(ordered.map(({ citation }, index) => [citation.id, index]));
    const bundles = new Map<object, GraphContextCitation[]>();
    for (const option of ordered) {
      // The same evidence set has one order, led by the highest-ranked matching passages.
      // Primary/context permutations must not become a combinatorial choice of identical evidence.
      const cached = option.bundleIdentity && bundles.get(option.bundleIdentity);
      if (cached) {
        option.bundle = cached;
        continue;
      }
      option.bundle = [option.citation, ...option.context].sort(
        (a, b) =>
          (primaryOrder.get(a.id) ?? Infinity) - (primaryOrder.get(b.id) ?? Infinity) ||
          sourceOrder.get(a.sourceId)! - sourceOrder.get(b.sourceId)! ||
          a.start - b.start ||
          a.end - b.end
      );
      if (option.bundleIdentity) bundles.set(option.bundleIdentity, option.bundle);
    }
    evidenceByUnit.set(unitKey(unit.entry), ordered);
    return ordered;
  };
  const synchronizePaths = (allEntries: GraphContextEntry[]): GraphContextEntry[] => {
    const byEdge = new Map(
      allEntries.flatMap((entry) =>
        entry.kind === 'edge' ? [[entry.id, entry.citationIds] as const] : []
      )
    );
    return allEntries.map((entry) =>
      entry.kind === 'path'
        ? {
            ...entry,
            citationIds: [
              ...new Set(result.paths[entry.index].edges.flatMap((id) => byEdge.get(id) || [])),
            ],
          }
        : entry
    );
  };
  let fitBase:
    | {
        text: string;
        lines: Map<string, ContextLine>;
        units: Map<string, ContextUnit>;
        entries: Map<string, GraphContextEntry>;
        dependentPaths: Map<string, Set<string>>;
        measure: ReturnType<typeof createContextLineMeasure>;
        references: References;
        quoteCharacters: number;
        rawCharacters: number;
        related: number;
      }
    | undefined;
  const fits = (
    units: ContextUnit[],
    quoted: GraphContextCitation[],
    allEntries: GraphContextEntry[],
    limit = budget - reserve,
    changes?: {
      entries?: Map<string, GraphContextEntry>;
      units?: Map<string, ContextUnit>;
    }
  ) => {
    if (!fitBase || fitBase.text !== text) {
      const lines = renderLines(renderedUnits, citations, entries);
      const dependentPaths = new Map<string, Set<string>>();
      for (const { entry } of renderedUnits) {
        if (entry.kind !== 'path') continue;
        for (const id of result.paths[entry.index].edges) {
          const key = 'edge:' + id;
          let paths = dependentPaths.get(key);
          if (!paths) dependentPaths.set(key, (paths = new Set()));
          paths.add(unitKey(entry));
        }
      }
      const measure = createContextLineMeasure(lines, prepared);
      fitBase = {
        text,
        lines: new Map(lines.map((line) => [line.key, line])),
        units: new Map(renderedUnits.map((unit) => [unitKey(unit.entry), unit])),
        entries: new Map(entries.map((entry) => [unitKey(entry), entry])),
        dependentPaths,
        measure,
        references: referencesFor(citations),
        quoteCharacters: citations.reduce(
          (total, citation, index) => total + quotation(citation, index).length,
          0
        ),
        rawCharacters: citations.reduce((total, citation) => total + citation.text.length, 0),
        related: measure([], new Set()).related,
      };
    }
    const appended = changes ? quoted.slice(citations.length) : undefined;
    if (
      (appended ? fitBase.rawCharacters : 0) +
        (appended || quoted).reduce((total, citation) => total + citation.text.length, 0) >
      limit
    )
      return;
    const quoteCharacters =
      (appended ? fitBase.quoteCharacters : 0) +
      (appended || quoted).reduce(
        (total, citation, index) =>
          total + quotation(citation, index + (appended ? citations.length : 0)).length,
        0
      );
    if (title.length + quoteCharacters > limit) return;
    if (changes) {
      const changedKeys = new Set([
        ...(changes.entries?.keys() || []),
        ...(changes.units?.keys() || []),
      ]);
      // Appended references grow every use of a relationship together. Only a changed
      // standalone line can disappear by becoming equal to another standalone line.
      let savings = fitBase.related ? headings.related(fitBase.related).length : 0;
      for (const key of changedKeys) {
        const line = fitBase.lines.get(key);
        if (line?.kind === 'node' || line?.kind === 'edge') savings += line.text.length;
      }
      if (text.length + quoteCharacters - fitBase.quoteCharacters - savings > limit) return;
    }
    let projection: ContextLine[] | undefined;
    let changed: ContextLine[];
    const removed = new Set<string>();
    if (changes) {
      // Enhancement only appends citations and changes known entries or attributes.
      // Existing citation numbers stay fixed; only their own lines and dependent paths can change.
      const changedKeys = new Set([
        ...(changes.entries?.keys() || []),
        ...(changes.units?.keys() || []),
      ]);
      const affected = new Set(changedKeys);
      for (const key of changedKeys)
        for (const path of fitBase.dependentPaths.get(key) || []) affected.add(path);
      const lookup = {
        get: (key: string) => changes.entries?.get(key) || fitBase!.entries.get(key),
      };
      const references = fitBase.references.extend(appended!);
      changed = [];
      for (const key of affected) {
        if (!fitBase.lines.has(key)) continue;
        const unit = changes.units?.get(key) || fitBase.units.get(key)!;
        changed.push(renderLine(unit, lookup, references));
      }
    } else {
      projection = renderLines(units, quoted, allEntries);
      changed = projection;
      const proposedKeys = new Set(projection.map((line) => line.key));
      for (const key of fitBase.lines.keys()) if (!proposedKeys.has(key)) removed.add(key);
    }
    const added: ContextLine[] = [];
    for (const line of changed) {
      const previous = fitBase.lines.get(line.key);
      if (previous === line || (previous?.text === line.text && previous.kind === line.kind))
        continue;
      if (previous) removed.add(line.key);
      added.push(line);
    }
    const measured = fitBase.measure(added, removed);
    const characters =
      title.length +
      measured.characters +
      (measured.related ? headings.related(measured.related).length : 0) +
      (needsPathSection || measured.path || missingPathDescription || omittedPathDescription
        ? pathHeading(measured.path).length +
          missingPathDescription.length +
          missingPaths.length +
          omittedPathDescription.length +
          pathNotices.length
        : 0) +
      (measured.nearby ? headings.nearby(measured.nearby).length : 0) +
      (quoted.length ? headings.evidence(quoted.length).length : 0) +
      quoteCharacters;
    if (characters > limit) return;
    if (!projection) {
      const replacements = new Map(added.map((line) => [line.key, line]));
      projection = [...fitBase.lines.values()].map((line) => replacements.get(line.key) || line);
    }
    return renderProjection(projection, quoted);
  };
  type CoreProjection = {
    measureLines: ReturnType<typeof createContextLineMeasure>;
    measureBareLines: ReturnType<typeof createContextLineMeasure>;
    explained: Set<string>;
    quoteCharacters: number;
    rawCharacters: number;
  };
  let coreProjection: CoreProjection | undefined;
  const currentCore = () =>
    (coreProjection ||= {
      measureLines: createContextLineMeasure([], prepared),
      measureBareLines: createContextLineMeasure([], prepared),
      explained: new Set<string>(),
      quoteCharacters: 0,
      rawCharacters: 0,
    });
  /** Existing citations and lines stay fixed during admission; only new paths can hide old edge lines. */
  const createCoreMeasure = () => {
    const byEntry = new Map(entries.map((entry) => [unitKey(entry), entry]));
    const references = referencesFor(citations);
    const { explained, measureLines, measureBareLines, quoteCharacters, rawCharacters } =
      currentCore();
    /** Removing citation labels retains a lower bound with the same path and duplicate rules. */
    return (units: ContextUnit[]) => {
      const removed = new Set(
        units.flatMap(({ entry }) =>
          entry.kind === 'path' ? result.paths[entry.index].edges.map((id) => 'edge:' + id) : []
        )
      );
      const changingUnits = units.filter(
        ({ entry }) =>
          entry.kind === 'path' ||
          (entry.kind === 'edge' && !explained.has(entry.id) && !removed.has(unitKey(entry)))
      );
      const minimum = measureBareLines(
        [...units.filter(({ entry }) => entry.kind === 'node'), ...changingUnits].map(bareLine),
        removed
      );
      const minimumCharacters =
        title.length +
        quoteCharacters +
        minimum.characters +
        (minimum.related ? headings.related(minimum.related).length : 0) +
        (needsPathSection || minimum.path ? pathHeading(minimum.path).length : 0) +
        missingPathDescription.length +
        omittedPathDescription.length +
        (minimum.nearby ? headings.nearby(minimum.nearby).length : 0) +
        (citations.length ? headings.evidence(citations.length).length : 0);
      let measureTrial: ReturnType<typeof createContextLineMeasure> | undefined;
      const fixed = units.filter(({ entry }) => entry.kind === 'node').map(bareLine);
      const fixedMeasure = measureLines(fixed, removed);
      const fixedMinimum =
        title.length +
        quoteCharacters +
        fixedMeasure.characters +
        (fixedMeasure.related ? headings.related(fixedMeasure.related).length : 0) +
        (needsPathSection || fixedMeasure.path ? pathHeading(fixedMeasure.path).length : 0) +
        missingPathDescription.length +
        omittedPathDescription.length +
        (fixedMeasure.nearby ? headings.nearby(fixedMeasure.nearby).length : 0) +
        (citations.length ? headings.evidence(citations.length).length : 0);
      const noRemovals = new Set<string>();
      const measure = (
        quoted: Map<string, GraphContextCitation>,
        allEntries: GraphContextEntry[],
        limit: number
      ) => {
        if (Math.max(minimumCharacters, fixedMinimum) > limit) return;
        measureTrial ||= measureLines.extend(fixed, removed);
        const addedQuotes = [...quoted.values()];
        if (
          rawCharacters + addedQuotes.reduce((total, quote) => total + quote.text.length, 0) >
          limit
        )
          return;
        const nextEntries = new Map(allEntries.map((entry) => [unitKey(entry), entry]));
        const entryLookup = { get: (key: string) => nextEntries.get(key) || byEntry.get(key) };
        const referenceLookup = references.extend(addedQuotes);
        const added = changingUnits.map((unit) => renderLine(unit, entryLookup, referenceLookup));
        const measured = measureTrial(added, noRemovals);
        const characters =
          title.length +
          measured.characters +
          (measured.related ? headings.related(measured.related).length : 0) +
          (needsPathSection || measured.path ? pathHeading(measured.path).length : 0) +
          missingPathDescription.length +
          omittedPathDescription.length +
          (measured.nearby ? headings.nearby(measured.nearby).length : 0) +
          (citations.length + quoted.size
            ? headings.evidence(citations.length + quoted.size).length
            : 0) +
          quoteCharacters +
          addedQuotes.reduce(
            (total, citation, index) =>
              total + quotation(citation, citations.length + index).length,
            0
          );
        return characters <= limit ? characters : undefined;
      };
      return { measure, minimumCharacters: Math.max(minimumCharacters, fixedMinimum) };
    };
  };
  let corePhase = true;
  let coreMeasure: ReturnType<typeof createCoreMeasure> | undefined;
  const coreCitations = new Set<string>();
  let planMinimum = 0;
  /** Plan a whole explanation against its final Markdown cost, backtracking when a later edge needs room. */
  const plan = (units: ContextUnit[], limit = budget - reserve) => {
    planMinimum = 0;
    type State = {
      quoted: Map<string, GraphContextCitation>;
      entries: GraphContextEntry[];
      characters: number;
      quoteCharacters: number;
      referenceCharacters: number;
    };
    const allUnits = corePhase ? [] : [...renderedUnits, ...units];
    const existingCitations = corePhase
      ? coreCitations
      : new Set(citations.map((citation) => citation.id));
    let unitEntries: GraphContextEntry[] | undefined;
    const bareEntries = () =>
      (unitEntries ||= units.map((unit) => ({ ...unit.entry, citationIds: [] as string[] })));
    const coreTrial = corePhase ? (coreMeasure ||= createCoreMeasure())(units) : undefined;
    planMinimum = coreTrial?.minimumCharacters || 0;
    if (coreTrial && coreTrial.minimumCharacters > limit) return;
    const measureCore = coreTrial?.measure;
    const fixedQuoteCharacters =
      coreTrial?.minimumCharacters ??
      (() => {
        const nodeLines = new Set(
          [...renderedUnits, ...units]
            .filter(({ entry }) => entry.kind === 'node')
            .map((unit) => unit.line.trimEnd() + (unit.details ? '\n' + unit.details : '') + '\n\n')
        );
        return citations.reduce(
          (total, citation, index) => total + quotation(citation, index).length,
          title.length + [...nodeLines].reduce((total, line) => total + line.length, 0)
        );
      })();
    const measure = (quoted: State['quoted'], allEntries: GraphContextEntry[]) =>
      measureCore
        ? measureCore(quoted, allEntries, limit)
        : fits(allUnits, [...citations, ...quoted.values()], [...entries, ...allEntries], limit)
            ?.length;
    const baseQuoted = new Map<string, GraphContextCitation>();
    const baseCharacters = measureCore
      ? measureCore(baseQuoted, [], Infinity)
      : measure(baseQuoted, bareEntries());
    const hiddenEdges = new Set(
      units.flatMap(({ entry }) => (entry.kind === 'path' ? result.paths[entry.index].edges : []))
    );
    if (
      baseCharacters !== undefined &&
      units.every(
        ({ entry }) =>
          entry.kind !== 'edge' ||
          hiddenEdges.has(entry.id) ||
          currentCore().explained.has(entry.id)
      )
    )
      planMinimum = Math.max(planMinimum, baseCharacters);
    if (baseCharacters === undefined || baseCharacters > limit) return;
    const alternatives = new Map(
      units.map((unit) => [
        unitKey(unit.entry),
        unit.entry.kind === 'edge' ? rankEvidence(unit) : ([] as RankedCitation[]),
      ])
    );
    if (!units.some(({ entry }) => entry.kind === 'edge'))
      return {
        units,
        alternatives,
        state: {
          quoted: baseQuoted,
          entries: bareEntries(),
          characters: baseCharacters,
          quoteCharacters: 0,
          referenceCharacters: 0,
        },
      };
    const options = new Map<string, RankedCitation[]>();
    for (const unit of units) {
      if (unit.entry.kind !== 'edge') continue;
      const key = unitKey(unit.entry);
      const cached = evidenceOptionsByUnit.get(key);
      if (cached) {
        options.set(key, cached);
        continue;
      }
      const ranked = alternatives.get(key)!;
      const distinct = new Map<string, RankedCitation>();
      const seenBundles = new Set<GraphContextCitation[]>();
      for (const option of (ranked.some((option) => option.complete && !option.unresolved)
        ? ranked.filter((option) => option.complete)
        : ranked
      ).filter((option) => !option.unresolved)) {
        if (seenBundles.has(option.bundle!)) continue;
        seenBundles.add(option.bundle!);
        const signature = JSON.stringify(option.bundle!.map((citation) => citation.id));
        if (!distinct.has(signature)) distinct.set(signature, option);
      }
      const values = [...distinct.values()];
      evidenceOptionsByUnit.set(key, values);
      possibleCitationsByUnit.set(
        key,
        new Set(values.flatMap((option) => option.bundle!.map((citation) => citation.id)))
      );
      options.set(key, values);
    }
    const apply = (
      state: State,
      key: string,
      option: RankedCitation,
      ceiling = limit
    ): State | undefined => {
      const bundle = option.bundle!;
      let optionCharacters = optionReferenceCharacters.get(option);
      if (optionCharacters === undefined) {
        optionCharacters = bundle.reduce(
          (total, citation) => total + citationHref(citation).length + 5,
          Math.max(0, bundle.length - 1)
        );
        optionReferenceCharacters.set(option, optionCharacters);
      }
      // At least the longest required citation list must occur in a displayed connection.
      // Taking the maximum also preserves cases whose identical connection lines collapse.
      const referenceCharacters = Math.max(state.referenceCharacters, optionCharacters);
      const added: GraphContextCitation[] = [];
      let quoteCharacters = state.quoteCharacters;
      for (const citation of bundle) {
        if (existingCitations.has(citation.id) || state.quoted.has(citation.id)) continue;
        // Item names and intact quotations already impose a lower bound on the final Markdown.
        if (
          fixedQuoteCharacters + quoteCharacters + referenceCharacters + citation.text.length >
          ceiling
        )
          return;
        quoteCharacters += quotation(
          citation,
          citations.length + state.quoted.size + added.length
        ).length;
        if (fixedQuoteCharacters + quoteCharacters + referenceCharacters > ceiling) return;
        added.push(citation);
      }
      const quoted = new Map(state.quoted);
      for (const citation of added) quoted.set(citation.id, citation);
      let citationIds = optionCitationIds.get(option);
      if (!citationIds)
        optionCitationIds.set(option, (citationIds = bundle.map((citation) => citation.id)));
      const nextEntries = state.entries.map((entry) =>
        unitKey(entry) === key ? { ...entry, citationIds: citationIds! } : entry
      );
      const characters = measure(quoted, nextEntries);
      if (characters === undefined) return;
      return { quoted, entries: nextEntries, characters, quoteCharacters, referenceCharacters };
    };
    const required = units.filter(
      (unit) => unit.entry.kind === 'edge' && alternatives.get(unitKey(unit.entry))!.length
    );
    if (
      corePhase &&
      units.every(
        ({ entry }) =>
          entry.kind !== 'edge' ||
          hiddenEdges.has(entry.id) ||
          currentCore().explained.has(entry.id)
      )
    ) {
      let quoteFloor = 0;
      let referenceFloor = 0;
      for (const unit of required) {
        let minimumQuotes = Infinity;
        let minimumReferences = Infinity;
        for (const option of options.get(unitKey(unit.entry))!) {
          let quotes = optionQuoteFloors.get(option);
          if (quotes === undefined) {
            quotes = option.bundle!.reduce(
              (total, citation) =>
                total + (existingCitations.has(citation.id) ? 0 : quotation(citation, 0).length),
              0
            );
            optionQuoteFloors.set(option, quotes);
          }
          let references = optionReferenceCharacters.get(option);
          if (references === undefined) {
            references = option.bundle!.reduce(
              (total, citation) => total + citationHref(citation).length + 5,
              Math.max(0, option.bundle!.length - 1)
            );
            optionReferenceCharacters.set(option, references);
          }
          minimumQuotes = Math.min(minimumQuotes, quotes);
          minimumReferences = Math.min(minimumReferences, references);
        }
        quoteFloor = Math.max(quoteFloor, minimumQuotes);
        referenceFloor = Math.max(referenceFloor, minimumReferences);
      }
      planMinimum = Math.max(planMinimum, baseCharacters + quoteFloor + referenceFloor);
      if (planMinimum > limit) return;
    }
    const requiredKey = JSON.stringify(required.map((unit) => unitKey(unit.entry)));
    let futureIds = futureCitationSets.get(requiredKey);
    if (!futureIds) {
      futureIds = required.map(
        (_, index) =>
          new Set(
            required
              .slice(index)
              .flatMap((unit) => [...possibleCitationsByUnit.get(unitKey(unit.entry))!])
          )
      );
      futureCitationSets.set(requiredKey, futureIds);
    }
    const failed = new Set<string>();
    const choose = (index: number, state: State): State | undefined => {
      if (index === required.length) return state;
      // Equal-cost states with the same future reusable citations have identical remaining choices.
      const signature = JSON.stringify([
        index,
        state.characters,
        state.quoted.size,
        [...state.quoted.keys()].filter((id) => futureIds[index].has(id)).sort(),
      ]);
      if (failed.has(signature)) return;
      const key = unitKey(required[index].entry);
      let best: State | undefined;
      for (const option of options.get(key)!) {
        const next = apply(state, key, option, best ? Math.min(limit, best.characters) : limit);
        if (!next || (best && next.characters > best.characters)) continue;
        const complete = choose(index + 1, next);
        if (complete && (!best || complete.characters < best.characters)) best = complete;
      }
      if (!best) failed.add(signature);
      return best;
    };
    const state = choose(0, {
      quoted: baseQuoted,
      // Only required relationships change references during a trial. Item/path records
      // are restored once after selection rather than copied through every evidence combination.
      entries: required.map((unit) => ({ ...unit.entry, citationIds: [] })),
      characters: baseCharacters,
      quoteCharacters: 0,
      referenceCharacters: 0,
    });
    if (!state) return;
    const selectedEntries = new Map(state.entries.map((entry) => [unitKey(entry), entry]));
    return {
      units,
      alternatives,
      state: {
        ...state,
        entries: bareEntries().map((entry) => selectedEntries.get(unitKey(entry)) || entry),
      },
    };
  };
  const publish = ({ units, alternatives, state }: NonNullable<ReturnType<typeof plan>>) => {
    // Optional item provenance is needed only after a trial has actually been selected.
    // Path citations are synchronized from the selected relationships below.
    for (const unit of units)
      if (unit.entry.kind === 'node') alternatives.set(unitKey(unit.entry), rankEvidence(unit));
    const allEntries = synchronizePaths([...entries, ...state.entries]);
    const allCitations = [...citations, ...state.quoted.values()];
    if (corePhase) {
      const base = currentCore();
      const removed = new Set<string>();
      for (const { entry } of units) {
        if (entry.kind !== 'path') continue;
        for (const id of result.paths[entry.index].edges) {
          base.explained.add(id);
          removed.add('edge:' + id);
        }
      }
      const visible = units.filter(
        ({ entry }) => entry.kind !== 'edge' || !base.explained.has(entry.id)
      );
      const byEntry = new Map(allEntries.map((entry) => [unitKey(entry), entry]));
      const references = referencesFor(allCitations);
      base.measureLines.accept!(
        visible.map((unit) => renderLine(unit, byEntry, references)),
        removed
      );
      base.measureBareLines.accept!(visible.map(bareLine), removed);
      for (const [index, citation] of [...state.quoted.values()].entries()) {
        base.quoteCharacters += quotation(citation, citations.length + index).length;
        base.rawCharacters += citation.text.length;
      }
    } else text = render([...renderedUnits, ...units], allCitations, allEntries);
    fitBase = undefined;
    coreMeasure = undefined;
    citations.push(...state.quoted.values());
    if (state.quoted.size) optionQuoteFloors = new WeakMap();
    for (const citation of state.quoted.values()) coreCitations.add(citation.id);
    entries.splice(0, entries.length, ...allEntries);
    renderedUnits.push(...units);
    for (const [key, ranked] of alternatives) remainingEvidence.set(key, ranked);
    for (const { entry } of units) {
      if (entry.kind === 'path') includedPaths.add(entry.index);
      else if (entry.kind === 'node') includedNodes.add(entry.id);
      else includedEdges.add(entry.id);
    }
    return true;
  };
  const commit = (units: ContextUnit[]) => {
    const next = plan(units);
    return next ? publish(next) : false;
  };
  const addNode = (id: string) => {
    return includedNodes.has(id) || commit([nodeUnit(id)]);
  };
  /** Use endpoint relevance and hop-decayed relationship relevance; explicit connection queries prioritize complete routes. */
  const pathScore = (path: GraphSearchResult['paths'][number]) => {
    const endpoints =
      ((nodeScores.get(path.nodes[0]) || 0) +
        (nodeScores.get(path.nodes[path.nodes.length - 1]) || 0)) /
      2;
    const relationships =
      path.edges.reduce((total, id) => total + (edgeScores.get(id) || 0), 0) /
      Math.max(1, path.edges.length);
    return (
      endpoints +
      relationships / (path.edges.length + 1) +
      (result.plan.intent === 'connection' &&
      (result.plan.targetIds
        ? targets.has(path.nodes[0]) && targets.has(path.nodes.at(-1)!)
        : path.kind !== 'surrounding')
        ? 100
        : 0)
    );
  };
  const seenPaths = new Set<string>();
  const distinctPaths = result.paths.flatMap((path, index) => {
    const forward = JSON.stringify([path.nodes, path.edges]);
    const reverse = JSON.stringify([[...path.nodes].reverse(), [...path.edges].reverse()]);
    const key = forward < reverse ? forward : reverse;
    if (seenPaths.has(key)) return [];
    seenPaths.add(key);
    return [{ path, index }];
  });
  const candidates: (
    | { kind: 'node' | 'edge'; id: string; score: number }
    | { kind: 'path'; index: number; score: number }
  )[] = [
    ...distinctPaths.map(({ path, index }) => ({
      kind: 'path' as const,
      index,
      score: pathScore(path),
    })),
    ...result.edges.map(({ edge }) => ({
      kind: 'edge' as const,
      id: edge.id,
      score: edgeScores.get(edge.id)!,
    })),
    ...result.nodes.map(({ node }) => ({
      kind: 'node' as const,
      id: node.id,
      score: nodeScores.get(node.id)!,
    })),
  ];
  candidates.sort((a, b) => b.score - a.score);
  const presentation = new Map<string, number>();
  const remember = (entry: ContextUnit['entry']) => {
    const key = unitKey(entry);
    if (!presentation.has(key)) presentation.set(key, presentation.size);
  };
  for (const candidate of candidates) {
    if (candidate.kind === 'path') {
      const path = result.paths[candidate.index];
      path.edges.forEach((id) => remember({ kind: 'edge', id }));
      path.nodes.forEach((id) => remember({ kind: 'node', id }));
      remember({ kind: 'path', index: candidate.index });
    } else {
      remember({ kind: candidate.kind, id: candidate.id });
      if (candidate.kind === 'edge') {
        const edge = edges.get(candidate.id)!;
        [edge.source, edge.target].forEach((id) => remember({ kind: 'node', id }));
      }
    }
  }
  const order = (a: { entry: ContextUnit['entry'] }, b: { entry: ContextUnit['entry'] }) =>
    presentation.get(unitKey(a.entry))! - presentation.get(unitKey(b.entry))!;
  const pending = new Set(candidates.filter((candidate) => candidate.kind !== 'node'));
  const candidateKey = (candidate: (typeof candidates)[number]) =>
    candidate.kind === 'path' ? 'path:' + candidate.index : candidate.kind + ':' + candidate.id;
  const preparedUnits = new Map<string, ContextUnit[]>();
  const prepare = (candidate: (typeof candidates)[number]) => {
    const key = candidateKey(candidate);
    let needed = preparedUnits.get(key);
    if (!needed) {
      needed = [];
      if (candidate.kind === 'path') {
        const path = result.paths[candidate.index];
        if (!path.nodes.every((id) => nodes.has(id)) || !path.edges.every((id) => edges.has(id)))
          return;
        needed.push(...[...new Set(path.edges)].map(edgeUnit));
        needed.push(...[...new Set(path.nodes)].map(nodeUnit));
        needed.push(pathUnit(candidate.index));
      } else {
        const edge = edges.get(candidate.id)!;
        needed.push(edgeUnit(edge.id));
        needed.push(...[...new Set([edge.source, edge.target])].map(nodeUnit));
      }
      const neededNodes = new Set(
        needed.flatMap((unit) => (unit.entry.kind === 'node' ? [unit.entry.id] : []))
      );
      for (const { node, score } of result.nodes) {
        if (score <= candidate.score || neededNodes.has(node.id)) continue;
        needed.push(nodeUnit(node.id));
        neededNodes.add(node.id);
      }
      preparedUnits.set(key, needed.sort(order));
    }
    return needed.filter(({ entry }) =>
      entry.kind === 'path'
        ? !includedPaths.has(entry.index)
        : entry.kind === 'edge'
        ? !includedEdges.has(entry.id)
        : !includedNodes.has(entry.id)
    );
  };
  const initialText = text;
  let completeCore = true;
  // When every explanation fits, coverage is already maximal and no admission search is needed.
  for (const candidate of candidates) {
    yield;
    if (
      (candidate.kind === 'node' && includedNodes.has(candidate.id)) ||
      (candidate.kind === 'edge' && includedEdges.has(candidate.id)) ||
      (candidate.kind === 'path' && includedPaths.has(candidate.index))
    )
      continue;
    const needed = candidate.kind === 'node' ? [nodeUnit(candidate.id)] : prepare(candidate);
    const next = needed && plan(needed);
    if (!next) {
      completeCore = false;
      break;
    }
    publish(next);
  }
  if (!completeCore) {
    text = initialText;
    renderedUnits.length = 0;
    entries.length = 0;
    citations.length = 0;
    coreCitations.clear();
    includedNodes.clear();
    includedEdges.clear();
    includedPaths.clear();
    remainingEvidence.clear();
    coreMeasure = undefined;
    coreProjection = undefined;
    const texts = [
      ...result.nodes.map(({ node }) => node.body),
      ...result.sources.map((source) => source.text),
    ];
    const identity = JSON.stringify([
      result.revision,
      result.query,
      result.plan,
      result.nodes.map(({ node, score }) => ({ node: { ...node, body: undefined }, score })),
      result.edges,
      result.paths,
      result.sources.map((source) => ({ ...source, text: undefined })),
      title,
      evidenceNote,
      status(true),
      status(false),
      headings.related(0),
      headings.paths(0),
      headings.nearby(0),
      headings.evidence(0),
      translate('Property'),
      translate('Association score'),
      translate('Reference'),
    ]);
    const previousTrace = coreTraces.get(result);
    const trace: CoreTrace =
      previousTrace?.identity === identity &&
      previousTrace.texts.length === texts.length &&
      previousTrace.texts.every((value, index) => value === texts[index])
        ? previousTrace
        : { identity, texts, steps: [], searchedCapacity: -1, complete: false };
    coreTraces.set(result, trace);
    const byCandidate = new Map(
      [...pending].map((candidate) => [candidateKey(candidate), candidate])
    );
    const admissionHints = new Map<string, number>();
    const dependents = new Map<string, Set<string>>();
    const registered = new Set<string>();
    const publishedResources = new Set<string>();
    const sourcesFor = new Map<string, Set<string>>();
    const sourceClosure = (id: string) => {
      let found = sourcesFor.get(id);
      if (found) return found;
      found = new Set([id]);
      for (const sourceId of found) {
        const source = sources.get(sourceId);
        if (source?.origin) found.add(source.origin.sourceId);
        for (const reference of source?.references || [])
          for (const target of reference.targets || []) found.add(target.sourceId);
      }
      sourcesFor.set(id, found);
      return found;
    };
    const pathResources = (index: number) => {
      const path = result.paths[index];
      return path.nodes.flatMap((_, depth) => {
        const prefix = path.nodes.slice(0, depth + 1);
        return [
          'prefix:' + JSON.stringify(prefix),
          ...(depth ? ['relation:' + JSON.stringify([prefix, path.edges[depth - 1]])] : []),
        ];
      });
    };
    const register = (candidate: (typeof candidates)[number]) => {
      const key = candidateKey(candidate);
      if (registered.has(key)) return;
      registered.add(key);
      const resources = new Set<string>();
      for (const unit of preparedUnits.get(key) || []) {
        const { entry } = unit;
        resources.add('unit:' + unitKey(entry));
        if (entry.kind === 'path') {
          for (const resource of pathResources(entry.index)) resources.add(resource);
          for (const id of result.paths[entry.index].edges) resources.add('explained:' + id);
        } else {
          resources.add('line:' + bareLine(unit).text);
          if (entry.kind === 'edge') {
            const possible = possibleCitationsByUnit.get(unitKey(entry));
            if (possible) for (const id of possible) resources.add('quote:' + id);
            else
              for (const id of unit.sourceIds)
                for (const sourceId of sourceClosure(id)) resources.add('source:' + sourceId);
          }
        }
      }
      for (const resource of resources) {
        let values = dependents.get(resource);
        if (!values) dependents.set(resource, (values = new Set()));
        values.add(key);
      }
    };
    const invalidate = (selected: NonNullable<ReturnType<typeof plan>>) => {
      const changed = new Set<string>();
      for (const unit of selected.units) {
        changed.add('unit:' + unitKey(unit.entry));
        if (unit.entry.kind === 'path') {
          for (const resource of pathResources(unit.entry.index)) changed.add(resource);
          for (const id of result.paths[unit.entry.index].edges) changed.add('explained:' + id);
        } else changed.add('line:' + bareLine(unit).text);
      }
      for (const resource of changed) {
        if (publishedResources.has(resource)) continue;
        publishedResources.add(resource);
        for (const key of dependents.get(resource) || []) admissionHints.delete(key);
      }
      for (const citation of selected.state.quoted.values()) {
        for (const key of dependents.get('source:' + citation.sourceId) || [])
          admissionHints.delete(key);
        for (const key of dependents.get('quote:' + citation.id) || []) admissionHints.delete(key);
      }
    };
    // Unchanged resources retain their previous minimum incremental body cost.
    // Discard all possible heading savings; shared units, prefixes and sources invalidate the hint.
    const publishedCharacters = () => {
      const base = currentCore();
      const measured = base.measureLines([], new Set());
      const characters =
        title.length +
        measured.characters +
        base.quoteCharacters +
        (measured.related ? headings.related(measured.related).length : 0) +
        (needsPathSection || measured.path ? pathHeading(measured.path).length : 0) +
        missingPathDescription.length +
        omittedPathDescription.length +
        (measured.nearby ? headings.nearby(measured.nearby).length : 0) +
        (citations.length ? headings.evidence(citations.length).length : 0);
      const headingAllowance = [
        [measured.related, headings.related(budget)],
        [needsPathSection || measured.path, pathHeading(budget)],
        [measured.nearby, headings.nearby(budget)],
        [citations.length, headings.evidence(budget)],
      ].reduce(
        (total, [present, heading]) =>
          total + (present ? 0 : String(heading).length) + 2 * String(budget).length,
        0
      );
      return { characters, headingAllowance };
    };
    let replayLimited = false;
    for (const step of trace.steps) {
      yield;
      if (step.peak > budget - reserve) {
        replayLimited = true;
        break;
      }
      const candidate = byCandidate.get(step.key)!;
      const needed = prepare(candidate)!;
      const next = plan(needed)!;
      publish(next);
      invalidate(next);
      pending.delete(candidate);
    }
    // At each next affordable cost, admit the most relevant complete explanation at that cost.
    // This budget-independent sequence retains every earlier explanation when the budget grows.
    // Repacking replays the same trace; new admission searches are needed only beyond its known capacity.
    while (
      !replayLimited &&
      !trace.complete &&
      budget - reserve > trace.searchedCapacity &&
      pending.size
    ) {
      let best: ReturnType<typeof plan>;
      let chosen: (typeof candidates)[number] | undefined;
      const { characters: baseCharacters, headingAllowance } = publishedCharacters();
      for (const candidate of pending) {
        yield;
        if (
          (candidate.kind === 'path' && includedPaths.has(candidate.index)) ||
          (candidate.kind === 'edge' && includedEdges.has(candidate.id))
        ) {
          pending.delete(candidate);
          continue;
        }
        const needed = prepare(candidate);
        if (!needed) {
          pending.delete(candidate);
          continue;
        }
        const ceiling = best ? Math.min(budget - reserve, best.state.characters) : budget - reserve;
        const key = candidateKey(candidate);
        const hint = admissionHints.get(key);
        if (hint !== undefined && baseCharacters + hint > ceiling) continue;
        const next = plan(needed, ceiling);
        register(candidate);
        admissionHints.set(
          key,
          (next?.state.characters ?? Math.max(ceiling, planMinimum)) -
            baseCharacters -
            headingAllowance
        );
        if (next && (!best || next.state.characters < best.state.characters)) {
          best = next;
          chosen = candidate;
        }
      }
      if (!best || !chosen) break;
      publish(best);
      invalidate(best);
      pending.delete(chosen);
      trace.steps.push({
        key: candidateKey(chosen),
        peak: Math.max(trace.steps.at(-1)?.peak || 0, best.state.characters),
      });
    }
    if (!replayLimited && budget - reserve > trace.searchedCapacity) {
      trace.searchedCapacity = budget - reserve;
      trace.complete = !pending.size;
    }
  }
  corePhase = false;
  coreMeasure = undefined;
  renderedUnits.sort(order);
  entries.sort((a, b) => presentation.get(unitKey(a))! - presentation.get(unitKey(b))!);
  fitBase = undefined;
  const coreText = render(renderedUnits, citations, entries);
  if (coreText.length <= budget - reserve) text = coreText;
  text = fits(renderedUnits, citations, entries) ?? text;
  if (result.plan.intent === 'connection' && targets.size >= 2) {
    const shown = targetConnections([...includedPaths]);
    const explainable = new Map<string, boolean>();
    const available = targetConnections(
      result.paths.flatMap((path, index) => {
        const ready =
          path.nodes.every((id) => nodes.has(id)) &&
          path.edges.every((id) => {
            if (!edges.has(id)) return false;
            let resolved = explainable.get(id);
            if (resolved === undefined) {
              const evidence = rankEvidence(edgeUnit(id));
              resolved = !evidence.length || evidence.some((option) => !option.unresolved);
              explainable.set(id, resolved);
            }
            return resolved;
          });
        return ready ? [index] : [];
      })
    );
    const ids = [...targets];
    const excludedPairs = function* () {
      for (const [index, id] of ids.entries())
        for (const peer of ids.slice(index + 1)) {
          const missing = !foundConnections.get(id)!.has(peer);
          yield !shown.get(id)!.has(peer) && (missing || available.get(id)!.has(peer))
            ? { id, peer, missing }
            : undefined;
        }
    };
    let missingCount = 0;
    let omittedCount = 0;
    for (const pair of excludedPairs()) {
      yield;
      if (pair?.missing) missingCount++;
      else if (pair) omittedCount++;
    }
    const exclusionDescription = (missing: boolean) =>
      description(
        missing
          ? 'No path found within the selected search range.'
          : 'Path omitted due to context size.'
      );
    for (const missing of [true, false]) {
      const count = missing ? missingCount : omittedCount;
      if (!count) continue;
      const summary = exclusionDescription(missing);
      if (missing) missingPathDescription = summary;
      else omittedPathDescription = summary;
      const next = fits(renderedUnits, citations, entries);
      if (next === undefined) {
        if (missing) missingPathDescription = '';
        else omittedPathDescription = '';
        truncated = true;
      } else text = next;
    }
    const missingPairs: ContextLine[] = [];
    const omittedPairs: ContextLine[] = [];
    for (const pair of excludedPairs()) {
      yield;
      if (!pair) continue;
      const { id, peer, missing } = pair;
      if (!(missing ? missingPathDescription : omittedPathDescription)) continue;
      const pairs = missing ? missingPairs : omittedPairs;
      pairs.push({
        key: JSON.stringify([id, peer]),
        text: '',
        kind: 'path',
        path: [id, peer].map((key) => ({
          key,
          text: pathItemName(key, translate('Unclassified')),
        })),
      });
      const notice = renderContextPaths(pairs);
      const previous = missing ? missingPaths : pathNotices;
      const additional = notice.length - previous.length;
      if (text.length + additional > budget - reserve) {
        pairs.pop();
        truncated = true;
        continue;
      }
      if (missing) {
        missingPaths = notice;
        missingPathCount++;
      } else {
        pathNotices = notice;
        omittedPathCount++;
      }
      const next = fits(renderedUnits, citations, entries);
      if (next === undefined) {
        pairs.pop();
        if (missing) {
          missingPaths = previous;
          missingPathCount--;
        } else {
          pathNotices = previous;
          omittedPathCount--;
        }
        truncated = true;
      } else text = next;
    }
  }
  const enhanced = new Set<string>();
  /** Spend remaining space on the selected results before adding lower-priority standalone items. */
  function* enhance(): Generator<void, void, void> {
    const entryIndices = new Map(entries.map((entry, index) => [unitKey(entry), index]));
    const wording = (citation: GraphContextCitation) => {
      let value = wordingCache.get(citation.id);
      if (value === undefined) {
        value = citation.text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
        wordingCache.set(citation.id, value);
      }
      return value;
    };
    const covered = new Set(citations.map(wording));
    const fresh = [...remainingEvidence].filter(([key]) => !enhanced.has(key));
    const queued = fresh.flatMap(([key, ranked]) => ranked.map((item) => ({ key, ...item })));
    queued.sort(
      (a, b) =>
        Number(b.key.startsWith('edge:')) - Number(a.key.startsWith('edge:')) ||
        b.relevance - a.relevance
    );
    const distinct = new Set(covered);
    const extras = queued
      .map((item) => {
        const content =
          item.citation.text.length <= budget ? wording(item.citation) : item.citation.id;
        const novel = !distinct.has(content);
        distinct.add(content);
        return { ...item, novel };
      })
      .sort(
        (a, b) =>
          Number(b.key.startsWith('edge:')) - Number(a.key.startsWith('edge:')) ||
          Number(b.novel) - Number(a.novel) ||
          b.relevance - a.relevance
      );
    const unitScores = new Map(
      renderedUnits.map(({ entry }) => [
        unitKey(entry),
        entry.kind === 'node'
          ? nodeScores.get(entry.id) || 0
          : entry.kind === 'edge'
          ? edgeScores.get(entry.id) || 0
          : 0,
      ])
    );
    const evidenceScores = new Map(
      [...remainingEvidence].map(([key, ranked]) => [
        key,
        Math.max(1, ...ranked.map((value) => value.relevance)),
      ])
    );
    type Enhancement =
      | {
          kind: 'evidence';
          key: string;
          citation: GraphContextCitation;
          context: GraphContextCitation[];
          score: number;
          novel: boolean;
        }
      | { kind: 'attribute'; id: string; attribute: Attribute; score: number; novel: boolean };
    const enhancements: Enhancement[] = [
      ...extras
        .filter((option) => !option.unresolved)
        .map(({ key, citation, context, relevance, novel }) => ({
          kind: 'evidence' as const,
          key,
          citation,
          context,
          novel,
          score: (unitScores.get(key) || 0) * (1 + relevance / evidenceScores.get(key)!),
        })),
      ...[...attributes]
        .filter(([id]) => includedNodes.has(id) && !enhanced.has('node:' + id))
        .flatMap(([id, values]) =>
          values.map((attribute) => ({
            kind: 'attribute' as const,
            id,
            attribute,
            novel: true,
            score: (nodeScores.get(id) || 0) * (1 + attribute.relevance),
          }))
        ),
    ];
    enhancements.sort((a, b) => Number(b.novel) - Number(a.novel) || b.score - a.score);
    for (const enhancement of enhancements) {
      yield;
      if (enhancement.kind === 'attribute') {
        const { id, attribute } = enhancement;
        const selected = new Set(selectedAttributes.get(id));
        selected.add(attribute.key);
        const details = attributes
          .get(id)!
          .filter((value) => selected.has(value.key))
          .map((value) => value.line)
          .join('\n');
        const key = 'node:' + id;
        const unit = renderedUnits.find((unit) => unitKey(unit.entry) === key)!;
        const replacement = { ...unit, details };
        const nextText = fits(renderedUnits, citations, entries, budget - reserve, {
          units: new Map([[key, replacement]]),
        });
        if (nextText === undefined) continue;
        text = nextText;
        renderedUnits[renderedUnits.indexOf(unit)] = replacement;
        selectedAttributes.set(id, selected);
        fitBase = undefined;
        continue;
      }
      const { key, citation, context } = enhancement;
      const entryIndex = entryIndices.get(key)!;
      const entry = entries[entryIndex];
      if (entry.citationIds.includes(citation.id)) continue;
      const allCitations = [
        ...new Map([...citations, citation, ...context].map((value) => [value.id, value])).values(),
      ];
      const replacement = {
        ...entry,
        citationIds: [
          ...new Set([
            ...entry.citationIds,
            citation.id,
            ...context.map((citation) => citation.id),
          ]),
        ],
      };
      const nextText = fits(renderedUnits, allCitations, entries, budget - reserve, {
        entries: new Map([[key, replacement]]),
      });
      if (nextText === undefined) continue;
      text = nextText;
      citations.splice(0, citations.length, ...allCitations);
      entries[entryIndex] = replacement;
      entries.splice(0, entries.length, ...synchronizePaths(entries));
      fitBase = undefined;
    }
    for (const [key] of fresh) enhanced.add(key);
  }
  yield* enhance();
  // These additions cannot evict any relationship or path in the stable explanation prefix.
  for (const { node } of [...result.nodes].sort((a, b) => b.score - a.score)) {
    yield;
    if (includedNodes.has(node.id)) continue;
    if (addNode(node.id)) yield* enhance();
  }
  // Keep the relationship-specific passage first even when a cheaper context bundle was selected.
  for (const [key, ranked] of remainingEvidence) {
    const entry = entries.find((entry) => unitKey(entry) === key)!;
    const primary = ranked
      .map(({ citation }) => citation.id)
      .filter((id) => entry.citationIds.includes(id));
    entry.citationIds = [...new Set([...primary, ...entry.citationIds])];
  }
  entries.splice(0, entries.length, ...synchronizePaths(entries));
  text = fits(renderedUnits, citations, entries) ?? text;
  // Only optional item provenance may be abbreviated, after complete context bundles have been tried.
  for (const [key, ranked] of remainingEvidence) {
    yield;
    const entry = entries.find((entry) => unitKey(entry) === key)!;
    if (entry.kind !== 'node' || entry.citationIds.length) continue;
    for (const { citation, unresolved } of ranked) {
      if (unresolved) continue;
      const original = sources.get(citation.sourceId)!;
      const queryLengths = terms
        .filter((term) => getSourceText(original.id).text.includes(term))
        .map((term) => term.length);
      const size = Math.max(
        1,
        ...queryLengths,
        queryLengths.length ? 0 : original.text.match(/\S+/u)?.[0].length || 0
      );
      const range = graphEvidenceExcerpt(original.text, getSourceText(original.id), size, {
        terms,
      });
      const clip = {
        ...original,
        ...range,
        sourceId: original.id,
        id: original.id + '@' + range.start + ':' + range.end,
        text: original.text.slice(range.start, range.end),
      };
      const quoted = [...new Map([...citations, clip].map((value) => [value.id, value])).values()];
      const nextEntries = entries.map((value) =>
        value === entry ? { ...value, citationIds: [clip.id] } : value
      );
      const next = fits(renderedUnits, quoted, nextEntries, budget - reserve, {
        entries: new Map([[key, nextEntries[entries.indexOf(entry)]]]),
      });
      if (next === undefined) continue;
      text = next;
      citations.splice(0, citations.length, ...quoted);
      entries.splice(0, entries.length, ...nextEntries);
      clipped.set(clip.id, clip);
      fitBase = undefined;
      break;
    }
  }
  // Unstructured provenance may be abbreviated; complete relationship statements are never cut to fit.
  for (const [id, originalClip] of clipped) {
    yield;
    if (!citations.some((citation) => citation.id === id)) continue;
    const original = sources.get(originalClip.sourceId)!;
    let lower = originalClip.end - originalClip.start;
    let upper = Math.min(original.text.length, budget);
    let best:
      | { text: string; citations: GraphContextCitation[]; entries: GraphContextEntry[] }
      | undefined;
    while (lower <= upper) {
      yield;
      const size = Math.floor((lower + upper) / 2);
      const range = graphEvidenceExcerpt(original.text, getSourceText(original.id), size, {
        terms,
      });
      const citation = {
        ...original,
        start: range.start,
        end: range.end,
        sourceId: original.id,
        id: original.id + '@' + range.start + ':' + range.end,
        text: original.text.slice(range.start, range.end),
      };
      const quoted = [
        ...new Map(
          citations.map((value) => {
            const next = value.id === id ? citation : value;
            return [next.id, next];
          })
        ).values(),
      ];
      const allEntries = synchronizePaths(
        entries.map((entry) => ({
          ...entry,
          citationIds: [
            ...new Set(entry.citationIds.map((value) => (value === id ? citation.id : value))),
          ],
        }))
      );
      const nextText = fits(renderedUnits, quoted, allEntries);
      if (nextText === undefined) upper = size - 1;
      else {
        best = { text: nextText, citations: quoted, entries: allEntries };
        lower = size + 1;
      }
    }
    if (best) {
      text = best.text;
      citations.splice(0, citations.length, ...best.citations);
      entries.splice(0, entries.length, ...best.entries);
      fitBase = undefined;
    }
  }
  const coverage = new Map<string, { start: number; end: number }[]>();
  for (const citation of citations) {
    const ranges = coverage.get(citation.sourceId) || [];
    ranges.push({ start: citation.start, end: citation.end });
    coverage.set(citation.sourceId, ranges);
  }
  for (const ranges of coverage.values()) ranges.sort((a, b) => a.start - b.start);
  const coveredRange = (citation: GraphContextCitation) => {
    const original = sources.get(citation.sourceId)!.text;
    let cursor = citation.start;
    for (const range of coverage.get(citation.sourceId) || []) {
      if (range.end <= cursor || range.start >= citation.end) continue;
      if (range.start > cursor && original.slice(cursor, range.start).trim()) return false;
      cursor = Math.max(cursor, range.end);
      if (cursor >= citation.end) return true;
    }
    return !original.slice(cursor, citation.end).trim();
  };
  truncated ||=
    [...attributes].some(
      ([id, values]) =>
        includedNodes.has(id) && values.length > (selectedAttributes.get(id)?.size || 0)
    ) ||
    [...remainingEvidence.values()].some((ranked) =>
      ranked.some(
        ({ citation, context, unresolved }) =>
          unresolved || [citation, ...context].some((range) => !coveredRange(range))
      )
    );
  truncated ||=
    includedNodes.size < result.nodes.length ||
    includedEdges.size < result.edges.length ||
    includedPaths.size < distinctPaths.length;
  if (!renderedUnits.length) {
    const empty = render([], [], []);
    if (empty.length <= budget - reserve) text = empty;
    else truncated = true;
  }
  const footer = evidenceNote + status(truncated);
  if (text.length + footer.length <= budget) text += footer;
  else {
    truncated = true;
    const notice = `> ${translate('Content omissions')}: ${translate('Present')}\n\n`;
    if (text.length + notice.length <= budget) text += notice;
  }
  const context = {
    text,
    citations,
    entries,
    truncated,
    usage: { characters: text.length, limit: budget },
  };
  prepared.contexts.set(budget, context);
  return context;
}

type ContextLine = {
  key: string;
  text: string;
  kind: 'node' | 'edge' | 'path' | 'nearby';
  path?: { key: string; text: string; relation?: { key: string; text: string } }[];
};

/** Share node prefixes only within one starting point, retaining parallel relationship evidence. */
function renderContextPaths(lines: ContextLine[]) {
  type Branch = {
    text: string;
    relations: Map<string, string>;
    children: Map<string, Branch>;
  };
  const roots = new Map<string, Branch>();
  for (const line of lines) {
    let children = roots;
    for (const part of line.path || []) {
      let branch = children.get(part.key);
      if (!branch) {
        branch = { text: part.text, relations: new Map(), children: new Map() };
        children.set(part.key, branch);
      }
      if (part.relation) branch.relations.set(part.relation.key, part.relation.text);
      children = branch.children;
    }
  }
  const rows: string[] = [];
  const visit = (children: Map<string, Branch>, depth: number) => {
    for (const branch of children.values()) {
      const relations = [...branch.relations.values()].join(' · ');
      rows.push('  '.repeat(depth) + '- ' + (relations ? relations + ' ' : '') + branch.text);
      visit(branch.children, depth + 1);
    }
  };
  visit(roots, 0);
  return rows.length ? rows.join('\n') + '\n\n' : '';
}

type Measurement = { related: number; path: number; nearby: number; characters: number };
type Piece = { count: number; characters: number };
type Prefix = { children: Map<string, Prefix>; relations: Map<string, object> };
const pathCaches = new WeakMap<object, ReturnType<typeof createPathPieces>>();

/** Intern structural identities without repeatedly serializing citation URLs in every trial. */
function createPathPieces() {
  const groups = new Map<ContextLine['kind'], Prefix>();
  const cache = new WeakMap<ContextLine, Map<object, number>>();
  const createPrefix = (): Prefix => ({ children: new Map(), relations: new Map() });
  return (line: ContextLine) => {
    const cached = cache.get(line);
    if (cached) return cached;
    const pieces = new Map<object, number>();
    if (line.path?.length) {
      let prefix: Prefix = groups.get(line.kind) || createPrefix();
      groups.set(line.kind, prefix);
      pieces.set(prefix, 1);
      for (const [depth, part] of line.path.entries()) {
        let row: Prefix | undefined = prefix.children.get(part.key);
        if (!row) prefix.children.set(part.key, (row = createPrefix()));
        pieces.set(row, depth * 2 + 3 + part.text.length - (part.relation ? 2 : 0));
        if (part.relation) {
          let relation = row.relations.get(part.relation.key);
          if (!relation) row.relations.set(part.relation.key, (relation = {}));
          pieces.set(relation, part.relation.text.length + 3);
        }
        prefix = row;
      }
    }
    cache.set(line, pieces);
    return pieces;
  };
}
type LineMeasure = {
  (added: ContextLine[], removed: Set<string>): Measurement;
  extend: (added: ContextLine[], removed: Set<string>) => LineMeasure;
  accept?: (added: ContextLine[], removed: Set<string>) => void;
};

/** Measure changed lines with the same duplicate and path precedence rules as Markdown rendering. */
function createContextLineMeasure(lines: ContextLine[], owner?: object) {
  const byKey = new Map(lines.map((line) => [line.key, line]));
  const buckets = new Map<string, ContextLine[]>();
  const counts = { related: 0, path: 0, nearby: 0 };
  const group = (line: ContextLine) =>
    line.kind === 'path' || line.kind === 'nearby' ? line.kind : 'related';
  const selected = (bucket: ContextLine[]) => {
    for (let index = bucket.length - 1; index >= 0; index--)
      if (bucket[index].kind === 'path' || bucket[index].kind === 'nearby') return bucket[index];
    return bucket[0];
  };
  let piecesFor = owner && pathCaches.get(owner);
  if (!piecesFor) {
    piecesFor = createPathPieces();
    if (owner) pathCaches.set(owner, piecesFor);
  }
  for (const line of lines) {
    const bucket = buckets.get(line.text) || [];
    bucket.push(line);
    buckets.set(line.text, bucket);
  }
  let characters = 0;
  const pieces = new Map<object, Piece>();
  for (const [text, bucket] of buckets) {
    const line = selected(bucket);
    const parts = piecesFor(line);
    if (!parts.size) characters += text.length;
    for (const [key, size] of parts) {
      const previous = pieces.get(key);
      if (previous) previous.count++;
      else {
        pieces.set(key, { count: 1, characters: size });
        characters += size;
      }
    }
    counts[group(line)]++;
  }
  const create = (
    byKey: Pick<Map<string, ContextLine>, 'get'>,
    buckets: Pick<Map<string, ContextLine[]>, 'get'>,
    pieces: Pick<Map<object, Piece>, 'get'>,
    baseline: Measurement,
    storage?: {
      byKey: Map<string, ContextLine>;
      buckets: Map<string, ContextLine[]>;
      pieces: Map<object, Piece>;
    }
  ): LineMeasure => {
    const changes = (added: ContextLine[], removed: Set<string>) => {
      const changed = new Map<string, ContextLine[]>();
      for (const key of removed) {
        const line = byKey.get(key);
        if (line && !changed.has(line.text))
          changed.set(
            line.text,
            buckets.get(line.text)!.filter((line) => !removed.has(line.key))
          );
      }
      for (const line of added) {
        let bucket = changed.get(line.text);
        if (!bucket) changed.set(line.text, (bucket = [...(buckets.get(line.text) || [])]));
        bucket.push(line);
      }
      return changed;
    };
    const total = (changed: Map<string, ContextLine[]>) => {
      const next = { ...baseline };
      const changedPieces = new Map<object, Piece>();
      const apply = (line: ContextLine, delta: number) => {
        next[group(line)] += delta;
        const parts = piecesFor(line);
        if (!parts.size) next.characters += line.text.length * delta;
        for (const [key, size] of parts) {
          const previous = changedPieces.get(key) || pieces.get(key);
          const count = (previous?.count || 0) + delta;
          if (!previous?.count && count) next.characters += size;
          if (previous?.count && !count) next.characters -= previous.characters;
          changedPieces.set(key, { count, characters: size });
        }
      };
      for (const [text, bucket] of changed) {
        const previous = buckets.get(text);
        if (previous?.length) apply(selected(previous), -1);
        if (bucket.length) apply(selected(bucket), 1);
      }
      return { next, changedPieces };
    };
    const measure: LineMeasure = (added, removed) => total(changes(added, removed)).next;
    // Keep fixed additions as a small overlay instead of copying the full published inventory.
    measure.extend = (added, removed) => {
      const changed = changes(added, removed);
      const byAdded = new Map(added.map((line) => [line.key, line]));
      const { next, changedPieces } = total(changed);
      return create(
        { get: (key) => byAdded.get(key) || (removed.has(key) ? undefined : byKey.get(key)) },
        { get: (text) => changed.get(text) || buckets.get(text) },
        { get: (key) => changedPieces.get(key) || pieces.get(key) },
        next
      );
    };
    // Accepted core admissions invalidate old trials and update one flat inventory.
    // Trials remain immutable until the owner explicitly accepts a publication.
    if (storage)
      measure.accept = (added, removed) => {
        const changed = changes(added, removed);
        const { next, changedPieces } = total(changed);
        for (const key of removed) storage.byKey.delete(key);
        for (const line of added) storage.byKey.set(line.key, line);
        for (const [text, bucket] of changed) {
          if (bucket.length) storage.buckets.set(text, bucket);
          else storage.buckets.delete(text);
        }
        for (const [key, piece] of changedPieces) {
          if (piece.count) storage.pieces.set(key, piece);
          else storage.pieces.delete(key);
        }
        Object.assign(baseline, next);
      };
    return measure;
  };
  return create(byKey, buckets, pieces, { ...counts, characters }, { byKey, buckets, pieces });
}
