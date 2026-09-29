const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-inference-'));
let inferKnowledgeGraphRelations;
let getRelationType;
let isInferredRelationType;
try {
  const source = readFileSync(path.join(__dirname, 'inference.ts'), 'utf8');
  const file = path.join(output, 'inference.js');
  writeFileSync(
    file,
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
  );
  ({ inferKnowledgeGraphRelations, getRelationType, isInferredRelationType } = require(file));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const node = (id) => ({ id });
const edge = (id, source, target, type) => ({ id, source, target, type });

test('infers instance membership and transitive subclasses with premise evidence', () => {
  const nodes = ['card', 'child', 'parent', 'root'].map(node);
  const edges = [
    edge('member', 'card', 'child', 'INSTANCE_OF'),
    edge('child-parent', 'child', 'parent', 'SUBCLASS_OF'),
    edge('parent-root', 'parent', 'root', 'SUBCLASS_OF'),
  ];
  const inferred = inferKnowledgeGraphRelations(nodes, edges);
  const find = (source, target, type) =>
    inferred.find((item) => item.source === source && item.target === target && item.type === type);

  assert.deepEqual(find('card', 'parent', 'INFERRED_INSTANCE_OF')?.inferences, [
    { rule: 'INSTANCE_INHERITANCE', premiseEdgeIds: ['member', 'child-parent'] },
  ]);
  assert.deepEqual(find('card', 'root', 'INFERRED_INSTANCE_OF')?.inferences, [
    {
      rule: 'INSTANCE_INHERITANCE',
      premiseEdgeIds: ['member', 'child-parent', 'parent-root'],
    },
  ]);
  assert.deepEqual(find('child', 'root', 'INFERRED_SUBCLASS_OF')?.inferences, [
    { rule: 'SUBCLASS_TRANSITIVITY', premiseEdgeIds: ['child-parent', 'parent-root'] },
  ]);
  assert.equal(inferred.length, 3);
  assert.ok(inferred.every((item) => item.dashed && item.color === '#9B59B6'));
  assert.equal(getRelationType('INFERRED_INSTANCE_OF'), 'INSTANCE_OF');
  assert.equal(getRelationType('INFERRED_SUBCLASS_OF'), 'SUBCLASS_OF');
  assert.equal(isInferredRelationType('REFERENCES'), false);
});

test('explicit membership, cycles, and matching titles do not create heuristic relations', () => {
  const nodes = ['paragraph', 'topic', 'backend-note'].map(node);
  const edges = [edge('member', 'paragraph', 'topic', 'INSTANCE_OF')];
  assert.deepEqual(inferKnowledgeGraphRelations(nodes, edges), []);

  const cyclic = [
    edge('a-b', 'topic', 'backend-note', 'SUBCLASS_OF'),
    edge('b-a', 'backend-note', 'topic', 'SUBCLASS_OF'),
  ];
  assert.deepEqual(inferKnowledgeGraphRelations(nodes, cyclic), []);
});
