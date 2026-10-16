const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');
const { resultFixture } = require('./resultFixtures.cjs');
const statement = ({ evidence: { observation } }, template) =>
  relationStatement(template, observation.source, observation.target);
const confidence = (candidate) =>
  createRelationResultsIndex([], [candidate]).relations.get(candidate.id).confidence;
const {
  createRelationResultsIndex,
  relationEntityKey,
  relationStatement,
  compareRelationConfidence,
} = loadTs('relationResults.ts', {
  './relationKeywords': loadTs('relationKeywords.ts'),
});

test('ranking balances average NLI support and supported judgments, with pending work contributing zero', () => {
  const data = resultFixture();
  const base = data.result.candidates[0];
  const make = (id, scores) => ({
    ...base,
    id,
    observations: scores.map(() => base.observations[0]),
    validations: scores.map((score, index) =>
      score === undefined
        ? undefined
        : {
            ...base.validations[0],
            evidence: `Independent source ${index}`,
            hypothesis: `Independent hypothesis ${index}`,
            verdict: score >= 0.8 ? 'supported' : 'contradicted',
            scores: { entailment: score, contradiction: 1 - score, neutral: 0 },
          }
    ),
  });
  const candidates = [
    make('pending', [undefined, undefined]),
    make('contradiction', [0.01, 0.01]),
    make('partial', [0.99, undefined, undefined]),
    make('single-high', [0.99]),
    make('strong', [0.9, 0.9]),
    make('repeated', [0.85, 0.85, 0.85, 0.85, 0.85]),
  ];
  const index = createRelationResultsIndex(data.entities.entities, candidates);
  assert.equal(index.relations.get('partial').meanSupport, 0.33);
  assert.equal(index.relations.get('partial').supportCount, 1);
  assert.equal(index.relations.get('partial').confidence, 0.165);
  assert.equal(index.relations.get('pending').confidence, 0);
  const ordered = [...index.relations.values()].sort(compareRelationConfidence);
  assert.deepEqual(
    ordered.map((item) => item.candidate.id),
    ['repeated', 'strong', 'single-high', 'partial', 'contradiction', 'pending']
  );
  assert.ok(
    confidence(make('two-supports', [0.9, 0.9])) > confidence(make('one-support', [0.9])),
    'equal averages gain rank from additional supported judgments'
  );
  assert.ok(
    confidence(make('diluted', [0.9, 0.9, ...Array(20).fill(0.01)])) <
      confidence(make('one-support', [0.9])),
    'more support cannot outweigh a sufficiently poor overall average'
  );
  assert.deepEqual(
    [...index.entities.get('orama').relationships.values()]
      .sort(compareRelationConfidence)
      .map((item) => item.id),
    ordered.map((item) => item.candidate.id)
  );
  assert.equal(confidence({ ...base, observations: [] }), 0);
  for (const invalid of [NaN, Infinity, -1, 2])
    assert.equal(confidence(make('invalid', [invalid])), 0);
  const unverified = make('unverified', [0.99]);
  unverified.validations[0].verdict = 'unverified';
  assert.equal(confidence(unverified), 0);
});

test('entity details index both endpoints, keep equally named relationships distinct and retain unconnected keywords', () => {
  const data = resultFixture();
  const before = JSON.stringify(data);
  const index = createRelationResultsIndex(data.entities.entities, data.result.candidates);
  const orama = index.entities.get('orama');
  assert.equal(orama.text, 'Orama');
  assert.deepEqual([...orama.relationships.keys()], ['uses-storage', 'uses-ui']);
  assert.deepEqual([...orama.relatedEntities], ['indexeddb', 'react native']);
  assert.equal(index.entities.get('unconnected').relationships.size, 0);
  assert.equal(
    index.entities.get('indexeddb').relationships.get('uses-storage').sentences.length,
    2
  );
  assert.equal(JSON.stringify(data), before);
});

test('identical evidence from the same note retains the corresponding entity pair and validation by occurrence', () => {
  const data = resultFixture();
  const index = createRelationResultsIndex(data.entities.entities, data.result.candidates);
  const rows = index.relations.get('uses-storage').evidence;
  assert.equal(rows[0].observation.evidence, rows[1].observation.evidence);
  assert.equal(rows[0].validation.verdict, 'supported');
  assert.equal(rows[1].validation.verdict, 'contradicted');
  assert.equal(rows[1].observation.source, 'React Native');
  assert.equal(rows[1].validation.hypothesis, 'Hypothesis 1');
});

test('each related relationship keeps complete sentences while indexing only its actual counterpart', () => {
  const data = resultFixture();
  data.result.candidates[0].observations[0].evidence = 'Orama uses\nIndexedDB';
  data.result.candidates[0].observations[1].evidence = 'React Native uses IndexedDB.';
  data.result.candidates[1].observations[0].evidence = 'Orama renders React Native.';
  const details = {
    orama: {
      sources: [],
      sentences: [
        {
          noteTitle: 'Folder/One',
          section: 'Storage',
          text: 'Orama uses IndexedDB alongside React Native to retain all context.',
          entities: ['Orama', 'IndexedDB', 'React Native'],
        },
        {
          noteTitle: 'Folder/One',
          section: 'Storage',
          text: 'Orama renders React Native.',
          entities: ['Orama', 'React Native'],
        },
        {
          noteTitle: 'Elsewhere',
          section: 'Storage',
          text: 'Orama uses IndexedDB in an unrelated note.',
          entities: ['Orama', 'IndexedDB'],
        },
      ],
    },
  };
  const index = createRelationResultsIndex(data.entities.entities, data.result.candidates, details);
  const entity = index.entities.get('orama');
  const storage = entity.relationships.get('uses-storage');
  assert.deepEqual(storage.sentences, [
    {
      context: details.orama.sentences[0],
      relatedEntityKey: 'indexeddb',
      evidence: index.relations.get('uses-storage').evidence[0],
      observationIndex: 0,
    },
  ]);
  assert.equal(storage.sentences[0].context, details.orama.sentences[0]);
  assert.deepEqual(
    storage.sentences.map((row) => row.relatedEntityKey),
    ['indexeddb']
  );
  assert.deepEqual(entity.relationships.get('uses-ui').sentences, [
    {
      context: details.orama.sentences[1],
      relatedEntityKey: 'react native',
      evidence: index.relations.get('uses-ui').evidence[0],
      observationIndex: 0,
    },
  ]);
  assert.equal(
    storage.sentences.length,
    1,
    'other entity endpoints in the same candidate do not leak into this item'
  );
});

test('one sentence keeps each actual relationship counterpart separate from other co-occurring entities', () => {
  const data = resultFixture();
  const candidate = data.result.candidates[0];
  const text = 'Orama uses IndexedDB and React Native.';
  candidate.observations = ['IndexedDB', 'React Native'].map((target) => ({
    ...candidate.observations[0],
    source: 'Orama',
    target,
    evidence: text,
  }));
  const sentence = {
    noteTitle: 'Folder/One',
    section: 'Storage',
    text,
    entities: ['Orama', 'IndexedDB', 'React Native'],
  };
  const index = createRelationResultsIndex(data.entities.entities, [candidate], {
    orama: { sources: [], sentences: [sentence] },
  });
  assert.deepEqual(
    index.entities
      .get('orama')
      .relationships.get(candidate.id)
      .sentences.map((row) => row.relatedEntityKey),
    ['indexeddb', 'react native']
  );
  assert.deepEqual([...index.entities.get('indexeddb').relatedEntities], ['orama']);
});

test('normalization preserves display names, avoids double-counting a self pair, and rebuilding discards removed details', () => {
  assert.equal(relationEntityKey('  React   Native '), 'react native');
  assert.equal(relationEntityKey('가나다'.normalize('NFD')), '가나다');
  const data = resultFixture();
  const candidate = data.result.candidates[0];
  candidate.observations = [{ ...candidate.observations[0], source: 'ORAMA', target: 'Orama' }];
  candidate.validations.length = 1;
  const index = createRelationResultsIndex(data.entities.entities, [candidate]);
  assert.equal(index.entities.get('orama').relationships.get(candidate.id).sentences.length, 1);
  assert.equal(index.entities.get('orama').relatedEntities.size, 0);
  const updated = createRelationResultsIndex(
    data.entities.entities.filter((item) => item.text !== 'Orama'),
    []
  );
  assert.equal(updated.entities.has('orama'), false);
  assert.equal(updated.relations.size, 0);
  assert.equal(updated.entities.get('indexeddb').relationships.size, 0);
});

test('concrete numeric endpoints navigate to one pattern entity without mixing different evidence sentences', () => {
  assert.equal(relationEntityKey('Sprint 123'), 'sprint 123');
  assert.notEqual(relationEntityKey('Sprint {{NUM}}'), 'sprint 123');
  const data = resultFixture();
  const inventory = [
    {
      ...loadTs('relationKeywords.ts').relationKeyword('Sprint 1'),
      mentionCount: 3,
      noteCount: 3,
    },
    ...data.entities.entities,
  ];
  const candidate = data.result.candidates[0];
  candidate.observations = [
    {
      ...candidate.observations[0],
      source: 'Sprint 1',
      sourceType: 'Sprint {{NUM}}',
      evidence: 'Sprint 1 uses IndexedDB.',
    },
  ];
  candidate.validations.length = 1;
  const details = {
    'sprint 1': {
      sources: [],
      sentences: [1, 2].map((value) => ({
        noteTitle: 'Folder/One',
        section: 'Storage',
        text: `Sprint ${value} uses IndexedDB.`,
        entities: [`Sprint ${value}`, 'IndexedDB'],
        entityKeys: [`sprint ${value}`, 'indexeddb'],
      })),
    },
  };
  const index = createRelationResultsIndex(inventory, [candidate], details);
  const entity = index.entities.get('sprint 1');
  assert.equal(entity.type, 'Sprint {{NUM}}');
  assert.equal(entity.relationships.get(candidate.id).sentences.length, 1);
  assert.deepEqual(entity.relationships.get(candidate.id).sentences, [
    {
      context: details['sprint 1'].sentences[0],
      relatedEntityKey: 'indexeddb',
      evidence: index.relations.get(candidate.id).evidence[0],
      observationIndex: 0,
    },
  ]);
  assert.equal(index.relations.get(candidate.id).evidence[0].observation.source, 'Sprint 1');
});

test('relationship titles use the representative template and retain endpoint order from either entity perspective', () => {
  const data = resultFixture();
  const candidate = data.result.candidates[0];
  candidate.template = '{{E1}} depends on {{E2}}; {{E1}} again.';
  const text = 'Orama and IndexedDB appear together in this complete source sentence.';
  candidate.observations = [
    { ...candidate.observations[0], source: 'Orama', target: 'IndexedDB', evidence: text },
    { ...candidate.observations[0], source: 'IndexedDB', target: 'Orama', evidence: text },
  ];
  const index = createRelationResultsIndex(data.entities.entities, [candidate]);
  const expected = [
    'Orama depends on IndexedDB; Orama again.',
    'IndexedDB depends on Orama; IndexedDB again.',
  ];
  for (const key of ['orama', 'indexeddb']) {
    const rows = index.entities.get(key).relationships.get(candidate.id).sentences;
    assert.deepEqual(
      rows.map((row) => statement(row, candidate.template)),
      expected
    );
    assert.ok(rows.every((row) => row.context.text === text));
    assert.equal(new Set(rows.map((row) => row.relatedEntityKey)).size, 1);
  }
  assert.equal(
    relationStatement('{{E1}} uses {{E2}} and {{E1}}.', 'Literal {{E2}}', '$& Tool'),
    'Literal {{E2}} uses $& Tool and Literal {{E2}}.'
  );
});

test('entity relationship cards retain the per-evidence judgment when identical statements have different validation outcomes', () => {
  const data = resultFixture();
  const candidate = data.result.candidates[0];
  candidate.observations = Array.from({ length: 4 }, () => ({ ...candidate.observations[0] }));
  candidate.validations = [
    candidate.validations[0],
    candidate.validations[1],
    undefined,
    candidate.validations[0],
  ];
  const index = createRelationResultsIndex(data.entities.entities, [candidate]);
  for (const key of ['orama', 'indexeddb']) {
    const rows = index.entities.get(key).relationships.get(candidate.id).sentences;
    assert.deepEqual(
      rows.map((row) => row.evidence.validation?.verdict ?? 'unverified'),
      ['supported', 'contradicted', 'unverified']
    );
    assert.equal(new Set(rows.map((row) => statement(row, candidate.template))).size, 1);
  }
});

test('entity verification cards retain exact observation and validation details even for equal statements and judgments', () => {
  const data = resultFixture();
  const candidate = data.result.candidates[0];
  candidate.template = '{{E2}} is used by {{E1}}.';
  candidate.observations = Array.from({ length: 3 }, () => ({ ...candidate.observations[0] }));
  candidate.validations = [
    candidate.validations[0],
    {
      ...candidate.validations[0],
      hypothesis: 'A different hypothesis',
      hypothesisSource: {
        noteTitle: 'Other pattern note',
        section: 'Parent / Literal / heading',
        sectionPath: ['Parent', 'Literal / heading'],
      },
      scores: { entailment: 0.91, neutral: 0.08, contradiction: 0.01 },
    },
    undefined,
  ];
  const index = createRelationResultsIndex(data.entities.entities, [candidate]);
  for (const key of ['orama', 'indexeddb']) {
    const relationship = index.entities.get(key).relationships.get(candidate.id);
    assert.equal(relationship.template, candidate.template);
    assert.equal(relationship.sentences.length, 3);
    relationship.sentences.forEach((row, i) => {
      assert.equal(row.observationIndex, i);
      assert.equal(row.evidence, index.relations.get(candidate.id).evidence[i]);
      assert.equal(row.evidence.observation, candidate.observations[i]);
      assert.equal(row.evidence.validation, candidate.validations[i]);
    });
  }
});
