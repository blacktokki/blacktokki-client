const assert = require('node:assert/strict');
const { test } = require('node:test');
const { performance } = require('node:perf_hooks');
const load = require('./loadTs.cjs');
const { referenceRelationSource, restoreRelationSource } = load('relationSourceCache.ts');

test('source references preserve escaped, normalized, nested and multilingual collection data', async () => {
  const notes = [['Synthetic 秘密 "title" 😀', '<h2>조건 é</h2><p>Unique Ελληνικά source.</p>']];
  const source = JSON.stringify(notes);
  const data = JSON.stringify({
    [notes[0][0]]: {
      noteTitle: notes[0][0],
      section: '조건 é',
      evidence: 'Unique Ελληνικά source.',
      key: 'synthetic 秘密 "title" 😀',
    },
    rows: Array.from({ length: 120 }, () => ({
      evidence: notes[0][1],
      count: 3,
      optional: null,
      selected: true,
    })),
  });
  const saved = await referenceRelationSource(data, source);
  assert.equal(await restoreRelationSource(saved, source), data);
  assert.ok(
    saved.parts.some((part) => Array.isArray(part) && part[0] === -1),
    'repeated collection structure is shared'
  );
  const views = source + source.normalize('NFC').toLowerCase();
  for (const part of saved.parts)
    if (typeof part === 'string')
      for (const character of part.split(''))
        assert.ok(
          !views.includes(character),
          'literal characters cannot duplicate source characters'
        );
  const json = JSON.stringify(saved);
  for (const text of [notes[0][0], notes[0][1], 'Unique Ελληνικά source.', '조건 é'])
    assert.ok(!json.includes(text), 'durable collections cannot contain source text or titles');
  assert.notEqual(
    await restoreRelationSource(saved, source.replace('Synthetic', 'Different')),
    data
  );
});

test('malformed ranges and cancelled work cannot restore a collection', async () => {
  for (const parts of [
    [[0, -1, 1]],
    [[0, 99999, 1]],
    [[-1, 0, 1]],
    [[4, 0, 1]],
    [[0, 0, 0]],
    [[0, 0, 0.5]],
    [null],
  ])
    await assert.rejects(restoreRelationSource({ parts }, 'source'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(referenceRelationSource('collection', 'source', controller.signal), {
    name: 'AbortError',
  });
  await assert.rejects(restoreRelationSource({ parts: [[0, 0, 1]] }, 'source', controller.signal), {
    name: 'AbortError',
  });
});

test('encoded metadata and HTML text also depend on the current source', async () => {
  const source = JSON.stringify([
    [
      'Synthetic metadata',
      '<p>&#x6F22;&#233;&alpha;</p><a href="%E9%9A%B1%E8%97%8F">generated</a>',
    ],
  ]);
  const data = JSON.stringify({ evidence: '漢éα', target: '隱藏', normalized: '漢éα隱藏' });
  const saved = await referenceRelationSource(data, source);
  assert.equal(await restoreRelationSource(saved, source), data);
  const json = JSON.stringify(saved);
  for (const character of '漢éα隱藏')
    assert.ok(!json.includes(character), 'decoded source characters must not be stored literally');
});

test('source-reference restoration stays within five seconds without a source index', async (t) => {
  const notes = Array.from({ length: 320 }, (_, index) => [
    `Synthetic document ${index}`,
    `<p>Generated evidence ${index}: ` +
      'Multilingual 한글 Ελληνικά é content. '.repeat(160) +
      '</p>',
  ]);
  const source = JSON.stringify(notes);
  const data = JSON.stringify(
    notes.flatMap(([noteTitle, evidence], index) =>
      Array.from({ length: 12 }, () => ({
        noteTitle,
        evidence,
        section: `Section ${index}`,
        source: 'Synthetic Alpha',
        target: 'Synthetic Beta',
        count: index,
      }))
    )
  );
  const saved = await referenceRelationSource(data, source);
  const started = performance.now();
  assert.equal(await restoreRelationSource(JSON.parse(JSON.stringify(saved)), source), data);
  const elapsed = performance.now() - started;
  t.diagnostic(
    JSON.stringify({
      sourceCharacters: source.length,
      collectionCharacters: data.length,
      referenceCharacters: JSON.stringify(saved).length,
      restoreMs: Math.round(elapsed),
    })
  );
  assert.ok(elapsed < 5000, `source references exceeded five seconds: ${elapsed}`);
  assert.ok(
    JSON.stringify(saved).length < data.length,
    'references reduce the duplicated collection payload'
  );
});
