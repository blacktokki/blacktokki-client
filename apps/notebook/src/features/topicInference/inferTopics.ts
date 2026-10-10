import {
  EvidenceText,
  hasConflictingContext,
  phraseCoverage,
  phraseSpelling,
  prepareEvidenceText,
  sharedPhrases,
} from './topicEvidence';
import { distinguishTopicNames } from './topicNames';
import {
  InferredTopic,
  TopicDocument,
  TopicEvidence,
  TopicInferenceResult,
  TopicMember,
  TopicPreferences,
} from './types';

const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);

/** The same Unicode operations apply to every input, without locale or language detection. */
export const normalizeTopicText = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');

/** UI identity only; caches compare complete source strings to detect changes. */
export function topicIdentity(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(i), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

interface Unit {
  member: TopicMember;
  normalized: string;
  families: Set<string>;
  primaryFamily: string;
  features: Set<string>;
  references: Set<string>;
  weights: Map<string, number>;
  totalWeight: number;
  featureWeight: number;
  characters: string[];
  text?: EvidenceText;
  mass?: Float64Array;
  contexts: { before: string; text: string; after: string }[];
  contextText?: EvidenceText;
}

/** ADR-2603: independent of document source and language, with cooperative scheduling. */
export function* inferTopicsSteps(
  documents: TopicDocument[]
): Generator<void, TopicInferenceResult> {
  const units: Unit[] = [];
  const unitByText = new Map<string, Unit>();
  const families = new Set<string>();
  const documentIds = new Set<string>();
  const records = [];
  const preparedTexts = new Map<string, { normalized: string; characters: string[] }>();
  const canonicalBodies = new Map<string, { body: string; contentId: string }>();
  for (const document of documents) {
    const normalized = [];
    for (const section of document.sections) {
      let prepared = preparedTexts.get(section.text);
      if (!prepared) {
        const text = section.text
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[\s\p{P}\p{S}]+/gu, ' ');
        prepared = { normalized: text.replace(/ /g, ''), characters: Array.from(text) };
        preparedTexts.set(section.text, prepared);
      }
      normalized.push(prepared);
      yield;
    }
    const body = normalized.map((text) => text.normalized).join('\n');
    let family = canonicalBodies.get(body);
    if (!family) {
      family = { body, contentId: topicIdentity(body) };
      canonicalBodies.set(body, family);
    }
    records.push({ document, normalized, ...family });
    yield;
  }
  records.sort((a, b) => compare(a.body, b.body) || compare(a.document.id, b.document.id));

  for (const { document, body, normalized: texts, contentId } of records) {
    if (!body.replace(/\s/g, '')) continue;
    // Equal content contributes once; original document identities and locations remain intact.
    families.add(body);
    documentIds.add(document.id);
    for (let sectionIndex = 0; sectionIndex < document.sections.length; sectionIndex++) {
      const section = document.sections[sectionIndex];
      const { normalized, characters } = texts[sectionIndex];
      if (normalized.length < 3 || (normalized.length < 6 && Array.from(normalized).length < 3))
        continue;
      let unit = unitByText.get(normalized);
      if (!unit) {
        unit = {
          normalized,
          member: {
            id: `content:${topicIdentity(normalized)}`,
            heading: section.heading || '',
            text: section.text,
            searchText: normalized,
            occurrences: [],
          },
          families: new Set(),
          primaryFamily: body,
          features: new Set(),
          references: new Set(),
          weights: new Map(),
          totalWeight: 0,
          featureWeight: 0,
          characters,
          contexts: [],
        };
        unitByText.set(normalized, unit);
        units.push(unit);
      }
      if (!unit.families.has(body) && unit.contexts.length < 3)
        unit.contexts.push({
          before: document.sections[sectionIndex - 1]?.text || '',
          text: section.text,
          after: document.sections[sectionIndex + 1]?.text || '',
        });
      unit.families.add(body);
      unit.member.occurrences.push({
        documentId: document.id,
        contentId,
        title: document.title,
        paragraph: section.paragraph,
        section: section.section,
        sectionId: section.id,
      });
      for (const reference of section.references || []) unit.references.add(reference);
      yield;
    }
    yield;
  }

  const featureFamilies = new Map<string, Set<string>>();
  const featureWeights = new Map<string, number>();
  const postings = new Map<string, number[]>();
  const maxFrequency = Math.max(6, Math.ceil(families.size * 0.18));
  for (const unit of units) {
    // Preserve boundaries: joining a name, a template label and an ID invents false fragments.
    const characters = unit.characters;
    for (let position = 0; position < characters.length; position++) {
      for (const length of [3, 6]) {
        if (position + length <= characters.length) {
          const feature =
            length === 3
              ? characters[position] + characters[position + 1] + characters[position + 2]
              : characters.slice(position, position + length).join('');
          if (!feature.includes(' ')) unit.features.add(feature);
        }
      }
      if (position % 128 === 0) yield;
    }
    let processed = 0;
    for (const feature of unit.features) {
      const documentsForFeature = featureFamilies.get(feature) || new Set<string>();
      for (const family of unit.families) documentsForFeature.add(family);
      featureFamilies.set(feature, documentsForFeature);
      if (++processed % 128 === 0) yield;
    }
    yield;
  }

  for (let index = 0; index < units.length; index++) {
    const unit = units[index];
    let processed = 0;
    for (const feature of unit.features) {
      const frequency = featureFamilies.get(feature)!.size;
      if (frequency <= maxFrequency) {
        let weight = featureWeights.get(feature);
        if (weight === undefined) {
          weight = Math.log(1 + families.size / frequency);
          featureWeights.set(feature, weight);
        }
        unit.featureWeight += weight;
        if (frequency >= 2) {
          unit.weights.set(feature, weight);
          const list = postings.get(feature) || [];
          if (list.length <= 64) list.push(index);
          postings.set(feature, list);
        }
      }
      if (++processed % 128 === 0) yield;
    }
    yield;
  }

  function* prepareMass(unit: Unit): Generator<void> {
    if (unit.mass) return;
    unit.mass = new Float64Array(unit.characters.length + 1);
    // Non-overlapping tiles approximate information density; exact phrase coverage never double counts.
    for (let position = 0; position < unit.characters.length; position += 3) {
      const weight = Math.max(
        featureWeights.get(unit.text!.grams[position]) || 0,
        featureWeights.get(unit.characters.slice(position, position + 6).join('')) || 0
      );
      for (let offset = position; offset < Math.min(position + 3, unit.characters.length); offset++)
        unit.mass[offset + 1] = unit.mass[offset] + weight;
      if (position % 128 === 0) yield;
    }
    unit.totalWeight = unit.mass[unit.characters.length];
    yield;
  }

  const adjacency = units.map(() => new Map<number, TopicEvidence>());
  const compared = new Set<string>();
  const independent = (left: Unit, right: Unit) =>
    left.families.size > 1 || right.families.size > 1 || left.primaryFamily !== right.primaryFamily;
  function* connect(index: number, target: number): Generator<void> {
    const unit = units[index];
    const key = `${Math.min(index, target)}:${Math.max(index, target)}`;
    if (compared.has(key)) return;
    compared.add(key);
    const other = units[target];
    if (!independent(unit, other)) return;
    let approximate = 0;
    let sharedCount = 0;
    const shorter = unit.weights.size <= other.weights.size ? unit : other;
    const longer = shorter === unit ? other : unit;
    for (const [feature, weight] of shorter.weights) {
      if (longer.weights.has(feature)) {
        approximate += weight;
        sharedCount++;
      }
    }
    if (sharedCount < 3 || approximate / Math.sqrt(unit.featureWeight * other.featureWeight) < 0.12)
      return;
    const references = [...unit.references].filter((reference) => other.references.has(reference));
    const directReference =
      unit.member.occurrences.some((occurrence) =>
        other.references.has(`document:${occurrence.documentId}`)
      ) ||
      other.member.occurrences.some((occurrence) =>
        unit.references.has(`document:${occurrence.documentId}`)
      );
    if (
      approximate / Math.sqrt(unit.featureWeight * other.featureWeight) <
      (directReference || references.length ? 0.12 : 0.23)
    )
      return;
    unit.text ||= prepareEvidenceText(unit.member.text);
    other.text ||= prepareEvidenceText(other.member.text);
    const phrases = sharedPhrases(unit.text, other.text, unit.weights, false);
    const substantial = phrases.filter((phrase) => phrase.size >= 4);
    if (!substantial.length) return;
    const longest = Math.max(...substantial.map((phrase) => phrase.size));
    let contextFragments: string[] = [];
    // A single short word needs surrounding body evidence, even with an explicit link.
    if (longest < 12 && substantial.length < 2) {
      const contextText = (context: Unit['contexts']) =>
        context
          .map(({ before, text, after }) =>
            [
              Array.from(before).slice(-240).join(''),
              text,
              Array.from(after).slice(0, 240).join(''),
            ].join('\n')
          )
          .join('\n');
      unit.contextText ||= prepareEvidenceText(contextText(unit.contexts));
      other.contextText ||= prepareEvidenceText(contextText(other.contexts));
      const contextWeights = new Map<string, number>();
      for (const feature of unit.contextText.positions.keys()) {
        const frequency = featureFamilies.get(feature)?.size;
        if (frequency && frequency >= 2 && frequency <= maxFrequency)
          contextWeights.set(feature, 1);
      }
      const context = sharedPhrases(unit.contextText, other.contextText, contextWeights, false)
        .map((phrase) => ({
          phrase,
          extra: Array.from(
            substantial
              .reduce((key, core) => key.replaceAll(core.key, ''), phrase.key)
              .replace(/ /g, '')
          ).length,
        }))
        .filter((item) => item.extra >= 4);
      if (!context.some((item) => item.extra >= 8) && context.length < 2) return;
      contextFragments = context
        .slice(0, 2)
        .map(({ phrase }) => phraseSpelling(unit.contextText!, phrase.left, phrase.length));
    }
    if (hasConflictingContext(phrases, unit.text, other.text)) return;
    yield* prepareMass(unit);
    yield* prepareMass(other);
    const denominator = Math.sqrt(unit.totalWeight * other.totalWeight);
    const sharedWeight = Math.sqrt(
      phraseCoverage(substantial, unit.mass!, 'left') *
        phraseCoverage(substantial, other.mass!, 'right')
    );
    const similarity = denominator ? sharedWeight / denominator : 0;
    // References support matching content; a link alone is never proof of a semantic topic.
    if (similarity < (directReference || references.length ? 0.12 : 0.22)) return;
    const fragments = substantial
      .sort((a, b) => b.size - a.size || compare(a.key, b.key))
      .slice(0, 5)
      .map((phrase) => phraseSpelling(unit.text!, phrase.left, phrase.length));
    const evidence: TopicEvidence = {
      source: unit.member.id,
      target: other.member.id,
      fragments,
      contextFragments,
      references: directReference ? [...references, 'document-reference'] : references,
      weight: similarity + (directReference || references.length ? 0.1 : 0),
    };
    adjacency[index].set(target, evidence);
    adjacency[target].set(index, evidence);
    yield;
  }

  for (let index = 0; index < units.length; index++) {
    const unit = units[index];
    const candidates = new Map<number, number>();
    const candidateText = unit.characters.join('');
    const indexedPositions = new Uint8Array(candidateText.length);
    const informative: [string, number][] = [];
    for (const entry of [...unit.weights]
      .filter(([feature]) => postings.get(feature)!.length <= 64)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || compare(a[0], b[0]))) {
      const start = candidateText.indexOf(entry[0]);
      const end = start + entry[0].length;
      // Candidate ranking also counts a run once instead of rewarding sliding windows of one word.
      let overlap = 0;
      for (let i = start; i < end; i++) overlap += indexedPositions[i];
      if (overlap > entry[0].length / 2) continue;
      indexedPositions.fill(1, start, end);
      informative.push(entry);
      if (informative.length === 48) break;
    }
    let indexed = 0;
    for (const [feature, weight] of informative) {
      const matches = postings.get(feature)!;
      if (matches.length > 64) continue;
      for (const target of matches) {
        if (target !== index && independent(unit, units[target]))
          candidates.set(target, (candidates.get(target) || 0) + weight);
      }
      if (++indexed % 8 === 0) yield;
    }
    const selected = [...candidates].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    for (const [target] of selected) {
      yield* connect(index, target);
    }
    yield;
  }

  const drafts: { indexes: number[]; label: string; key: string }[] = [];
  const signatures = new Set<string>();
  const strengths = adjacency.map((neighbors) =>
    [...neighbors.values()].reduce((sum, e) => sum + e.weight, 0)
  );
  const ranked = units
    .map((_, i) => i)
    .sort((a, b) => strengths[b] - strengths[a] || compare(units[a].member.id, units[b].member.id));
  const coresByEvidence = new Map<TopicEvidence, { key: string; label: string }[]>();
  const normalizedFragments = new Map<string, string>();
  const normalizeFragment = (text: string) => {
    let normalized = normalizedFragments.get(text);
    if (normalized === undefined) {
      normalized = normalizeTopicText(text);
      normalizedFragments.set(text, normalized);
    }
    return normalized;
  };
  const coreFamilies = new Map<string, Set<string>>();
  const familiesForCore = (label: string, key: string) => {
    const cached = coreFamilies.get(key);
    if (cached) return cached;
    const characters = Array.from(
      label
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    );
    let rarest: string | undefined;
    let bound = families.size;
    for (let position = 0; position < characters.length; position++) {
      for (const length of [3, 6]) {
        const feature = characters.slice(position, position + length).join('');
        if (position + length > characters.length || feature.includes(' ')) continue;
        const count = featureFamilies.get(feature)?.size;
        if (count && count < bound) {
          bound = count;
          rarest = feature;
        }
      }
    }
    const matches = (rarest && featureFamilies.get(rarest)) || families;
    const matching = new Set([...matches].filter((family) => family.includes(key)));
    coreFamilies.set(key, matching);
    return matching;
  };
  const coreFrequency = (label: string, key: string) => familiesForCore(label, key).size;
  for (const index of ranked) {
    const candidates = [...adjacency[index]].sort(
      (a, b) => b[1].weight - a[1].weight || a[0] - b[0]
    );
    const repeatedContent = units[index].families.size >= 2 && units[index].weights.size >= 3;
    if (!candidates.length && repeatedContent) {
      const label = Array.from(units[index].member.text.replace(/\s+/g, ' ').trim())
        .slice(0, 72)
        .join('');
      drafts.push({ indexes: [index], label, key: normalizeTopicText(label) });
      continue;
    }
    const supported = new Map<string, { label: string; neighbors: Set<number> }>();
    for (const [target, evidence] of candidates) {
      let cores = coresByEvidence.get(evidence);
      if (!cores) {
        const words = evidence.fragments
          .flatMap((fragment) => fragment.split(/[\s\p{P}\p{S}]+/u))
          .filter((word) => Array.from(word).length >= 4 && /\p{L}/u.test(word));
        cores = [
          ...evidence.fragments,
          ...words.sort((a, b) => b.length - a.length || compare(a, b)).slice(0, 8),
        ].map((label) => ({ label, key: normalizeFragment(label) }));
        coresByEvidence.set(evidence, cores);
      }
      for (const core of cores) {
        const support = supported.get(core.key) || {
          label: core.label,
          neighbors: new Set<number>(),
        };
        support.neighbors.add(target);
        supported.set(core.key, support);
      }
    }
    let produced = 0;
    for (const [key, core] of [...supported]
      .sort(
        (a, b) =>
          b[1].neighbors.size - a[1].neighbors.size ||
          b[0].length - a[0].length ||
          compare(a[0], b[0])
      )
      .slice(0, 12)) {
      const neighbors: number[] = [];
      for (const [target] of candidates) {
        if (
          core.neighbors.has(target) &&
          neighbors.every((accepted) => adjacency[accepted].has(target))
        )
          neighbors.push(target);
        if (neighbors.length === 24) break;
      }
      if (!neighbors.length) continue;
      const indexes = [index, ...neighbors].sort((a, b) => a - b);
      const signature = indexes.join('|');
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      // Each clique has one common body core; different pairwise cores cannot create a mixed topic.
      if (!indexes.every((member) => units[member].normalized.includes(key))) continue;
      const common = neighbors
        .flatMap((member) => adjacency[index].get(member)!.fragments)
        .filter((fragment) => {
          const normalized = normalizeFragment(fragment);
          return (
            normalized.includes(key) &&
            indexes.every((member) => units[member].normalized.includes(normalized))
          );
        })
        .sort((a, b) => Array.from(b).length - Array.from(a).length || compare(a, b));
      const label = Array.from((common[0] || core.label).replace(/\s+/g, ' ').trim())
        .slice(0, 72)
        .join('');
      drafts.push({ indexes, label, key: normalizeFragment(label) });
      yield;
      if (++produced === 3) break;
    }
    yield;
  }

  // Only overlapping groups are candidates; missing pairs use the same body verification.
  drafts.sort((a, b) => b.indexes.length - a.indexes.length || compare(a.key, b.key));
  const groups: typeof drafts = [];
  const groupsByMember = new Map<number, Set<number>>();
  let remainingChecks = units.length;
  for (const draft of drafts) {
    const candidates = new Map<number, number>();
    for (const member of draft.indexes) {
      for (const group of groupsByMember.get(member) || [])
        candidates.set(group, (candidates.get(group) || 0) + 1);
    }
    let consolidated = false;
    for (const [groupIndex, overlap] of [...candidates]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 32)) {
      const group = groups[groupIndex];
      if (
        overlap === draft.indexes.length &&
        (group.key.includes(draft.key) || draft.key.includes(group.key))
      ) {
        consolidated = true;
        break;
      }
      if (
        group.key !== draft.key &&
        overlap / Math.min(group.indexes.length, draft.indexes.length) < 0.6
      )
        continue;
      if (!group.key.includes(draft.key) && !draft.key.includes(group.key)) continue;
      const combined = [...new Set([...group.indexes, ...draft.indexes])];
      if (
        combined.length > 25 ||
        !combined.every((member) => units[member].normalized.includes(group.key))
      )
        continue;
      let compatible = true;
      for (let left = 0; left < combined.length && compatible; left++) {
        for (let right = left + 1; right < combined.length; right++) {
          const a = combined[left];
          const b = combined[right];
          const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
          if (!adjacency[a].has(b) && !compared.has(key) && remainingChecks > 0) {
            remainingChecks--;
            yield* connect(a, b);
          }
          if (!adjacency[a].has(b)) {
            compatible = false;
            break;
          }
        }
        yield;
      }
      if (!compatible) continue;
      group.indexes = combined.sort((a, b) => a - b);
      for (const member of combined) {
        const indexed = groupsByMember.get(member) || new Set<number>();
        indexed.add(groupIndex);
        groupsByMember.set(member, indexed);
      }
      consolidated = true;
      break;
    }
    if (!consolidated) {
      const index = groups.length;
      groups.push(draft);
      for (const member of draft.indexes) {
        const indexed = groupsByMember.get(member) || new Set<number>();
        indexed.add(index);
        groupsByMember.set(member, indexed);
      }
    }
    yield;
  }
  // A matching pair is a lead, not necessarily a notebook-level topic. Larger corpora need
  // recurrence in more independent contents; detailed, strong two-content evidence is retained.
  const minimumContents = Math.min(4, Math.max(2, Math.ceil(Math.log2(families.size || 1) / 2.5)));
  let promoted: typeof groups = [];
  for (const group of groups) {
    const support = new Set(group.indexes.flatMap((index) => [...units[index].families])).size;
    const evidence = group.indexes.slice(1).map((index) => adjacency[group.indexes[0]].get(index)!);
    const detailedPair =
      evidence.length > 0 &&
      evidence.every(
        (item) =>
          item.weight >= 0.65 &&
          item.fragments.some((fragment) => Array.from(normalizeFragment(fragment)).length >= 24)
      );
    if (support < Math.min(3, minimumContents) && !detailedPair) continue;
    const common = [...new Set(evidence.flatMap((item) => item.fragments))]
      .filter((fragment) => {
        const key = normalizeFragment(fragment);
        return (
          !group.key.includes(key) &&
          group.indexes.every((index) => units[index].normalized.includes(key))
        );
      })
      .sort((a, b) => b.length - a.length || compare(a, b))
      .slice(0, 2);
    // Shared corroboration distinguishes a specific subject from other uses of the same name.
    let matching = familiesForCore(group.label, group.key);
    for (const fragment of common) {
      const supported = familiesForCore(fragment, normalizeFragment(fragment));
      matching = new Set([...matching].filter((family) => supported.has(family)));
    }
    const specificFacet =
      support >= 3 &&
      common.length > 0 &&
      support >= Math.ceil(matching.size / 2) &&
      evidence.every((item) => item.weight >= 0.35);
    if (
      (support >= minimumContents || detailedPair || specificFacet) &&
      support >= Math.ceil(matching.size / 4)
    )
      promoted.push(group);
    yield;
  }
  // Merge only already-supported topics: combining weak leads must not manufacture recurrence.
  const consolidated: typeof groups = [];
  const groupsByCore = new Map<string, number[]>();
  for (const draft of promoted) {
    const candidates = groupsByCore.get(draft.key) || [];
    let merged = false;
    for (const index of candidates) {
      const group = consolidated[index];
      const combined = [...new Set([...group.indexes, ...draft.indexes])].sort((a, b) => a - b);
      if (combined.length > 25) continue;
      let compatible = true;
      for (let left = 0; left < combined.length && compatible; left++) {
        for (let right = left + 1; right < combined.length; right++) {
          const a = combined[left];
          const b = combined[right];
          const key = `${a}:${b}`;
          if (!adjacency[a].has(b) && !compared.has(key) && remainingChecks > 0) {
            remainingChecks--;
            yield* connect(a, b);
          }
          if (!adjacency[a].has(b)) {
            compatible = false;
            break;
          }
        }
        yield;
      }
      if (!compatible) continue;
      group.indexes = combined;
      merged = true;
      break;
    }
    if (!merged) {
      if (candidates.length < 32) candidates.push(consolidated.length);
      groupsByCore.set(draft.key, candidates);
      consolidated.push(draft);
    }
    yield;
  }
  promoted = consolidated;
  // Prefer the more distinguishing name when different drafts reach the same membership.
  promoted.sort(
    (a, b) =>
      coreFrequency(a.label, a.key) - coreFrequency(b.label, b.key) ||
      b.key.length - a.key.length ||
      compare(a.key, b.key)
  );
  const promotedByMember = new Map<number, number[]>();
  promoted.forEach((group, index) =>
    group.indexes.forEach((member) => {
      const list = promotedByMember.get(member) || [];
      list.push(index);
      promotedByMember.set(member, list);
    })
  );
  const topics: InferredTopic[] = [];
  const covered = new Set<string>();
  const emitted = new Set<string>();
  for (const group of promoted) {
    // A smaller facet adds no source content when one existing topic already contains it all.
    const candidates = promotedByMember.get(group.indexes[0]) || [];
    if (
      candidates.some((index) => {
        const other = promoted[index];
        return (
          other.indexes.length > group.indexes.length &&
          group.indexes.every((member) => other.indexes.includes(member)) &&
          coreFrequency(other.label, other.key) <= coreFrequency(group.label, group.key)
        );
      })
    )
      continue;
    const signature = group.indexes.join('|');
    if (emitted.has(signature)) continue;
    emitted.add(signature);
    const members = group.indexes.map((index) => units[index].member);
    const evidence: TopicEvidence[] = [];
    for (const member of group.indexes.slice(1))
      evidence.push(adjacency[group.indexes[0]].get(member)!);
    members.forEach((member) => covered.add(member.id));
    topics.push({
      id: `topic:${topicIdentity(
        members
          .map((member) => member.id)
          .sort(compare)
          .join('|')
      )}`,
      label: group.label,
      searchText: group.key,
      members,
      evidence,
      documentCount: new Set(group.indexes.flatMap((index) => [...units[index].families])).size,
      kind: 'INFERRED',
    });
    yield;
  }

  yield* distinguishTopicNames(topics, normalizeFragment, coreFrequency);
  topics.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      b.documentCount - a.documentCount ||
      compare(a.searchText, b.searchText) ||
      compare(a.id, b.id)
  );

  return {
    topics,
    unclassified: units.filter((unit) => !covered.has(unit.member.id)).map((unit) => unit.member),
    documentCount: documentIds.size,
    distinctContentCount: families.size,
    sectionCount: units.length,
    comparedPairCount: compared.size,
  };
}

export const emptyTopicPreferences = (): TopicPreferences => ({
  labels: {},
  excluded: {},
  hidden: [],
  collections: [],
});

/** User curation never changes inferred facts or original notes. */
export function curateTopics(
  result: TopicInferenceResult,
  preferences: TopicPreferences
): TopicInferenceResult {
  const allMembers = new Map<string, TopicMember>();
  for (const topic of result.topics)
    topic.members.forEach((member) => allMembers.set(member.id, member));
  result.unclassified.forEach((member) => allMembers.set(member.id, member));
  const topics: InferredTopic[] = result.topics
    .filter((topic) => !preferences.hidden.includes(topic.id))
    .map((topic) => {
      const members = topic.members.filter(
        (member) => !preferences.excluded[topic.id]?.includes(member.id)
      );
      const ids = new Set(members.map((member) => member.id));
      return {
        ...topic,
        label: preferences.labels[topic.id] || topic.label,
        nameFragments: preferences.labels[topic.id] ? undefined : topic.nameFragments,
        example: topic.example && ids.has(topic.example.memberId) ? topic.example : undefined,
        searchText: preferences.labels[topic.id]
          ? normalizeTopicText(preferences.labels[topic.id])
          : topic.searchText,
        members,
        documentCount: new Set(
          members.flatMap((member) => member.occurrences.map((o) => o.contentId))
        ).size,
        evidence: topic.evidence.filter((e) => ids.has(e.source) && ids.has(e.target)),
      };
    })
    .filter((topic) => topic.members.length > 0);
  for (const collection of preferences.collections) {
    if (preferences.hidden.includes(collection.id)) continue;
    const members = [...new Set(collection.memberIds)]
      .filter((id) => !preferences.excluded[collection.id]?.includes(id))
      .flatMap((id) => (allMembers.get(id) ? [allMembers.get(id)!] : []));
    if (members.length)
      topics.push({
        id: collection.id,
        label: preferences.labels[collection.id] || collection.label,
        searchText: normalizeTopicText(preferences.labels[collection.id] || collection.label),
        members,
        documentCount: new Set(
          members.flatMap((member) => member.occurrences.map((o) => o.contentId))
        ).size,
        evidence: [],
        kind: 'CURATED',
      });
  }
  const covered = new Set(topics.flatMap((topic) => topic.members.map((member) => member.id)));
  return {
    ...result,
    topics,
    unclassified: [...allMembers.values()].filter((member) => !covered.has(member.id)),
  };
}
