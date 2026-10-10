import { toRaw } from '@blacktokki/editor';

const decodeEntities = (html: string): string =>
  html.replace(/&(?:quot|apos|amp|lt|gt|nbsp|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = {
      '&quot;': '"',
      '&apos;': "'",
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&nbsp;': ' ',
    };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const value = entity.slice(2, -1);
    const point = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd';
  });

/** Decode embedded markup in prose, while preserving literal markup inside code examples. */
export function topicHtml(html: string): string {
  if (!/&lt;\/?[a-z]/i.test(html)) return html;
  // Decode the whole stream: Markdown may have inserted paragraphs inside an escaped table.
  return html.replace(
    /<(pre|code)\b[^>]*>[\s\S]*?<\/\1>|&lt;(\/?[a-z][\s\S]*?)&gt;/gi,
    (match, code, tag: string) => (code ? match : `<${decodeEntities(tag)}>`)
  );
}

/** Human-readable paragraphs and table rows are also the only text passed to inference. */
export function topicPlainText(html: string): string {
  const safe = html.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const rows = safe.replace(
    /<tr\b[^>]*>[\s\S]*?<\/tr>/gi,
    (row) =>
      row
        .replace(/<\/(?:p|li|div|blockquote)>|<br\s*\/?>/gi, ' ')
        .replace(/<\/(?:td|th)>/gi, ' | $&') + '\n\n'
  );
  const separated = rows.replace(/<\/(?:p|li|pre|div|blockquote)>|<br\s*\/?>/gi, '$&\n\n');
  // The editor's non-DOM fallback removes literal newlines; entities preserve our block boundaries.
  const text =
    typeof DOMParser === 'undefined'
      ? decodeEntities(toRaw(separated.replace(/\n/g, '&#10;')))
      : toRaw(separated);
  return text.replace(/[ \t]*\|[ \t]*(?=\n|$)/g, '').trim();
}
