import { extractHtmlLinks } from '@blacktokki/editor';

import { topicHtml, topicPlainText } from './topicText';
import { TopicDocument, TopicSection } from './types';
import { parseHtmlToParagraphs, Paragraph } from '../../components/HeaderSelectBar';
import { urlToNoteLink } from '../../components/SearchBar';
import { Content } from '../../types';

export type TopicDocumentCache = Map<
  string,
  { description: string; title: string; referenceScope: string; document: TopicDocument }
>;

/** All headings participate; headerless text uses bounded blocks, without language-specific rules. */
export function* extractTopicDocumentsSteps(
  contents: Content[],
  cache: TopicDocumentCache
): Generator<void, TopicDocument[]> {
  const documents: TopicDocument[] = [];
  const paragraphsByHtml = new Map<string, Paragraph[]>();
  const headingsByHtml = new Map<string, string>();
  const resolvedReferences = new Map<string, string>();
  const blocksByHtml = new Map<
    string,
    {
      text: string;
      withoutLinks: string;
      links: ReturnType<typeof extractHtmlLinks>;
      chunks?: string[];
    }
  >();
  const idsByTitle = new Map(contents.map((content) => [content.title, String(content.id)]));
  const referenceScope = contents
    .map((content) => `${content.title}\0${content.id}`)
    .sort()
    .join('\n');
  const seen = new Set<string>();
  for (const content of contents) {
    const id = String(content.id);
    seen.add(id);
    const description = content.description || '';
    const cached = cache.get(id);
    if (
      cached?.description === description &&
      cached.title === content.title &&
      cached.referenceScope === referenceScope
    ) {
      documents.push(cached.document);
      yield;
      continue;
    }
    let paragraphs = paragraphsByHtml.get(description);
    if (!paragraphs) {
      paragraphs =
        typeof DOMParser === 'undefined'
          ? [{ path: '', title: '', level: 0, header: '', description }]
          : parseHtmlToParagraphs(description);
      paragraphsByHtml.set(description, paragraphs);
    }
    const sections: TopicSection[] = [];
    for (const paragraph of paragraphs) {
      let parsedBlock = blocksByHtml.get(paragraph.description);
      if (!parsedBlock) {
        const html = topicHtml(paragraph.description);
        const text = topicPlainText(html);
        const hasLinks = /<a\b/i.test(html);
        parsedBlock = {
          text,
          withoutLinks: hasLinks
            ? topicPlainText(html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ''))
            : text,
          links: typeof DOMParser === 'undefined' || !hasLinks ? [] : extractHtmlLinks(html),
        };
        blocksByHtml.set(paragraph.description, parsedBlock);
      }
      const { text, withoutLinks } = parsedBlock;
      // Link-only navigation/footer blocks provide no independent topical content.
      if (withoutLinks.replace(/[\s\p{P}\p{S}]/gu, '').length < 3) {
        yield;
        continue;
      }
      const references: { reference: string; text: string }[] = [];
      for (const link of parsedBlock.links) {
        const rawUrl = 'rawUrl' in link && typeof link.rawUrl === 'string' ? link.rawUrl : link.url;
        try {
          // Absolute references share one resolution; relative files retain their document base.
          const key = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(rawUrl)
            ? rawUrl
            : `${content.title}\0${rawUrl}`;
          const resolved = resolvedReferences.get(key);
          if (resolved !== undefined) {
            if (resolved) references.push({ reference: resolved, text: link.text });
            continue;
          }
          const target = urlToNoteLink(rawUrl, content.title);
          const targetId = target ? idsByTitle.get(target.title) : undefined;
          const reference = targetId
            ? `document:${targetId}`
            : /^https?:\/\//i.test(link.url)
            ? link.url
            : '';
          resolvedReferences.set(key, reference);
          if (reference) references.push({ reference, text: link.text });
        } catch {
          /* Invalid links do not prevent body-based inference. */
        }
      }
      let heading = headingsByHtml.get(paragraph.title);
      if (heading === undefined) {
        heading = topicPlainText(topicHtml(paragraph.title));
        headingsByHtml.set(paragraph.title, heading);
      }
      if (!parsedBlock.chunks) {
        parsedBlock.chunks = [];
        for (const block of text.split(/\n\s*\n/).filter((block) => block.trim())) {
          // A footer in a content paragraph must not become an independent content unit.
          const prose = parsedBlock.links.reduce(
            (value, link) => (link.text ? value.replaceAll(link.text, '') : value),
            block
          );
          const independentLength = prose.replace(/[\s\p{P}\p{S}]/gu, '').length;
          if (
            independentLength < 3 ||
            independentLength < block.replace(/[\s\p{P}\p{S}]/gu, '').length * 0.2
          )
            continue;
          const characters = Array.from(block.trim());
          for (let offset = 0; offset < characters.length; offset += 600)
            parsedBlock.chunks.push(characters.slice(offset, offset + 600).join(''));
          yield;
        }
      }
      let blockIndex = 0;
      for (const chunk of parsedBlock.chunks) {
        sections.push({
          id: `${paragraph.path}:${paragraph.autoSection || ''}:${blockIndex++}`,
          heading,
          text: chunk,
          references: [
            ...new Set(
              references
                .filter((link) => link.text && chunk.includes(link.text))
                .map((link) => link.reference)
            ),
          ],
          paragraph: paragraph.title || undefined,
          section: paragraph.autoSection,
        });
        yield;
      }
      yield;
    }
    const document: TopicDocument = { id, title: content.title, sections };
    cache.set(id, { description, title: content.title, referenceScope, document });
    documents.push(document);
    yield;
  }
  for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id);
  return documents;
}
