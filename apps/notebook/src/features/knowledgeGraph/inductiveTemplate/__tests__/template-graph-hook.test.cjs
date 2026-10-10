const assert = require('node:assert/strict');
const { test } = require('node:test');
const markdownIt = require('markdown-it');
const loadTs = require('../../../inductiveTemplate/__tests__/loadTs.cjs');
const inference = loadTs('inference.ts');
const discovery = loadTs('discovery.ts', {
  './inference': inference,
  './titleGrouping': loadTs('titleGrouping.ts'),
});
const similarity = loadTs('templateSimilarity.ts', { './inference': inference });
const graphHelpers = loadTs('../knowledgeGraph/inductiveTemplate/graph.ts');
const palette = loadTs('../knowledgeGraph/inductiveTemplate/palette.ts', {
  '../utils/palette': loadTs('../knowledgeGraph/utils/palette.ts'),
});
const modes = loadTs('../knowledgeGraph/inductiveTemplate/types.ts');
const renderer = new markdownIt();

function fixture() {
  const sources = [
    { title: 'Notes/One', description: '<h2>Agenda</h2><h2>Actions</h2>' },
    { title: 'Notes/Two', description: '<h2>Agenda</h2><h2>Actions</h2>' },
  ];
  const state = {
    available: true,
    requested: [],
    slots: [],
    effects: [],
    scope: 'local:1:public',
    refetches: 0,
  };
  const roots = [];
  let stateIndex = 0;
  let effectIndex = 0;
  let pending = [];
  const refetch = () => {
    state.refetches++;
    return Promise.resolve();
  };
  const hook = loadTs('../knowledgeGraph/inductiveTemplate/useTemplateGraph.ts', {
    '@blacktokki/core': { useLangContext: () => ({ lang: (key) => key }) },
    '@blacktokki/editor': { toHtml: (markdown) => renderer.render(markdown) },
    react: {
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in state.slots)) state.slots[index] = initial;
        return [
          state.slots[index],
          (value) => {
            state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value;
          },
        ];
      },
      useMemo: (factory) => factory(),
      useEffect: (effect, deps) => {
        const index = effectIndex++;
        const previous = state.effects[index];
        if (previous && deps.every((value, i) => value === previous.deps[i])) return;
        pending.push(() => {
          previous?.cleanup?.();
          state.effects[index] = { deps, cleanup: effect() };
        });
      },
    },
    './graph': graphHelpers,
    './types': modes,
    '../../../hooks/useExtension': {
      useExtension: () => ({
        data: { info: [{ key: 'inductiveTemplate', active: state.available }] },
      }),
    },
    '../../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ colorScheme: 'light' }) },
    '../../inductiveTemplate/discovery': discovery,
    '../../inductiveTemplate/templateSimilarity': similarity,
    '../../inductiveTemplate/useInductiveTemplates': {
      useInductiveTemplates: (requested) => {
        state.requested.push(requested);
        return {
          scope: state.scope,
          enabled: requested,
          notebookRoots: roots,
          examples: { data: sources, isFetching: false, isError: false, refetch },
        };
      },
    },
    './palette': palette,
  });
  const base = {
    nodes: sources.map((source, index) => ({
      id: String(index),
      name: source.title,
      noteTitle: source.title,
      role: 'INSTANCE',
      instanceKind: 'NOTE',
      properties: {},
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 9,
      color: 'color',
    })),
    edges: [],
    axioms: { violations: [] },
  };
  function render() {
    stateIndex = 0;
    effectIndex = 0;
    pending = [];
    const result = hook.useTemplateGraph(base);
    for (const effect of pending) effect();
    return result;
  }
  return {
    state,
    base,
    render,
    tick: () => new Promise((resolve) => setTimeout(resolve, 5)),
    close: () => state.effects.forEach((effect) => effect?.cleanup?.()),
  };
}

test('integration cycles on/off, resets on scope and extension changes, and cancels stale discovery', async () => {
  const { state, base, render, tick, close } = fixture();
  try {
    let result = render();
    assert.equal(result.mode, 'off');
    assert.equal(result.nodes, base.nodes);
    result.toggle();
    result = render();
    assert.equal(result.mode, 'previous');
    assert.equal(result.working, true);
    await tick();
    result = render();
    assert.equal(result.count, 1);
    assert.equal(result.nodes.filter((node) => node.instanceKind === 'TEMPLATE').length, 1);
    assert.ok(result.getNeighbors('0').size > 1);
    result.toggle();
    result = render();
    assert.equal(result.mode, 'current');
    // Turn off while a different extraction is still scheduled.
    result.toggle();
    result = render();
    await tick();
    result = render();
    assert.equal(result.mode, 'off');
    assert.equal(result.nodes, base.nodes);
    assert.equal(result.edges, base.edges);
    assert.equal(result.working, false);
    result.toggle();
    render();
    await tick();
    result = render();
    assert.equal(result.count, 1);
    state.scope = 'local:2:private';
    result = render();
    assert.equal(result.mode, 'off');
    assert.equal(result.nodes, base.nodes);
    result.toggle();
    render();
    await tick();
    result = render();
    assert.equal(result.count, 1);
    state.available = false;
    result = render();
    assert.equal(result.available, false);
    assert.equal(result.nodes, base.nodes);
    assert.equal(state.requested.at(-1), false);
    state.available = true;
    result = render();
    assert.equal(result.mode, 'off');
    assert.equal(result.nodes, base.nodes);
  } finally {
    close();
  }
});

test('base source updates refresh template data without generating any template nodes while off', async () => {
  const { state, base, render, tick, close } = fixture();
  try {
    let result = render();
    assert.equal(state.refetches, 0);
    base.nodes = [...base.nodes];
    result = render();
    assert.equal(result.nodes, base.nodes);
    assert.equal(state.refetches, 0);
    result.toggle();
    render();
    await tick();
    const previous = state.refetches;
    base.nodes = [...base.nodes];
    result = render();
    assert.equal(state.refetches, previous + 1);
    assert.equal(result.count, 1);
  } finally {
    close();
  }
});
