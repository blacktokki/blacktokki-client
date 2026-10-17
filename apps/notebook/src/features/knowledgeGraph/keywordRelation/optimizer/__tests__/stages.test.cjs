const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { moduleLoader } = require('../run-corpus.cjs');
const root = path.join(__dirname, '..');
const load = moduleLoader();
const syntax = load(path.join(root, 'syntax.ts'));
const validation = load(path.join(root, 'validation.ts'));
const schema = load(path.join(root, 'schema.ts'));
const budget = load(path.join(root, 'token-budget.ts'));
const good = { entailment: 0.95, neutral: 0.03, contradiction: 0.02 };
const mention = (text, name) => ({
  text: name,
  key: name.toLowerCase(),
  start: text.indexOf(name),
  end: text.indexOf(name) + name.length,
  type: null,
});
const parse = (text, rows) => syntax.alignConllu(text, rows.map((r) => r.join('\t')).join('\n'));
const token = (id, word, pos, head, rel, xpos = '_') => [
  id,
  word,
  word,
  pos,
  xpos,
  '_',
  head,
  rel,
  '_',
  '_',
];

test('distinct predicate arguments preserve negative auxiliaries and their original scope', () => {
  const text = 'Alpha does not use Beta.';
  syntax.configureRelationOptimization({
    stage: 1,
    parser: {
      revision: 'fixture',
      parse: () =>
        parse(text, [
          token(1, 'Alpha', 'PROPN', 4, 'nsubj'),
          token(2, 'does', 'AUX', 4, 'aux'),
          token(3, 'not', 'PART', 4, 'advmod'),
          token(4, 'use', 'VERB', 0, 'root'),
          token(5, 'Beta', 'PROPN', 4, 'obj'),
          token(6, '.', 'PUNCT', 4, 'punct'),
        ]),
    },
  });
  const claim = syntax.analyzeSyntaxClaim(
    text,
    ['Alpha', 'Beta'].map((name) => mention(text, name))
  );
  assert.equal(claim.status, 'direct');
  assert.equal(claim.hypothesis, text);
  assert.deepEqual(claim.roles, ['nsubj', 'obj']);
});

test('arbitrary coordinated endpoint names do not become a binary predicate', () => {
  const text = 'Zeta and Omega are available.';
  syntax.configureRelationOptimization({
    stage: 2,
    parser: {
      revision: 'fixture',
      parse: () =>
        parse(text, [
          token(1, 'Zeta', 'PROPN', 5, 'nsubj'),
          token(2, 'and', 'CCONJ', 3, 'cc'),
          token(3, 'Omega', 'PROPN', 1, 'conj'),
          token(4, 'are', 'AUX', 5, 'cop'),
          token(5, 'available', 'ADJ', 0, 'root'),
          token(6, '.', 'PUNCT', 5, 'punct'),
        ]),
    },
  });
  const claim = syntax.analyzeSyntaxClaim(
    text,
    ['Zeta', 'Omega'].map((name) => mention(text, name))
  );
  assert.equal(claim.status, 'separate');
  assert.equal(claim.reason, 'coordinated-arguments');
  assert.equal(validation.optimizedValidationVerdict({ scores: good, claim }), 'uncertain');
});

test('a parser failure cannot convert copied text and a high NLI score into proven roles', () => {
  syntax.configureRelationOptimization({
    stage: 1,
    parser: {
      revision: 'bad',
      parse: () => {
        throw Error('unavailable');
      },
    },
  });
  const text = 'Alpha Beta';
  const claim = syntax.analyzeSyntaxClaim(
    text,
    ['Alpha', 'Beta'].map((name) => mention(text, name))
  );
  assert.equal(claim.reason, 'syntax-unavailable');
  assert.equal(validation.optimizedValidationVerdict({ scores: good, claim }), 'uncertain');
});

test('schema hypotheses use arbitrary roles, preserve whole subject values, and claim no completion', () => {
  const s = {
    kind: 'table',
    sourceHeader: 'Vorgang',
    subject: 'Planned Alpha migration',
    targetHeader: 'Reviewer',
    value: '@Xi / @Psi',
  };
  assert.equal(
    schema.schemaHypothesis(s, '@Xi'),
    'Vorgang: Planned Alpha migration. Reviewer: @Xi.'
  );
  assert.equal(
    schema.schemaHypothesis(s, '@Tau'),
    'Vorgang: Planned Alpha migration. Reviewer: @Tau.'
  );
  assert.ok(!schema.schemaHypothesis(s, '@Xi').includes('completed'));
});

test('token budgets use paired tokens rather than character count and never truncate', async () => {
  await budget.checkInputBudget(
    async () => ({ tokens: 8, limit: 8 }),
    'long text'.repeat(1000),
    'hypothesis'
  );
  await assert.rejects(
    budget.checkInputBudget(async () => ({ tokens: 9, limit: 8 }), '짧다', '가설'),
    { name: 'RelationContextTooLongError' }
  );
  await assert.rejects(
    budget.checkInputBudget(async () => ({ tokens: NaN, limit: 8 }), 'x', 'y'),
    /invalid input budget/
  );
});

test('CoNLL-U alignment refuses rewritten or partially omitted source text', () => {
  assert.deepEqual(parse('Alpha Beta', [token(1, 'Alpha', 'PROPN', 0, 'root')]), []);
  assert.deepEqual(
    parse('Alpha Beta', [
      token(1, 'ALPHA', 'PROPN', 0, 'root'),
      token(2, 'Beta', 'PROPN', 1, 'obj'),
    ]),
    []
  );
});
