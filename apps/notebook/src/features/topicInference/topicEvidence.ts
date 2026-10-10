/** Character offsets retain readable source spelling, including supplementary Unicode characters. */
export interface EvidenceText {
  source: string;
  characters: string[];
  offsets?: number[];
  ends?: number[];
  positions: Map<string, number[]>;
  grams: string[];
}

export interface SharedPhrase {
  key: string;
  text: string;
  left: number;
  right: number;
  length: number;
  size: number;
}

export function prepareEvidenceText(text: string): EvidenceText {
  const source = text.normalize('NFKC');
  const characters = Array.from(source.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' '));
  const positions = new Map<string, number[]>();
  const grams: string[] = [];
  for (let i = 0; i + 3 <= characters.length; i++) {
    const fragment = characters[i] + characters[i + 1] + characters[i + 2];
    grams.push(fragment);
    if (fragment.includes(' ')) continue;
    const list = positions.get(fragment) || [];
    // Repeated occurrences cannot turn one phrase into many independent claims.
    if (list.length < 8) list.push(i);
    positions.set(fragment, list);
  }
  return { source, characters, positions, grams };
}

export function phraseSpelling(text: EvidenceText, start: number, length: number): string {
  if (!text.offsets) {
    text.offsets = [];
    text.ends = [];
    let offset = 0;
    let previous = '';
    for (const character of text.source) {
      for (const lower of character.toLowerCase()) {
        const value = /[\s\p{P}\p{S}]/u.test(lower) ? ' ' : lower;
        if (value !== ' ' || previous !== ' ') {
          text.offsets.push(offset);
          text.ends.push(offset + character.length);
        } else text.ends[text.ends.length - 1] = offset + character.length;
        previous = value;
      }
      offset += character.length;
    }
  }
  return text.source
    .slice(text.offsets[start], text.ends![start + length - 1])
    .replace(/\s+/g, ' ')
    .trim();
}

/** Greedy maximal exact runs, with bounded alignments rather than a quadratic substring matrix. */
export function sharedPhrases(
  left: EvidenceText,
  right: EvidenceText,
  informative: ReadonlyMap<string, number>,
  readable = true
): SharedPhrase[] {
  const phrases: SharedPhrase[] = [];
  const a = left.characters;
  const b = right.characters;
  for (let i = 0; i + 3 <= a.length; i++) {
    const feature = left.grams[i];
    if (!informative.has(feature)) continue;
    let best = 0;
    let target = 0;
    let start = i;
    for (const j of right.positions.get(feature) || []) {
      let length = 3;
      while (i + length < a.length && j + length < b.length && a[i + length] === b[j + length])
        length++;
      while (length && a[i + length - 1] === ' ') length--;
      let begin = i;
      let otherBegin = j;
      while (begin > 0 && otherBegin > 0 && a[begin - 1] === b[otherBegin - 1]) {
        begin--;
        otherBegin--;
        length++;
      }
      while (a[begin] === ' ') {
        begin++;
        otherBegin++;
        length--;
      }
      // Prefer complete words where boundaries exist, while retaining long runs in unsegmented text.
      if ((begin && a[begin - 1] !== ' ') || (otherBegin && b[otherBegin - 1] !== ' ')) {
        const boundary = a.indexOf(' ', begin);
        if (boundary >= begin && boundary < begin + length) {
          const skipped = boundary - begin + 1;
          begin += skipped;
          otherBegin += skipped;
          length -= skipped;
        }
      }
      // Short substring coincidences inside different words are not whole phrases.
      const complete =
        (!begin || a[begin - 1] === ' ') &&
        (!otherBegin || b[otherBegin - 1] === ' ') &&
        (begin + length === a.length || a[begin + length] === ' ') &&
        (otherBegin + length === b.length || b[otherBegin + length] === ' ');
      if (!complete && length < 12) continue;
      if (length > best) {
        best = length;
        target = otherBegin;
        start = begin;
      }
    }
    if (!best) continue;
    const key = a.slice(start, start + best).join('');
    const size =
      best - a.slice(start, start + best).filter((character) => character === ' ').length;
    if (size >= 3 && !phrases.some((phrase) => phrase.key.includes(key))) {
      const text = readable ? phraseSpelling(left, start, best) : key;
      phrases.push({ key, text, left: start, right: target, length: best, size });
    }
    i = start + best - 1;
  }
  return phrases.filter(
    (phrase) => !phrases.some((other) => other !== phrase && other.key.includes(phrase.key))
  );
}

/** Count matched character positions once, independent of overlapping 3/6-character windows. */
export function phraseCoverage(
  phrases: SharedPhrase[],
  mass: Float64Array,
  side: 'left' | 'right'
): number {
  let weight = 0;
  let end = 0;
  for (const phrase of phrases.slice().sort((a, b) => a[side] - b[side])) {
    const start = Math.max(end, phrase[side]);
    const next = phrase[side] + phrase.length;
    if (next > start) weight += mass[next] - mass[start];
    end = Math.max(end, next);
  }
  return weight;
}

/** Repeated fixed text around different substantive slots needs corroboration outside that template. */
export function hasConflictingContext(
  phrases: SharedPhrase[],
  left: EvidenceText,
  right: EvidenceText
): boolean {
  let conflicts = 0;
  const ordered = phrases.slice().sort((a, b) => a.left - b.left);
  for (let i = 1; i < ordered.length; i++) {
    const before = ordered[i - 1];
    const after = ordered[i];
    if (before.size < 6 || after.size < 6 || after.right < before.right + before.length) continue;
    const a = left.characters
      .slice(before.left + before.length, after.left)
      .join('')
      .trim();
    const b = right.characters
      .slice(before.right + before.length, after.right)
      .join('')
      .trim();
    // Numeric versions and quantities do not establish a contradictory subject by themselves.
    const aSize = Array.from(a).length;
    const bSize = Array.from(b).length;
    if (
      a !== b &&
      a.replace(/\p{N}/gu, '') !== b.replace(/\p{N}/gu, '') &&
      aSize >= 3 &&
      bSize >= 3 &&
      aSize <= 32 &&
      bSize <= 32 &&
      /\p{L}/u.test(a) &&
      /\p{L}/u.test(b)
    )
      conflicts++;
  }
  return conflicts >= 2;
}
