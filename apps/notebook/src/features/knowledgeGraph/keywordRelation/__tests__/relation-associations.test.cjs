const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Association scores and collection', () => {
  const { discoverKeywordAssociations } = require('./loadTs.cjs').keywordHarness();
  const loadTs = require('./loadTs.cjs');
  const { scoreRelationAssociation, evaluateKeywordAssociations } = loadTs(
    'keyword/evaluateKeywordAssociations.ts',
    {},
    ['scoreRelationAssociation']
  );
  const { createRelationDiscoveryMemory, analyzeRelationKeywordComposition } =
    loadTs('keyword/keywordUtils.ts');
  const { collectKeywordTypes } = loadTs('keyword/collectKeywordTypes.ts');
  const { collectKeywordRelations } = loadTs('keyword/collectKeywordRelations.ts');
  const { relationPatternEntityTypes } = loadTs('keyword/collectKeywordRelations.ts', {}, [
    'relationPatternEntityTypes',
  ]);

  const names = [
    'Service Alpha',
    'Service Beta',
    'Service Gamma',
    'Tool Alpha',
    'Tool Beta',
    'Tool Gamma',
  ];
  function dictionaries() {
    return Array.from({ length: 3 }, (_, index) => ({
      title: `Dictionary ${index}`,
      description:
        '## Services\n' +
        names
          .slice(0, 3)
          .map((name) => `- **${name}**`)
          .join('\n') +
        '\n\n## Tools\n' +
        names
          .slice(3)
          .map((name) => `- **${name}**`)
          .join('\n'),
    }));
  }
  const pairs = (candidate) =>
    candidate.observations.map(({ source, target }) => [source, target].sort().join(' / '));
  const byKind = (result, kind) =>
    result.candidates.filter((candidate) => candidate.association.context === kind);

  function boundaryEngine(blocks, options = {}) {
    const entities = names.map((text) => ({
      text,
      key: text.toLowerCase(),
      type: null,
      mentionCount: 3,
      noteCount: 3,
    }));
    const type = (name, indices, parentIndices = [], childIndices = []) => ({
      name,
      parentIndices,
      childIndices,
      keywordCount: 1,
      occurrences: [],
      items: indices.map((index) => ({
        keywords: [{ key: entities[index].key, text: entities[index].text }],
      })),
    });
    const extraction = {
      status: 'completed',
      noteCount: 1,
      inputCount: 18,
      mentionCount: 18,
      entities,
      enumerations: [],
      entityTypes: [
        type('Services', [0, 1], [], [1]),
        type('Extended services', [0, 1, 2], [0]),
        type('Tools', [3, 4, 5]),
      ],
    };
    const memory = createRelationDiscoveryMemory();
    memory.notes.set('Source', {
      title: 'Source',
      blocks: blocks.map((block) => ({ section: '', sectionPath: [], ...block })),
    });
    return {
      extraction,
      memory,
      run: async (extra) => {
        const input = { ...options, ...extra };
        memory.stats = createRelationDiscoveryMemory().stats;
        input.onEntities?.(extraction);
        const types = await collectKeywordTypes(
          {
            notes: [],
            extraction,
            memory,
            composition: analyzeRelationKeywordComposition(extraction.entities),
          },
          input
        );
        const prepared = await collectKeywordRelations(types, input);
        return input.prepareOnly ? prepared.result : evaluateKeywordAssociations(prepared, input);
      },
    };
  }

  function compositionEngine(
    blocks,
    keywords = ['React Native', 'React DOM', 'React Server', 'React', 'Native', 'Storage']
  ) {
    const engine = boundaryEngine(blocks);
    const replacements = new Map(names.map((name, index) => [name.toLowerCase(), keywords[index]]));
    const rename = (keyword) => {
      const text = replacements.get(keyword.key);
      keyword.key = text.toLowerCase();
      keyword.text = text;
    };
    engine.extraction.entities.forEach(rename);
    engine.extraction.entityTypes.forEach((type) => {
      type.items.forEach((item) => item.keywords.forEach(rename));
    });
    engine.extraction.entities.sort(
      (a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text)
    );
    engine.memory.notes.get('Source').title = 'React Native';
    return engine;
  }

  test('frequency correction ranks selective repetition above an ubiquitous endpoint and keeps finite degenerate scores', () => {
    const selective = scoreRelationAssociation('sentence', 100, 10, 10, 8);
    const common = scoreRelationAssociation('sentence', 100, 100, 10, 8);
    assert.ok(selective.score > common.score);
    assert.ok(selective.lift > common.lift);
    assert.ok(selective.specificity > common.specificity);
    assert.ok(
      scoreRelationAssociation('table-row', 10, 4, 4, 3).score >
        scoreRelationAssociation('sentence', 10, 4, 4, 3).score
    );
    assert.ok(
      scoreRelationAssociation('sentence', 10, 4, 4, 3).score >
        scoreRelationAssociation('sentence', 10, 4, 4, 1).score
    );
    for (const metrics of [
      scoreRelationAssociation('sentence', 1, 1, 1, 1),
      scoreRelationAssociation('sentence', 0, 0, 0, 0),
    ]) {
      assert.ok(
        Object.values(metrics)
          .filter((value) => typeof value === 'number')
          .every(Number.isFinite)
      );
      assert.ok(metrics.score >= 0 && metrics.score <= 1);
    }
  });

  test('shared entity types are excluded in every association context before role combinations expand', async (t) => {
    const cases = {
      sentence: [
        { text: 'Service Alpha meets Service Beta.' },
        { text: 'Service Alpha meets Service Gamma.' },
      ],
      'list-item': [
        { text: 'Service Alpha and Service Beta', listItem: { list: 0, item: 0 } },
        { text: 'Service Alpha and Service Gamma', listItem: { list: 0, item: 1 } },
      ],
      field: [
        { text: 'Service Beta', field: 'Related' },
        { text: 'Service Gamma', field: 'Related' },
      ],
      'table-row': [
        { text: 'Service Alpha', table: 0, row: 0, column: 'First', columnIndex: 0 },
        { text: 'Service Beta', table: 0, row: 0, column: 'Second', columnIndex: 1 },
        { text: 'Service Alpha', table: 0, row: 1, column: 'First', columnIndex: 0 },
        { text: 'Service Gamma', table: 0, row: 1, column: 'Second', columnIndex: 1 },
      ],
      'table-cell': [
        {
          text: 'Service Alpha and Service Beta',
          table: 0,
          row: 0,
          column: 'Details',
          columnIndex: 0,
        },
        {
          text: 'Service Alpha and Service Gamma',
          table: 0,
          row: 1,
          column: 'Details',
          columnIndex: 0,
        },
      ],
      'field-value': [
        { text: 'Service Alpha and Service Beta', field: 'Details' },
        { text: 'Service Alpha and Service Gamma', field: 'Details' },
      ],
    };
    for (const [kind, blocks] of Object.entries(cases)) {
      await t.test(kind, async () => {
        const engine = boundaryEngine(blocks);
        engine.memory.notes.get('Source').title = 'Service Alpha';
        const result = await engine.run();
        assert.equal(result.candidates.length, 0);
        assert.equal(result.inputPatterns.length, 0);
        assert.equal(result.associationStats.pairCount, 0);
        assert.equal(result.entityExtraction, engine.extraction);
        assert.deepEqual(result.entityExtraction.entityTypes[1].parentIndices, [0]);
      });
    }
  });

  test('existing compound and contained keyword relationships exclude pairs across every association context', async (t) => {
    const cases = {
      sentence: [{ text: 'REACT NATIVE includes React.' }, { text: 'React is part of React DOM.' }],
      'list-item': [
        { text: 'React Native includes React', listItem: { list: 0, item: 0 } },
        { text: 'Native is part of React Native', listItem: { list: 0, item: 1 } },
      ],
      field: [
        { text: 'React', field: 'Component' },
        { text: 'Native', field: 'Component' },
      ],
      'table-row': [
        { text: 'React Native', table: 0, row: 0, column: 'Whole', columnIndex: 0 },
        { text: 'React', table: 0, row: 0, column: 'Part', columnIndex: 1 },
        { text: 'React DOM', table: 0, row: 1, column: 'Whole', columnIndex: 0 },
        { text: 'React', table: 0, row: 1, column: 'Part', columnIndex: 1 },
      ],
      'table-cell': [
        {
          text: 'React Native includes React',
          table: 0,
          row: 0,
          column: 'Details',
          columnIndex: 0,
        },
        {
          text: 'Native is part of React Native',
          table: 0,
          row: 1,
          column: 'Details',
          columnIndex: 0,
        },
      ],
      'field-value': [
        { text: 'React Native includes React', field: 'Details' },
        { text: 'Native is part of React Native', field: 'Details' },
      ],
    };
    for (const [kind, blocks] of Object.entries(cases)) {
      await t.test(kind, async () => {
        const engine = compositionEngine(blocks);
        const result = await engine.run();
        assert.equal(result.candidates.length, 0);
        assert.equal(result.inputPatterns.length, 0);
        assert.equal(result.associationStats.pairCount, 0);
        assert.equal(result.entityExtraction, engine.extraction);
      });
    }
  });

  test('single-pair single-evidence groups are excluded, while two source sections support a single pair', async () => {
    const one = boundaryEngine([{ text: 'Service Alpha meets Tool Alpha.' }]);
    assert.equal((await one.run()).candidates.length, 0);
    const two = boundaryEngine([
      { text: 'Service Alpha meets Tool Alpha.', section: 'One', sectionPath: ['One'] },
      { text: 'Service Alpha meets Tool Alpha.', section: 'Two', sectionPath: ['Two'] },
    ]);
    const result = await two.run();
    assert.equal(result.candidates.length, 2);
    for (const candidate of result.candidates) {
      assert.equal(candidate.pairSupport, 1);
      assert.equal(candidate.association.evidenceCount, 2);
      assert.equal(candidate.association.generalizationScore, 0);
      assert.equal(candidate.observations.length, 2);
      assert.ok(candidate.measurements.every((row) => row.association.pairCount === 2));
    }
  });

  test('duplicate source blocks and expanded parent/child memberships do not multiply physical evidence', async () => {
    const engine = boundaryEngine([
      { text: 'Service Alpha meets Tool Alpha.' },
      { text: 'Service Alpha meets Tool Alpha.' },
      { text: 'Service Beta meets Tool Beta.' },
    ]);
    const result = await engine.run();
    assert.equal(result.candidates.length, 2);
    assert.equal(result.associationStats.evidenceCount, 2);
    assert.equal(result.observationCount, 2);
    const memberships = relationPatternEntityTypes(engine.extraction.entityTypes);
    assert.deepEqual(memberships.get('service alpha'), ['Extended services', 'Services']);
    assert.deepEqual(memberships.get('service gamma'), ['Extended services']);
    for (const candidate of result.candidates) {
      assert.equal(candidate.observations.length, 2);
      assert.equal(candidate.pairSupport, 2);
      assert.equal(candidate.association.evidenceCount, 2);
      assert.ok(
        candidate.observations.every(
          (row) => row.sourceEntityTypes.length === 1 && row.targetEntityTypes.length === 1
        )
      );
    }
    assert.notEqual(result.candidates[0].id, result.candidates[1].id);
  });

  test('keeps table row boundaries and column role families; headers do not become endpoints', async () => {
    const result = await discoverKeywordAssociations([
      ...dictionaries(),
      {
        title: 'Records',
        description:
          '| Service | Used tool |\n| --- | --- |\n| Service Alpha | Tool Alpha |\n| Service Beta | Tool Beta |\n',
      },
    ]);
    const tables = byKind(result, 'table-row');
    assert.ok(tables.length);
    assert.ok(
      tables.every(
        (candidate) =>
          candidate.associationFamily === JSON.stringify(['table-row', 'service', 'used tool']) &&
          JSON.stringify(candidate.associationRoles) === JSON.stringify(['Service', 'Used tool'])
      )
    );
    const found = new Set(tables.flatMap(pairs));
    assert.ok(found.has('Service Alpha / Tool Alpha'));
    assert.ok(found.has('Service Beta / Tool Beta'));
    assert.ok(!found.has('Service Alpha / Tool Beta'));
    assert.ok(!found.has('Service Beta / Tool Alpha'));
    assert.ok(
      tables
        .flatMap((row) => row.observations)
        .every((row) => row.origin === 'table' && !['Service', 'Used tool'].includes(row.source))
    );
  });

  test('whole property values connect linked peers without an admitted owner or crossing other properties', async () => {
    const result = await discoverKeywordAssociations([
      ...dictionaries(),
      {
        title: 'Values',
        description:
          'Details: [Service Alpha](alpha.md), [Tool Alpha](tool.md); Other: [Tool Gamma](gamma.md)\n\n' +
          'Details: [Service Beta](beta.md), [Tool Beta](tool-beta.md)\n\n' +
          'Details: Service Alpha\n\n' +
          'Tool Gamma: Service Alpha',
      },
    ]);
    const values = byKind(result, 'field-value');
    assert.ok(values.length);
    assert.deepEqual([...new Set(values.flatMap(pairs))].sort(), [
      'Service Alpha / Tool Alpha',
      'Service Beta / Tool Beta',
    ]);
    assert.equal(byKind(result, 'field').length, 0);
    for (const candidate of values) {
      assert.equal(candidate.associationFamily, JSON.stringify(['field-value', 'details']));
      assert.deepEqual(candidate.associationRoles, ['Details']);
      assert.ok(
        candidate.observations.every(
          (row) => row.origin === 'field' && row.direction === 'undirected'
        )
      );
      assert.ok(candidate.observations.every((row) => !row.evidence.includes('Other')));
      const at = candidate.observations.findIndex((row) =>
        [row.source, row.target].includes('Service Alpha')
      );
      const { association: metrics } = candidate.measurements[at];
      assert.equal(metrics.context, 'field-value');
      assert.equal(metrics.contextCount, 3);
      assert.equal(metrics.pairCount, 1);
      assert.equal(
        candidate.observations[at].source === 'Service Alpha'
          ? metrics.sourceCount
          : metrics.targetCount,
        2
      );
    }
  });

  test('list hierarchy and sibling enumeration entries do not create associations', async () => {
    const result = await discoverKeywordAssociations([
      ...dictionaries(),
      {
        title: 'Lists',
        description: '- Service Alpha\n  - Tool Alpha\n- Service Beta\n  - Tool Beta\n',
      },
    ]);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.associationStats.pairCount, 0);
  });

  test('marginals include single-keyword contexts and a source edit recomputes scores without mutating a published result', async () => {
    const memory = createRelationDiscoveryMemory();
    const base = [
      ...dictionaries(),
      {
        title: 'First',
        description: 'Service Alpha meets Tool Alpha.\n\nService Alpha follows Tool Alpha.',
      },
    ];
    const previous = await discoverKeywordAssociations(base, { memory });
    const before = byKind(previous, 'sentence')[0];
    const snapshot = structuredClone(before);
    const edited = await discoverKeywordAssociations(
      [
        ...base,
        {
          title: 'Extra',
          description: Array.from(
            { length: 8 },
            (_, index) => `Service Alpha does task ${index}.`
          ).join('\n\n'),
        },
      ],
      { memory }
    );
    const after = byKind(edited, 'sentence').find((candidate) => candidate.id === before.id);
    assert.ok(after.association.score < before.association.score);
    assert.ok(
      after.measurements[0].association.sourceCount >
        before.measurements[0].association.sourceCount ||
        after.measurements[0].association.targetCount >
          before.measurements[0].association.targetCount
    );
    assert.deepEqual(before, snapshot);
  });
});

describe('Relationship role templates', () => {
  const loadTs = require('./loadTs.cjs');
  const { relationPatternRoleKey } = loadTs('keyword/collectKeywordRelations.ts', {}, [
    'relationPatternRoleKey',
  ]);
  const { relationPatternTemplate, relationPatternEntityTypes, relationPatternRoleVariants } =
    loadTs('keyword/collectKeywordRelations.ts', {}, [
      'relationPatternTemplate',
      'relationPatternEntityTypes',
      'relationPatternRoleVariants',
    ]);
  test('role slots use descriptors and allow one fixed literal keyword', () => {
    assert.equal(
      relationPatternTemplate({
        template: '{{E1}} uses {{E2}}.',
        sourceType: 'Sample {{NUM}}',
        targetType: null,
        sourceEntityTypes: ['작업'],
        targetEntityTypes: ['도구'],
      }),
      '{{E1: pattern=Sample {{NUM}}; type=작업}} uses {{E2: type=도구}}.'
    );
    assert.equal(
      relationPatternTemplate({
        template: '{{E1}} uses {{E2}}.',
        sourceType: null,
        targetType: 'Sample {{NUM}}',
        source: 'ObjectAlpha',
        target: 'Sample 1',
      }),
      '{{E1: keyword=ObjectAlpha}} uses {{E2: pattern=Sample {{NUM}}}}.'
    );
  });

  test('each distinct type combination gets one type per role without mutating or dropping memberships', () => {
    const base = {
      template: '{{E1}} uses {{E2}}.',
      origin: 'sentence',
      sourceType: null,
      targetType: null,
      sourceEntityTypes: ['Type {{E2}}', '$& Tools', 'Type {{E2}}', ''],
      targetEntityTypes: ['Target', 'Other'],
    };
    const before = JSON.stringify(base);
    const variants = relationPatternRoleVariants(base);
    assert.equal(JSON.stringify(base), before);
    assert.deepEqual(
      variants.map((variant) => [variant.sourceEntityTypes, variant.targetEntityTypes]),
      [
        [['$& Tools'], ['Other']],
        [['$& Tools'], ['Target']],
        [['Type {{E2}}'], ['Other']],
        [['Type {{E2}}'], ['Target']],
      ]
    );
    assert.equal(new Set(variants.map(relationPatternRoleKey)).size, 4);
    assert.deepEqual(
      relationPatternRoleVariants({
        ...base,
        sourceEntityTypes: [...base.sourceEntityTypes].reverse(),
        targetEntityTypes: [...base.targetEntityTypes].reverse(),
      }).map(relationPatternRoleKey),
      variants.map(relationPatternRoleKey)
    );
    assert.throws(() => relationPatternTemplate(base), /Expand relationship type combinations/);
    assert.deepEqual(
      relationPatternRoleVariants({
        ...base,
        sourceEntityTypes: [],
        targetEntityTypes: ['Target'],
      }).map((variant) => [variant.sourceEntityTypes, variant.targetEntityTypes]),
      [[undefined, ['Target']]]
    );
    assert.deepEqual(
      relationPatternRoleVariants({
        ...base,
        sourceEntityTypes: undefined,
        targetEntityTypes: [],
      }).map((variant) => [variant.sourceEntityTypes, variant.targetEntityTypes]),
      [[undefined, undefined]]
    );
  });

  test('role memberships include matching parents, children and independent overlapping types', () => {
    const type = (name, words, childIndices = []) => ({
      name,
      childIndices,
      items: words.map((key) => ({ keywords: [{ key, text: key }] })),
    });
    const types = relationPatternEntityTypes([
      type('Parent', ['alpha', 'beta'], [1]),
      type('Specific', ['alpha', 'beta', 'gamma']),
      type('Independent', ['alpha', 'delta']),
    ]);
    assert.deepEqual(types.get('alpha'), ['Independent', 'Parent', 'Specific']);
    assert.deepEqual(types.get('beta'), ['Parent', 'Specific']);
    assert.deepEqual(types.get('gamma'), ['Specific']);
    assert.deepEqual(types.get('delta'), ['Independent']);
    assert.equal(types.get('missing'), undefined);
  });
});
