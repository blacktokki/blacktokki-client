const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

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
