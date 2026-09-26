const createLayoutRunner =
  (initForceSimulation, stepForceSimulation) => (nodes, edges, options) => {
    if (nodes.length === 0) return [];
    const totalSteps = Math.min(
      options.iterations ?? 160,
      Math.max(65, Math.round(150 - Math.min(nodes.length, 600) * 0.08))
    );
    const context = initForceSimulation(nodes, edges, options);
    const warmCount = nodes.filter((node) => node.x !== 0 || node.y !== 0).length;
    const startAlpha = warmCount >= nodes.length * 0.7 ? 0.45 : 1.0;

    for (let step = 0; step < totalSteps; step++) {
      const alpha = Math.max(0.05, startAlpha * (1 - step / totalSteps));
      stepForceSimulation(context, alpha);
    }

    return context.simNodes;
  };

module.exports = { createLayoutRunner };
