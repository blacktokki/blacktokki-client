const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

describe('Entity extraction', () => {
  const Turndown = require('turndown');
  const { gfm } = require('turndown-plugin-gfm');

  const keywordHarness = require('./loadTs.cjs').keywordHarness;
  const loadTs = require('./loadTs.cjs');
  const markdown = new Turndown({ headingStyle: 'atx' });
  markdown.use(gfm);
  const { extractRelationEntities, createRelationDiscoveryMemory } = keywordHarness({
    '@blacktokki/editor': {
      toMarkdown: (html) => markdown.turndown(html),
      toRaw: (text) => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'),
    },
  });
  const note = (title, description) => ({ title, description });
  test('extracts whole keywords from final path titles, headings, links, bold text and both sides of fields', async () => {
    const html =
      '<h2>문단 제목</h2><p><a href="/ignored-url">링크 이름</a> <strong>React <em>Native</em></strong></p>' +
      '<table><tr><th>첫 헤더</th><th>둘째 헤더</th></tr><tr><td>일반 셀</td><td>숫자</td></tr></table>' +
      '<p>담당자: 홍길동</p><p>일반 본문</p>';
    const result = await extractRelationEntities(
      [0, 1, 2].map((i) => note(`Folder${i}/노트 제목`, html))
    );
    assert.deepEqual(
      result.entities.map((e) => e.text).sort(),
      ['노트 제목', '문단 제목', 'React Native', '담당자', '홍길동'].sort()
    );
    assert.ok(result.entities.every((e) => e.noteCount === 3 && e.type === null));
    assert.ok(!JSON.stringify(result.entities).includes('Folder'));
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
    assert.equal(detail.sources.length, 16);
    assert.equal(detail.sources.filter((source) => source.kind === 'link').length, 1);
    assert.deepEqual(
      new Set(detail.sources.map((source) => source.kind)),
      new Set(['title', 'heading', 'link', 'bold', 'field-name', 'field-value'])
    );
    assert.ok(detail.sources.every((source) => source.keyword === '2023년'));
    assert.equal(result.details['2024년'].sources.length, 3);
    const { summarizeRelationEntities } = loadTs('useRelationAnalysis.ts', {
      './keyword/keywordUtils': loadTs('keyword/keywordUtils.ts'),
    });
    const summary = summarizeRelationEntities(result);
    assert.deepEqual(
      summary.개체목록
        .filter((item) => item.패턴 === '{{NUM}}년')
        .map((item) => item.개체)
        .sort(),
      ['2023년', '2024년', '2025년']
    );
    assert.equal(summary.개체목록.find((item) => item.개체 === '2023년').출처유형.length, 6);
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
    const removed = await extractRelationEntities(
      sources.slice(0, 2),
      undefined,
      undefined,
      memory
    );
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

  test('table headers never supply keyword support, including formatted and restored headers', async () => {
    for (const description of [
      '| Label | Value |\n| --- | --- |\n| Target | Active |',
      '| **Label** | [Value](/value) |\n| --- | --- |\n| Target | Active |',
      '| Column1 | Column2 |\n| --- | --- |\n| **Label** | [Value](/value) |\n| Target 1 | Active |',
    ]) {
      const result = await extractRelationEntities(
        ['A', 'B', 'C'].map((title) => note(title, description))
      );
      assert.deepEqual(result.entities, []);
      assert.equal(result.inputCount, 0);

      const memory = createRelationDiscoveryMemory();
      const sources = [
        note('First', '**Label**'),
        note('Second', '**Label**'),
        note('Third', description),
      ];
      const before = await extractRelationEntities(sources, undefined, undefined, memory);
      assert.equal(before.details.label, undefined);
      sources[2] = note('Third', '## Label');
      const admitted = await extractRelationEntities(sources, undefined, undefined, memory);
      assert.equal(admitted.entities.find((entity) => entity.text === 'Label').noteCount, 3);
      sources[2] = note('Third', description);
      const removed = await extractRelationEntities(sources, undefined, undefined, memory);
      assert.equal(removed.details.label, undefined);
    }
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
});

describe('Document blocks and evidence', () => {
  const path = require('node:path');

  const load = require('./loadTs.cjs');
  const editor = load(
    path.join(require.resolve('@blacktokki/editor/package.json'), '../src/lib/markdown.ts')
  );
  const { parseRelationDocument } = load('keyword/extractKeywords.ts', {}, [
    'parseRelationDocument',
  ]);
  const blocks = (description) =>
    parseRelationDocument({ title: 'Example', description }, editor.parser).regions.flatMap(
      (region) => region.blocks
    );
  const evidence = (description) =>
    blocks(description).map((block) => block.sourceText || block.text);

  test('explicit line breaks separate evidence while ordinary soft wraps keep a complete sentence', () => {
    const soft = 'Alpha starts the sentence and\ncontinues with Beta.';
    for (const description of [soft, editor.renderer(soft)])
      assert.deepEqual(evidence(description), [
        'Alpha starts the sentence and continues with Beta.',
      ]);
    for (const description of [
      'Alpha is enabled  \nBeta is disabled',
      'Alpha is enabled\\\nBeta is disabled',
      '<p>Alpha is enabled<br>Beta is disabled</p>',
      editor.renderer('Alpha is enabled  \nBeta is disabled'),
    ])
      assert.deepEqual(evidence(description), ['Alpha is enabled', 'Beta is disabled']);
  });

  test('paragraphs, nested list items and table rows retain their own evidence boundaries', () => {
    const markdown = [
      'Alpha is enabled.',
      '',
      'Beta is disabled.',
      '',
      '- Parent item',
      '  - Child item',
      '- Sibling item',
      '',
      '| Service | Tool |',
      '| --- | --- |',
      '| Service 1 | Tool 1 |',
      '| Service 2 | Tool 2 |',
    ].join('\n');
    for (const description of [markdown, editor.renderer(markdown)]) {
      const content = blocks(description);
      assert.deepEqual(
        content.slice(0, 5).map((block) => block.text),
        ['Alpha is enabled.', 'Beta is disabled.', 'Parent item', 'Child item', 'Sibling item']
      );
      assert.equal(content[5].row, content[6].row);
      assert.equal(content[7].row, content[8].row);
      assert.notEqual(content[5].row, content[7].row);
    }
  });

  test('whole property values survive linked entry splitting without including adjacent fields', () => {
    const markdown =
      'Details: [Service Alpha](alpha.md), [Tool Alpha](tool.md); Other: [Tool Gamma](gamma.md)';
    for (const description of [markdown, editor.renderer(markdown)]) {
      const content = blocks(description);
      assert.deepEqual(
        content.map((block) => [block.field, block.text, block.fieldValue]),
        [
          ['Details', 'Service Alpha', 'Service Alpha, Tool Alpha'],
          ['Details', 'Tool Alpha', 'Service Alpha, Tool Alpha'],
          ['Other', 'Tool Gamma', 'Tool Gamma'],
        ]
      );
    }
  });

  test('line breaks within a table cell never create additional rows or move values to another column', () => {
    const html =
      '<table><thead><tr><th>Service</th><th>Tool</th></tr></thead><tbody>' +
      '<tr><td>Service\n1</td><td>Tool<br>1</td></tr>' +
      '<tr><td>Service 2</td><td>Tool 2</td></tr></tbody></table>';
    const content = blocks(html);
    assert.deepEqual(
      content.map((block) => block.text),
      ['Service 1', 'Tool 1', 'Service 2', 'Tool 2']
    );
    assert.deepEqual(
      content.map((block) => block.column),
      ['Service', 'Tool', 'Service', 'Tool']
    );
    assert.equal(content[0].row, content[1].row);
    assert.equal(content[2].row, content[3].row);
    assert.notEqual(content[0].row, content[2].row);
  });
});

describe('Linked keyword sources', () => {
  const { extractRelationEntities, createRelationDiscoveryMemory } =
    require('./loadTs.cjs').keywordHarness();
  const note = (title, description) => ({ title, description });
  const link = (label = 'Shared link', href = 'https://example.com/page') => `[${label}](${href})`;

  test('different destinations supply distinct sources but still require three notes', async () => {
    const addresses = [
      'https://example.com/Page',
      'https://example.com/page',
      'https://example.com/page#part',
    ];
    const result = await extractRelationEntities(
      addresses.map((href, index) =>
        note(String.fromCharCode(65 + index), link('Shared link', href))
      )
    );
    assert.equal(result.inputCount, 3);
    assert.equal(result.entities[0].mentionCount, 3);
    assert.equal(result.entities[0].noteCount, 3);
    assert.deepEqual(
      result.details['shared link'].sources.map((source) => source.href),
      addresses
    );
    const oneNote = await extractRelationEntities([
      note('A', addresses.map((href) => link('Shared link', href)).join(' ')),
      note('B', 'Plain prose.'),
      note('C', 'Other prose.'),
    ]);
    assert.equal(oneNote.inputCount, 3);
    assert.deepEqual(oneNote.entities, []);
  });

  test('link deduplication also applies to provenance without reducing non-link sources', async () => {
    const result = await extractRelationEntities(
      ['A', 'B', 'C'].map((title) =>
        note(title, `${link()} ${link()}\n\n**Shared link** **Shared link**`)
      )
    );
    assert.equal(result.inputCount, 7);
    assert.equal(result.mentionCount, 7);
    assert.equal(result.entities[0].noteCount, 3);
    const sources = result.details['shared link'].sources;
    assert.equal(sources.length, 7);
    assert.deepEqual(
      sources.filter((source) => source.kind === 'link').map((source) => source.noteTitle),
      ['A']
    );
    assert.equal(sources.filter((source) => source.kind === 'bold').length, 6);
  });

  test('cached notes are deduplicated again after edits and deletion of the first link source', async () => {
    const memory = createRelationDiscoveryMemory();
    const extract = (sources) => extractRelationEntities(sources, undefined, undefined, memory);
    const initial = ['A', 'B', 'C'].map((title) => note(title, link()));
    const first = await extract(initial);
    assert.equal(first.inputCount, 1);
    assert.equal(await extract(initial), first);
    const expanded = [
      ...initial,
      note('D', link('Shared link', 'https://example.com/second')),
      note('E', link('Shared link', 'https://example.com/third')),
    ];
    const admitted = await extract(expanded);
    assert.equal(admitted.entities[0].noteCount, 3);
    assert.equal(admitted.entities[0].mentionCount, 3);
    const remaining = expanded.slice(1);
    const reassigned = await extract(remaining);
    assert.deepEqual(
      reassigned.details['shared link'].sources.map((source) => source.noteTitle),
      ['B', 'D', 'E']
    );
    const changed = remaining.map((source) => (source.title === 'D' ? note('D', link()) : source));
    const removed = await extract(changed);
    assert.equal(removed.inputCount, 2);
    assert.deepEqual(removed.entities, []);
    assert.deepEqual((await extract(remaining)).entities, reassigned.entities);
  });
});

describe('Collection stage contracts', () => {
  const load = require('./loadTs.cjs');

  const extraction = load('keyword/extractKeywords.ts');
  const types = load('keyword/collectKeywordTypes.ts');
  const collection = load('keyword/collectKeywordRelations.ts');
  const notes = () => [
    ...Array.from({ length: 3 }, (_, index) => ({
      title: `Dictionary ${index}`,
      description:
        '## Services\n- **Service Alpha**\n- **Service Beta**\n- **Service Gamma**\n\n' +
        '## Tools\n- **Tool Alpha**\n- **Tool Beta**\n- **Tool Gamma**\n\n' +
        '**React Native** **React Web** **React DOM** **React** **Native** **Web** **DOM**',
    })),
    { title: 'First', description: 'Service Alpha uses Tool Alpha.' },
    { title: 'Second', description: 'Service Beta works with Tool Beta.' },
  ];

  test('extraction completes keywords and composition before enumeration, types and unscored candidates', async (t) => {
    let clock = 0;
    t.mock.method(Date, 'now', () => (clock += 10));
    const events = [];
    const progress = new Map();
    const record = (stage, ratio) => {
      const values = progress.get(stage) || [];
      values.push(ratio);
      progress.set(stage, values);
    };
    const onInferenceProgress = (event) =>
      record(
        event.stage,
        event.ratio ??
          (event.total ? event.processed / event.total : event.status === 'completed' ? 1 : 0)
      );
    const keywords = await extraction.extractKeywords(notes(), {
      onEntityProgress: (event) => record('keywords', event.ratio),
      onEntities: (result) => {
        events.push('keywords');
        assert.equal(result.enumerations, undefined);
        assert.equal(result.entityTypes, undefined);
      },
    });
    assert.ok(keywords.composition.compounds.some((item) => item.key === 'react native'));
    assert.ok(keywords.composition.constituents.length);
    assert.deepEqual(events, ['keywords']);
    const collectedTypes = await types.collectKeywordTypes(keywords, {
      onInferenceProgress,
      onEntityTypes: (result) => {
        events.push('types');
        assert.ok(result.enumerations.length);
        assert.ok(result.entityTypes.length);
      },
    });
    assert.deepEqual(events, ['keywords', 'types']);
    const prepared = await collection.collectKeywordRelations(collectedTypes, {
      onInferenceProgress,
      onPatterns: (patterns) => {
        events.push('patterns');
        assert.ok(patterns.length);
      },
    });
    assert.deepEqual(events, ['keywords', 'types', 'patterns']);
    assert.ok(prepared.result.candidates.length);
    assert.ok(prepared.families.size);
    assert.ok(
      prepared.result.candidates.every(
        (candidate) => !candidate.measurements.length && !candidate.association
      )
    );
    assert.equal(keywords.extraction.entityTypes, undefined, 'stage one remains a stable snapshot');
    assert.equal(keywords.memory.entityExtraction.result, prepared.result.entityExtraction);
    const { evaluateKeywordAssociations } = load('keyword/evaluateKeywordAssociations.ts');
    await evaluateKeywordAssociations(prepared, { onInferenceProgress });
    for (const stage of ['keywords', 'types', 'contexts', 'collection', 'grouping', 'evaluation']) {
      const values = progress.get(stage);
      assert.equal(values[0], 0, stage);
      assert.equal(values.at(-1), 1, stage);
      assert.ok(
        values.every(
          (value, index) => value >= 0 && value <= 1 && (!index || value >= values[index - 1])
        ),
        stage
      );
      assert.ok(
        values.some((value) => value > 0 && value < 1),
        stage
      );
    }
  });

  test('dense enumerations retain their results without publishing a progress update per item', async (t) => {
    t.mock.method(Date, 'now', () => 0);
    const keywords = await extraction.extractKeywords([
      ...notes(),
      {
        title: 'Dense',
        description: Array.from(
          { length: 4000 },
          (_, index) => `- **Service ${['Alpha', 'Beta', 'Gamma'][index % 3]}**`
        ).join('\n'),
      },
    ]);
    const events = [];
    const reported = await types.collectKeywordTypes(keywords, {
      onInferenceProgress: (event) => events.push(event),
    });
    const silent = await types.collectKeywordTypes(keywords);
    assert.deepEqual(reported.extraction, silent.extraction);
    assert.ok(reported.extraction.enumerations.some((entry) => entry.items.length === 4000));
    assert.equal(events[0].ratio, 0);
    assert.equal(events.at(-1).ratio, 1);
    assert.ok(events.length < 100, `progress notifications: ${events.length}`);
  });

  test('small notes batch corpus and context progress while retaining final counts and results', async (t) => {
    t.mock.method(Date, 'now', () => 0);
    const input = Array.from({ length: 500 }, (_, index) => ({
      title: `Batch ${index}`,
      description: '**Service Alpha** uses **Tool Alpha**.',
    }));
    const events = [];
    const keywords = await extraction.extractKeywords(input, {
      onEntityProgress: (event) => events.push(event),
    });
    const silent = await extraction.extractKeywords(input);
    assert.deepEqual(keywords.extraction, silent.extraction);
    assert.equal(events[0].ratio, 0);
    assert.equal(events.at(-1).ratio, 1);
    assert.equal(events.at(-1).completedNotes, input.length);
    assert.ok(events.length < 50, `keyword notifications: ${events.length}`);
    const typed = await types.collectKeywordTypes(keywords);
    const contexts = [];
    const prepared = await collection.collectKeywordRelations(typed, {
      onInferenceProgress: (event) => {
        if (event.stage === 'contexts') contexts.push(event);
      },
    });
    assert.deepEqual(prepared.result, (await collection.collectKeywordRelations(typed)).result);
    assert.equal(contexts[0].processed, 0);
    assert.equal(contexts.at(-1).processed, input.length);
    assert.equal(contexts.at(-1).status, 'completed');
    assert.ok(contexts.length < 10, `context notifications: ${contexts.length}`);
  });

  for (const messageChannel of [true, false])
    test(`yielded work observes cancellation and supports subsequent work (channel: ${messageChannel})`, async (t) => {
      const { yieldRelationWork } = load('keyword/keywordUtils.ts');
      if (!messageChannel) {
        const original = globalThis.MessageChannel;
        globalThis.MessageChannel = undefined;
        t.after(() => (globalThis.MessageChannel = original));
      }
      const controller = new AbortController();
      const pending = yieldRelationWork(controller.signal);
      controller.abort();
      await assert.rejects(pending, { name: 'AbortError' });
      await assert.rejects(yieldRelationWork(controller.signal), { name: 'AbortError' });
      await yieldRelationWork();
    });

  test('type mining reports partial work and can be cancelled before committing the extraction cache', async () => {
    const input = Array.from({ length: 3 }, (_, index) => ({
      title: `Source ${index}`,
      description: Array.from({ length: 150 }, (_, item) => `- **Item ${item}**`).join('\n'),
    }));
    const keywords = await extraction.extractKeywords(input);
    const controller = new AbortController();
    let partial = false;
    await assert.rejects(
      types.collectKeywordTypes(keywords, {
        signal: controller.signal,
        onInferenceProgress: (event) => {
          if (event.ratio > 0.4 && event.ratio < 1) {
            partial = true;
            controller.abort();
          }
        },
        onEntityTypes: () => assert.fail('cancelled mining cannot publish completed types'),
      }),
      { name: 'AbortError' }
    );
    assert.equal(partial, true);
    assert.equal(keywords.memory.entityExtraction.result, keywords.extraction);
    assert.equal(keywords.extraction.entityTypes, undefined);
    const retried = await types.collectKeywordTypes(keywords);
    assert.ok(retried.extraction.entityTypes.length);
  });

  test('cancellation between stages preserves extraction and types for retry without reading sources again', async () => {
    const input = notes();
    const keywords = await extraction.extractKeywords(input);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(types.collectKeywordTypes(keywords, { signal: controller.signal }), {
      name: 'AbortError',
    });
    const retained = await extraction.extractKeywords(input, {
      memory: keywords.memory,
      onEntityProgress: (progress) =>
        assert.equal(progress.inputCount === 0 || progress.status === 'completed', true),
    });
    assert.equal(retained.extraction, keywords.extraction);
    const collectedTypes = await types.collectKeywordTypes(retained);
    await assert.rejects(
      collection.collectKeywordRelations(collectedTypes, { signal: controller.signal }),
      { name: 'AbortError' }
    );
    const prepared = await collection.collectKeywordRelations(collectedTypes);
    assert.ok(prepared.result.candidates.length);
  });
});
