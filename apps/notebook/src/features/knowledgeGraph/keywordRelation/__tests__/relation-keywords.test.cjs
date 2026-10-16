const assert = require('node:assert/strict');
const { test } = require('node:test');
const loadTs = require('./loadTs.cjs');
const { relationKeyword, classifyRelationKeywords, createRelationKeywordMatcher } =
  loadTs('relationKeywords.ts');

const classify = (values) => classifyRelationKeywords(values.map(relationKeyword));

test('shared suffixes never create a pattern type, even with three names and multiple characters', () => {
  const result = classify(['개발 계획서', '운영 계획서', '배포 계획서']);
  assert.ok(result.every((keyword) => keyword.type === null));
});

test('symbol-only and text-plus-symbol prefixes gain a type without merging identities', () => {
  const values = [
    '#개발',
    '#운영',
    '#배포',
    '업무-개발',
    '업무-운영',
    '업무-배포',
    'API:Read',
    'API:Write',
    'API:Delete',
    'Isolated',
  ];
  const result = classify(values);
  assert.deepEqual(
    result.map((keyword) => keyword.text),
    values
  );
  assert.equal(new Set(result.map((keyword) => keyword.key)).size, values.length);
  assert.deepEqual(
    result.map((keyword) => keyword.type),
    [
      ...Array(3).fill('#{{TEXT}}'),
      ...Array(3).fill('업무-{{TEXT}}'),
      ...Array(3).fill('API:{{TEXT}}'),
      null,
    ]
  );
});

test('prefix support counts distinct normalized names, not duplicate mentions or empty variable parts', () => {
  for (const values of [
    ['Service: Alpha', 'service:   alpha', 'Service: Beta'],
    ['#Alpha', '#ALPHA', '#Beta'],
  ])
    assert.ok(classify(values).every((keyword) => keyword.type === null));
  assert.ok(
    classify(['API:', 'API:Alpha', 'API:Beta']).every((keyword) => keyword.type === null),
    'the variable part must contain at least one character in three different keywords'
  );
});

test('prefixes of any length require a non-bracket symbol boundary', () => {
  for (const fixed of [
    '가',
    '메신저 ',
    'API ',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    '<',
    '>',
    '（',
    '）',
    '＜',
    '＞',
    '「',
    '」',
    '【',
    '】',
    '〈',
    '〉',
    '《',
    '》',
    '[업무]-',
    '업무(공통)-',
  ]) {
    assert.ok(
      classify(['Alpha', 'Beta', 'Gamma'].map((name) => fixed + name)).every(
        (keyword) => keyword.type === null
      ),
      fixed
    );
  }
  for (const fixed of ['#', '@@', '---', '+', '😀', '업무-', 'API:', '메신저 / ']) {
    assert.ok(
      classify(['Alpha', 'Beta', 'Gamma'].map((name) => fixed + name)).every(
        (keyword) => keyword.type === `${fixed}{{TEXT}}`
      ),
      fixed
    );
  }
});

test('the longest qualifying delimiter boundary wins and numeric types keep priority', () => {
  for (const [values, expected] of [
    [['API:readAlpha', 'API:readBeta', 'API:readGamma'], 'API:{{TEXT}}'],
    [['#Sprint 1', '#Sprint 2', '#Sprint 3'], '#Sprint {{NUM}}'],
    [['[Issue 1]', '[Issue 2]', '[Issue 3]'], '[Issue {{NUM}}]'],
  ])
    assert.ok(classify(values).every((keyword) => keyword.type === expected));
  const nested = classify([
    'API:read-A',
    'API:read-B',
    'API:read-C',
    'API:write-A',
    'API:write-B',
    'API:write-C',
  ]);
  assert.deepEqual(
    nested.map((keyword) => keyword.type),
    [...Array(3).fill('API:read-{{TEXT}}'), ...Array(3).fill('API:write-{{TEXT}}')]
  );
});

test('prefix spelling is shared deterministically across case variants and input order', () => {
  const values = ['Api: One', 'API: Two', 'api: Three'];
  const forward = classify(values);
  const backward = classify([...values].reverse()).reverse();
  assert.deepEqual(forward, backward);
  assert.equal(new Set(forward.map((keyword) => keyword.type)).size, 1);
  assert.equal(forward[0].type, 'API: {{TEXT}}');
});

test('checkbox brackets stop prefix discovery after the leading list marker', () => {
  const values = ['- [ ] 개발', '- [ ] 운영', '- [ ] 배포'];
  assert.ok(classify(values).every((keyword) => keyword.type === '- {{TEXT}}'));
});

test('numeric prefix parts share NUMBER types across fixed and varying digit runs', () => {
  for (const [values, expected] of [
    [['2026: 개발', '2026: 운영', '2026: 배포'], '{{NUMBER}}: {{TEXT}}'],
    [['1. 개발', '2. 운영', '30. 배포'], '{{NUMBER}}. {{TEXT}}'],
    [
      ['v1.2/API:Read', 'v2.30/API:Write', 'v4.5/API:Delete'],
      'v{{NUMBER}}.{{NUMBER}}/API:{{TEXT}}',
    ],
  ]) {
    const result = classify(values);
    assert.ok(result.every((keyword) => keyword.type === expected));
    assert.deepEqual(result, classify([...values].reverse()).reverse());
    assert.deepEqual(
      result.map(({ text }) => text),
      values
    );
    assert.equal(new Set(result.map(({ key }) => key)).size, values.length);
    const match = createRelationKeywordMatcher(result);
    for (const keyword of result) assert.equal(match(keyword.text)[0].key, keyword.key);
    assert.deepEqual(match('99. 다른 이름'), []);
  }
});

test('numeric prefix support requires three distinct names and cannot be supplied by literal placeholders', () => {
  for (const values of [
    ['1. Read', '2. Write'],
    ['1. Read', '1. READ', '2. Write'],
    ['1. Read', '2. Write', '{{NUMBER}}. Delete'],
    ['1.', '2. Write', '3. Delete'],
  ])
    assert.ok(classify(values).every((keyword) => keyword.type === null));
});

test('table record prefixes normalize numbers while retaining the record marker', () => {
  const result = classifyRelationKeywords(
    ['1. 개발', '2. 운영', '3. 배포'].map((text) => ({
      ...relationKeyword(text),
      type: '{{TABLE_RECORD}}',
    }))
  );
  assert.ok(result.every((keyword) => keyword.type === '{{NUMBER}}. {{TABLE_RECORD}}'));
  assert.deepEqual(classifyRelationKeywords(result), result);
});

test('table records prefer supported prefixes while retaining their record placeholder and identity', () => {
  const values = ['업무-개발', '업무-운영', '업무-배포', 'Task-1', 'Task-2', 'Task-3'];
  const keywords = values.map((text) => ({ ...relationKeyword(text), type: '{{TABLE_RECORD}}' }));
  const result = classifyRelationKeywords(keywords);
  assert.deepEqual(
    result.map((keyword) => keyword.type),
    [...Array(3).fill('업무-{{TABLE_RECORD}}'), ...Array(3).fill('Task-{{TABLE_RECORD}}')]
  );
  assert.deepEqual(
    result.map(({ type, ...identity }) => identity),
    keywords.map(({ type, ...identity }) => identity)
  );
  assert.deepEqual(classifyRelationKeywords(result), result);
});

test('table records share distinct prefix support with ordinary keywords and retain fallback rules', () => {
  const result = classifyRelationKeywords([
    relationKeyword('API: Read'),
    ...[
      'API: Write',
      'API: Delete',
      '#Alpha',
      '#ALPHA',
      '#Beta',
      '[Task]-A',
      '[Task]-B',
      '[Task]-C',
    ].map((text) => ({ ...relationKeyword(text), type: '{{TABLE_RECORD}}' })),
  ]);
  assert.deepEqual(
    result.map((keyword) => keyword.type),
    [
      'API: {{TEXT}}',
      'API: {{TABLE_RECORD}}',
      'API: {{TABLE_RECORD}}',
      ...Array(6).fill('{{TABLE_RECORD}}'),
    ]
  );
});

test('literal placeholders and wildcard-looking names remain literal, distinct matcher inputs', () => {
  const result = classify([
    'Sprint {{NUM}}',
    'Sprint 1',
    'Sprint 2',
    'Report {{TEXT}}',
    'Report Alpha',
    'Report Beta',
    '#Report {{TEXT}}',
    '#Report Alpha',
    '#Report Beta',
  ]);
  assert.ok(
    result.every((keyword) => !keyword.type?.includes('{{NUM}}')),
    'a literal placeholder does not supply a third numeric variant'
  );
  const match = createRelationKeywordMatcher(result.sort((a, b) => b.text.length - a.text.length));
  for (const keyword of result) {
    assert.equal(match(`${keyword.text} works.`)[0].key, keyword.key);
    assert.equal(match(`${keyword.text} works.`)[0].text, keyword.text);
  }
  assert.deepEqual(match('Sprint 999 works.'), []);
  assert.deepEqual(match('Report Gamma works.'), []);
  assert.deepEqual(match('#Report Gamma works.'), []);
});

test('classification patterns never replace original text or affect literal matching', () => {
  const values = [
    'Sprint {{NUM}}',
    'Sprint 123',
    'Sprint 456',
    'Sprint \\{{NUM}}',
    'Task {{NUM}} 1',
    'Task 1 2',
    'Task \\1 2',
  ];
  const keywords = values.map(relationKeyword);
  assert.deepEqual(
    keywords.map((keyword) => keyword.text),
    values
  );
  assert.equal(new Set(keywords.map((keyword) => keyword.key)).size, values.length);
  assert.equal(keywords[0].type, null);
  assert.equal(keywords[1].type, 'Sprint {{NUM}}');
  assert.equal(keywords[1].type, keywords[2].type);
  assert.equal(keywords[4].type, keywords[5].type);
  const match = createRelationKeywordMatcher(
    keywords.sort((a, b) => b.text.length - a.text.length)
  );
  for (const original of values) {
    const matches = match(`${original} works.`);
    assert.equal(matches.length, 1, original);
    assert.equal(matches[0].key, relationKeyword(original).key, original);
    assert.equal(matches[0].text, original);
  }
  assert.deepEqual(match('Sprint 999 works.'), []);
  assert.deepEqual(match('Task {{NUM}} 999 works.'), []);
});
