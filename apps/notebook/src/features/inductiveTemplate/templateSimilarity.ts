import { extractStructure } from './inference';
import { TemplateCandidate } from './types';

export type SimilarTemplateGroup = {
  templates: TemplateCandidate[];
  /** Minimum pairwise structural similarity, or null for a single template. */
  similarity: number | null;
};

type BlockSignature = Map<string, number>;
type Signature = { exact: BlockSignature; layout: BlockSignature; rows: BlockSignature };
type RenderMarkdown = (markdown: string) => string;
const weights = { heading: 2, field: 1, table: 3, row: 1, list: 1, date: 1 };
export const TEMPLATE_SIMILARITY_THRESHOLD = 2 / 3;

function signature(template: TemplateCandidate, render: RenderMarkdown): Signature {
  const skeleton = template.markdown
    .replace(/\{\{\s*(?:Date|날짜)(?:\s*\(\d+\))?\s*\}\}/g, '2000-01-01')
    .replace(/\{\{\s*([^{}\n]{1,100}?)\s*\}\}/g, '{{}}');
  const blocks = extractStructure({ title: '{{}}', description: render(skeleton) });
  const exact = new Map(blocks.map((block) => [block.id, weights[block.kind]]));
  const layout: BlockSignature = new Map();
  const rows: BlockSignature = new Map();
  const ids = new Map<string, string>();
  const tables = new Map<string, number>();
  for (const block of blocks) {
    const parent = ids.get(block.parentId || '') || '';
    let id = parent + block.id.slice((block.parentId || '').length);
    if (block.kind === 'table') {
      const occurrence = (tables.get(parent) || 0) + 1;
      tables.set(parent, occurrence);
      id = `${parent}/table:${occurrence}`;
      const columns = new Map<string, number>();
      for (const column of block.columns || []) {
        const label = column
          .normalize('NFC')
          .toLowerCase()
          .replace(/(\p{Script=Hangul})\s+(?=\p{Script=Hangul})/gu, '$1');
        const count = (columns.get(label) || 0) + 1;
        columns.set(label, count);
        layout.set(`${id}/column/${encodeURIComponent(label)}:${count}`, 1);
      }
    } else (block.kind === 'row' ? rows : layout).set(id, weights[block.kind]);
    ids.set(block.id, id);
  }
  return { exact, layout, rows };
}

function weightedOverlap(a: BlockSignature, b: BlockSignature): number {
  const union = new Set([...a.keys(), ...b.keys()]);
  let shared = 0;
  let total = 0;
  for (const key of union) {
    shared += Math.min(a.get(key) || 0, b.get(key) || 0);
    total += Math.max(a.get(key) || 0, b.get(key) || 0);
  }
  return total ? shared / total : 0;
}

function overlap(a: Signature, b: Signature): number {
  const layout = weightedOverlap(a.layout, b.layout);
  const rows = weightedOverlap(a.rows, b.rows);
  return Math.max(weightedOverlap(a.exact, b.exact), layout * 0.9 + rows * 0.1);
}

/**
 * Compare exact weighted structure and common layout, using the stronger score.
 * Layout compares table columns individually; row labels provide 10% of its score.
 * IDs retain section ancestry and occurrences; source paths and entered values are excluded.
 * Standalone dates and placeholders are normalized before extraction so changing dates or
 * field values cannot lower the similarity of otherwise identical forms.
 */
export function templateSimilarity(
  a: TemplateCandidate,
  b: TemplateCandidate,
  render: RenderMarkdown
): number {
  return overlap(signature(a, render), signature(b, render));
}

/**
 * Flat groups require every pair to meet exactly 2 / 3, avoiding weak similarity chains.
 * Rounded display percentages are not used for membership: 66% is below the boundary.
 * Report the minimum pairwise similarity while retaining each template's own body and sources.
 * Rank templates by source count after grouping so display order cannot change memberships.
 * Groups use their largest member's source count; ties retain the existing structural order.
 */
export function groupSimilarTemplates(
  templates: TemplateCandidate[],
  render: RenderMarkdown
): SimilarTemplateGroup[] {
  const ordered = [...templates].sort(
    (a, b) => a.markdown.localeCompare(b.markdown) || a.name.localeCompare(b.name)
  );
  const signatures = ordered.map((template) => signature(template, render));
  const groups: { indices: number[]; similarity: number | null }[] = [];
  for (let index = 0; index < ordered.length; index++) {
    let best: { group: (typeof groups)[number]; similarity: number } | undefined;
    for (const group of groups) {
      const similarity = Math.min(
        ...group.indices.map((other) => overlap(signatures[index], signatures[other]))
      );
      if (similarity >= TEMPLATE_SIMILARITY_THRESHOLD && (!best || similarity > best.similarity))
        best = { group, similarity };
    }
    if (best) {
      best.group.indices.push(index);
      best.group.similarity = Math.min(best.group.similarity ?? 1, best.similarity);
    } else groups.push({ indices: [index], similarity: null });
  }
  return groups
    .map((group) => ({
      templates: group.indices
        .map((index) => ordered[index])
        .sort((a, b) => b.sourceTitles.length - a.sourceTitles.length),
      similarity: group.similarity,
    }))
    .sort((a, b) => b.templates[0].sourceTitles.length - a.templates[0].sourceTitles.length);
}
