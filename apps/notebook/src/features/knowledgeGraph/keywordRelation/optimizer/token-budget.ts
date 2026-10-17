import { RELATION_MODELS } from '../relationModels';

export type InputBudget = (
  premise: string,
  hypothesis: string
) => Promise<{ tokens: number; limit: number }>;
let budget: Promise<InputBudget> | undefined;

/** Count the real paired tokenizer input, including special tokens; never truncate the claim. */
export const relationInputBudget: InputBudget = async (premise, hypothesis) => {
  budget ||= (async () => {
    const { AutoTokenizer, AutoConfig } = await import('@huggingface/transformers');
    const [tokenizer, config] = await Promise.all([
      AutoTokenizer.from_pretrained(RELATION_MODELS.nli),
      AutoConfig.from_pretrained(RELATION_MODELS.nli),
    ]);
    const limit = (config as unknown as { max_position_embeddings?: number })
      .max_position_embeddings;
    if (!Number.isSafeInteger(limit) || !limit || limit < 1)
      throw new Error('The NLI model must declare a valid positional input limit.');
    return async (text, pair) => ({
      tokens: tokenizer(text, { text_pair: pair, truncation: false }).input_ids.dims.at(-1)!,
      limit,
    });
  })();
  return (await budget)(premise, hypothesis);
};

export async function checkInputBudget(check: InputBudget, premise: string, hypothesis: string) {
  const { tokens, limit } = await check(premise, hypothesis);
  if (![tokens, limit].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error('The tokenizer returned an invalid input budget.');
  if (tokens > limit)
    throw Object.assign(new Error(`NLI input has ${tokens} tokens; model limit is ${limit}.`), {
      name: 'RelationContextTooLongError',
    });
}
