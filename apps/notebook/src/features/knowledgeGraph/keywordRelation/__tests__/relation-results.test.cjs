const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const loadTs = require('./loadTs.cjs');
const { resultFixture } = require('./loadTs.cjs');

const { createRelationResultsIndex, relationEntityKey } = loadTs('relationResults.ts', {
  './keyword/keywordUtils': loadTs('keyword/keywordUtils.ts'),
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

test('derived constituent entries share original provenance, deduplicate locations and refresh with the input inventory', () => {
  const inventory = ['서울역', '서울시청', '서울버스'].map((text) => ({
    text,
    type: null,
    noteCount: 1,
    mentionCount: 1,
  }));
  const shared = { noteTitle: '서울', section: '', kind: 'bold', text: '서울역 서울시청' };
  const details = Object.fromEntries(
    inventory.map((entity, index) => [
      entity.text,
      {
        sources: [
          {
            ...shared,
            ...(index === 2 ? { noteTitle: '교통', text: '서울버스' } : {}),
            keyword: entity.text,
          },
        ],
        sentences: [],
      },
    ])
  );
  const before = JSON.stringify({ inventory, details });
  const index = createRelationResultsIndex(inventory, [], details);
  const constituent = index.entities.get('서울');
  assert.equal(index.entities.size, 4);
  assert.equal(constituent.isConstituentKeyword, true);
  assert.equal(constituent.isSyntheticKeyword, false);
  assert.equal(constituent.isContainedKeyword, true);
  assert.equal(constituent.isCompoundKeyword, false);
  assert.equal(constituent.sources.length, 2);
  assert.equal(constituent.noteCount, 2);
  assert.equal(constituent.mentionCount, 2);
  assert.ok(constituent.sources.every((source) => source.keyword === '서울'));
  assert.ok(inventory.every((entity) => index.entities.get(entity.text).isCompoundKeyword));
  assert.ok(inventory.every((entity) => index.entities.get(entity.text).isSyntheticKeyword));
  for (const entity of inventory) {
    const relations = index.entities.get(entity.text).generalRelations;
    assert.deepEqual(relations.constituentKeys, ['서울']);
    assert.deepEqual(relations.containedKeys, ['서울']);
  }
  assert.deepEqual(
    constituent.generalRelations.syntheticKeys.sort(),
    inventory.map((e) => e.text).sort()
  );
  assert.deepEqual(
    constituent.generalRelations.compoundKeys.sort(),
    inventory.map((e) => e.text).sort()
  );
  assert.equal(JSON.stringify({ inventory, details }), before);
  assert.equal(
    createRelationResultsIndex(inventory.slice(0, 2), [], details).entities.has('서울'),
    false
  );
  assert.deepEqual(
    createRelationResultsIndex(inventory.slice(0, 2), [], details).entities.get('서울역')
      .generalRelations.constituentKeys,
    []
  );
});

test('type filters expose roots, include descendants and keep identity across renames and reordering', () => {
  const type = (name, items, parentIndices = [], childIndices = []) => ({
    name,
    keywordCount: items[0].length,
    items: items.map((keys) => ({ keywords: keys.map((key) => ({ key, text: key })) })),
    occurrences: [],
    parentIndices,
    childIndices,
  });
  const types = [
    type('General', [['a'], ['b']], [], [1, 2]),
    type('Middle', [['a'], ['b'], ['c']], [0], [2]),
    type('Specific', [['a'], ['b'], ['c'], ['d']], [0, 1]),
    type('Independent', [['c'], ['e']]),
    type('Compound', [
      ['a', 'b'],
      ['f', 'g'],
    ]),
  ];
  const inventory = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'other'].map((text) => ({
    text,
    type: null,
    noteCount: 3,
    mentionCount: 3,
  }));
  const before = JSON.stringify(types);
  const index = createRelationResultsIndex(inventory, [], {}, types);
  const key = (name) =>
    Object.entries(index.entityTypeLabels).find(([, label]) => label === name)[0];
  assert.deepEqual(Object.values(index.entityTypeLabels), ['General', 'Independent', 'Compound']);
  assert.deepEqual(index.entities.get('d').entityTypeKeys, [key('General')]);
  assert.deepEqual(index.entities.get('c').entityTypeKeys, [key('General'), key('Independent')]);
  assert.deepEqual(index.entities.get('f').entityTypeKeys, [key('Compound')]);
  assert.deepEqual(index.entities.get('other').entityTypeKeys, []);
  assert.deepEqual(index.entities.get('a').entityTypeNames, ['Specific', 'Compound']);
  assert.deepEqual(
    index.entities.get('a').generalRelations.entityTypes.map((type) => type.name),
    ['General', 'Middle', 'Specific', 'Compound']
  );
  const reordered = [...types].reverse().map((type) => ({
    ...type,
    name: `${type.name} renamed`,
    parentIndices: type.parentIndices.map((index) => types.length - 1 - index),
    childIndices: type.childIndices.map((index) => types.length - 1 - index),
  }));
  const refreshed = createRelationResultsIndex(inventory, [], {}, reordered);
  assert.deepEqual(
    refreshed.entities.get('d').entityTypeKeys,
    index.entities.get('d').entityTypeKeys
  );
  assert.equal(refreshed.entityTypeLabels[key('General')], 'General renamed');
  assert.equal(JSON.stringify(types), before);
});

test('normalization preserves display names, avoids double-counting a self pair, and rebuilding discards removed details', () => {
  assert.equal(relationEntityKey('  React   Native '), 'react native');
  assert.equal(relationEntityKey('가나다'.normalize('NFD')), '가나다');
  const data = resultFixture();
  const candidate = data.result.candidates[0];
  candidate.observations = [{ ...candidate.observations[0], source: 'ORAMA', target: 'Orama' }];
  candidate.measurements.length = 1;
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

test('association ranking averages measured scores per physical evidence ID', () => {
  const { relationAssociationRank } = loadTs('relationResults.ts');
  const row = (id, score) => ({
    evidenceId: id,
    noteTitle: 'One',
    evidence: 'Same spelling in different sections',
    association: { score },
  });
  const rank = relationAssociationRank([
    row('section-a', 0.6),
    row('section-a', 0.6),
    row('section-b', 0.8),
  ]);
  assert.equal(rank.evidenceCount, 2);
  assert.equal(rank.score, 0.7);
  const mixed = relationAssociationRank([row('one-row', 0.9), row('one-row', 0.1)]);
  assert.equal(mixed.score, 0.5);
  assert.equal(mixed.evidenceCount, 1);
  const fixture = resultFixture();
  const candidate = {
    ...fixture.result.candidates[0],
    association: { score: 0.55, generalizationScore: 0.2 },
    measurements: [row('section-a', 0.6), row('section-b', 0.8)],
  };
  const index = createRelationResultsIndex(fixture.entities.entities, [candidate]);
  assert.equal(index.relations.get(candidate.id).score, 0.55);
  assert.equal(index.entities.get('orama').relationships.get(candidate.id).score, 0.55);
});

describe('Association filters', () => {
  const { filterRelationEvidence: filter } = loadTs('relationPresentation.ts');
  const { matchesRelationGroupingFilter: grouping } = loadTs('relationResults.ts');

  function row(peer, context) {
    return {
      associationContext: context,
      associationRoles:
        context === 'field' ? ['Support'] : context === 'table-row' ? ['Owner', 'Peer'] : [],
      observation: {
        source: 'Owner',
        target: peer,
        sourceType: null,
        targetType: null,
        noteTitle: 'One',
        section: '',
        evidence: `${peer}: ${context}`,
        origin: 'sentence',
      },
    };
  }

  test('association AND requires every selected type within one normalized unordered entity pair', () => {
    const a = row('Both', 'sentence');
    const b = row('Only sentence', 'sentence');
    const c = row('Both', 'field');
    const d = row('Only field', 'field');
    c.observation.source = ' both ';
    c.observation.target = 'OWNER';
    const rows = [a, b, c, d];
    const snapshot = JSON.stringify(rows);
    assert.deepEqual(filter(rows, ['sentence', 'field']), rows);
    assert.deepEqual(filter(rows, ['sentence', 'field'], [], 'and'), [a, c]);
    assert.deepEqual(filter([b, d], ['sentence', 'field'], [], 'and'), []);
    assert.equal(JSON.stringify(rows), snapshot);
  });

  test('aggregation AND requires all selected bases on the same pair and never combines unrelated pairs', () => {
    const property = row('Both', 'field');
    const columns = row('Both', 'table-row');
    const sentence = row('Both', 'sentence');
    const otherProperty = row('Property only', 'field');
    const otherColumns = row('Columns only', 'table-row');
    const rows = [property, otherProperty, sentence, columns, otherColumns];
    assert.deepEqual(filter(rows, [], ['property', 'table-columns']), [
      property,
      otherProperty,
      columns,
      otherColumns,
    ]);
    assert.deepEqual(filter(rows, [], ['property', 'table-columns'], 'or', 'and'), [
      property,
      columns,
    ]);
    assert.deepEqual(
      filter([otherProperty, otherColumns], [], ['property', 'table-columns'], 'or', 'and'),
      []
    );
  });

  test('separate relationship filters intersect and their AND selections remain justified by visible evidence', () => {
    const property = row('Both', 'field');
    const columns = row('Both', 'table-row');
    const sentence = row('Both', 'sentence');
    assert.deepEqual(
      filter(
        [property, sentence, columns],
        ['field', 'table-row'],
        ['property', 'table-columns'],
        'and',
        'and'
      ),
      [property, columns]
    );
    assert.deepEqual(filter([property, sentence], ['field', 'sentence'], ['property'], 'and'), []);
    assert.deepEqual(filter([property, columns], [], [], 'and', 'and'), [property, columns]);
  });

  test('group kinds and evidence sufficiency follow the selected OR/AND operator as one filter', () => {
    assert.equal(grouping(['type'], 'pattern', true, true, 'or'), true);
    assert.equal(grouping(['type'], 'pattern', true, true, 'and'), false);
    assert.equal(grouping(['type'], 'type', true, false, 'or'), true);
    assert.equal(grouping(['type'], 'type', true, false, 'and'), false);
    assert.equal(grouping(['type'], 'type', true, true, 'and'), true);
    assert.equal(grouping(['type', 'pattern'], 'type', false, false, 'or'), true);
    assert.equal(grouping(['type', 'pattern'], 'type', false, false, 'and'), false);
    assert.equal(grouping([], 'keyword', false, false, 'and'), true);
    assert.equal(grouping([], 'pattern', true, true, 'or'), true);
    assert.equal(grouping([], 'pattern', true, false, 'and'), false);
  });
});

describe('Entity type relationship grouping', () => {
  const { groupRelationEvidenceByType: group } = loadTs('relationPresentation.ts');
  const { groupRelationEvidenceByRolePair: groupPairs } = loadTs('relationPresentation.ts');
  const { groupRelationEvidenceByPeerRole: groupPeers } = loadTs('relationPresentation.ts');
  const { groupRelationEvidenceByPair: concretePairs } = loadTs('relationPresentation.ts');
  const { relationPairGroupingKind } = loadTs('relationResults.ts');

  function row(source, target, sourceType, targetType, associationContext = 'sentence') {
    return {
      associationContext,
      observation: {
        source,
        target,
        sourceType: 'Source pattern',
        targetType: 'Target pattern',
        sourceEntityTypes: sourceType ? [sourceType] : undefined,
        targetEntityTypes: targetType ? [targetType] : undefined,
        noteTitle: 'One',
        section: '',
        evidence: `${source} / ${target}`,
        template: '{{E1}} — {{E2}}',
        direction: 'undirected',
        origin: 'sentence',
      },
    };
  }

  test('type combinations precede concrete pairs and merge reversed endpoint order within one association type', () => {
    const first = row('Task A', 'Tool A', 'Task', 'Tool');
    const reversed = row('Tool B', 'Task B', 'Tool', 'Task');
    const third = row('Task C', 'Tool C', 'Task', 'Tool');
    third.observation.sourceType = 'Another name pattern';
    const groups = group([
      first,
      reversed,
      third,
      row('Task A', 'Tool A', 'Task', 'Tool', 'field'),
      row('Task A', 'Other A', 'Task', 'Other'),
    ]);
    assert.equal(groups.length, 3);
    assert.deepEqual(groups[0].sourceRole, { kind: 'type', name: 'Task' });
    assert.deepEqual(groups[0].targetRole, { kind: 'type', name: 'Tool' });
    assert.deepEqual(groups[0].items, [first, reversed, third]);
    assert.equal(groups[1].associationType, 'field');
    assert.equal(group([reversed])[0].key, group([first])[0].key);
  });

  test('each role selects exactly one collected type, otherwise a name pattern, otherwise a fixed keyword', () => {
    const typed = row('Task A', 'Tool A', 'Task', 'Tool');
    const patterned = row('Task B', 'Tool B');
    const literal = row('Task', 'Tool');
    literal.observation.sourceType = null;
    literal.observation.targetType = null;
    const sameNames = row('Task C', 'Tool C');
    sameNames.observation.sourceType = 'Task';
    sameNames.observation.targetType = 'Tool';
    const groups = group([typed, patterned, literal, sameNames]);
    assert.equal(groups.length, 4);
    assert.deepEqual(
      groups.map((value) => [value.sourceRole.kind, value.targetRole.kind]),
      [
        ['type', 'type'],
        ['pattern', 'pattern'],
        ['keyword', 'keyword'],
        ['pattern', 'pattern'],
      ]
    );
    assert.deepEqual(groups[0].sourceRole, { kind: 'type', name: 'Task' });
    assert.deepEqual(groups[1].sourceRole, { kind: 'pattern', name: 'Source pattern' });
    assert.deepEqual(groups[2].sourceRole, { kind: 'keyword', name: 'Task' });
  });

  test('role-pair grouping keeps distinct collected types, patterns and literal keywords separate', () => {
    const typed = row('Task A', 'Tool A', 'Task', 'Tool');
    const patterned = row('Task B', 'Tool B');
    patterned.observation.sourceType = 'Task';
    patterned.observation.targetType = 'Tool';
    const literal = row('Task', 'Tool');
    literal.observation.sourceType = null;
    literal.observation.targetType = null;
    const typedPeer = row('Task D', 'Tool D', 'Task', 'Tool');
    const patternedPeer = row('Task E', 'Tool E');
    patternedPeer.observation.sourceType = 'Task';
    patternedPeer.observation.targetType = 'Tool';
    const groups = groupPairs([typed, typedPeer, patterned, patternedPeer, literal]);
    assert.equal(groups.length, 3);
    assert.deepEqual(
      groups.map((value) => value.sourceRole.kind),
      ['type', 'pattern', 'keyword']
    );
  });

  test('one normalized concrete pair always falls back to keywords despite repeated sources and type variants', () => {
    const first = row('Task A', 'Tool A', 'Task', 'Tool');
    const duplicateType = row('Task A', 'Tool A', 'Extended task', 'Extended tool');
    const reversed = row('tool a', ' TASK A ', 'Tool', 'Task', 'field');
    reversed.observation.noteTitle = 'Another note';
    const patterned = row('Task A', 'Tool A');
    const literal = row('Task A', 'Tool A');
    literal.observation.sourceType = null;
    literal.observation.targetType = null;
    const rows = [first, duplicateType, reversed, patterned, literal];
    const snapshot = JSON.stringify(rows);
    const groups = groupPairs(rows);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].sourceRole, { kind: 'keyword', name: 'Task A' });
    assert.deepEqual(groups[0].targetRole, { kind: 'keyword', name: 'Tool A' });
    assert.equal(groups[0].items.length, rows.length);
    assert.deepEqual(
      groups[0].associations.map((value) => value.items.length),
      [4, 1]
    );
    assert.ok(groups[0].associations.every((value) => value.sourceRole.kind === 'keyword'));
    assert.equal(JSON.stringify(rows), snapshot);
  });

  test('type, pattern and mixed descriptor pairs require two distinct pairs, including after filtering', () => {
    for (const kind of ['type', 'pattern', 'mixed']) {
      const first = row('Task A', 'Tool A', kind === 'type' ? 'Task' : undefined);
      const second = row(
        'Task B',
        kind === 'mixed' ? 'Tool A' : 'Tool B',
        kind === 'type' ? 'Task' : undefined
      );
      if (kind === 'mixed') {
        first.observation.targetType = null;
        second.observation.targetType = null;
      }
      const groups = groupPairs([first, second]);
      assert.equal(groups.length, 1);
      assert.ok(
        [groups[0].sourceRole, groups[0].targetRole].some((role) => role.kind !== 'keyword')
      );
      assert.equal(groupPairs([first])[0].sourceRole.kind, 'keyword');
      assert.equal(groupPairs([first])[0].targetRole.kind, 'keyword');
    }
  });

  test('peer keyword fallbacks merge into every existing descriptor group without losing their source evidence', () => {
    const typed = row('Selected', 'Café Tool', 'Owner', 'Tools');
    const typedPeer = row('Selected', 'Tool B', 'Owner', 'Tools');
    const patterned = row('Café Tool', 'Selected');
    const patternedPeer = row('Peer C', 'Selected');
    const variant = row('Selected', 'Café Tool', 'Owner', 'Singleton variant');
    const literal = row('cafe\u0301 tool', ' SELECTED ', undefined, undefined, 'field');
    literal.observation.sourceType = null;
    literal.observation.targetType = null;
    literal.observation.noteTitle = 'Unique field evidence';
    const unrelated = row('Selected', 'Other');
    unrelated.observation.targetType = null;
    const rows = [variant, literal, typed, typedPeer, patterned, patternedPeer, unrelated];
    const snapshot = JSON.stringify(rows);
    const groups = groupPeers(rows, 'Selected');
    assert.deepEqual(
      groups.map((value) => value.role.kind),
      ['type', 'pattern', 'keyword']
    );
    assert.equal(groups[2].role.name, 'Other');
    for (const value of groups.slice(0, 2)) {
      assert.ok(value.items.includes(literal));
      assert.ok(value.items.includes(variant));
    }
    assert.equal(JSON.stringify(rows), snapshot);
    const filtered = groupPeers([literal], 'Selected');
    assert.deepEqual(filtered[0].role, { kind: 'keyword', name: 'cafe\u0301 tool' });
    assert.deepEqual(filtered[0].items, [literal]);
  });

  test('keyword-containing pair groups keep only uncovered pairs and fall back again below two results', () => {
    const typed = row('Task A', 'Tool A', 'Task', 'Tool');
    const typedPeer = row('Task B', 'Tool B', 'Task', 'Tool');
    const mixed = ['Task A', 'Task C', 'Task D'].map((source) => {
      const value = row(source, 'Tool A', 'Task');
      value.observation.targetType = null;
      return value;
    });
    const patterns = ['Task A', 'Task E'].map((source) => {
      const value = row(source, 'Tool A');
      value.observation.targetType = null;
      return value;
    });
    const literal = row('tool a', ' TASK A ', undefined, undefined, 'field');
    literal.observation.sourceType = null;
    literal.observation.targetType = null;
    const other = row('Unrelated task', 'Tool A');
    other.observation.sourceType = null;
    other.observation.targetType = null;
    const rows = [literal, other, ...patterns, ...mixed, typed, typedPeer];
    const snapshot = JSON.stringify(rows);
    const groups = groupPairs(rows);
    const kinds = groups.map((value) =>
      relationPairGroupingKind(value.sourceRole, value.targetRole)
    );
    assert.deepEqual(kinds, ['type-type', 'type-keyword', 'keyword-keyword', 'keyword-keyword']);
    assert.deepEqual(groups[1].items, mixed.slice(1));
    assert.ok(groups[0].items.includes(literal));
    assert.ok(groups[0].items.includes(mixed[0]));
    assert.ok(groups[0].items.includes(patterns[0]));
    assert.deepEqual(
      groups[0].associations.find((value) => value.associationType === 'field').items,
      [literal]
    );
    assert.deepEqual(
      new Set(groups.slice(2).flatMap((value) => [value.sourceRole.name, value.targetRole.name])),
      new Set(['Task E', 'Tool A', 'Unrelated task'])
    );
    const pairs = groups.flatMap((value) =>
      concretePairs(value.items, (item) => item.observation).map((pair) => pair.key)
    );
    assert.equal(new Set(pairs).size, pairs.length);
    assert.equal(JSON.stringify(rows), snapshot);
  });
});

describe('Evidence basis and aggregation', () => {
  const { groupRelationEvidenceByBasis: group, uniqueRelationEvidence } =
    loadTs('relationPresentation.ts');
  const { createRelationResultsIndex } = loadTs('relationResults.ts');
  const { relationAggregationKind, relationAggregationKindLabels, countRelationAggregationKinds } =
    loadTs('relationResults.ts');

  function row(kind = 'field', roles = ['Tools']) {
    const fixture = resultFixture();
    return {
      associationContext: kind,
      associationFamily: JSON.stringify([kind, ...roles.map((role) => role.toLowerCase()).sort()]),
      associationRoles: roles,
      observation: { ...fixture.result.candidates[0].observations[0] },
      measurement: {
        ...fixture.result.candidates[0].measurements[0],
        association: { ...fixture.result.candidates[0].measurements[0].association, context: kind },
      },
    };
  }

  test('one scoring basis combines different notes and type patterns for the same normalized unordered pair', () => {
    const first = row();
    const second = row('field', ['tools']);
    second.observation = {
      ...second.observation,
      noteTitle: 'Another note',
      source: 'indexeddb',
      target: 'ORAMA',
      sourceEntityTypes: ['Another type'],
    };
    second.measurement.association.score = 0.1;
    const groups = group([first, second]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].items, [first, second]);
    assert.deepEqual(groups[0].roles, ['Tools']);
  });

  test('equal scores or source text never merge different properties, column combinations or entity pairs', () => {
    const first = row();
    const property = row('field', ['Owner']);
    const columns = row('table-row', ['Service', 'Tool']);
    const otherColumns = row('table-row', ['Service', 'Owner']);
    const otherPair = row();
    otherPair.observation.target = 'React Native';
    const items = [first, property, columns, otherColumns, otherPair];
    assert.equal(group(items).length, 5);
    assert.equal(uniqueRelationEvidence([first, { ...first }, property]).length, 2);
    const reversedColumns = row('table-row', ['Tool', 'Service']);
    assert.equal(group([columns, reversedColumns]).length, 1);
  });

  test('unmeasured and older evidence retain context-based grouping without guessing roles from the source text', () => {
    const sentence = row('sentence', []);
    delete sentence.associationFamily;
    delete sentence.associationRoles;
    delete sentence.measurement;
    const list = { ...sentence, associationContext: 'list-item' };
    assert.deepEqual(
      group([sentence, { ...sentence }, list]).map((value) => value.items.length),
      [2, 1]
    );
    assert.deepEqual(group([sentence])[0].roles, []);
  });

  test('statistical family and original role labels reach both tabs before and after evaluation', () => {
    for (const measured of [false, true]) {
      const fixture = resultFixture();
      const candidate = fixture.result.candidates[0];
      candidate.associationFamily = JSON.stringify(['field', 'tools']);
      candidate.associationRoles = ['Tools'];
      if (!measured) candidate.measurements = [];
      const index = createRelationResultsIndex(fixture.entities.entities, [candidate]);
      const rows = [
        ...index.relations.get(candidate.id).evidence,
        ...index.entities
          .get('orama')
          .relationships.get(candidate.id)
          .sentences.map((s) => s.evidence),
      ];
      assert.ok(rows.every((item) => item.associationFamily === candidate.associationFamily));
      assert.ok(rows.every((item) => item.associationRoles === candidate.associationRoles));
    }
  });

  test('aggregation filters expose exactly three kinds and include all individual names within each kind', () => {
    const items = [
      row('field', ['Tools']),
      row('field', ['Owner']),
      row('table-row', ['Editor', 'Feature']),
      row('field-value', ['Details']),
      row('table-cell', ['Notes']),
      row('sentence', []),
      row('list-item', []),
    ];
    assert.deepEqual(Object.values(relationAggregationKindLabels), [
      'Property',
      'Table column combination',
      'Evidence group',
    ]);
    assert.deepEqual(items.map(relationAggregationKind), [
      'property',
      'property',
      'table-columns',
      'property',
      'evidence-group',
      'evidence-group',
      'evidence-group',
    ]);
    assert.deepEqual(countRelationAggregationKinds(items), {
      all: 7,
      property: 3,
      'table-columns': 1,
      'evidence-group': 3,
    });
    assert.deepEqual(countRelationAggregationKinds(items, ['field']), {
      all: 2,
      property: 2,
      'table-columns': 0,
      'evidence-group': 0,
    });
  });
});

describe('Evidence support requirements', () => {
  const {
    relationGroupEvidenceSatisfied: satisfied,
    groupRelationEvidenceByPeerRole,
    groupRelationEvidenceByRolePair,
  } = loadTs('relationPresentation.ts');

  function rows(counts) {
    return counts.flatMap((count, peer) =>
      Array.from({ length: count }, (_, context) => ({
        associationContext: 'sentence',
        observation: {
          source: 'Owner',
          target: `Peer ${peer}`,
          sourceType: null,
          targetType: null,
          sourceEntityTypes: ['Owners'],
          targetEntityTypes: ['Peers'],
          noteTitle: 'One note',
          section: '',
          sectionPath: [],
          evidence: `Source context ${context}`,
          origin: 'sentence',
          direction: 'undirected',
        },
      }))
    );
  }

  test('without a qualifying score, support needs two repeated children and at most one singleton', () => {
    for (const [counts, expected] of [
      [[], false],
      [[1, 1], false],
      [[1, 2], false],
      [[2], false],
      [[2, 2], true],
      [[1, 2, 2], true],
      [[1, 1, 2, 2], false],
      [[3, 4, 1], true],
      [[2, 1, 1], false],
    ]) {
      assert.equal(satisfied(rows(counts)), expected, JSON.stringify(counts));
    }
  });

  test('support requires any two of the three conditions and includes the exact 0.5 score boundary', () => {
    for (const [counts, score, expected] of [
      [[2, 2, 1, 1], 0.499999, false],
      [[2, 2, 1, 1], 0.5, true],
      [[2, 2, 1, 1, 1], 0.7, true],
      [[2, 2, 1, 1], 0, false],
      [[1, 2], 0.499999, false],
      [[1, 2], 0.5, true],
      [[1, 1], 0, false],
      [[1, 1], 0.5, false],
      [[1], 0.5, true],
      [[1, 1, 1], 0.99, false],
      [[100], 1, true],
      [[2, 2, 1], 0.1, true],
      [[2, 2, 1], 0.7, true],
    ]) {
      assert.equal(satisfied(rows(counts), score), expected, JSON.stringify({ counts, score }));
    }
  });

  test('type variants, association families, metric changes and reversed endpoints never multiply a physical source', () => {
    const original = rows([1, 1]);
    const variants = original.flatMap((row) => [
      { ...row, observation: { ...row.observation, sourceEntityTypes: ['Other owners'] } },
      {
        ...row,
        associationContext: 'field',
        associationFamily: 'another family',
        observation: { ...row.observation, evidenceId: 'different scoring identity' },
        measurement: { association: { score: 0.9 } },
      },
      {
        ...row,
        observation: {
          ...row.observation,
          source: row.observation.target.toUpperCase(),
          target: ' OWNER ',
          direction: 'text-order',
        },
      },
    ]);
    const all = [...original, ...variants];
    const snapshot = JSON.stringify(all);
    assert.equal(satisfied(all), false);
    assert.equal(JSON.stringify(all), snapshot);
  });

  test('equal text in distinct source notes or paragraph paths counts as separate evidence', () => {
    const original = rows([1, 1]);
    const otherNotes = original.map((row) => ({
      ...row,
      observation: { ...row.observation, noteTitle: 'Another note' },
    }));
    const otherPaths = original.map((row) => ({
      ...row,
      observation: { ...row.observation, sectionPath: ['Another section'] },
    }));
    assert.equal(satisfied([...original, ...otherNotes]), true);
    assert.equal(satisfied([...original, ...otherPaths]), true);
    const legacy = original.map((row) => ({ ...row, observation: { ...row.observation } }));
    legacy.forEach((row) => delete row.observation.sectionPath);
    assert.equal(satisfied([...original, ...legacy]), false);
  });

  test('literal endpoint normalization and source evidence do not require measured scores', () => {
    const original = rows([2, 2]);
    original[1].observation.source = 'Peer 0';
    original[1].observation.target = ' OWNER ';
    original[3].observation.target = ' peer 1 ';
    assert.equal(satisfied(original), true);
    assert.equal(satisfied(rows([100])), false);
  });

  test('both tab groupings evaluate evidence after merging covered keyword children', () => {
    const original = rows([1, 2]);
    const extra = {
      ...original[0],
      observation: {
        ...original[0].observation,
        targetEntityTypes: ['Singleton variant'],
        noteTitle: 'Additional note',
      },
    };
    assert.equal(satisfied(original), false);
    const peers = groupRelationEvidenceByPeerRole([...original, extra], 'Owner');
    const pairs = groupRelationEvidenceByRolePair([...original, extra]);
    for (const groups of [peers, pairs]) {
      assert.equal(groups.length, 1);
      assert.equal(satisfied(groups[0].items), true);
    }
  });
});

describe('Keyword graph nodes and relationships', () => {
  const load = require('./loadTs.cjs');

  const { addKeywordRelationGraph } = load('graph.ts');
  const { getKnowledgeGraphPalette, getKeywordRelationColors } = load('../utils/palette.ts');
  const palette = getKnowledgeGraphPalette(false);
  const relationColors = getKeywordRelationColors(false);
  const translate = (key) => key;
  const note = (id, noteTitle) => ({
    id,
    noteTitle,
    name: noteTitle,
    role: 'INSTANCE',
    instanceKind: 'NOTE',
    properties: {},
    x: 20,
    y: 30,
    vx: 0,
    vy: 0,
    radius: 9,
    color: 'blue',
  });
  function fixture() {
    const source = {
      noteTitle: 'Folder/One',
      section: 'Inner / Name',
      sectionPath: ['Root', 'Inner / Name'],
    };
    const extraction = {
      entities: ['Task 1', 'Task 2', 'Beta', 'Isolated'].map((text) => ({
        text,
        type: text.startsWith('Task') ? 'Task {{NUM}}' : null,
        noteCount: 3,
        mentionCount: 4,
      })),
      details: { 'task 1': { sources: [source, source], sentences: [] } },
    };
    const candidate = {
      id: 'same-label-different-pairs',
      label: 'uses',
      observations: [
        ['Task 1', 'Beta'],
        ['TASK 1', 'Beta'],
        ['Task 2', 'Beta'],
      ].map(([from, target]) => ({ ...source, source: from, target, origin: 'sentence' })),
      measurements: [0.95, 0.95, 0.01].map((score) => ({ association: { score } })),
    };
    const graph = { nodes: [note('source', 'Folder/One')], edges: [], axioms: { violations: [] } };
    return { source, extraction, candidate, graph };
  }

  test('keyword projection preserves original names and source nodes and aggregates each pair independently', () => {
    const { graph, extraction, candidate } = fixture();
    const original = structuredClone({ graph, extraction, candidate });
    const result = addKeywordRelationGraph(graph, extraction, [candidate], palette, relationColors);
    assert.deepEqual({ graph, extraction, candidate }, original);
    assert.equal(result.nodes[0], graph.nodes[0]);
    const keywords = result.nodes.filter((node) => node.instanceKind === 'KEYWORD');
    assert.equal(keywords.length, 5);
    assert.equal(new Set(keywords.map((node) => node.id)).size, 5);
    assert.ok(
      keywords.some((node) => node.name === 'ta'),
      'the constituent shared by Task 1, Task 2 and Beta uses the same keyword inventory as the entity tab'
    );
    assert.ok(
      keywords.every((node) => node.noteTitle === '' && Object.keys(node.properties).length === 0)
    );
    const task1 = keywords.find((node) => node.name === 'Task 1');
    assert.equal(task1.keyword.sources.length, 1);
    const relations = result.edges.filter((edge) => edge.type === 'KEYWORD_RELATION');
    assert.equal(relations.length, 1);
    const supported = relations.find((edge) => edge.source === task1.id);
    assert.equal(supported.keywordRelation.score, 0.95);
    assert.equal(supported.keywordRelation.observations, 2);
    assert.ok(!supported.dashed);
    assert.equal(supported.directed, false);
    assert.equal(supported.label, 'Associated in the same sentence');
    assert.equal(supported.propertyLabel, undefined);
    assert.equal(supported.color, relationColors.association);
    assert.ok(!relations.some((edge) => edge.keywordRelation.score === 0.01));
    assert.equal(
      result.edges.filter((edge) => edge.type === 'KEYWORD_SOURCE' && edge.source === task1.id)
        .length,
      1
    );
  });

  test('only evidence-satisfied associations survive, reversed pairs aggregate and dangling edges are excluded', () => {
    const { graph, extraction, candidate } = fixture();
    candidate.observations[1] = { ...candidate.observations[0], source: 'Beta', target: 'Task 1' };
    candidate.observations.push({ ...candidate.observations[0], target: 'Missing' });
    candidate.observations.push({ ...candidate.observations[0], target: 'Task 1' });
    const result = addKeywordRelationGraph(graph, extraction, [candidate], palette, relationColors);
    const relations = result.edges.filter((edge) => edge.type === 'KEYWORD_RELATION');
    assert.equal(relations.length, 1);
    assert.deepEqual(new Set(relations.map((edge) => edge.keywordRelation.score)), new Set([0.95]));
    const ids = new Set(result.nodes.map((node) => node.id));
    assert.ok(
      result.edges.every(
        (edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target
      )
    );
    assert.equal(addKeywordRelationGraph(graph, undefined, [], palette, relationColors), graph);
    const reordered = addKeywordRelationGraph(
      graph,
      { ...extraction, entities: [...extraction.entities].reverse() },
      [candidate],
      palette,
      relationColors
    );
    assert.deepEqual(
      new Set(result.nodes.map((node) => node.id)),
      new Set(reordered.nodes.map((node) => node.id))
    );
  });

  const heading = (id, noteTitle, path, kind = 'PARAGRAPH') => ({
    ...note(id, noteTitle),
    name: path.at(-1),
    instanceKind: kind,
    paragraph: {
      origin: noteTitle,
      title: path.at(-1),
      path: path.map((part) => Buffer.from(part).toString('base64')).join(','),
      level: path.length,
      header: '',
      description: '',
      autoSection: path.at(-2),
    },
  });

  test('keyword sources resolve exact paragraph paths, cards and shared-board occurrences without changing base visibility', () => {
    const { graph, extraction } = fixture();
    const exact = heading('exact', 'Folder/One', ['Root', 'Inner / Name']);
    const wrong = heading('wrong', 'Folder/One', ['Root', 'Inner', 'Name']);
    const other = heading('other', 'Folder/One', ['Other', 'Inner / Name']);
    const card = heading('card', 'Folder/One', ['Root', 'Card'], 'CARD');
    const shared = heading('shared', 'Original', ['Board', 'Shared'], 'BOARD_PARAGRAPH');
    shared.paragraphOccurrences = [{ ...shared.paragraph, origin: 'Column/Two' }];
    graph.nodes.push(exact, wrong, other, card, shared);
    extraction.details['task 1'].sources = [
      { noteTitle: 'Folder/One', kind: 'title', section: '', sectionPath: [] },
      {
        noteTitle: 'Folder/One',
        kind: 'bold',
        section: 'Root / Inner / Name',
        sectionPath: ['Root', 'Inner / Name'],
      },
      {
        noteTitle: 'Folder/One',
        kind: 'heading',
        section: 'Other / Inner / Name',
        sectionPath: ['Other', 'Inner / Name'],
      },
      {
        noteTitle: 'Folder/One',
        kind: 'field-value',
        section: 'Root / Card',
        sectionPath: ['Root', 'Card'],
      },
      {
        noteTitle: 'Column/Two',
        kind: 'heading',
        section: 'Board / Shared',
        sectionPath: ['Board', 'Shared'],
      },
      { noteTitle: 'Folder/One', kind: 'bold', section: 'Deleted', sectionPath: ['Deleted'] },
    ];
    const original = structuredClone(graph);
    const result = addKeywordRelationGraph(graph, extraction, [], palette, relationColors);
    const sources = result.edges.filter((edge) => edge.type === 'KEYWORD_SOURCE');
    assert.deepEqual(
      new Set(sources.map((edge) => edge.target)),
      new Set(['source', 'exact', 'other', 'card', 'shared'])
    );
    assert.equal(
      result.nodes.find((node) => node.id === 'exact').instanceKind,
      'CONNECTED_PARAGRAPH'
    );
    assert.equal(result.nodes.find((node) => node.id === 'wrong').instanceKind, 'PARAGRAPH');
    assert.deepEqual(graph, original);
  });

  test('keyword type nodes include every collected membership, pattern membership and stable type hierarchy', () => {
    const { graph, extraction } = fixture();
    const type = (name, keys, parentIndices = [], childIndices = []) => ({
      name,
      keywordCount: 1,
      items: keys.map((key) => ({ keywords: [{ key, text: key }] })),
      occurrences: [],
      parentIndices,
      childIndices,
    });
    extraction.entityTypes = [
      type('Task {{NUM}}', ['task 1', 'beta'], [], [1]),
      type('Specific', ['task 1', 'task 2', 'beta'], [0]),
      type('Independent', ['task 1', 'isolated']),
    ];
    const before = structuredClone(extraction);
    const result = addKeywordRelationGraph(graph, extraction, [], palette, relationColors);
    const types = result.nodes.filter((node) => node.classKind === 'KEYWORD_TYPE');
    assert.equal(types.length, 4);
    assert.equal(types.filter((node) => node.name === 'Task {{NUM}}').length, 2);
    assert.ok(
      types.every(
        (node) =>
          node.role === 'CLASS' && node.noteTitle === '' && !Object.keys(node.properties).length
      )
    );
    const memberships = result.edges.filter(
      (edge) => edge.source === 'keyword:task%201' && edge.propertyLabel === 'keywordType'
    );
    assert.equal(memberships.length, 4);
    assert.equal(new Set(memberships.map((edge) => edge.target)).size, 4);
    const hierarchy = result.edges.filter((edge) => edge.propertyLabel === 'keywordTypeHierarchy');
    assert.equal(hierarchy.length, 1);
    assert.equal(result.nodes.find((node) => node.id === hierarchy[0].source).name, 'Specific');
    assert.equal(
      result.nodes.find((node) => node.id === hierarchy[0].target).keywordType.kind,
      'entity-type'
    );
    const {
      getKnowledgeGraphNodeKind,
      getKnowledgeGraphNodeKindLabel,
      summarizeKnowledgeGraphRelations,
      getKnowledgeGraphRelationDisplayLabel,
    } = load('../utils/relations.ts');
    assert.ok(types.every((node) => getKnowledgeGraphNodeKind(node) === 'keywordType'));
    assert.equal(getKnowledgeGraphNodeKindLabel('keywordType', translate), 'Keyword type');
    const summaries = summarizeKnowledgeGraphRelations(result.edges);
    assert.equal(
      getKnowledgeGraphRelationDisplayLabel(memberships[0], translate),
      'Keyword type membership'
    );
    assert.ok(summaries.some((summary) => summary.label === 'keywordTypeHierarchy'));
    const reordered = addKeywordRelationGraph(
      graph,
      {
        ...extraction,
        entities: [...extraction.entities].reverse(),
        entityTypes: [...extraction.entityTypes].reverse().map((type) => ({
          ...type,
          name: type.name + ' renamed',
          items: [...type.items].reverse(),
          parentIndices: type.parentIndices.map((index) => 2 - index),
          childIndices: type.childIndices.map((index) => 2 - index),
        })),
      },
      [],
      palette,
      relationColors
    );
    assert.deepEqual(
      new Set(result.nodes.map((node) => node.id)),
      new Set(reordered.nodes.map((node) => node.id))
    );
    assert.deepEqual(
      new Set(result.edges.map((edge) => edge.id)),
      new Set(reordered.edges.map((edge) => edge.id))
    );
    assert.deepEqual(extraction, before);
    const refreshed = addKeywordRelationGraph(
      graph,
      { ...extraction, entityTypes: [] },
      [],
      palette,
      relationColors
    );
    assert.equal(
      refreshed.nodes.filter((node) => node.keywordType?.kind === 'entity-type').length,
      0
    );
    assert.equal(
      refreshed.nodes.filter((node) => node.keywordType?.kind === 'entity-pattern').length,
      1
    );
  });

  test('generated constituent keywords can join collected keyword types without dangling memberships', () => {
    const entities = ['서울역', '서울시청', '서울버스', '부산역', '부산시청', '부산버스'].map(
      (text) => ({ text, type: null, mentionCount: 3, noteCount: 3 })
    );
    const result = addKeywordRelationGraph(
      { nodes: [note('source', 'Note')], edges: [] },
      {
        entities,
        details: Object.fromEntries(
          entities.map((entity) => [
            entity.text,
            { sources: [{ noteTitle: 'Note', section: '', keyword: entity.text }], sentences: [] },
          ])
        ),
        entityTypes: [
          {
            name: '도시',
            keywordCount: 1,
            items: ['서울', '부산'].map((key) => ({ keywords: [{ key, text: key }] })),
            occurrences: [],
            parentIndices: [],
            childIndices: [],
          },
        ],
      },
      [],
      palette,
      relationColors
    );
    const type = result.nodes.find((node) => node.name === '도시');
    assert.ok(type);
    const members = result.edges.filter(
      (edge) => edge.target === type.id && edge.type === 'INSTANCE_OF'
    );
    assert.deepEqual(
      new Set(members.map((edge) => edge.source)),
      new Set(['keyword:' + encodeURIComponent('서울'), 'keyword:' + encodeURIComponent('부산')])
    );
    const ids = new Set(result.nodes.map((node) => node.id));
    assert.ok(result.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
    assert.equal(
      result.nodes.find((node) => node.id === members[0].source).keyword.sources[0].noteTitle,
      'Note'
    );
  });
});

describe('Keyword graph placement', () => {
  const load = require('./loadTs.cjs');
  const { initForceSimulation, stepForceSimulation, advanceForceSimulation, setSimulationFocus } =
    load('../utils/forceLayout.ts');

  const node = (id, x, y, extra = {}) => ({
    id,
    name: id,
    role: 'INSTANCE',
    instanceKind: 'KEYWORD',
    noteTitle: '',
    properties: {},
    radius: 12,
    color: 'gray',
    x,
    y,
    vx: 0,
    vy: 0,
    ...extra,
  });
  const type = (id, kind) =>
    node(id, -500, -300, {
      role: 'CLASS',
      instanceKind: undefined,
      classKind: 'KEYWORD_TYPE',
      keywordType: { kind, key: id, sources: [] },
    });
  const member = (source, target) => ({
    source,
    target,
    type: 'INSTANCE_OF',
    propertyLabel: 'keywordType',
  });
  const fixture = (extra = 0) => ({
    nodes: [
      type('parent', 'entity-type'),
      type('child', 'entity-type'),
      type('pattern', 'entity-pattern'),
      type('single', 'entity-pattern'),
      node('one', 120, 90),
      node('two', 660, 150),
      node('three', 900, 570),
      node('note', 4000, 5000, { instanceKind: 'NOTE' }),
      ...Array.from({ length: extra }, (_, i) =>
        node(`extra:${i}`, 1200 + (i % 10) * 100, 1000 + Math.floor(i / 10) * 100)
      ),
    ],
    edges: [
      member('one', 'parent'),
      member('one', 'parent'),
      member('two', 'parent'),
      member('one', 'child'),
      member('two', 'child'),
      member('three', 'child'),
      member('two', 'pattern'),
      member('three', 'pattern'),
      member('one', 'single'),
      member('missing', 'parent'),
      member('note', 'parent'),
      {
        source: 'child',
        target: 'parent',
        type: 'SUBCLASS_OF',
        propertyLabel: 'keywordTypeHierarchy',
      },
      { source: 'one', target: 'note', type: 'KEYWORD_SOURCE' },
    ],
  });
  const assertCenters = (nodes) => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const [id, members] of [
      ['parent', ['one', 'two']],
      ['child', ['one', 'two', 'three']],
      ['pattern', ['two', 'three']],
      ['single', ['one']],
    ]) {
      for (const axis of ['x', 'y']) {
        const center =
          members.reduce((sum, member) => sum + byId.get(member)[axis], 0) / members.length;
        assert.ok(Math.abs(byId.get(id)[axis] - center) < 1e-8, `${id}.${axis}`);
      }
      assert.equal(byId.get(id).vx, 0);
      assert.equal(byId.get(id).vy, 0);
    }
  };

  test('keyword types follow the center of distinct keyword members through motion, focus and rebuilding', () => {
    for (const extra of [0, 140]) {
      for (const spacingScale of [0.4, 1, 2.5]) {
        const graph = fixture(extra);
        const context = initForceSimulation(graph.nodes, graph.edges, {
          width: 800,
          height: 600,
          spacingScale,
        });
        assertCenters(context.simNodes);
        for (const selected of ['parent', 'two']) {
          setSimulationFocus(
            context,
            graph.edges,
            selected,
            2,
            new Set(context.simNodes.map((node) => node.id))
          );
          for (const alpha of [1, 0.4, 0.005]) {
            stepForceSimulation(context, alpha);
            assertCenters(context.simNodes);
          }
        }
        assertCenters(
          initForceSimulation(context.simNodes, [...graph.edges].reverse(), {
            width: 800,
            height: 600,
            spacingScale,
          }).simNodes
        );
        assertCenters(
          initForceSimulation(
            graph.nodes.map((node) => ({ ...node, x: 0, y: 0 })),
            graph.edges,
            { width: 800, height: 600 }
          ).simNodes
        );
      }
    }
  });

  test('keyword type centroids do not pull or repel members and survive yielded spatial steps', () => {
    const graph = fixture(140);
    const members = graph.nodes.filter((node) => node.role !== 'CLASS');
    const options = { width: 800, height: 600, centerOrigin: true };
    const baseline = initForceSimulation(
      members,
      graph.edges.filter((edge) => edge.type === 'KEYWORD_SOURCE'),
      options
    );
    const augmented = initForceSimulation(graph.nodes, graph.edges, options);
    for (let i = 0; i < 10; i++) {
      stepForceSimulation(baseline, 0.4);
      stepForceSimulation(augmented, 0.4);
      const byId = new Map(augmented.simNodes.map((node) => [node.id, node]));
      for (const node of baseline.simNodes)
        for (const field of ['x', 'y', 'vx', 'vy'])
          assert.ok(Math.abs(byId.get(node.id)[field] - node[field]) < 1e-8, `${node.id}.${field}`);
      assertCenters(augmented.simNodes);
    }
    let completed = null;
    for (let i = 0; completed === null && i < 1000; i++) {
      completed = advanceForceSimulation(augmented, 0.5, 0);
      assertCenters(augmented.simNodes);
    }
    assert.notEqual(completed, null);
    const orphan = initForceSimulation(
      [type('orphan', 'entity-pattern')],
      [member('missing', 'orphan')],
      options
    );
    stepForceSimulation(orphan, 0.5);
    assert.ok(orphan.simNodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  });
});
