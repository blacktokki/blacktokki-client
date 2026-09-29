const {
  createLayoutRunner: createBaseLayoutRunner,
} = require('../../knowledgeGraph/__tests__/layoutTestHelper.cjs');

const createLayoutRunner = (initForceSimulation, stepForceSimulation) => {
  const run = createBaseLayoutRunner(initForceSimulation, stepForceSimulation);
  return (nodes, edges, options) =>
    run(nodes, edges, {
      ...options,
      clusterClassIds:
        options.clusterClassIds ??
        new Set(
          nodes
            .filter((node) => node.role === 'CLASS' && node.classCategory === 'TOPIC')
            .map((node) => node.id)
        ),
    });
};

module.exports = { createLayoutRunner };
