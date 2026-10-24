const assert = require('node:assert/strict');
const { test } = require('node:test');

const load = require('../keywordRelation/__tests__/loadTs.cjs');
const { visibleKnowledgeGraphEdges, summarizeKnowledgeGraphRelations } =
  load('../utils/relations.ts');

test('paragraph visibility swaps direct note containment for hierarchy without losing sources or other relations', () => {
  const nodes = [
    { id: 'note', instanceKind: 'NOTE', noteTitle: 'Document' },
    { id: 'other-note', instanceKind: 'NOTE', noteTitle: 'Other' },
    { id: 'parent', instanceKind: 'PARAGRAPH', noteTitle: 'Document' },
    { id: 'nested', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    { id: 'top', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    { id: 'keyword-source', instanceKind: 'CONNECTED_PARAGRAPH', noteTitle: 'Document' },
    {
      id: 'shared',
      instanceKind: 'BOARD_PARAGRAPH',
      noteTitle: 'Document',
      paragraphOccurrences: [{ origin: 'Document' }, { origin: 'Other' }],
    },
    { id: 'card', instanceKind: 'CARD', noteTitle: 'Document' },
  ];
  const part = (id, source, target, propertyLabel = 'paragraphPartOf') => ({
    id,
    source,
    target,
    type: 'PART_OF',
    propertyLabel,
    color: '#B7950B',
  });
  const edges = [
    part('parent-hierarchy', 'parent', 'note'),
    part('nested-hierarchy', 'nested', 'parent'),
    part('nested-note', 'nested', 'note', 'connectedPartOf'),
    part('top-hierarchy', 'top', 'note'),
    part('keyword-hierarchy', 'keyword-source', 'parent'),
    part('shared-first', 'shared', 'note'),
    part('shared-other', 'shared', 'other-note'),
    part('card-parent', 'card', 'shared', 'cardPartOf'),
    { id: 'reference', source: 'note', target: 'nested', type: 'REFERENCES' },
  ];
  const before = structuredClone({ nodes, edges });
  const collapsed = visibleKnowledgeGraphEdges(
    nodes.filter((node) => node.id !== 'parent'),
    edges,
    false
  );
  assert.ok(collapsed.every((edge) => edge.source !== 'parent' && edge.target !== 'parent'));
  assert.ok(!collapsed.some((edge) => edge.propertyLabel === 'paragraphPartOf'));
  const direct = collapsed.filter((edge) => edge.propertyLabel === 'connectedPartOf');
  assert.deepEqual(
    new Set(direct.map((edge) => `${edge.source}:${edge.target}`)),
    new Set(['nested:note', 'top:note', 'keyword-source:note', 'shared:note', 'shared:other-note'])
  );
  assert.equal(direct.length, 5, 'an existing direct edge must not be duplicated');
  assert.ok(direct.every((edge) => edge.color === '#B7950B'));
  const expanded = visibleKnowledgeGraphEdges(nodes, edges, true);
  assert.ok(!expanded.some((edge) => edge.propertyLabel === 'connectedPartOf'));
  assert.equal(expanded.filter((edge) => edge.propertyLabel === 'paragraphPartOf').length, 6);
  assert.deepEqual(
    summarizeKnowledgeGraphRelations(collapsed)
      .filter((summary) => ['connectedPartOf', 'paragraphPartOf'].includes(summary.label))
      .map((summary) => summary.label),
    ['connectedPartOf']
  );
  assert.deepEqual(
    summarizeKnowledgeGraphRelations(expanded)
      .filter((summary) => ['connectedPartOf', 'paragraphPartOf'].includes(summary.label))
      .map((summary) => summary.label),
    ['paragraphPartOf']
  );
  for (const result of [collapsed, expanded]) {
    assert.ok(result.some((edge) => edge.id === 'card-parent'));
    assert.ok(result.some((edge) => edge.id === 'reference'));
  }
  assert.deepEqual({ nodes, edges }, before);
});
