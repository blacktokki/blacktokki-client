const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'topic-graph-extension-'));
const source = readFileSync(path.join(__dirname, '../useTopicGraphData.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const file = path.join(output, 'useTopicGraphData.js');
writeFileSync(file, compiled.outputText);

let topicBuilds = 0;
const originalLoad = Module._load;
Module._load = function loadTopicGraphDependency(request, parent, isMain) {
  if (request === 'react') {
    return { useCallback: (callback) => callback, useMemo: (factory) => factory() };
  }
  if (request === '@blacktokki/core') {
    return { useLangContext: () => ({ lang: (key) => key }) };
  }
  if (request === './utils/topicNodes') {
    return {
      addTopicNodes: (base) => {
        topicBuilds++;
        return {
          ...base,
          nodes: [...base.nodes, { id: 'topic' }],
          edges: [...base.edges, { source: 'base', target: 'topic' }],
        };
      },
    };
  }
  if (request === '../../hooks/useNotebookTheme') {
    return { useNotebookTheme: () => ({ colorScheme: 'light' }) };
  }
  if (request === '../knowledgeGraph/owlrdf/inference') {
    return {
      inferKnowledgeGraphRelations: () => [{ id: 'topic-inference' }],
    };
  }
  if (request === '../knowledgeGraph/owlrdf/useOwlRdfGraphData') {
    return { useOwlRdfGraphData: () => undefined };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let useTopicGraphDataFromBase;
try {
  ({ useTopicGraphDataFromBase } = require(file));
} finally {
  Module._load = originalLoad;
  rmSync(output, { recursive: true, force: true });
}

test('disabled topic injection keeps the base graph and active injection preserves validation', () => {
  const violation = { id: 'existing-warning', severity: 'warning' };
  const base = {
    nodes: [{ id: 'base' }],
    edges: [],
    cardSubheadings: [],
    axioms: {
      isConsistent: true,
      hasErrors: false,
      hasWarnings: true,
      violations: [violation],
      inferredEdges: [],
    },
    datatypeNodes: [],
    datatypeEdges: [],
    isLoading: false,
    getNeighbors: (id) => new Set([id]),
  };

  const disabled = useTopicGraphDataFromBase(base, false);
  assert.equal(topicBuilds, 0);
  assert.equal(disabled.nodes, base.nodes);
  assert.deepEqual([...disabled.getNeighbors('base')], ['base']);

  const enabled = useTopicGraphDataFromBase(base, true);
  assert.equal(topicBuilds, 1);
  assert.deepEqual(
    enabled.nodes.map((node) => node.id),
    ['base', 'topic']
  );
  assert.deepEqual(enabled.axioms.violations, [violation]);
  assert.equal(enabled.axioms.hasWarnings, true);
  assert.deepEqual(enabled.axioms.inferredEdges, [{ id: 'topic-inference' }]);
  assert.deepEqual([...enabled.getNeighbors('base')], ['base', 'topic']);
});
