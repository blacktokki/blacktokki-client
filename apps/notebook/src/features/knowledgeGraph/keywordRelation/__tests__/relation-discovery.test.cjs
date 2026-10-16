const assert = require('node:assert/strict');
const { test } = require('node:test');
const Turndown = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const loadTs = require('./loadTs.cjs');
const markdown = new Turndown({ headingStyle: 'atx' });
markdown.use(gfm);
const {
  discoverInductiveRelations,
  extractRelationEntities,
  getRelationInputPatterns,
  createRelationDiscoveryMemory,
} = loadTs('relationDiscovery.ts', {
  './relationKeywords': loadTs('relationKeywords.ts'),
  './relationProgress': loadTs('relationProgress.ts'),
  '@blacktokki/editor': {
    toMarkdown: (html) => markdown.turndown(html),
    toRaw: (text) => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'),
  },
});
const { relationNliScores } = loadTs('relationModels.ts');
const supported = { entailment: 0.95, neutral: 0.03, contradiction: 0.02 };
const neutral = { entailment: 0.1, neutral: 0.85, contradiction: 0.05 };
const contradicted = { entailment: 0.02, neutral: 0.03, contradiction: 0.95 };
const note = (title, description) => ({ title, description });
const runtime = (overrides = {}) => ({
  embed: async () => [1, 0],
  entailment: async () => supported,
  ...overrides,
});
// Give algorithm fixtures real keyword support without introducing extra relation observations.
const withKeywords = (sources, names) => [
  ...sources,
  ...['First dictionary', 'Second dictionary', 'Third dictionary'].map((title) =>
    note(title, names.map((name) => `<h2>${name}</h2>`).join(''))
  ),
];
const discover = (sources, names, options = {}) =>
  discoverInductiveRelations(withKeywords(sources, names), {
    runtime: runtime(),
    ...options,
  });

test('the pattern embedding model is released before NLI duplicate checks', async () => {
  const order = [];
  const sharedRuntime = runtime({
    embed: async () => {
      order.push('pattern');
      return [1, 0];
    },
    release: async (stage) => order.push(`release:${stage}`),
    entailment: async () => {
      order.push('nli');
      return supported;
    },
  });
  await discover(
    [note('One', '<p>Alpha uses Beta.</p>'), note('Two', '<p>Gamma utilizes Delta.</p>')],
    ['Alpha', 'Beta', 'Gamma', 'Delta'],
    {
      runtime: sharedRuntime,
    }
  );
  assert.ok(order.includes('pattern'));
  assert.ok(order.includes('nli'));
  assert.ok(order.indexOf('pattern') < order.indexOf('release:embedding'));
  assert.ok(order.indexOf('release:embedding') < order.indexOf('nli'));
});

test('extracts whole keywords from final path titles, headings, links, each header cell, bold text and both sides of fields', async () => {
  const html =
    '<h2>문단 제목</h2><p><a href="/ignored-url">링크 이름</a> <strong>React <em>Native</em></strong></p>' +
    '<table><tr><th>첫 헤더</th><th>둘째 헤더</th></tr><tr><td>일반 셀</td><td>숫자</td></tr></table>' +
    '<p>담당자: 홍길동</p><p>일반 본문</p>';
  const result = await extractRelationEntities(
    [0, 1, 2].map((i) => note(`Folder${i}/노트 제목`, html))
  );
  assert.deepEqual(
    result.entities.map((e) => e.text).sort(),
    [
      '노트 제목',
      '문단 제목',
      '링크 이름',
      'React Native',
      '첫 헤더',
      '둘째 헤더',
      '담당자',
      '홍길동',
    ].sort()
  );
  assert.ok(result.entities.every((e) => e.noteCount === 3 && e.type === null));
  assert.ok(!JSON.stringify(result.entities).includes('Folder'));
});

test('source and sentence navigation preserve literal slashes within nested headings', async () => {
  const body = '# Platform\n## Deploy / Infra\n**Orama** uses **IndexedDB**.';
  const result = await extractRelationEntities([0, 1, 2].map((i) => note(`Note ${i}`, body)));
  const details = result.details.orama;
  assert.deepEqual(details.sources.find((source) => source.kind === 'bold').sectionPath, [
    'Platform',
    'Deploy / Infra',
  ]);
  assert.deepEqual(details.sentences[0].sectionPath, ['Platform', 'Deploy / Infra']);
});

test('keyword details retain each structural origin and complete soft-wrapped sentences with every co-occurring entity before NLI', async () => {
  const body =
    '# 플랫폼\n## React Native\n[React Native](/guide)\n\n| React Native | 상태 |\n| --- | --- |\n| 사용 | 활성 |\n\n**React Native**\n기술: React Native\nReact Native: 도구\n\n## IndexedDB\n## Orama\n\nReact Native는 첫 번째 줄에서 시작하고\nIndexedDB 및 Orama와 함께 전체 문장을 구성합니다.';
  const sources = [0, 1, 2].map((i) => note(`Folder${i}/React Native`, body));
  const result = await extractRelationEntities(sources);
  const detail = result.details['react native'];
  assert.deepEqual(
    new Set(detail.sources.map((source) => source.kind)),
    new Set(['title', 'heading', 'link', 'table-header', 'bold', 'field-name', 'field-value'])
  );
  assert.equal(new Set(detail.sources.map((source) => source.noteTitle)).size, 3);
  assert.ok(
    detail.sources.some(
      (source) => source.kind === 'link' && source.section === '플랫폼 / React Native'
    )
  );
  assert.ok(
    detail.sources.some(
      (source) => source.kind === 'field-value' && source.text === '기술: React Native'
    )
  );
  const sentence = detail.sentences.find((item) => item.text.startsWith('React Native는 첫 번째'));
  assert.equal(
    sentence.text,
    'React Native는 첫 번째 줄에서 시작하고 IndexedDB 및 Orama와 함께 전체 문장을 구성합니다.'
  );
  assert.deepEqual(sentence.entities, ['React Native', 'IndexedDB', 'Orama']);
  assert.equal(sentence.noteTitle, 'Folder0/React Native');
});

test('single-entity prose and unconnected keywords retain sources and full predicates without a relation pair', async () => {
  const result = await extractRelationEntities([
    ...[0, 1, 2].map((i) => note(`Dictionary${i}`, '# Lonely')),
    note('Story', 'Lonely works alone with a complete predicate.'),
  ]);
  assert.equal(result.details.lonely.sources.length, 3);
  assert.equal(
    result.details.lonely.sentences[0].text,
    'Lonely works alone with a complete predicate.'
  );
  assert.deepEqual(result.details.lonely.sentences[0].entities, ['Lonely']);
});

test('numeric keywords retain original spelling, independent sources and a shared pattern type', async () => {
  const result = await extractRelationEntities(
    ['First', 'Second', 'Third'].map((title) =>
      note(
        `History/${title}/2023년`,
        '# 2023년\n[2023년](/year) **2023년**\n\n| 2023년 | 상태 |\n| --- | --- |\n| 사용 | 활성 |\n\n2023년: 2023년\n\n## 2024년\n## 2025년\n\n**Archive**'
      )
    )
  );
  const numeric = result.entities.filter((item) => item.type === '{{NUM}}년');
  assert.deepEqual(numeric.map((item) => item.text).sort(), ['2023년', '2024년', '2025년']);
  assert.ok(numeric.every((item) => item.noteCount === 3));
  assert.equal(result.entities.find((item) => item.text === 'Archive').type, null);
  const detail = result.details['2023년'];
  assert.equal(detail.sources.length, 21);
  assert.deepEqual(
    new Set(detail.sources.map((source) => source.kind)),
    new Set(['title', 'heading', 'link', 'table-header', 'bold', 'field-name', 'field-value'])
  );
  assert.ok(detail.sources.every((source) => source.keyword === '2023년'));
  assert.equal(result.details['2024년'].sources.length, 3);
  const { summarizeRelationEntities } = loadTs('relationSummary.ts', {
    './relationKeywords': loadTs('relationKeywords.ts'),
  });
  const summary = summarizeRelationEntities(result);
  assert.deepEqual(
    summary.개체목록
      .filter((item) => item.유형 === '{{NUM}}년')
      .map((item) => item.개체)
      .sort(),
    ['2023년', '2024년', '2025년']
  );
  assert.equal(summary.개체목록.find((item) => item.개체 === '2023년').출처유형.length, 7);
});

test('numeric variants never share note support and original keywords keep distinct units and separators', async () => {
  const values = [
    'Sprint 1',
    'Sprint 12',
    'Sprint 300',
    'v1.2',
    'v3.4',
    'v5.6',
    'v1-2',
    'v3-4',
    'v5-6',
    '2023년',
    '1월',
  ];
  const result = await extractRelationEntities(
    ['First', 'Second', 'Third'].map((title) =>
      note(title, values.map((value) => `## ${value}`).join('\n'))
    )
  );
  assert.deepEqual(result.entities.map((item) => item.text).sort(), [...values].sort());
  assert.ok(result.entities.every((item) => item.noteCount === 3));
  assert.equal(result.entities.find((item) => item.text === 'v1.2').type, 'v{{NUM}}.{{NUM}}');
  assert.equal(result.entities.find((item) => item.text === 'v1-2').type, 'v{{NUM}}-{{NUM}}');
  const tooFew = await extractRelationEntities([
    note('First', '# Sprint 1\n## Sprint 2\n## Sprint 3'),
    note('Second', '# Sprint 12'),
    note('Third', 'Sprint 300 is only mentioned in prose.'),
  ]);
  assert.deepEqual(tooFew.entities, []);
});

test('a pattern type requires three distinct admitted keywords and type-only changes refresh cached observations', async () => {
  const memory = createRelationDiscoveryMemory();
  const sources = ['First', 'Second', 'Third'].map((title) =>
    note(title, '# Sprint 1\n## SPRINT 1\n## Sprint 2\n\n**Minji**')
  );
  sources.push(note('Story', 'Sprint 1 uses Minji.'));
  const options = { memory, runtime: runtime(), maxMergeNliChecks: 0 };
  const first = await discoverInductiveRelations(sources, options);
  assert.ok(first.entityExtraction.entities.every((entity) => entity.type === null));
  assert.equal(first.candidates[0].observations[0].sourceType, null);
  sources[0] = { ...sources[0], description: sources[0].description + '\n\n## Sprint 3' };
  const insufficient = await discoverInductiveRelations(sources, options);
  assert.ok(insufficient.entityExtraction.entities.every((entity) => entity.type === null));
  for (let i = 1; i < 3; i++)
    sources[i] = { ...sources[i], description: sources[i].description + '\n\n## Sprint 3' };
  const promoted = await discoverInductiveRelations(sources, options);
  assert.equal(
    promoted.entityExtraction.entities.filter((entity) => entity.type === 'Sprint {{NUM}}').length,
    3
  );
  assert.equal(promoted.candidates[0].observations[0].sourceType, 'Sprint {{NUM}}');
  assert.equal(
    promoted.entityExtraction.entities.find((entity) => entity.text === 'Minji').type,
    null
  );
  sources[0] = note('First', '# Sprint 1\n## Sprint 2\n\n**Minji**');
  const demoted = await discoverInductiveRelations(sources, options);
  assert.ok(demoted.entityExtraction.entities.every((entity) => entity.type === null));
  assert.equal(demoted.candidates[0].observations[0].sourceType, null);
});

test('literal placeholders retain their identity and never contribute numeric support', async () => {
  const sources = ['First', 'Second', 'Third'].map((title) =>
    note(
      title,
      '# Sprint {{NUM}}\n## Sprint 123\n## Sprint 456\n## Sprint 789\n\nSprint {{NUM}} uses Sprint 123.'
    )
  );
  for (const input of [sources, [...sources].reverse()]) {
    const result = await discoverInductiveRelations(input, {
      runtime: runtime(),
      maxMergeNliChecks: 0,
    });
    const inventory = result.entityExtraction.entities;
    assert.equal(inventory.length, 4);
    const literal = inventory.find((entity) => entity.text === 'Sprint {{NUM}}');
    const numeric = inventory.find((entity) => entity.text === 'Sprint 123');
    assert.equal(literal.text, 'Sprint {{NUM}}');
    assert.equal(literal.type, null);
    assert.equal(numeric.text, 'Sprint 123');
    assert.notEqual(literal.key, numeric.key);
    assert.ok(
      result.entityExtraction.details[literal.key].sources.every(
        (source) => source.keyword === 'Sprint {{NUM}}'
      )
    );
    assert.ok(
      result.entityExtraction.details[numeric.key].sources.every(
        (source) => source.keyword === 'Sprint 123'
      )
    );
    assert.equal(result.observationCount, 3);
    assert.ok(
      result.candidates[0].observations.every(
        (observation) =>
          observation.sourceType === null && observation.targetType === 'Sprint {{NUM}}'
      )
    );
  }
  const unsupported = await extractRelationEntities([
    note('First', '# Sprint {{NUM}}'),
    note('Second', '# Sprint 1'),
    note('Third', '# Sprint 2'),
  ]);
  assert.equal(unsupported.entities.length, 0);
});

test('prefix classification uses admitted entities and refreshes unchanged observations after promotion or demotion', async () => {
  for (const names of [
    ['업무-개발', '업무-운영', '업무-배포', '업무-{{TEXT}}'],
    ['@@개발', '@@운영', '@@배포', '@@{{TEXT}}'],
  ]) {
    const memory = createRelationDiscoveryMemory();
    const sources = ['First', 'Second', 'Third'].map((title) =>
      note(title, `# ${names[0]}\n## ${names[1]}\n\n**Minji**`)
    );
    sources.push(note('Story', `${names[0]} uses Minji.`));
    const options = { memory, runtime: runtime(), maxMergeNliChecks: 0 };
    const first = await discoverInductiveRelations(sources, options);
    assert.equal(first.candidates[0].observations[0].sourceType, null);
    sources[0] = { ...sources[0], description: sources[0].description + `\n\n## ${names[2]}` };
    const insufficient = await discoverInductiveRelations(sources, options);
    assert.ok(insufficient.entityExtraction.entities.every((entity) => entity.type === null));
    for (let i = 1; i < 3; i++)
      sources[i] = { ...sources[i], description: sources[i].description + `\n\n## ${names[2]}` };
    const promoted = await discoverInductiveRelations(sources, options);
    assert.equal(
      promoted.entityExtraction.entities.filter((entity) => entity.type === names[3]).length,
      3
    );
    assert.equal(promoted.candidates[0].observations[0].sourceType, names[3]);
    assert.equal(promoted.candidates[0].observations[0].source, names[0]);
    assert.ok(
      promoted.candidates[0].validations.every(
        (validation) => !validation.hypothesis.includes('{{TEXT}}')
      )
    );
    sources[0] = note('First', `# ${names[0]}\n## ${names[1]}\n\n**Minji**`);
    const demoted = await discoverInductiveRelations(sources, options);
    assert.equal(demoted.candidates[0].observations[0].sourceType, null);
    assert.ok(demoted.entityExtraction.entities.every((entity) => entity.type === null));
  }
});

test('unchanged extraction reuses its result without reparsing while edits and removed notes invalidate it', async () => {
  const memory = createRelationDiscoveryMemory();
  const sources = ['First', 'Second', 'Third'].map((title) =>
    note(title, '**Alpha**\n\nAlpha works alone.')
  );
  const first = await extractRelationEntities(sources, undefined, undefined, memory);
  const progress = [];
  const second = await extractRelationEntities(
    [...sources].reverse(),
    undefined,
    (p) => progress.push(p),
    memory
  );
  assert.equal(second, first);
  assert.equal(progress.at(-1).status, 'completed');
  assert.equal(progress.at(-1).completedNotes, 3);
  const rows = memory.notes.get('First').entitySentences.rows;
  sources[2] = note('Third', '**Alpha**\n\nAlpha has changed.');
  const edited = await extractRelationEntities(sources, undefined, undefined, memory);
  assert.notEqual(edited, first);
  assert.equal(memory.notes.get('First').entitySentences.rows, rows);
  assert.ok(
    edited.details.alpha.sentences.some((sentence) => sentence.text === 'Alpha has changed.')
  );
  const removed = await extractRelationEntities(sources.slice(0, 2), undefined, undefined, memory);
  assert.equal(removed.entities.length, 0);
  assert.notEqual(removed, edited);
});

test('an aborted edit cannot poison the previous extraction cache when the original input returns', async () => {
  const memory = createRelationDiscoveryMemory();
  const sources = Array.from({ length: 30 }, (_, i) => note(`Note${i}`, '**Original**'));
  const first = await extractRelationEntities(sources, undefined, undefined, memory);
  const controller = new AbortController();
  await assert.rejects(
    extractRelationEntities(
      sources.map((source) => ({ ...source, description: '**Changed**' })),
      controller.signal,
      (progress) => {
        if (progress.completedNotes >= 25) controller.abort();
      },
      memory
    ),
    { name: 'AbortError' }
  );
  const restored = await extractRelationEntities(sources, undefined, undefined, memory);
  assert.equal(restored, first);
  assert.ok(restored.entities.some((entity) => entity.text === 'Original'));
  assert.ok(!restored.entities.some((entity) => entity.text === 'Changed'));
});

test('new and removed field-name or table-header entities refresh unchanged sentence indexes', async () => {
  for (const description of [
    'Label: Target',
    '| Label | Value |\n| --- | --- |\n| Target | Active |\n\n**Target**',
  ]) {
    const memory = createRelationDiscoveryMemory();
    const sources = [
      note('First', '**Label**\n\n**Target**'),
      note('Second', '**Target**'),
      note('Third', description),
    ];
    const before = await extractRelationEntities(sources, undefined, undefined, memory);
    assert.equal(before.details.label, undefined);
    sources[1] = note('Second', '**Label**\n\n**Target**');
    const added = await extractRelationEntities(sources, undefined, undefined, memory);
    assert.ok(added.details.label.sentences.some((sentence) => sentence.noteTitle === 'Third'));
    sources[1] = note('Second', '**Target**');
    const removed = await extractRelationEntities(sources, undefined, undefined, memory);
    assert.equal(removed.details.label, undefined);
    assert.ok(
      removed.details.target.sentences.every((sentence) => !sentence.entityKeys.includes('label'))
    );
  }
});

test('numeric classifications preserve exact matching, distinct pairs and concrete NLI inputs', async () => {
  const calls = [];
  const result = await discoverInductiveRelations(
    ['First', 'Second', 'Third'].map((title) =>
      note(
        `Projects/${title}/Sprint 1`,
        '# Minji\n## Sprint 2\n## Sprint 3\n담당자: Minji\n\nSprint 1 uses Minji.\nSprint 2 uses Minji.\nSprint 777 uses Minji.'
      )
    ),
    {
      runtime: runtime({
        entailment: async (premise, hypothesis) => {
          calls.push({ premise, hypothesis });
          return supported;
        },
      }),
      maxMergeNliChecks: 0,
    }
  );
  assert.equal(result.entityCount, 5);
  assert.equal(
    result.entityExtraction.entities.filter((item) => item.type === 'Sprint {{NUM}}').length,
    3
  );
  assert.equal(result.observationCount, 9);
  assert.equal(
    result.candidates.find((candidate) => candidate.template === '{{E1}} uses {{E2}}.').pairSupport,
    2
  );
  for (const candidate of result.candidates) {
    assert.ok(
      candidate.observations.every(
        (item) => item.sourceType === 'Sprint {{NUM}}' && item.targetType === null
      )
    );
    assert.ok(
      candidate.validations.every(
        (item) => !item.hypothesis.includes('{{NUM}}') && item.skipReason === 'pending'
      )
    );
  }
  assert.equal(calls.length, 0, 'candidate generation does not perform final NLI');
  assert.ok(
    result.entityExtraction.details['sprint 1'].sentences.some(
      (item) => item.text === 'Sprint 1 uses Minji.' && item.entities.includes('Sprint 1')
    )
  );
});

test('numeric keyword matchers retain exact punctuation and Korean particle boundaries', async () => {
  const result = await discover(
    [
      note(
        'Story',
        'C++ 1.2 uses Minji.\nC++ 1 uses Minji.\nXC++ 1.2 uses Minji.\nC++ 999.88 uses Minji.\n2023년은 Minji를 지원한다.'
      ),
    ],
    ['C++ 1.2', 'C++ 1', 'Minji', '2023년'],
    { maxMergeNliChecks: 0 }
  );
  const observations = result.candidates.flatMap((item) => item.observations);
  assert.deepEqual(
    new Set(observations.map((item) => item.source)),
    new Set(['C++ 1.2', 'C++ 1', '2023년'])
  );
  assert.ok(observations.every((item) => item.sourceType === null && item.targetType === null));
  assert.ok(observations.some((item) => item.template === '{{E1}}은 {{E2}}를 지원한다.'));
});

test('changing numeric-keyword support rematches unchanged prose without promoting another numeric variant', async () => {
  const memory = createRelationDiscoveryMemory();
  const sources = ['First', 'Second', 'Third'].map((title) =>
    note(title, '**Sprint 1**\n\n**Minji**')
  );
  sources.push(note('Story', 'Sprint 1 uses Minji.'));
  const options = { memory, runtime: runtime(), maxMergeNliChecks: 0 };
  assert.equal((await discoverInductiveRelations(sources, options)).observationCount, 1);
  sources[2] = note('Third', '**Minji**');
  assert.equal((await discoverInductiveRelations(sources, options)).observationCount, 0);
  sources[2] = note('Third', '**Sprint 333**\n\n**Minji**');
  assert.equal((await discoverInductiveRelations(sources, options)).observationCount, 0);
  sources[2] = note('Third', '**Sprint 1**\n\n**Minji**');
  const restored = await discoverInductiveRelations(sources, options);
  assert.equal(restored.observationCount, 1);
  assert.equal(restored.candidates[0].observations[0].source, 'Sprint 1');
});

test('supports Markdown headings, links, bold, tables and fields without splitting multiword labels', async () => {
  const body =
    '# 문단 제목\n\n[링크 이름](/target) **React Native**\n\n' +
    '| 첫 헤더 | 둘째 헤더 |\n| --- | --- |\n| 일반 셀 | 일반 값 |\n\n- 담당자：홍길동';
  const result = await extractRelationEntities(
    [0, 1, 2].map((i) => note(`Folder${i}/노트 제목`, body))
  );
  assert.equal(result.entities.length, 8);
  assert.ok(result.entities.some((e) => e.text === 'React Native'));
  assert.ok(
    !result.entities.some((e) => ['React', 'Native', '일반 셀', '일반 값'].includes(e.text))
  );
});

test('three distinct normalized note paths must supply an exact keyword, regardless of repetition and prose occurrences', async () => {
  const first = note(
    'cafe\u0301',
    '<strong>React Native</strong><strong>React Native</strong><strong>Two notes</strong>'
  );
  const second = note('Second', '<a href="/x">react native</a><strong>Two notes</strong>');
  const result = await extractRelationEntities([
    first,
    { ...first, title: 'café' },
    second,
    note('Third', '<h3>React Native</h3><p>Two notes and React appear in prose.</p>'),
  ]);
  assert.equal(result.noteCount, 3);
  assert.deepEqual(result.entities, [
    {
      text: 'React Native',
      type: null,
      key: 'react native',
      mentionCount: 4,
      noteCount: 3,
    },
  ]);
});

test('rejects one-character, numeric and symbol-only candidates while retaining letter-based names with punctuation', async () => {
  const values = [
    'A',
    '가',
    '𐐀',
    '1',
    '123',
    '12.34',
    '---',
    '😀😀',
    'C++',
    '.NET',
    '한글',
    'React Native',
  ];
  const result = await extractRelationEntities(
    ['First', 'Second', 'Third'].map((title) =>
      note(title, values.map((v) => `<b>${v}</b>`).join('<br>'))
    )
  );
  assert.deepEqual(
    result.entities.map((e) => e.text).sort(),
    ['C++', '.NET', '한글', 'React Native'].sort()
  );
});

test('excludes code, metadata, images, URLs and ordinary unmarked body text from keyword support', async () => {
  const body =
    '---\nsecret: hidden\n---\n\n```md\n**CodeName**\n```\n\n' +
    '`**InlineCode**`\n\n![ImageName](/image)\n\nhttps://example.com\n\nOrdinary text';
  const html =
    '<div class="yaml-frontmatter"><b>Metadata</b></div><pre><b>CodeName</b></pre>' +
    '<code><b>InlineCode</b></code><script><b>ScriptName</b></script><p>Ordinary text</p>';
  for (const description of [body, html]) {
    const result = await extractRelationEntities(
      ['First', 'Second', 'Third'].map((title) => note(title, description))
    );
    assert.deepEqual(result.entities, []);
  }
});

test('longest keyword wins at each occurrence and a shorter keyword requires its own support', async () => {
  const sources = [
    note('One', '<p>React Native uses TypeScript.</p><p>React uses TypeScript.</p>'),
  ];
  const onlyLong = await discover(sources, ['React Native', 'TypeScript']);
  assert.equal(onlyLong.observationCount, 1);
  assert.equal(onlyLong.candidates[0].observations[0].source, 'React Native');
  assert.ok(!onlyLong.entityExtraction.entities.some((e) => e.text === 'React'));
  const both = await discover(sources, ['React Native', 'React', 'TypeScript']);
  assert.equal(both.observationCount, 2);
  assert.deepEqual(
    both.candidates[0].observations.map((o) => o.source),
    ['React Native', 'React']
  );
});

test('matches Korean particles and literal punctuation without matching inside longer words', async () => {
  const result = await discover(
    [
      note(
        'One',
        '<p>민수는 서울대학교에서 일한다.</p><p>C++ uses .NET.</p><p>ReactNative uses .NET.</p>'
      ),
    ],
    ['민수', '서울대학교', 'C++', '.NET', 'React'],
    { maxMergeNliChecks: 0 }
  );
  assert.equal(result.observationCount, 2);
  assert.ok(result.candidates.some((c) => c.observations[0].source === '민수'));
  assert.ok(result.candidates.some((c) => c.observations[0].source === 'C++'));
});

test('note titles and field owners obey the same three-note rule', async () => {
  const sources = [note('Folder/Unique', '<p>담당자: 민수</p><p>Unique works with 민수.</p>')];
  const result = await discover(sources, ['민수']);
  assert.equal(result.candidates.length, 0);
  assert.ok(!result.entityExtraction.entities.some((e) => e.text === 'Unique'));
  const registered = await discover(sources, ['민수', 'Unique']);
  assert.ok(registered.candidates.some((c) => c.label === '담당자'));
});

test('keyword inventory arrives before model inference and includes entities with no relation pair', async () => {
  let inventory;
  const events = [];
  const result = await discover(
    [note('One', '<p>Alpha uses Beta.</p>')],
    ['Alpha', 'Beta', 'Singleton'],
    {
      onEntities: (value) => {
        inventory = value;
        events.push('entities');
      },
      runtime: runtime({
        embed: async () => {
          events.push('embedding');
          return [1, 0];
        },
      }),
    }
  );
  assert.deepEqual(events.slice(0, 2), ['entities', 'embedding']);
  assert.deepEqual(result.entityExtraction, inventory);
  assert.equal(result.entityCount, 3);
  assert.equal(result.candidates[0].observations[0].sourceType, null);
  assert.ok(inventory.entities.some((e) => e.text === 'Singleton'));
});

test('extraction yields to cancellation and never emits completion after the scope is left', async () => {
  const controller = new AbortController();
  const progress = [];
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(
    extractRelationEntities(
      Array.from({ length: 100 }, (_, i) => note(`Note${i}`, '<strong>Shared</strong>')),
      controller.signal,
      (value) => progress.push(value)
    ),
    { name: 'AbortError' }
  );
  assert.ok(progress.every((p) => p.status === 'running'));
  assert.doesNotMatch(JSON.stringify(progress), /Shared/);
});

test('empty input completes extraction with no model work', async () => {
  const events = [];
  const result = await discoverInductiveRelations([], {
    onEntityProgress: (p) => events.push(p),
    runtime: runtime({
      embed: async () => assert.fail('no embedding expected'),
      entailment: async () => assert.fail('no NLI expected'),
    }),
  });
  assert.deepEqual(result.entityExtraction.entities, []);
  assert.equal(events.at(-1).status, 'completed');
  assert.equal(result.observationCount, 0);
});

test('discovers recurring predicates across distinct pairs and preserves singleton relation patterns', async () => {
  const result = await discover(
    [
      note('First', '<h2>연구 / 관찰</h2><p>민수는 토끼를 관찰한다.</p>'),
      note('Second', '<h2>프로젝트</h2><h3>관찰 기록</h3><p>영희는 고양이를 관찰한다.</p>'),
      note('Third', '<h2>그림</h2><p>지수는 강아지를 그린다.</p>'),
    ],
    ['민수', '영희', '지수', '토끼', '고양이', '강아지'],
    {
      runtime: runtime({ embed: async (text) => (text.includes('관찰') ? [1, 0] : [0, 1]) }),
    }
  );
  assert.equal(result.candidates.length, 2);
  const recurring = result.candidates.find((c) => c.recurring);
  assert.equal(recurring.label, '관찰한다');
  assert.equal(recurring.pairSupport, 2);
  assert.ok(recurring.validations.every((v) => !v.heldOut && v.basis === 'reconstruction'));
  for (const validation of recurring.validations) {
    const donor = recurring.observations.find((item) => item.noteTitle !== validation.noteTitle);
    assert.deepEqual(validation.hypothesisSource, {
      noteTitle: donor.noteTitle,
      section: donor.section,
      sectionPath: donor.sectionPath,
    });
  }
  const singleton = result.candidates.find((c) => !c.recurring);
  assert.equal(singleton.label, '그린다');
  assert.equal(singleton.validations[0].heldOut, false);
  assert.deepEqual(singleton.validations[0].hypothesisSource, {
    noteTitle: 'Third',
    section: '그림',
    sectionPath: ['그림'],
  });
});

test('field labels and table columns retain source context and never join separate table rows', async () => {
  const result = await discover(
    [
      note(
        '프로젝트/노트앱',
        '<h2>설정</h2><p>검토 파트너: 민수</p>' +
          '<table><tr><th>대상</th><th>지원 도구</th></tr><tr><td>검색기</td><td>Orama</td></tr>' +
          '<tr><td>편집기</td><td>Monaco</td></tr><tr><td>Alpha</td><td></td></tr><tr><td></td><td>Beta</td></tr></table>'
      ),
    ],
    ['노트앱', '민수', '검색기', 'Orama', '편집기', 'Monaco', 'Alpha', 'Beta'],
    { maxMergeNliChecks: 0 }
  );
  const field = result.candidates.find((c) => c.label === '검토 파트너');
  assert.equal(field.observations[0].source, '노트앱');
  assert.equal(field.observations[0].section, '설정');
  const table = result.candidates.find((c) => c.label === '대상 / 지원 도구');
  assert.deepEqual(
    table.observations.map((o) => [o.source, o.target]),
    [
      ['검색기', 'Orama'],
      ['편집기', 'Monaco'],
    ]
  );
});

test('mutual NLI distinguishes negation, merges supported paraphrases and retains the original embedding inventory', async () => {
  const sources = [
    note('One', '<p>Alpha uses Beta.</p>'),
    note('Two', '<p>Gamma does not use Delta.</p>'),
  ];
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const separated = await discover(sources, names, {
    runtime: runtime({
      entailment: async (p, h) =>
        p.includes('not') === h.includes('not') ? supported : contradicted,
    }),
  });
  assert.equal(separated.candidates.length, 2);
  const merged = await discover([sources[0], note('Two', '<p>Gamma utilizes Delta.</p>')], names);
  assert.equal(merged.candidates.length, 1);
  assert.equal(merged.candidates[0].variants.length, 2);
  for (const [index, validation] of merged.candidates[0].validations.entries()) {
    const observation = merged.candidates[0].observations[index];
    const donor = merged.candidates[0].observations.find(
      (item) => item.noteTitle === validation.hypothesisSource.noteTitle
    );
    assert.notEqual(donor.noteTitle, observation.noteTitle);
    assert.equal(
      validation.hypothesis,
      donor.template
        .replaceAll('{{E1}}', observation.source)
        .replaceAll('{{E2}}', observation.target)
    );
  }
  assert.deepEqual(
    getRelationInputPatterns({ ...merged, inputPatterns: undefined }),
    merged.inputPatterns
  );
});

test('merge checks stay bounded while every final example is queued for the batch runner', async () => {
  const names = [];
  const sources = Array.from({ length: 22 }, (_, i) => {
    names.push(`Source${i}`, `Target${i}`);
    return note(`Note${i}`, `<p>Source${i} expresses-predicate${i} Target${i}.</p>`);
  });
  const result = await discover(sources, names, {
    runtime: runtime({ entailment: async () => neutral }),
  });
  assert.equal(result.nliStats.mergeChecks, 200);
  assert.equal(result.nliStats.validationChecks, 0);
  const validations = result.candidates.flatMap((candidate) => candidate.validations);
  assert.equal(validations.length, 22);
  assert.ok(validations.every((item) => item.skipReason === 'pending' && !item.scores));
});

test('candidate discovery keeps embedding and merge progress without starting a final-validation timer', async (t) => {
  const timers = new Map();
  let id = 0;
  t.mock.method(globalThis, 'setInterval', (callback) => {
    timers.set(++id, callback);
    return id;
  });
  t.mock.method(globalThis, 'clearInterval', (value) => timers.delete(value));
  let finish;
  const output = [];
  const promise = discover([note('One', '<p>Alpha uses Beta.</p>')], ['Alpha', 'Beta'], {
    onInferenceProgress: (p) => output.push(p),
    runtime: runtime({
      embed: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  [...timers.values()][0]();
  assert.equal(output.at(-1).processed, 0);
  assert.ok(output.at(-1).inFlightInputChars > 0);
  finish([1, 0]);
  await promise;
  assert.equal(timers.size, 0);
  assert.ok(output.every((progress) => progress.phase !== 'validation'));
  for (const phase of ['embedding', 'merge']) {
    const final = output.find((p) => p.phase === phase && p.status === 'completed');
    assert.equal(final.processed, final.total);
  }
});

test('NLI softmax obeys model label order and preserves neutral scores', () => {
  const scores = relationNliScores([0, 3, 1], {
    0: 'contradiction',
    1: 'neutral',
    2: 'entailment',
  });
  assert.ok(scores.neutral > 0.8);
  assert.throws(() => relationNliScores([0, 1], { 0: 'LABEL_0', 1: 'LABEL_1' }), /must expose/);
});

test('out-of-order bulk results preserve relation grouping and populate the existing vector cache', async () => {
  const sources = [
    note('One', '<p>Alpha uses Beta.</p>'),
    note('Two', '<p>Alpha avoids Beta.</p>'),
  ];
  const vector = (text) => (text.includes('avoids') ? [0, 1] : [1, 0]);
  const single = await discover(sources, ['Alpha', 'Beta'], {
    runtime: runtime({ embed: async (text) => vector(text) }),
  });
  const memory = createRelationDiscoveryMemory();
  const progress = [];
  let calls = 0;
  const bulkRuntime = runtime({
    embed: async () => assert.fail('the bulk interface should own inference'),
    embedMany: async (texts, { onBatch, onResult }) => {
      calls++;
      onBatch(texts.map((_, index) => index));
      for (let index = texts.length - 1; index >= 0; index--) onResult(index, vector(texts[index]));
    },
  });
  const bulk = await discover(sources, ['Alpha', 'Beta'], {
    memory,
    runtime: bulkRuntime,
    onInferenceProgress: (p) => progress.push(p),
  });
  assert.deepEqual(bulk.candidates, single.candidates);
  assert.equal(
    progress.find((p) => p.phase === 'embedding' && p.status === 'completed').modelChecks,
    1
  );
  for (const pattern of bulk.inputPatterns)
    assert.deepEqual(memory.embeddings.get(pattern.template), vector(pattern.template));
  const repeated = await discover(sources, ['Alpha', 'Beta'], { memory, runtime: bulkRuntime });
  assert.equal(calls, 1, 'a repeated analysis does not load or invoke the embedding model');
  assert.deepEqual(repeated.candidates, bulk.candidates);
});

test('bulk inference embeds duplicate templates only once across distinct entity types', async () => {
  const memory = createRelationDiscoveryMemory();
  const progress = [];
  const result = await discover(
    [note('One', '<p>Alpha uses Beta.</p>'), note('Two', '<p>Team#Alice uses Team#Bob.</p>')],
    ['Alpha', 'Beta', 'Team#Alice', 'Team#Bob', 'Team#Carol'],
    {
      memory,
      embeddingOnly: true,
      onInferenceProgress: (p) => progress.push(p),
      runtime: runtime({
        embedMany: async (texts, { onBatch, onResult }) => {
          assert.equal(texts.length, 1);
          onBatch([0]);
          onResult(0, [1, 0]);
        },
      }),
    }
  );
  assert.equal(result.inputPatterns.length, 2);
  const completed = progress.at(-1);
  assert.equal(completed.processed, 2);
  assert.equal(completed.total, 2);
  assert.equal(completed.modelChecks, 1);
  assert.equal(memory.stats.embeddingReuses, 1);
});

test('cancelled bulk work keeps completed vectors, discards late results and releases its progress timer', async (t) => {
  const memory = createRelationDiscoveryMemory();
  const controller = new AbortController();
  const timers = new Set();
  t.mock.method(globalThis, 'setInterval', () => {
    const timer = {};
    timers.add(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearInterval', (timer) => timers.delete(timer));
  await assert.rejects(
    discover(
      [note('One', '<p>Alpha uses Beta.</p>'), note('Two', '<p>Alpha avoids Beta.</p>')],
      ['Alpha', 'Beta'],
      {
        memory,
        signal: controller.signal,
        onInferenceProgress: () => {},
        runtime: runtime({
          embedMany: async (texts, { onBatch, onResult }) => {
            onBatch([0, 1]);
            onResult(0, [1, 0]);
            controller.abort();
            onResult(1, [0, 1]);
          },
        }),
      }
    ),
    { name: 'AbortError' }
  );
  assert.equal(memory.embeddings.size, 1);
  assert.equal(timers.size, 0);
});

test('failed bulk inputs remain retryable while successful vectors and progress are retained', async () => {
  const sources = [
    note('One', '<p>Alpha uses Beta.</p>'),
    note('Two', '<p>Alpha avoids Beta.</p>'),
  ];
  const memory = createRelationDiscoveryMemory();
  const progress = [];
  const partial = await discover(sources, ['Alpha', 'Beta'], {
    memory,
    embeddingOnly: true,
    onInferenceProgress: (p) => progress.push(p),
    runtime: runtime({
      embedMany: async (texts, { onBatch, onResult }) => {
        onBatch([0, 1]);
        onResult(0, [1, 0]);
        onResult(1);
      },
    }),
  });
  assert.equal(partial.discoveryIncomplete, true);
  assert.equal(memory.embeddings.size, 1);
  assert.equal(progress.at(-1).modelFailures, 1);
  assert.equal(progress.at(-1).processed, progress.at(-1).total);
  const retried = await discover(sources, ['Alpha', 'Beta'], {
    memory,
    embeddingOnly: true,
    runtime: runtime({
      embedMany: async (texts, { onBatch, onResult }) => {
        assert.equal(texts.length, 1);
        onBatch([0]);
        onResult(0, [0, 1]);
      },
    }),
  });
  assert.equal(retried.discoveryIncomplete, undefined);
  assert.equal(memory.embeddings.size, 2);
});
