exports.resultFixture = function resultFixture() {
  const entities = ['Orama', 'IndexedDB', 'React Native', 'Unconnected'].map((text) => ({
    text,
    type: 'KEYWORD',
    noteCount: 3,
    mentionCount: 5,
  }));
  const candidate = (id, pairs) => ({
    id,
    label: 'uses',
    template: '{{E1}} uses {{E2}}.',
    variants: [],
    noteSupport: 1,
    pairSupport: pairs.length,
    recurring: false,
    observations: pairs.map(([source, target]) => ({
      source,
      target,
      sourceType: 'KEYWORD',
      targetType: 'KEYWORD',
      noteTitle: 'Folder/One',
      section: 'Storage',
      evidence: 'Shared source text',
      template: '{{E1}} uses {{E2}}.',
      origin: 'sentence',
      direction: 'text-order',
    })),
    validations: pairs.map((_, i) => ({
      noteTitle: 'Folder/One',
      evidence: 'Shared source text',
      hypothesis: `Hypothesis ${i}`,
      heldOut: false,
      verdict: i ? 'contradicted' : 'supported',
      scores: { entailment: i ? 0.01 : 0.97, neutral: 0.02, contradiction: i ? 0.97 : 0.01 },
    })),
  });
  return {
    status: 'completed',
    entities: { status: 'completed', noteCount: 3, inputCount: 4, mentionCount: 20, entities },
    patterns: [{ label: 'Hidden pattern inventory', template: 'not shown in the UI' }],
    result: {
      candidates: [
        candidate('uses-storage', [
          ['ORAMA', 'IndexedDB'],
          ['React Native', 'IndexedDB'],
        ]),
        candidate('uses-ui', [['Orama', 'React Native']]),
      ],
      warnings: [],
    },
  };
};
