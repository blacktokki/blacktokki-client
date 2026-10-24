const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Entity type names and hierarchy', () => {
  const loadTs = require('./loadTs.cjs');
  const { collectRelationEntityTypes: collectTypes } = loadTs(
    'keyword/collectKeywordTypes.ts',
    {},
    ['collectRelationEntityTypes']
  );
  const ko = require('../../../../lang/ko.json');
  const korean = (value) => ko[value] || value;
  const collectRelationEntityTypes = (enumerations) => collectTypes(enumerations, korean);
  const enumeration = (items) => ({
    kind: 'list',
    noteTitle: 'Outline',
    keywordCount: items[0].length,
    items: items.map((values, index) => ({
      noteTitle: 'Outline',
      sectionPath: [],
      text: values.join(' '),
      index,
      keywords: values.map((text) => ({ key: text.toLowerCase(), text })),
    })),
  });
  const singles = (names) => enumeration(names.map((name) => [name]));
  const key = (type) =>
    JSON.stringify(type.items.map((item) => item.keywords.map((word) => word.key).sort()).sort());

  test('enumeration context translates structure labels while preserving source names', () => {
    const { relationEnumerationContext } = loadTs('keyword/keywordUtils.ts');
    const enumeration = {
      kind: 'table-column',
      noteTitle: 'Source',
      table: 0,
      column: 1,
      items: ['First', 'Second'].map((name) => ({
        noteTitle: 'Source',
        sectionPath: ['Chapter', name],
      })),
    };
    const english = relationEnumerationContext(enumeration);
    const translated = relationEnumerationContext(enumeration, korean);
    assert.equal(english.kind, 'Table columns');
    assert.equal(translated.kind, '표의 열');
    assert.equal(english.name, 'Source / Chapter / Table 1 / Table column 2');
    assert.equal(translated.name, 'Source / Chapter / 표 1 / 열 2');
    assert.equal(english.sourceName, translated.sourceName);
    assert.equal(english.itemParents[0].kind, 'Paragraph');
    assert.equal(translated.itemParents[0].kind, '문단');
    assert.equal(english.itemParents[0].name, translated.itemParents[0].name);
  });

  test('types require three repetitions or exactly two repetitions of at least three distinct items', () => {
    const sources = [
      singles(['A', 'B', 'A', 'B']),
      singles(['B', 'A']),
      singles(['A', 'B']),
      singles(['C', 'D', 'E']),
      singles(['E', 'D', 'C']),
      singles(['F', 'G']),
      singles(['G', 'F']),
      singles(['H', 'I', 'J']),
      singles(['K', 'L']),
      singles(['K', 'M']),
      singles(['K', 'N']),
    ];
    const before = JSON.stringify(sources);
    const types = collectRelationEntityTypes(sources);
    assert.deepEqual(
      types.map((type) => [key(type), type.occurrences.length]),
      [
        ['[["a"],["b"]]', 3],
        ['[["c"],["d"],["e"]]', 2],
      ]
    );
    assert.ok(types.every((type) => !type.parentIndices.length && !type.childIndices.length));
    assert.equal(JSON.stringify(sources), before);
    assert.deepEqual(collectRelationEntityTypes(), []);
  });

  test('every strict subset is a parent of its longer types, including multiple parents and transitive pairs', () => {
    const types = collectRelationEntityTypes([
      singles(['A', 'B', 'C', 'D']),
      singles(['D', 'C', 'B', 'A']),
      singles(['A', 'B', 'C']),
      singles(['A', 'B', 'D']),
    ]);
    assert.equal(types.length, 4);
    const relations = [];
    for (const [parentIndex, parent] of types.entries()) {
      for (const childIndex of parent.childIndices) {
        assert.ok(types[childIndex].parentIndices.includes(parentIndex));
        assert.ok(parent.items.length < types[childIndex].items.length);
        relations.push([key(parent), key(types[childIndex])]);
      }
    }
    assert.deepEqual(relations, [
      ['[["a"],["b"]]', '[["a"],["b"],["c"]]'],
      ['[["a"],["b"]]', '[["a"],["b"],["d"]]'],
      ['[["a"],["b"]]', '[["a"],["b"],["c"],["d"]]'],
      ['[["a"],["b"],["c"]]', '[["a"],["b"],["c"],["d"]]'],
      ['[["a"],["b"],["d"]]', '[["a"],["b"],["c"],["d"]]'],
    ]);
    assert.deepEqual(types[3].parentIndices, [0, 1, 2]);
    assert.deepEqual(types[1].childIndices, [3]);
    assert.deepEqual(types[2].childIndices, [3]);
    assert.equal(new Set(types.map((type) => type.name)).size, types.length);
  });

  test('compound items match as complete keyword sets and are not flattened into other type hierarchies', () => {
    const a = ['Alpha', 'Beta'],
      b = ['Gamma', 'Delta'],
      c = ['Epsilon', 'Zeta'];
    const alternative = [['Alpha', 'Gamma'], ['Beta', 'Delta'], c];
    const sources = [
      enumeration([a, b, c]),
      enumeration([['Delta', 'Gamma'], ['Beta', 'Alpha'], c]),
      enumeration([a, b, ['Eta', 'Theta']]),
      ...Array.from({ length: 3 }, () => enumeration(alternative)),
      ...Array.from({ length: 3 }, () => singles(['Alpha', 'Beta', 'Gamma', 'Delta'])),
    ];
    const types = collectRelationEntityTypes(sources);
    assert.equal(types.length, 4);
    assert.equal(types.filter((type) => type.keywordCount === 1).length, 1);
    assert.equal(
      types.reduce((total, type) => total + type.childIndices.length, 0),
      1
    );
    const parent = types.find((type) => type.childIndices.length);
    const child = types[parent.childIndices[0]];
    assert.equal(parent.keywordCount, 2);
    assert.equal(child.keywordCount, 2);
    assert.equal(parent.items.length, 2);
    assert.equal(child.items.length, 3);
    assert.equal(parent.occurrences.length, 3);
    assert.equal(child.occurrences.length, 2);
  });

  const contextual = (items, noteTitle, sectionPath, source = {}) => {
    const value = enumeration(items);
    return {
      ...value,
      ...source,
      noteTitle,
      items: value.items.map((item) => ({ ...item, noteTitle, sectionPath })),
    };
  };
  const unnamedSources = (items) => [
    contextual(items, 'One', [], { list: 0 }),
    contextual(items, 'Two', [], { kind: 'heading', level: 2 }),
    contextual(items, 'Six', [], { kind: 'table-row', table: 0, row: 1 }),
  ];

  test('keyword or naming is allowed only after both parent names and parent kinds fail', () => {
    const items = [['react native'], ['react dom'], ['vue router'], ['vue core']];
    const sources = unnamedSources(items);
    assert.equal(collectRelationEntityTypes(sources)[0].name, 'react / vue');
    assert.equal(
      collectRelationEntityTypes(
        [...sources].reverse().map((source) => ({ ...source, items: [...source.items].reverse() }))
      )[0].name,
      'react / vue'
    );
  });

  test('each common or two-way parent name or kind independently blocks keyword or naming', () => {
    const items = [['react native'], ['react dom'], ['vue router'], ['vue core']];
    const cases = [
      {
        titles: ['Outline', 'Outline', 'Outline'],
        kinds: ['list', 'heading', 'table-row'],
        name: 'outline',
      },
      {
        titles: ['개발 서버', '개발 클라이언트', '운영 문서', '운영 기록'],
        kinds: ['list', 'heading', 'table-row', 'list'],
        name: '개발 / 운영',
      },
      {
        titles: ['One', 'Two', 'Six'],
        kinds: ['list', 'list', 'list'],
        name: '리스트',
      },
      {
        titles: ['One', 'Two', 'Six'],
        kinds: ['list', 'heading', 'list'],
        name: '리스트 / 헤더',
      },
    ];
    for (const { titles, kinds, name } of cases) {
      const sources = titles.map((title, index) =>
        contextual(items, title, [], { kind: kinds[index] })
      );
      assert.equal(collectRelationEntityTypes(sources)[0].name, name);
    }
  });

  test('a type with no shared or two-part description uses all literal keyword keys as its name', () => {
    const items = [['ab'], ['cd'], ['ef']];
    const sources = unnamedSources(items);
    for (const source of sources)
      for (const item of source.items)
        for (const word of item.keywords) word.text = `Display name for ${word.key}`;
    assert.equal(collectRelationEntityTypes(sources)[0].name, 'ab · cd · ef');
    assert.equal(
      collectRelationEntityTypes(
        [...sources].reverse().map((source) => ({ ...source, items: [...source.items].reverse() }))
      )[0].name,
      'ab · cd · ef'
    );
  });

  test('literal fallback names include every complete key without length or item count limits', () => {
    const items = Array.from({ length: 120 }, (_, index) => [
      String(index).padStart(4, '0').repeat(10),
    ]);
    const types = collectRelationEntityTypes(unnamedSources(items));
    assert.equal(types.length, 1);
    assert.equal(types[0].name, items.map(([word]) => word).join(' · '));
    assert.ok(types[0].name.length > 1000);
  });
});

describe('Repeated enumeration patterns', () => {
  const { extractRelationEntities, createRelationDiscoveryMemory } =
    require('./loadTs.cjs').keywordHarness();
  const loadTs = require('./loadTs.cjs');
  const { findRelationEnumerationPatterns } = loadTs('keyword/collectKeywordTypes.ts', {}, [
    'findRelationEnumerationPatterns',
  ]);
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const note = (title, description) => ({ title, description });
  const dictionary = () =>
    ['One', 'Two', 'Three'].map((title) =>
      note(`Dictionary/${title}`, names.map((name) => `**${name}**`).join('\n\n'))
    );
  const extract = (description) =>
    extractRelationEntities([...dictionary(), note('Outline', description)]);
  const extractWithKeywords = (keywords, description) =>
    extractRelationEntities([
      ...['One', 'Two', 'Three'].map((title) =>
        note(`Dictionary/${title}`, keywords.map((keyword) => `**${keyword}**`).join('\n\n'))
      ),
      note('Outline', description),
    ]);
  const itemKeys = (group) =>
    group.items.map((item) => item.keywords.map((keyword) => keyword.key).sort());

  test('headings, lists and table columns retain original and decomposed keyword interpretations', async () => {
    const result = await extractWithKeywords(
      ['React Native', 'Vue Router', 'React', 'Native', 'Vue', 'Router'],
      '# React Native\n\n# Vue Router\n\n- React Native\n- Vue Router\n\n' +
        '| Name | Tool |\n| --- | --- |\n| First | React Native |\n| Second | Vue Router |'
    );
    assert.equal(result.enumerations.length, 6);
    for (const kind of ['heading', 'list', 'table-column']) {
      const groups = result.enumerations.filter((group) => group.kind === kind);
      assert.equal(groups.length, 2);
      assert.deepEqual(
        groups.map((group) => group.keywordCount),
        [1, 2]
      );
      assert.equal(groups[0].decomposed, undefined);
      assert.equal(groups[1].decomposed, true);
      assert.equal(groups[0].sourceIndex, groups[1].sourceIndex);
      assert.deepEqual(itemKeys(groups[0]), [['react native'], ['vue router']]);
      assert.deepEqual(itemKeys(groups[1]), [
        ['native', 'react'],
        ['router', 'vue'],
      ]);
      assert.deepEqual(
        groups[1].items.map(({ keywords, ...item }) => item),
        groups[0].items.map(({ keywords, ...item }) => item)
      );
    }
    assert.ok(result.entityTypes.every((type) => type.occurrences.length === 3));
    const { summarizeRelationEnumerations } = loadTs('useRelationAnalysis.ts');
    const log = summarizeRelationEnumerations(result.enumerations);
    assert.ok(log.열거목록[2].every((group) => group.포함키워드해체 === true));
    assert.ok(log.열거목록[1].every((group) => !Object.hasOwn(group, '포함키워드해체')));
  });

  test('constituent decomposition discovers repeated types even when the common keys were never extracted alone', async () => {
    const keywords = ['서울역', '서울시청', '서울버스', '부산역', '부산시청', '부산버스'];
    const result = await extractWithKeywords(
      keywords,
      '- 서울역\n- 부산역\n\nSeparate.\n\n- 서울시청\n- 부산시청\n\nSeparate.\n\n- 서울버스\n- 부산버스'
    );
    assert.equal(
      result.entities.some((entity) => ['서울', '부산'].includes(entity.key)),
      false
    );
    const expanded = result.enumerations.filter((group) => group.decomposed);
    assert.equal(expanded.length, 3);
    assert.ok(expanded.every((group) => group.keywordCount === 1));
    assert.ok(
      expanded.every(
        (group) => JSON.stringify(itemKeys(group)) === JSON.stringify([['서울'], ['부산']])
      )
    );
    const type = result.entityTypes.find((type) =>
      type.items.every((item) => ['서울', '부산'].includes(item.keywords[0].key))
    );
    assert.ok(type);
    assert.equal(type.occurrences.length, 3);
    assert.equal(new Set(type.occurrences.map((source) => source.sourceIndex)).size, 3);
    const unequal = await extractWithKeywords(
      keywords,
      '- 서울역 부산역\n- 서울시청 서울버스 부산시청 부산버스'
    );
    const groups = unequal.enumerations.filter((group) => group.kind === 'list');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].decomposed, true);
    assert.equal(groups[0].keywordCount, 2);
    assert.deepEqual(itemKeys(groups[0]), [['부산', '서울'].sort(), ['부산', '서울'].sort()]);
    const standalone = await extractWithKeywords(keywords, '- 서울\n- 부산');
    const direct = standalone.enumerations.filter((group) => group.kind === 'list');
    assert.equal(direct.length, 1);
    assert.equal(direct[0].decomposed, true);
    assert.deepEqual(itemKeys(direct[0]), [['서울'], ['부산']]);
  });

  test('original and decomposed variants never inflate subenumeration support or entity types', async () => {
    const keywords = ['React Native', 'React', 'Vue Router', 'Vue', 'Alpha', 'Beta'];
    const description =
      '- Alpha\n- Beta\n- React Native\n\nSeparate.\n\n- Alpha\n- Beta\n- Vue Router';
    const twice = await extractWithKeywords(keywords, description);
    assert.equal(twice.enumerations.length, 4);
    assert.deepEqual(findRelationEnumerationPatterns(twice.enumerations), []);
    assert.deepEqual(twice.entityTypes, []);
    const patterns = findRelationEnumerationPatterns(twice.enumerations, 2);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].occurrences.length, 2);
    const three = await extractWithKeywords(
      keywords,
      description + '\n\nSeparate.\n\n- Alpha\n- Beta'
    );
    assert.equal(three.entityTypes.length, 1);
    assert.equal(three.entityTypes[0].occurrences.length, 3);
    assert.equal(
      new Set(three.entityTypes[0].occurrences.map((source) => source.sourceIndex)).size,
      3
    );
  });

  test('a common subenumeration must occur in three separate enumerations', async () => {
    const result = await extract(
      '- Alpha\n- Beta\n- Gamma\n\n' +
        'Separate.\n\n- Alpha notes\n- Beta notes\n- Delta\n\n' +
        'Separate.\n\n- Beta details\n- Alpha details'
    );
    const before = JSON.stringify(result.enumerations);
    const patterns = findRelationEnumerationPatterns(result.enumerations);
    assert.equal(result.enumerations.length, 3);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].keywordCount, 1);
    assert.deepEqual(
      patterns[0].items.map((item) => item.keywords.map((keyword) => keyword.key)),
      [['alpha'], ['beta']]
    );
    assert.deepEqual(
      patterns[0].occurrences.map((occurrence) => occurrence.enumerationIndex),
      [0, 1, 2]
    );
    assert.deepEqual(
      patterns[0].occurrences.map((occurrence) => occurrence.items.map((item) => item.text)),
      [
        ['Alpha', 'Beta'],
        ['Alpha notes', 'Beta notes'],
        ['Beta details', 'Alpha details'],
      ]
    );
    assert.equal(JSON.stringify(result.enumerations), before);
    assert.deepEqual(findRelationEnumerationPatterns(), []);
  });

  const enumeration = (items, options = {}) => ({
    kind: 'list',
    keywordCount: items[0].length,
    ...options,
    items: items.map((values, index) => ({
      noteTitle: 'Outline',
      sectionPath: [],
      text: values.join(' '),
      index,
      keywords: values.map((text) => ({ key: text.toLowerCase(), text })),
    })),
  });

  test('item and keyword order can differ across structural kinds without flattening keyword bundles', () => {
    const sources = [
      enumeration([
        ['Alpha', 'Beta'],
        ['Gamma', 'Delta'],
        ['One', 'Two'],
      ]),
      enumeration(
        [
          ['Delta', 'Gamma'],
          ['Beta', 'Alpha'],
        ],
        { kind: 'heading', level: 2 }
      ),
      enumeration(
        [
          ['beta', 'alpha'],
          ['gamma', 'delta'],
        ],
        { kind: 'table-column', table: 0, column: 1 }
      ),
      enumeration([
        ['Alpha', 'Gamma'],
        ['Beta', 'Delta'],
      ]),
      enumeration([['Alpha'], ['Beta'], ['Gamma'], ['Delta']]),
    ];
    const patterns = findRelationEnumerationPatterns(sources);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].keywordCount, 2);
    assert.deepEqual(
      patterns[0].items.map((item) => item.keywords.map((keyword) => keyword.key)),
      [
        ['alpha', 'beta'],
        ['gamma', 'delta'],
      ]
    );
    assert.deepEqual(
      patterns[0].occurrences.map((occurrence) => occurrence.enumerationIndex),
      [0, 1, 2]
    );
    assert.deepEqual(
      patterns[0].occurrences.map((occurrence) => occurrence.kind),
      ['list', 'heading', 'table-column']
    );
  });

  test('two-source intersections are found even when each individual item appears in three sources', () => {
    const sources = [
      enumeration([['Alpha'], ['Beta']]),
      enumeration([['Beta'], ['Alpha']]),
      enumeration([['Alpha'], ['Gamma']]),
      enumeration([['Beta'], ['Delta']]),
    ];
    assert.deepEqual(findRelationEnumerationPatterns(sources), []);
    const patterns = findRelationEnumerationPatterns(sources, 2);
    assert.equal(patterns.length, 1);
    assert.deepEqual(
      patterns[0].items.map((item) => item.keywords[0].key),
      ['alpha', 'beta']
    );
    assert.deepEqual(
      patterns[0].occurrences.map((occurrence) => occurrence.enumerationIndex),
      [0, 1]
    );
    assert.deepEqual(findRelationEnumerationPatterns(sources.slice(0, 1), 2), []);
  });

  test('extraction stores qualified entity types and refreshes their hierarchy with changed enumerations', async () => {
    const memory = createRelationDiscoveryMemory();
    const sources = [
      ...dictionary(),
      note(
        'Outline',
        '- Alpha\n- Beta\n- Gamma\n\n' +
          'Separate.\n\n- Alpha\n- Beta\n- Gamma\n- Delta\n\n' +
          'Separate.\n\n- Alpha\n- Beta'
      ),
    ];
    const first = await extractRelationEntities(sources, undefined, undefined, memory);
    assert.deepEqual(
      first.entityTypes.map((type) => [type.items.length, type.occurrences.length]),
      [
        [2, 3],
        [3, 2],
      ]
    );
    assert.deepEqual(first.entityTypes[0].childIndices, [1]);
    assert.deepEqual(first.entityTypes[1].parentIndices, [0]);
    assert.equal(await extractRelationEntities(sources, undefined, undefined, memory), first);
    const edited = await extractRelationEntities(
      [...dictionary(), note('Outline', '- Alpha\n- Beta\n\nSeparate.\n\n- Alpha\n- Beta')],
      undefined,
      undefined,
      memory
    );
    assert.deepEqual(edited.entityTypes, []);
    const restored = await extractRelationEntities(sources, undefined, undefined, memory);
    assert.deepEqual(restored.entityTypes, first.entityTypes);
  });
});
