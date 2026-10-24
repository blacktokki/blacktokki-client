import { components } from '@orama/orama';

/** Insert each distinct token once while preserving the original BM25 frequencies and lengths. */
export const createSearchIndexComponent = () => {
  const base = components.index.createIndex();
  return {
    ...base,
    insert: (...args: Parameters<typeof components.index.insert>) => {
      const [
        implementation,
        index,
        prop,
        ,
        internalId,
        value,
        schemaType,
        language,
        tokenizer,
        docsCount,
      ] = args;
      const tree = index.indexes[prop];
      if (schemaType !== 'string' || tree?.type !== 'Radix') return base.insert(...args);
      const tokens = tokenizer.tokenize(value as string, language, prop, false);
      implementation.insertDocumentScoreParameters(index, prop, internalId, tokens, docsCount);
      const counts = new Map<string, number>();
      for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
      const occurrences: Record<string, any> = index.tokenOccurrences[prop];
      for (const [token, frequency] of counts) {
        index.frequencies[prop][internalId]![token] = frequency / tokens.length;
        if (!(token in occurrences)) occurrences[token] = 0;
        if (typeof occurrences[token] === 'number') {
          occurrences[token] += frequency;
        } else {
          for (let occurrence = 0; occurrence < frequency; occurrence++) occurrences[token] += 1;
        }
        tree.node.insert(token, internalId);
      }
    },
  };
};
