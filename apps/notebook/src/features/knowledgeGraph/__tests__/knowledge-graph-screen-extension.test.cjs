const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-screen-extension-'));
let registerKnowledgeGraphScreenExtension;
let useKnowledgeGraphScreenExtension;
try {
  const source = readFileSync(
    path.join(__dirname, '../useKnowledgeGraphScreenExtension.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const file = path.join(output, 'screenExtension.js');
  writeFileSync(file, compiled.outputText);
  ({ registerKnowledgeGraphScreenExtension, useKnowledgeGraphScreenExtension } = require(file));
} finally {
  rmSync(output, { recursive: true, force: true });
}

test('registered graph extension receives activation changes without switching the hook', () => {
  const base = { nodes: [{ id: 'base' }] };
  const topicGraph = { nodes: [{ id: 'base' }, { id: 'topic' }] };
  const activations = [];
  const useTopicExtension = (graph, active) => {
    activations.push(active);
    return { graph: active ? topicGraph : graph };
  };
  registerKnowledgeGraphScreenExtension('topicNotes', useTopicExtension);

  const disabled = useKnowledgeGraphScreenExtension(base, new Set());
  const enabled = useKnowledgeGraphScreenExtension(base, new Set(['topicNotes']));
  const disabledAgain = useKnowledgeGraphScreenExtension(base, new Set());

  assert.deepEqual(activations, [false, true, false]);
  assert.equal(disabled.graph, base);
  assert.equal(disabled.scopeKey, '');
  assert.equal(enabled.graph, topicGraph);
  assert.equal(enabled.scopeKey, 'topicNotes');
  assert.equal(disabledAgain.graph, base);
  assert.throws(() => registerKnowledgeGraphScreenExtension('topicNotes', useTopicExtension));
  assert.throws(() => registerKnowledgeGraphScreenExtension('other', useTopicExtension));
});
