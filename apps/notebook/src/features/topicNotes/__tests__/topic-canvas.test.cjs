const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { createLayoutRunner } = require('./layoutTestHelper.cjs');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-canvas-test-'));
let initForceSimulation;
let stepForceSimulation;
let computeForceLayout;
let screenToWorld;
let findNodeAtScreenCoord;
let drawEdges;
let drawNodes;

try {
  for (const name of ['relations', 'inference', 'owlRelations', 'axioms', 'forceLayout', 'canvasRenderer']) {
    const file =
      name === 'owlRelations' || name === 'inference'
        ? path.join(__dirname, '../../knowledgeGraph/owlrdf', `${name === 'owlRelations' ? 'relations' : name}.ts`)
        : path.join(__dirname, '../../knowledgeGraph/utils', `${name}.ts`);
    const source = readFileSync(file, 'utf8')
      .replaceAll('../utils/relations', './relations')
      .replaceAll('../owlrdf/relations', './owlRelations')
      .replaceAll('../owlrdf/inference', './inference');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
  }
  ({ initForceSimulation, stepForceSimulation } = require(path.join(output, 'forceLayout.js')));
  computeForceLayout = createLayoutRunner(initForceSimulation, stepForceSimulation);
  ({ screenToWorld, findNodeAtScreenCoord, drawEdges, drawNodes } = require(path.join(
    output,
    'canvasRenderer.js'
  )));
} finally {
  rmSync(output, { recursive: true, force: true });
}

const worldToScreen = (x, y, panX, panY, zoom) => ({
  x: x * zoom + panX,
  y: y * zoom + panY,
});

test('evenly distributes topic classes across the canvas and clusters paragraph instances around their parent topic', () => {
  const topicCount = 5;
  const parasPerTopic = 10;
  const nodes = [];
  const edges = [];

  for (let t = 0; t < topicCount; t++) {
    const topicId = `class:topic:${t}`;
    nodes.push({
      id: topicId,
      name: `Topic ${t}`,
      role: 'CLASS',
      type: 'CLASS',
      classCategory: 'TOPIC',
      x: 0,
      y: 0,
      radius: 15,
    });

    for (let p = 0; p < parasPerTopic; p++) {
      const paraId = `para:${t}:${p}`;
      nodes.push({
        id: paraId,
        name: `Paragraph ${t}-${p}`,
        role: 'INSTANCE',
        type: 'INSTANCE',
        instanceKind: 'PARAGRAPH',
        x: 0,
        y: 0,
        radius: 8,
      });

      edges.push({
        id: `edge:inst:${paraId}->${topicId}`,
        source: paraId,
        target: topicId,
        type: 'INSTANCE_OF',
      });
    }
  }

  const context = initForceSimulation(nodes, edges, {
    width: 800,
    height: 600,
    clusterClassIds: new Set(
      nodes.filter((node) => node.classCategory === 'TOPIC').map((node) => node.id)
    ),
  });

  // 1. Topic classes are spread out from each other (not all stacked at center or outer ring)
  const topicNodes = context.simNodes.filter((n) => n.role === 'CLASS');
  assert.equal(topicNodes.length, topicCount);

  let totalInterTopicDist = 0;
  let pairCount = 0;
  for (let i = 0; i < topicCount; i++) {
    for (let j = i + 1; j < topicCount; j++) {
      totalInterTopicDist += Math.hypot(
        topicNodes[i].x - topicNodes[j].x,
        topicNodes[i].y - topicNodes[j].y
      );
      pairCount++;
    }
  }
  const avgInterTopicDist = totalInterTopicDist / pairCount;
  assert.ok(
    avgInterTopicDist > 200,
    `Topic classes are evenly spread across field (avg dist=${avgInterTopicDist.toFixed(
      1
    )}px > 200px)`
  );

  // 2. Each paragraph instance is significantly closer to its own parent topic than other topics
  let ownDistTotal = 0;
  let otherDistTotal = 0;
  let checkedCount = 0;

  for (let t = 0; t < topicCount; t++) {
    const topicNode = context.simNodes.find((n) => n.id === `class:topic:${t}`);
    for (let p = 0; p < parasPerTopic; p++) {
      const paraNode = context.simNodes.find((n) => n.id === `para:${t}:${p}`);
      const ownDist = Math.hypot(paraNode.x - topicNode.x, paraNode.y - topicNode.y);
      ownDistTotal += ownDist;

      // Distance to an alternative other topic
      const otherTopicNode = context.simNodes.find(
        (n) => n.id === `class:topic:${(t + 1) % topicCount}`
      );
      const otherDist = Math.hypot(paraNode.x - otherTopicNode.x, paraNode.y - otherTopicNode.y);
      otherDistTotal += otherDist;
      checkedCount++;
    }
  }

  const avgOwnDist = ownDistTotal / checkedCount;
  const avgOtherDist = otherDistTotal / checkedCount;

  assert.ok(
    avgOwnDist < avgOtherDist * 0.75,
    `Paragraphs are clustered around their parent topic: own=${avgOwnDist.toFixed(
      1
    )}px, other=${avgOtherDist.toFixed(1)}px`
  );
});
