import { InferredTopic } from './types';

const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);
const size = (text: string) => Array.from(text).length;

/** Bounded source windows include endings, so a shared long prefix does not hide the subject. */
function nameWindows(source: string, focus?: string): string[] {
  const text = source.replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  const windows = source
    .split(/(?:[|;\n\r\t]+|[.!?]\s+)/u)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => Array.from(part).length <= 72)
    .slice(0, 12);
  if (characters.length <= 72) windows.push(text);
  else {
    const positions = [0, Math.floor((characters.length - 72) / 2), characters.length - 72];
    const focused = focus && text.toLowerCase().indexOf(focus.toLowerCase());
    if (typeof focused === 'number' && focused >= 0)
      positions.unshift(Math.max(0, Array.from(text.slice(0, focused)).length - 24));
    for (const position of positions) {
      let start = position;
      let end = Math.min(characters.length, start + 72);
      const boundary = (character: string) => /[\s\p{P}\p{S}]/u.test(character);
      // Keep whole words where boundaries are available; unsegmented scripts use the same windows.
      if (start && !boundary(characters[start - 1]) && !boundary(characters[start])) {
        const next = characters.findIndex(
          (character, index) => index >= start && boundary(character)
        );
        if (next >= start && next - start <= 16) start = next + 1;
      }
      if (end < characters.length && !boundary(characters[end]) && !boundary(characters[end - 1])) {
        let previous = end - 1;
        while (previous > start && !boundary(characters[previous])) previous--;
        if (end - previous <= 16) end = previous;
      }
      windows.push(characters.slice(start, end).join('').trim());
    }
  }
  return [...new Set(windows)].filter((text) => /[^\s\p{P}\p{S}]/u.test(text));
}

interface NameCandidate {
  text: string;
  key: string;
  peers: Set<string>;
  frequency: number;
}

/** ADR-2603: automatic names describe common evidence; examples are explicitly one member. */
export function* distinguishTopicNames(
  topics: InferredTopic[],
  normalize: (text: string) => string,
  frequency: (text: string, key: string) => number
): Generator<void> {
  const normalized = new Map<string, string>();
  const keyFor = (text: string) => {
    let key = normalized.get(text);
    if (key === undefined) {
      key = normalize(text);
      normalized.set(text, key);
    }
    return key;
  };
  const buckets = new Map<string, InferredTopic[]>();
  for (const topic of topics) {
    const key = keyFor(topic.label);
    const bucket = buckets.get(key) || [];
    bucket.push(topic);
    buckets.set(key, bucket);
    topic.nameFragments = [topic.label];
    yield;
  }
  const reserved = new Set(
    [...buckets].filter(([, bucket]) => bucket.length === 1).map(([key]) => key)
  );
  for (const [, bucket] of [...buckets].sort((a, b) => compare(a[0], b[0]))) {
    if (bucket.length < 2) continue;
    const ordered = bucket.slice().sort((a, b) => compare(a.id, b.id));
    const peers = ordered.slice(0, 64);
    for (const topic of ordered) {
      const fragments = [
        topic.label,
        ...topic.evidence.flatMap((item) => item.fragments),
        ...(topic.members.length === 1 ? [topic.members[0].text] : []),
      ];
      const common = new Map<string, string>();
      for (const fragment of fragments) {
        const key = keyFor(fragment);
        if (!topic.members.every((member) => member.searchText.includes(key))) continue;
        for (const text of nameWindows(fragment)) {
          const key = keyFor(text);
          if (
            Array.from(key).length < 4 ||
            (key !== keyFor(topic.label) && Array.from(key.replace(/\p{N}/gu, '')).length < 4) ||
            !topic.members.every((m) => m.searchText.includes(key))
          )
            continue;
          const previous = common.get(key);
          if (!previous || compare(text, previous) < 0) common.set(key, text);
        }
        yield;
      }
      const candidates: NameCandidate[] = [];
      for (const [key, text] of [...common]
        .sort((a, b) => size(b[0]) - size(a[0]) || compare(a[0], b[0]))
        .slice(0, 48)) {
        candidates.push({
          text,
          key,
          peers: new Set(
            [topic, ...peers]
              .filter((peer) => peer.members.every((member) => member.searchText.includes(key)))
              .map((peer) => peer.id)
          ),
          frequency: frequency(text, key),
        });
        yield;
      }
      candidates.sort(
        (a, b) =>
          a.peers.size - b.peers.size ||
          a.frequency - b.frequency ||
          // Prefer a concise phrase once specificity is equal, avoiding procedural paragraphs.
          Number(size(a.key) < 8) - Number(size(b.key) < 8) ||
          size(a.key) - size(b.key) ||
          compare(a.key, b.key)
      );
      const options = candidates.map((candidate) => ({
        fragments:
          size(keyFor(topic.label)) <= 32 && !candidate.key.includes(keyFor(topic.label))
            ? [topic.label, candidate.text]
            : [candidate.text],
        peers: candidate.peers.size,
        frequency: candidate.frequency,
      }));
      // Two separate common phrases can distinguish a context that neither identifies alone.
      if (candidates[0]?.peers.size > 1) {
        const short = candidates.filter((item) => Array.from(item.text).length <= 48).slice(0, 8);
        for (let left = 0; left < short.length; left++) {
          for (let right = left + 1; right < short.length; right++) {
            const a = short[left];
            const b = short[right];
            if (a.key.includes(b.key) || b.key.includes(a.key)) continue;
            const peers = [...a.peers].filter((id) => b.peers.has(id)).length;
            if (peers < Math.min(a.peers.size, b.peers.size))
              options.push({
                fragments: [a.text, b.text],
                peers,
                frequency: Math.max(a.frequency, b.frequency),
              });
          }
          yield;
        }
      }
      options.sort(
        (a, b) =>
          a.peers - b.peers ||
          a.frequency - b.frequency ||
          a.fragments.length - b.fragments.length ||
          Number(size(keyFor(a.fragments[0])) < 8) - Number(size(keyFor(b.fragments[0])) < 8) ||
          size(a.fragments.join(' · ')) - size(b.fragments.join(' · ')) ||
          compare(a.fragments.join(' · '), b.fragments.join(' · '))
      );
      // Do not fall back to a generic word merely to manufacture a unique title.
      const best = options.filter(
        (option) => option.peers === options[0].peers && option.frequency === options[0].frequency
      );
      const chosen =
        best.find((option) => !reserved.has(keyFor(option.fragments.join(' · ')))) || best[0];
      if (chosen) {
        topic.nameFragments = chosen.fragments;
        topic.label = chosen.fragments.join(' · ');
        topic.searchText = keyFor(topic.label);
        reserved.add(topic.searchText);
      }
      yield;
    }
  }
  const remaining = new Map<string, InferredTopic[]>();
  for (const topic of topics) {
    const key = keyFor(topic.label);
    const bucket = remaining.get(key) || [];
    bucket.push(topic);
    remaining.set(key, bucket);
    yield;
  }
  for (const bucket of remaining.values()) {
    if (bucket.length < 2) continue;
    const used = new Set<string>();
    const ordered = bucket.slice().sort((a, b) => compare(a.id, b.id));
    const peers = ordered.slice(0, 64);
    for (const topic of ordered) {
      const examples: {
        memberId: string;
        text: string;
        key: string;
        peers: number;
        focused: boolean;
      }[] = [];
      for (const member of topic.members
        .slice()
        .sort((a, b) => compare(a.searchText, b.searchText))
        .slice(0, 8)) {
        for (const text of nameWindows(member.text, topic.nameFragments?.[0] || topic.label)) {
          const key = keyFor(text);
          if (key === keyFor(topic.label) || size(key) < 8 || used.has(key)) continue;
          examples.push({
            memberId: member.id,
            text,
            key,
            focused: (topic.nameFragments || [topic.label]).some((fragment) =>
              key.includes(keyFor(fragment))
            ),
            peers: peers.filter(
              (peer) =>
                peer !== topic && peer.members.some((other) => other.searchText.includes(key))
            ).length,
          });
        }
        yield;
      }
      examples.sort(
        (a, b) =>
          a.peers - b.peers ||
          Number(b.focused) - Number(a.focused) ||
          size(b.key) - size(a.key) ||
          compare(a.key, b.key)
      );
      if (examples[0]) {
        const { memberId, text, key } = examples[0];
        topic.example = { memberId, text };
        used.add(key);
      }
      yield;
    }
  }
}
