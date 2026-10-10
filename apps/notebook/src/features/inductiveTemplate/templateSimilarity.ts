import { extractStructure } from './inference';
import { TemplateCandidate } from './types';

export type SimilarTemplateGroup = {
  templates: TemplateCandidate[];
  /** Minimum pairwise structural similarity, or null for a single template. */
  similarity: number | null;
};

type Signature = Map<string, number>;
type RenderMarkdown = (markdown: string) => string;
const weights = { heading: 2, field: 1, table: 3, row: 1, list: 1, date: 1 };
export const TEMPLATE_SIMILARITY_THRESHOLD = 2 / 3;

function signature(template: TemplateCandidate, render: RenderMarkdown): Signature {
  const skeleton = template.markdown
    .replace(/\{\{\s*(?:Date|날짜)(?:\s*\(\d+\))?\s*\}\}/g, '2000-01-01')
    .replace(/\{\{\s*([^{}\n]{1,100}?)\s*\}\}/g, '{{}}');
  return new Map(
    extractStructure({ title: '{{}}', description: render(skeleton) }).map((block) => [
      block.id,
      weights[block.kind],
    ])
  );
}

function overlap(a: Signature, b: Signature): number {
  const union = new Set([...a.keys(), ...b.keys()]);
  let shared = 0;
  let total = 0;
  for (const key of union) {
    shared += Math.min(a.get(key) || 0, b.get(key) || 0);
    total += Math.max(a.get(key) || 0, b.get(key) || 0);
  }
  return total ? shared / total : 0;
}

/** Compare structure, including section ancestry and table columns, without source paths or values. */
export function templateSimilarity(
  a: TemplateCandidate,
  b: TemplateCandidate,
  render: RenderMarkdown
): number {
  return overlap(signature(a, render), signature(b, render));
}

/** Flat groups require every member pair to meet the threshold, avoiding weak similarity chains. */
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
  return groups.map((group) => ({
    templates: group.indices.map((index) => ordered[index]),
    similarity: group.similarity,
  }));
}
