interface HeaderPathCandidate {
  path: string;
  title: string;
  level: number;
}

export const normalizeTitle = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/** Return only the closest ancestor heading for a card heading. */
export const findNearestParentHeader = <T extends HeaderPathCandidate>(
  headers: T[],
  card: HeaderPathCandidate
): T | undefined => {
  let nearest: T | undefined;
  let nearestDepth = -1;
  for (const header of headers) {
    if (
      header.level <= 0 ||
      header.level >= card.level ||
      !card.path.startsWith(header.path + ',') ||
      !header.title.trim()
    ) {
      continue;
    }
    const depth = header.path.split(',').length;
    if (depth > nearestDepth) {
      nearest = header;
      nearestDepth = depth;
    }
  }
  return nearest;
};
