const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Keyword matching and classification', () => {
  const loadTs = require('./loadTs.cjs');
  const {
    relationKeyword,
    classifyRelationKeywords,
    createRelationKeywordMatcher,
    collectRelationCompoundKeywords,
  } = {
    ...loadTs('keyword/keywordUtils.ts'),
    ...loadTs('keyword/extractKeywords.ts', {}, ['relationKeyword', 'classifyRelationKeywords']),
  };

  const classify = (values) => classifyRelationKeywords(values.map(relationKeyword));

  test('compound keywords include every nested or overlapping proper keyword once', () => {
    const inventory = ['banana', 'ana', 'an', 'ban', 'na'].map(relationKeyword);
    const before = JSON.stringify(inventory);
    assert.deepEqual(collectRelationCompoundKeywords(inventory), [
      { key: 'ana', keywords: ['an', 'na'] },
      { key: 'ban', keywords: ['an'] },
      { key: 'banana', keywords: ['an', 'ana', 'ban', 'na'] },
    ]);
    assert.equal(JSON.stringify(inventory), before);
  });

  test('compound keyword detection normalizes keys and ignores display aliases, duplicates and self matches', () => {
    const inventory = [
      { text: 'Cafe\u0301   Tools' },
      { text: 'CAFÉ' },
      { text: 'café' },
      { text: 'Unrelated display name', key: 'CAFÉ TOOLS' },
      { text: 'Alias', key: 'tool' },
    ];
    assert.deepEqual(collectRelationCompoundKeywords(inventory), [
      { key: 'café tools', keywords: ['café', 'tool'] },
    ]);
    assert.deepEqual(collectRelationCompoundKeywords(), []);
    assert.deepEqual(collectRelationCompoundKeywords(['React', 'REACT'].map(relationKeyword)), []);
  });

  test('symbol-only and text-plus-symbol prefixes gain a type without merging identities', () => {
    const values = [
      '#개발',
      '#운영',
      '#도형',
      '표본-개발',
      '표본-운영',
      '표본-도형',
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
        ...Array(3).fill('표본-{{TEXT}}'),
        ...Array(3).fill('API:{{TEXT}}'),
        null,
      ]
    );
  });

  test('prefixes of any length require a non-bracket symbol boundary', () => {
    for (const fixed of [
      '가',
      '표본 ',
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
      '[표본]-',
      '표본(공통)-',
    ]) {
      assert.ok(
        classify(['Alpha', 'Beta', 'Gamma'].map((name) => fixed + name)).every(
          (keyword) => keyword.type === null
        ),
        fixed
      );
    }
    for (const fixed of ['#', '@@', '---', '+', '😀', '표본-', 'API:', '표본 / ']) {
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
      [['#Sample 1', '#Sample 2', '#Sample 3'], '#Sample {{NUM}}'],
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

  test('numeric prefix parts share NUMBER types across fixed and varying digit runs', () => {
    for (const [values, expected] of [
      [['2026: 개발', '2026: 운영', '2026: 도형'], '{{NUMBER}}: {{TEXT}}'],
      [['1. 개발', '2. 운영', '30. 도형'], '{{NUMBER}}. {{TEXT}}'],
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

  test('literal placeholders and wildcard-looking names remain literal, distinct matcher inputs', () => {
    const result = classify([
      'Sample {{NUM}}',
      'Sample 1',
      'Sample 2',
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
    const match = createRelationKeywordMatcher(
      result.sort((a, b) => b.text.length - a.text.length)
    );
    for (const keyword of result) {
      assert.equal(match(`${keyword.text} works.`)[0].key, keyword.key);
      assert.equal(match(`${keyword.text} works.`)[0].text, keyword.text);
    }
    assert.deepEqual(match('Sample 999 works.'), []);
    assert.deepEqual(match('Report Gamma works.'), []);
    assert.deepEqual(match('#Report Gamma works.'), []);
  });

  test('classification patterns never replace original text or affect literal matching', () => {
    const values = [
      'Sample {{NUM}}',
      'Sample 123',
      'Sample 456',
      'Sample \\{{NUM}}',
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
    assert.equal(keywords[1].type, 'Sample {{NUM}}');
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
    assert.deepEqual(match('Sample 999 works.'), []);
    assert.deepEqual(match('Task {{NUM}} 999 works.'), []);
  });
});

describe('Compound and constituent keywords', () => {
  const loadTs = require('./loadTs.cjs');
  const { analyzeRelationKeywordComposition: analyze } = loadTs('keyword/keywordUtils.ts');
  const inventory = (keys) => keys.map((text) => ({ text }));

  test('constituent keywords detect prefixes, suffixes and inner substrings in three distinct names', () => {
    for (const [keys, expected] of [
      [['서울역', '서울시청', '서울버스'], '서울'],
      [['개발 계획서', '운영 계획서', '도형 계획서'], '계획서'],
      [['X공통A', 'Y공통B', 'Z공통C'], '공통'],
    ]) {
      const result = analyze(inventory(keys));
      assert.deepEqual(result.constituents, [
        { key: expected, sourceKeys: [...keys].map((key) => key.toLowerCase()).sort() },
      ]);
      assert.ok(result.compounds.every((compound) => compound.keywords.includes(expected)));
    }
  });

  test('normalization, canonical keys and single-character complete words retain their identities', () => {
    const result = analyze([
      { text: 'Alias', key: 'Cafe\u0301 X' },
      { text: 'CAFÉ Y' },
      { text: 'café   Z' },
    ]);
    assert.deepEqual(result.constituents, [
      { key: 'café', sourceKeys: ['café x', 'café y', 'café z'] },
    ]);
    assert.deepEqual(
      analyze(inventory(['A X', 'A Y', 'A Z'])).constituents.map((item) => item.key),
      ['a']
    );
    assert.deepEqual(analyze(inventory(['cat', 'bar', 'map'])).constituents, []);
    assert.deepEqual(analyze(inventory(['123😀X', '123😀Y', '123😀Z'])).constituents, []);
  });

  test('constituent keywords must be newly generated and cached inputs refresh on mutation', () => {
    assert.deepEqual(
      analyze(inventory(['서울', '서울역', '서울시청', '서울버스'])).constituents,
      []
    );
    const keys = inventory(['서울역', '서울시청', '서울버스']);
    const result = analyze(keys);
    assert.deepEqual(result.constituents, [
      { key: '서울', sourceKeys: ['서울버스', '서울시청', '서울역'] },
    ]);
    assert.strictEqual(analyze(keys), result);
    keys.push({ text: '서울' });
    assert.deepEqual(analyze(keys).constituents, []);
    assert.deepEqual(analyze().compounds, []);
  });

  test('maximal common substring support agrees with an exhaustive small inventory oracle', () => {
    let seed = 47;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
    for (let round = 0; round < 60; round++) {
      const keys = [
        ...new Set(
          Array.from({ length: 7 }, () =>
            Array.from({ length: 6 }, () => 'abc'[random() % 3]).join('')
          )
        ),
      ].sort();
      const all = new Map();
      for (const name of keys)
        for (let start = 0; start < name.length; start++)
          for (let end = start + 2; end <= name.length; end++) {
            const key = name.slice(start, end);
            all.set(
              key,
              keys.filter((source) => source.includes(key))
            );
          }
      const expected = [...all]
        .filter(([, sources]) => sources.length >= 3)
        .filter(
          ([key, sources]) =>
            ![...all].some(
              ([other, support]) =>
                other !== key &&
                other.includes(key) &&
                JSON.stringify(sources) === JSON.stringify(support)
            )
        )
        .map(([key, sourceKeys]) => ({ key, sourceKeys }))
        .filter((keyword) => !keys.includes(keyword.key))
        .sort((a, b) => a.key.localeCompare(b.key));
      assert.deepEqual(analyze(inventory(keys)).constituents, expected, keys.join(','));
    }
  });
});
