import * as jsYaml from 'js-yaml';

import { OntologyDataProperties } from '../types';

/**
 * Extracts YAML frontmatter from markdown or editor HTML content.
 *
 * Supports two sources supported by the app:
 * 1. Editor HTML with `<div class="yaml-frontmatter" data-yaml="...">`
 * 2. Raw markdown with `--- ... ---` header block
 *
 * Always returns an object containing only the top-level keys defined in the frontmatter.
 * In case of parse error or empty content, returns an empty object.
 */
export function extractYamlFrontmatter(content?: string): OntologyDataProperties {
  if (!content || !content.trim()) {
    return {};
  }

  let yamlRaw: string | null = null;

  // 1. Editor HTML metadata (<div class="yaml-frontmatter" data-yaml="...">)
  const htmlMatch = content.match(/<div class="yaml-frontmatter"[^>]*data-yaml="([^"]*)"/i);
  if (htmlMatch && htmlMatch[1]) {
    try {
      yamlRaw = decodeURIComponent(htmlMatch[1]);
    } catch {
      yamlRaw = null;
    }
  }

  // 2. Raw markdown frontmatter (--- ... ---)
  if (!yamlRaw) {
    const mdMatch = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n(?:---\r?\n?|---$)/);
    if (mdMatch && mdMatch[1]) {
      yamlRaw = mdMatch[1];
    }
  }

  if (!yamlRaw || !yamlRaw.trim()) {
    return {};
  }

  try {
    const loadFn =
      typeof jsYaml.load === 'function'
        ? jsYaml.load
        : (jsYaml as unknown as { default: { load: (src: string) => unknown } }).default?.load;
    if (typeof loadFn !== 'function') {
      return {};
    }
    const parsed = loadFn(yamlRaw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const normalized: OntologyDataProperties = {};
      for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
        if (val instanceof Date) {
          const iso = val.toISOString();
          normalized[key] = iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
        } else {
          normalized[key] = val as any;
        }
      }
      return normalized;
    }
  } catch {
    return {};
  }

  return {};
}
