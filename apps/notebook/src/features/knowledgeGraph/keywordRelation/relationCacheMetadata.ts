import { relationCacheHash } from './relationCheckpoint';
import type { RelationNliCatalog, RelationNliReference } from './relationCheckpoint';
import { relationPatternIdentity } from './relationDiscovery';
import type { RelationObservation } from './relationDiscovery';

/** Final NLI records retain identities, not source text, embeddings or intermediate scores. */
export function createRelationCacheIdentity(groupingPolicy?: unknown) {
  const hashes = new Map<string, Promise<string>>();
  const pattern = (input: Parameters<typeof relationPatternIdentity>[0]) => {
    const identity = relationPatternIdentity(input);
    const key =
      groupingPolicy === undefined ? identity : JSON.stringify([groupingPolicy, identity]);
    let value = hashes.get(key);
    if (!value) hashes.set(key, (value = relationCacheHash(key)));
    return value;
  };
  const group = async (observations: RelationObservation[]): Promise<RelationNliReference> => {
    const patterns = [...new Set(await Promise.all(observations.map(pattern)))].sort();
    const evidence = [
      ...new Set(
        observations.map((item) =>
          JSON.stringify([item.origin, item.template, item.source, item.target, item.evidence])
        )
      ),
    ].sort();
    return { id: await relationCacheHash(JSON.stringify([patterns, evidence])), patterns };
  };
  const restore = async (observations: RelationObservation[][], catalog?: RelationNliCatalog) => {
    const byHash = new Map<string, RelationObservation[]>();
    for (const items of observations) if (items.length) byHash.set(await pattern(items[0]), items);
    const memberships = new Map<string, Set<string>>();
    for (const [id, patterns] of catalog?.relationships || []) {
      if ([...patterns].some((key) => !byHash.has(key))) continue;
      const items = [...patterns].flatMap((key) => byHash.get(key)!);
      if ((await group(items)).id !== id) continue;
      for (const key of patterns) {
        let groups = memberships.get(key);
        if (!groups) memberships.set(key, (groups = new Set()));
        groups.add(id);
      }
    }
    const restored = new Map<string, string>();
    for (const [hash, groups] of memberships)
      if (groups.size === 1)
        restored.set(relationPatternIdentity(byHash.get(hash)![0]), [...groups][0]);
    return restored;
  };
  return { pattern, group, restore };
}
