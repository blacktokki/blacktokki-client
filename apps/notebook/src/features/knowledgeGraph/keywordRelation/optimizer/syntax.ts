import type { RelationMention } from '../relationDiscovery';

/** Universal Dependencies labels are grammar metadata, never a vocabulary of business relations. */
export type SyntaxToken = {
  id: number;
  form: string;
  lemma: string;
  upos: string;
  xpos: string;
  head: number;
  deprel: string;
  start: number;
  end: number;
};
export type SyntaxParser = { parse: (text: string) => SyntaxToken[]; revision: string };
export type SyntaxClaim = {
  status: 'direct' | 'unresolved' | 'separate';
  reason: string;
  predicate?: string;
  roles?: string[];
  hypothesis?: string;
};
let parser: SyntaxParser | undefined;
let stage = 0;
const parsed = new Map<string, SyntaxToken[]>();

/** Explicit injection keeps model assets and licensing separate from application code. */
export function configureRelationOptimization(value: { stage: number; parser?: SyntaxParser }) {
  if (!Number.isInteger(value.stage) || value.stage < 0 || value.stage > 4)
    throw new Error('Optimization stage must be an integer from zero to four.');
  stage = value.stage;
  parser = value.parser;
  parsed.clear();
}
export const optimizationStage = () => stage;
export const syntaxRevision = () => parser?.revision || 'unavailable';
export function retainSyntaxInputs(inputs: Set<string>) {
  for (const text of parsed.keys()) if (!inputs.has(text)) parsed.delete(text);
}

/** Align real parser tokens; never guess offsets when a parser changes the source spelling. */
export function alignConllu(text: string, conllu: string): SyntaxToken[] {
  let cursor = 0;
  let base = 0;
  let largest = 0;
  const result: SyntaxToken[] = [];
  for (const line of conllu.split(/\r?\n/)) {
    if (!line.trim()) {
      base = largest;
      continue;
    }
    if (line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (!/^\d+$/.test(parts[0]) || parts.length !== 10) continue;
    const start = text.indexOf(parts[1], cursor);
    if (start < cursor || /\S/.test(text.slice(cursor, start))) return [];
    const id = Number(parts[0]) + base;
    result.push({
      id,
      form: parts[1],
      lemma: parts[2],
      upos: parts[3],
      xpos: parts[4],
      head: Number(parts[6]) ? Number(parts[6]) + base : 0,
      deprel: parts[7],
      start,
      end: start + parts[1].length,
    });
    cursor = start + parts[1].length;
    largest = Math.max(largest, id);
  }
  return /\S/.test(text.slice(cursor)) ? [] : result;
}

export function sentenceSyntax(text: string): SyntaxToken[] | undefined {
  if (!stage) return;
  if (!parser) return [];
  let tokens = parsed.get(text);
  if (!tokens) {
    // A parser failure is visible as an unresolved claim; it is never a grammar success.
    try {
      tokens = parser.parse(text);
    } catch {
      tokens = [];
    }
    parsed.set(text, tokens);
  }
  return tokens;
}

const relation = (token: SyntaxToken) => token.deprel.split(':')[0];
const predicate = (token: SyntaxToken) =>
  ['VERB', 'ADJ'].includes(token.upos) ||
  token.xpos.split('+').some((tag) => ['jp', 'paa', 'pvg', 'pvd', 'xsv', 'xsm'].includes(tag));
const argument = (token: SyntaxToken) =>
  ['nsubj', 'csubj', 'obj', 'iobj', 'obl', 'dislocated', 'advmod', 'advcl'].includes(
    relation(token)
  );

/** Require two distinct argument branches of one predicate, retaining all scope and negation. */
export function analyzeSyntaxClaim(
  text: string,
  mentions: RelationMention[]
): SyntaxClaim | undefined {
  const tokens = sentenceSyntax(text);
  if (!tokens) return;
  if (!tokens.length) return { status: 'unresolved', reason: 'syntax-unavailable' };
  if (mentions.length !== 2) return { status: 'unresolved', reason: 'ambiguous-endpoints' };
  const byId = new Map(tokens.map((token) => [token.id, token]));
  const paths = mentions.map((mention) => {
    const covered = tokens.filter(
      (token) => token.start < mention.end && token.end > mention.start
    );
    const ids = new Set(covered.map((token) => token.id));
    const heads = covered.filter((token) => !ids.has(token.head));
    if (heads.length !== 1) return [];
    const path: SyntaxToken[] = [];
    let current: SyntaxToken | undefined = heads[0];
    while (current && !path.some((token) => token.id === current!.id)) {
      path.push(current);
      current = byId.get(current.head);
    }
    return path;
  });
  if (paths.some((path) => !path.length))
    return { status: 'unresolved', reason: 'unaligned-endpoints' };
  const common = paths[0].find((token) => paths[1].some((other) => token.id === other.id));
  // Tokenizers can split a filename or mixed-language identifier into several sentences.
  // That segmentation alone is not evidence that the source asserts unrelated facts.
  if (!common) return { status: 'unresolved', reason: 'different-parser-sentences' };
  const branches = paths.map((path) =>
    path.slice(
      0,
      path.findIndex((token) => token.id === common.id)
    )
  );
  if (
    !predicate(common) &&
    branches.some((path) => !path.length) &&
    branches.every((path) => path.every((token) => !predicate(token))) &&
    branches.some((path) => path.some((token) => relation(token) === 'conj' && !predicate(token)))
  )
    return { status: 'separate', reason: 'coordinated-arguments' };
  const predicates = paths.map((path) => path.find(predicate));
  if (predicates.every(Boolean) && predicates[0]!.id !== predicates[1]!.id)
    return { status: 'unresolved', reason: 'different-predicates' };
  if (!predicate(common)) return { status: 'unresolved', reason: 'nominal-or-incomplete-claim' };
  const roles = branches.map((path) => path.at(-1));
  if (roles.some((token) => !token || !argument(token)))
    return { status: 'unresolved', reason: 'unproven-argument-roles', predicate: common.form };
  if (roles[0]!.id === roles[1]!.id || relation(roles[0]!) === relation(roles[1]!))
    return { status: 'unresolved', reason: 'same-argument-role', predicate: common.form };
  // Keep the whole source clause. Removing an adjunct could reverse a conditional or planned claim.
  return {
    status: 'direct',
    reason: 'distinct-predicate-arguments',
    predicate: common.form,
    roles: roles.map((token) => token!.deprel),
    hypothesis: text,
  };
}
