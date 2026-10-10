const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(name, mocks = {}, cache = new Map()) {
  const source = path.resolve(__dirname, '..', `${name}.ts`);
  const filename = fs.existsSync(source) ? source : source + 'x';
  if (cache.has(filename)) return cache.get(filename).exports;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = module.paths;
  cache.set(filename, instance);
  instance.require = (request) => {
    if (request in mocks) return mocks[request];
    if (request.startsWith('./')) return load(request.slice(2), mocks, cache);
    return require(request);
  };
  instance._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    filename
  );
  return instance.exports;
}

const { inferTopicsSteps, curateTopics, emptyTopicPreferences } = load('inferTopics');
const { normalizeTopicText } = load('inferTopics');
const { distinguishTopicNames } = load('topicNames');
const { runTopicTask } = load('runTopicTask');
const { parseTopicPreferences, topicPreferenceScope } = load('preferences');
const section = (text, heading = '', references = []) => ({
  id: 'body',
  text,
  heading,
  references,
});
const doc = (id, sections, title = id) => ({ id, title, sections });
function infer(documents) {
  const steps = inferTopicsSteps(documents);
  let next;
  do {
    next = steps.next();
  } while (!next.done);
  return next.value;
}
const fixture = () => [
  doc('a', [
    section('Solar battery charging stores energy during daylight and powers the cabin at night.'),
  ]),
  doc('b', [
    section(
      'Solar battery charging stores energy for the cabin. A charge controller protects the battery.'
    ),
  ]),
  doc('c', [
    section('Orchard irrigation distributes water through pipes to the roots of fruit trees.'),
  ]),
  doc('d', [
    section(
      'Orchard irrigation distributes water to fruit trees; soil moisture determines the watering interval.'
    ),
  ]),
];
const memberships = (result) =>
  result.topics
    .map((topic) =>
      topic.members
        .map((member) => member.id)
        .sort()
        .join('|')
    )
    .sort();

test('infers topics from headerless text without tags, folders, metadata or links', () => {
  const result = infer(fixture());
  assert.ok(result.topics.length >= 2);
  assert.ok(
    result.topics.every(
      (topic) => topic.evidence.length && topic.evidence.every((e) => e.fragments.length)
    )
  );
  assert.ok(result.topics.every((topic) => topic.members.length < 4));
});

test('opaque document source fields and metadata cannot affect inference', () => {
  const documents = fixture();
  const augmented = documents.map((document) => ({
    ...document,
    metadata: { provider: 'arbitrary', version: 71, labels: ['unrelated'] },
  }));
  assert.deepEqual(memberships(infer(augmented)), memberships(infer(documents)));
});

test('input order, file movement, titles and document ID renaming preserve topic contents', () => {
  const documents = fixture();
  const moved = documents
    .slice()
    .reverse()
    .map((document, i) => ({ ...document, id: `moved-${i}`, title: `folder/${i}` }));
  assert.deepEqual(memberships(infer(moved)), memberships(infer(documents)));
});

test('all character systems use the same recurrence and reference rules, including no spaces', () => {
  const documents = fixture();
  const encode = (text, base) =>
    Array.from(text.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase())
      .map((character) => String.fromCodePoint(base + character.charCodeAt(0)))
      .join('');
  const shape = (result) =>
    result.topics
      .map((topic) =>
        topic.members
          .flatMap((member) => member.occurrences.map((o) => o.documentId))
          .sort()
          .join('|')
      )
      .sort();
  for (const base of [0x4e00, 0xac00, 0x10000]) {
    const encoded = documents.map((document) => ({
      ...document,
      sections: document.sections.map((item) => ({ ...item, text: encode(item.text, base) })),
    }));
    assert.deepEqual(shape(infer(encoded)), shape(infer(documents)));
  }
});

test('a common heading cannot group unrelated bodies', () => {
  const documents = [
    doc('a', [section('abcdefghijklm', 'Common')]),
    doc('b', [section('nopqrstuvwxyz', 'Common')]),
  ];
  assert.equal(infer(documents).topics.length, 0);
});

test('shared links and direct references alone do not create semantic topics', () => {
  const documents = [
    doc('a', [section('abcdefghijklm', '', ['document:b', 'https://asset.test/x'])]),
    doc('b', [section('nopqrstuvwxyz', '', ['document:a', 'https://asset.test/x'])]),
  ];
  assert.equal(infer(documents).topics.length, 0);
});

test('explicit references support matching body evidence', () => {
  const documents = fixture();
  const baseline = infer(documents);
  documents[0].sections[0].references.push('document:b');
  const result = infer(documents);
  assert.ok(
    result.topics
      .flatMap((topic) => topic.evidence)
      .some((e) => e.references.includes('document-reference'))
  );
  const supported = result.topics
    .flatMap((topic) => topic.evidence)
    .find((e) => e.references.includes('document-reference'));
  const original = baseline.topics
    .flatMap((topic) => topic.evidence)
    .find((e) => e.source === supported.source && e.target === supported.target);
  assert.ok(supported.weight > original.weight);
});

test('adding copies preserves topic memberships, ranking and independent evidence counts', () => {
  const documents = fixture();
  const baseline = infer(documents);
  const copies = documents.concat(
    documents.map((document) => ({
      ...document,
      id: `copy-${document.id}`,
      title: `copy/${document.title}`,
    }))
  );
  const result = infer(copies);
  assert.deepEqual(memberships(result), memberships(baseline));
  assert.deepEqual(
    result.topics.map((topic) => topic.documentCount),
    baseline.topics.map((topic) => topic.documentCount)
  );
  assert.deepEqual(
    result.topics.map((topic) => topic.evidence.map((e) => e.weight)),
    baseline.topics.map((topic) => topic.evidence.map((e) => e.weight))
  );
  assert.equal(result.distinctContentCount, baseline.distinctContentCount);
  assert.ok(
    result.topics[0].members[0].occurrences.length >
      baseline.topics[0].members[0].occurrences.length
  );
});

test('copies of a single document cannot create a topic', () => {
  const document = fixture()[0];
  const result = infer([document, { ...document, id: 'copy' }]);
  assert.equal(result.topics.length, 0);
  assert.equal(result.distinctContentCount, 1);
  assert.equal(result.unclassified.length, 1);
});

test('identical passages across different contents retain all original locations', () => {
  const repeated = 'Solar battery charging stores energy for the cabin.';
  const result = infer([
    doc('a', [section(repeated), { ...section('abcdefghijklm'), id: 'extra' }]),
    doc('b', [section(repeated), { ...section('nopqrstuvwxyz'), id: 'extra' }]),
  ]);
  const member = result.topics
    .flatMap((topic) => topic.members)
    .find((member) => member.text === repeated);
  assert.ok(member);
  assert.equal(member.occurrences.length, 2);
});

test('bridging content does not transitively merge unrelated topics', () => {
  const documents = [
    doc('a', [section('abcdefghijklmno repeated solar charging')]),
    doc('b', [
      section('abcdefghijklmno repeated solar charging pqrstuvwxyz repeated irrigation watering'),
    ]),
    doc('c', [section('pqrstuvwxyz repeated irrigation watering')]),
  ];
  const result = infer(documents);
  assert.ok(result.topics.length >= 1);
  assert.ok(
    result.topics.every(
      (topic) =>
        new Set(topic.members.flatMap((member) => member.occurrences.map((o) => o.documentId)))
          .size < 3
    )
  );
});

test('frequent boilerplate is suppressed statistically without a stopword dictionary', () => {
  const documents = Array.from({ length: 20 }, (_, i) =>
    doc(String(i), [
      section('standard recurring boilerplate repeated for every document'),
      { ...section(String.fromCodePoint(0x4e00 + i).repeat(16)), id: 'body' + i },
    ])
  );
  assert.equal(infer(documents).topics.length, 0);
});

test('sliding fragments of one short word and an explicit link cannot establish a topic', () => {
  const result = infer([
    doc('a', [section('RESERVED_STATE | 3191001 | Reserved state', '', ['document:b'])]),
    doc('b', [section('Room status becomes reserved after booking')]),
  ]);
  assert.equal(result.topics.length, 0);
  assert.equal(result.unclassified.length, 2);
});

test('a short shared word needs independent surrounding body context, which is exposed as evidence', () => {
  const a = 'Orbital analysis.';
  const b = 'Orbital protocol.';
  const connected = (result) =>
    result.topics.some(
      (topic) =>
        topic.members.some((member) => member.text === a) &&
        topic.members.some((member) => member.text === b)
    );
  assert.equal(connected(infer([doc('a', [section(a)]), doc('b', [section(b)])])), false);
  const documents = [
    doc('a', [
      { ...section('Adaptive radiation shielding protects transport vehicles.'), id: 'context' },
      section(a),
    ]),
    doc('b', [
      {
        ...section('Adaptive radiation shielding protects transport vehicles during winter.'),
        id: 'context',
      },
      section(b),
    ]),
  ];
  const result = infer(documents);
  assert.equal(connected(result), true);
  assert.ok(
    result.topics
      .flatMap((topic) => topic.evidence)
      .some((e) => e.contextFragments?.some((fragment) => fragment.includes('radiation shielding')))
  );
  documents[1].sections[0].text =
    'Unrelated orchard irrigation provides moisture for growing trees.';
  assert.equal(connected(infer(documents)), false);
});

test('extending a shared word with one character is not independent surrounding evidence', () => {
  const result = infer([doc('a', [section('Orbital a')]), doc('b', [section('Orbital b')])]);
  assert.equal(result.topics.length, 0);
});

test('fixed templates with conflicting substantive slots are rejected without a provider or word list', () => {
  const prefix = 'deploy command target ';
  const suffix = ' service profile ';
  const finish = ' mode repeat console output';
  const result = infer([
    doc('a', [section(prefix + 'aurora' + suffix + 'primary' + finish)]),
    doc('b', [section(prefix + 'borealis' + suffix + 'replica' + finish)]),
  ]);
  assert.equal(result.topics.length, 0);
  const compatible = infer([
    doc('a', [section(prefix + 'aurora' + suffix + 'primary' + finish + ' version1')]),
    doc('b', [section(prefix + 'aurora' + suffix + 'primary' + finish + ' version2')]),
  ]);
  assert.ok(compatible.topics.length > 0);
});

test('names use common body evidence rather than an unrelated heading or private task', () => {
  const documents = [
    doc('a', [
      section(
        'Helios rotor pressure calibration uses an optical gauge. Private amber project.',
        'Private amber project'
      ),
    ]),
    doc('b', [
      section(
        'Helios rotor pressure calibration uses an optical gauge. Private violet project.',
        'Private violet project'
      ),
    ]),
  ];
  const result = infer(documents);
  assert.ok(result.topics.length);
  const { normalizeTopicText } = load('inferTopics');
  for (const topic of result.topics) {
    assert.ok(!topic.label.includes('amber') && !topic.label.includes('violet'));
    assert.ok(
      topic.members.every((member) =>
        (topic.nameFragments || [topic.label]).every((fragment) =>
          normalizeTopicText(member.text).includes(normalizeTopicText(fragment))
        )
      )
    );
  }
});

const namedTopic = (id, label, body, fragments) => {
  const members = ['amber', 'violet'].map((suffix) => ({
    id: `${id}:${suffix}`,
    heading: `Private ${suffix}`,
    text: `${body} ${suffix}`,
    searchText: normalizeTopicText(`${body} ${suffix}`),
    occurrences: [
      {
        documentId: `${id}:${suffix}`,
        contentId: `${id}:${suffix}`,
        title: 'Opaque',
        sectionId: 'body',
      },
    ],
  }));
  return {
    id,
    label,
    searchText: normalizeTopicText(label),
    members,
    documentCount: 2,
    kind: 'INFERRED',
    evidence: [
      { source: members[0].id, target: members[1].id, fragments, references: [], weight: 0.8 },
    ],
  };
};
const distinguish = (topics) => {
  const bodies = topics.flatMap((topic) => topic.members.map((member) => member.searchText));
  const steps = distinguishTopicNames(
    topics,
    normalizeTopicText,
    (_, key) => bodies.filter((body) => body.includes(key)).length
  );
  while (!steps.next().done) {
    /* Consume cooperative steps without changing the inference result. */
  }
  return topics;
};

test('duplicate generic names use distinct common body subjects without merging unrelated contents', () => {
  const topics = [
    namedTopic('rotor', 'Shared title', 'Shared title | Helios rotor pressure calibration', [
      'Shared title',
      'Helios rotor pressure calibration',
    ]),
    namedTopic('orchard', 'Shared title', 'Shared title | Orchard irrigation water supply', [
      'Shared title',
      'Orchard irrigation water supply',
    ]),
  ];
  const before = memberships({ topics });
  distinguish(topics);
  assert.equal(new Set(topics.map((topic) => normalizeTopicText(topic.label))).size, 2);
  assert.ok(topics[0].label.includes('Helios'));
  assert.ok(topics[1].label.includes('Orchard'));
  assert.ok(topics.every((topic) => !topic.example && !topic.label.includes('Private')));
  assert.deepEqual(memberships({ topics }), before);
});

test('names sharing a long clipped prefix retain meaningful distinct endings', () => {
  const prefix =
    'Routine measurements are recorded consistently for every observation in the laboratory. ';
  const phrases = ['Helios rotor pressure calibration', 'Orchard irrigation water supply'].map(
    (subject) => prefix + subject
  );
  const original = Array.from(prefix).slice(0, 72).join('');
  const topics = phrases.map((phrase, index) =>
    namedTopic(String(index), original, phrase, [phrase])
  );
  distinguish(topics);
  assert.notEqual(normalizeTopicText(topics[0].label), normalizeTopicText(topics[1].label));
  assert.ok(topics[0].label.includes('Helios'));
  assert.ok(topics[1].label.includes('Orchard'));
  assert.ok(
    topics.every((topic) =>
      topic.nameFragments.every((phrase) =>
        topic.members.every((member) => member.searchText.includes(normalizeTopicText(phrase)))
      )
    )
  );
});

test('two corroborating common phrases distinguish an otherwise ambiguous name', () => {
  const topics = [
    namedTopic('a', 'Shared title', 'Shared title Rotorflux Amberbay', [
      'Shared title',
      'Rotorflux',
      'Amberbay',
    ]),
    namedTopic('b', 'Shared title', 'Shared title Rotorflux Violetbay', [
      'Shared title',
      'Rotorflux',
      'Violetbay',
    ]),
    namedTopic('c', 'Shared title', 'Shared title Otherflux Amberbay', [
      'Shared title',
      'Otherflux',
      'Amberbay',
    ]),
  ];
  distinguish(topics);
  assert.equal(topics[0].nameFragments.length, 2);
  assert.ok(topics[0].label.includes('Rotorflux') && topics[0].label.includes('Amberbay'));
  assert.ok(
    topics.every((topic) =>
      topic.nameFragments.every((phrase) =>
        topic.members.every((member) => member.searchText.includes(normalizeTopicText(phrase)))
      )
    )
  );
});

test('unresolved names expose different grounded examples without claiming a private task for all members', () => {
  const topics = ['Mondayrotor Tuesdaychamber', 'Wednesdaygarden Thursdayorchard'].map(
    (body, index) =>
      namedTopic(String(index), 'Commonbridge', `Commonbridge ${body}`, ['Commonbridge'])
  );
  const raw = distinguish(topics);
  assert.ok(
    raw.every((topic) => topic.label === 'Commonbridge' && topic.nameFragments.length === 1)
  );
  assert.ok(
    raw.every(
      (topic) =>
        topic.example &&
        topic.members.some(
          (member) =>
            member.id === topic.example.memberId &&
            member.searchText.includes(normalizeTopicText(topic.example.text))
        )
    )
  );
  assert.notEqual(raw[0].example.text, raw[1].example.text);
  const snapshot = JSON.stringify(raw);
  const preferences = emptyTopicPreferences();
  preferences.labels[raw[0].id] = 'My chosen name';
  preferences.excluded[raw[0].id] = [raw[0].example.memberId];
  const result = curateTopics(
    {
      topics: raw,
      unclassified: [],
      documentCount: 4,
      distinctContentCount: 4,
      sectionCount: 4,
      comparedPairCount: 2,
    },
    preferences
  );
  assert.equal(result.topics[0].label, 'My chosen name');
  assert.equal(result.topics[0].nameFragments, undefined);
  assert.equal(result.topics[0].example, undefined);
  assert.equal(JSON.stringify(raw), snapshot);
});

test('duplicate naming is stable across order and opaque source changes for every character system', () => {
  const prepare = () => [
    namedTopic('a', 'Shared title', 'Shared title Rotorflux Amberbay', [
      'Shared title',
      'Rotorflux',
      'Amberbay',
    ]),
    namedTopic('b', 'Shared title', 'Shared title Rotorflux Violetbay', [
      'Shared title',
      'Rotorflux',
      'Violetbay',
    ]),
    namedTopic('c', 'Shared title', 'Shared title Otherflux Amberbay', [
      'Shared title',
      'Otherflux',
      'Amberbay',
    ]),
  ];
  const shape = (topics) =>
    topics.map((topic) => [topic.id, topic.label, topic.example?.text]).sort();
  const before = shape(distinguish(prepare()));
  const moved = prepare().reverse();
  moved.forEach((topic) =>
    topic.members.forEach((member) => {
      member.heading = 'Different';
      member.occurrences[0].title = 'Moved';
    })
  );
  assert.deepEqual(shape(distinguish(moved)), before);
  for (const base of [0x4e00, 0xac00, 0x10000]) {
    const encode = (text) =>
      Array.from(normalizeTopicText(text))
        .map((character) => String.fromCodePoint(base + character.charCodeAt(0)))
        .join('');
    const topics = prepare().map((topic) => ({
      ...topic,
      label: encode(topic.label),
      searchText: encode(topic.label),
      members: topic.members.map((member) => ({
        ...member,
        text: encode(member.text),
        searchText: encode(member.text),
      })),
      evidence: topic.evidence.map((evidence) => ({
        ...evidence,
        fragments: evidence.fragments.map(encode),
      })),
    }));
    distinguish(topics);
    assert.equal(new Set(topics.map((topic) => topic.label)).size, topics.length);
    assert.ok(
      topics.every((topic) =>
        topic.nameFragments.every((phrase) =>
          topic.members.every((member) => member.searchText.includes(normalizeTopicText(phrase)))
        )
      )
    );
  }
});

test('already-supported disjoint cliques with the same core merge only after every new pair is verified', () => {
  const common =
    'Helios rotor pressure calibration uses an optical gauge to record measurements during every laboratory observation. ';
  const documents = [
    'Copper chamber adjustments remain aligned.',
    'Silver chamber adjustments remain aligned.',
  ].flatMap((context, group) =>
    Array.from({ length: 6 }, (_, index) =>
      doc(`${group}:${index}`, [section(`${common}${context} shade${index}`)])
    )
  );
  const result = infer(documents.concat(unrelatedDocuments(200)));
  assert.equal(result.topics.length, 1);
  assert.equal(result.topics[0].members.length, 12);
  assert.equal(result.topics[0].evidence.length, 11);
  assert.ok(result.comparedPairCount <= result.sectionCount * 5);
  assert.deepEqual(
    memberships(infer(documents.slice().reverse().concat(unrelatedDocuments(200)))),
    memberships(result)
  );
});

test('a shared clipped name cannot merge cliques with conflicting substantive subjects', () => {
  const common =
    'Helios rotor pressure calibration uses an optical gauge to record measurements during every laboratory observation. ';
  const documents = [
    'Copper chamber adjustments remain aligned.',
    'Silver chamber adjustments remain balanced.',
  ].flatMap((context, group) =>
    Array.from({ length: 6 }, (_, index) =>
      doc(`${group}:${index}`, [section(`${common}${context} shade${index}`)])
    )
  );
  const result = infer(documents.concat(unrelatedDocuments(200)));
  assert.equal(result.topics.length, 2);
  assert.ok(result.topics.every((topic) => topic.members.length === 6));
  assert.equal(new Set(result.topics.map((topic) => topic.label)).size, 2);
  assert.ok(
    result.topics.every(
      (topic) =>
        new Set(
          topic.members.flatMap((member) =>
            member.occurrences.map((origin) => origin.documentId.split(':')[0])
          )
        ).size === 1
    )
  );
});

test('duplicate names cannot promote weak disjoint leads into a notebook topic', () => {
  const documents = ['copper', 'silver']
    .map((name) =>
      doc(
        name,
        ['amber', 'violet'].map((group) => section(`abcdefghijklmnop ${group} ${name}`))
      )
    )
    .concat(unrelatedDocuments(200));
  const result = infer(documents);
  assert.equal(result.topics.length, 0);
  assert.equal(result.unclassified.length, 204);
});

test('large repeated-name buckets keep original excerpts and cooperate with cancellation', async () => {
  const topics = Array.from({ length: 180 }, (_, index) =>
    namedTopic(
      `subject:${index}`,
      'Commonbridge',
      `Commonbridge ${String.fromCodePoint(0x5000 + index).repeat(24)}`,
      ['Commonbridge']
    )
  );
  let frequencies = 0;
  const steps = distinguishTopicNames(topics, normalizeTopicText, () => {
    frequencies++;
    return topics.length;
  });
  let slices = 0;
  await runTopicTask(steps, {
    budgetMs: 0,
    onSlice: () => slices++,
  });
  assert.ok(slices > topics.length);
  assert.ok(frequencies <= topics.length * 48);
  assert.equal(
    new Set(topics.map((topic) => normalizeTopicText(topic.label + (topic.example?.text || ''))))
      .size,
    topics.length
  );
  assert.ok(
    topics.every(
      (topic) =>
        topic.example &&
        topic.members.some(
          (member) =>
            member.id === topic.example.memberId &&
            member.searchText.includes(normalizeTopicText(topic.example.text))
        )
    )
  );
  const controller = new AbortController();
  const cancelled = runTopicTask(
    distinguishTopicNames(topics, normalizeTopicText, () => topics.length),
    {
      signal: controller.signal,
      budgetMs: 0,
    }
  );
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
});

test('compatible overlapping drafts consolidate, retaining every original location and stable unique IDs', () => {
  const documents = ['amber', 'violet', 'indigo', 'scarlet'].map((name) =>
    doc(name, [
      section(
        'Helios rotor pressure calibration uses an optical gauge for the workshop. Checked ' + name
      ),
    ])
  );
  const result = infer(documents);
  assert.equal(result.topics.length, 1);
  assert.equal(result.topics[0].members.length, 4);
  assert.equal(result.topics[0].documentCount, 4);
  assert.equal(new Set(result.topics.map((topic) => topic.id)).size, result.topics.length);
  assert.deepEqual(infer(documents.slice().reverse()), result);
  const copied = infer(
    documents.concat(documents.map((document) => ({ ...document, id: 'copy-' + document.id })))
  );
  assert.deepEqual(
    copied.topics.map((topic) => topic.id),
    result.topics.map((topic) => topic.id)
  );
  assert.equal(copied.topics[0].members.flatMap((member) => member.occurrences).length, 8);
});

test('two real body cores can overlap without a generic command taking over the specific topic', () => {
  const documents = [
    doc('a', [section('enginectl restart helios.service')]),
    doc('b', [section('enginectl start helios.service')]),
    doc('c', [section('enginectl enable helios.service')]),
    doc('d', [section('enginectl restart violet.service')]),
  ];
  const result = infer(documents);
  assert.ok(
    result.topics.some((topic) => topic.label.includes('helios') && topic.members.length === 3)
  );
  assert.ok(
    result.topics
      .filter((topic) => topic.label.includes('helios'))
      .every((topic) => topic.members.every((member) => member.text.includes('helios')))
  );
  assert.equal(new Set(result.topics.map((topic) => topic.id)).size, result.topics.length);
});

const unrelatedDocuments = (count) =>
  Array.from({ length: count }, (_, index) =>
    doc(`noise-${index}`, [section(String.fromCodePoint(0x5000 + index).repeat(48))])
  );

test('isolated short matches in a large corpus stay searchable without blocking small notebooks', () => {
  const pair = [
    doc('a', [section('abcdefghijklmnop amber')]),
    doc('b', [section('abcdefghijklmnop violet')]),
  ];
  assert.equal(infer(pair).topics.length, 1);
  const documents = pair.concat(unrelatedDocuments(200));
  const result = infer(documents);
  assert.equal(result.topics.length, 0);
  assert.equal(result.unclassified.length, documents.length);
  assert.ok(result.unclassified.some((member) => member.text === pair[0].sections[0].text));
  assert.ok(result.unclassified.every((member) => member.occurrences.length));
});

test('strong detailed two-content evidence and specific three-content corroboration survive in large corpora', () => {
  const documents = unrelatedDocuments(200).concat([
    doc('strong-a', [
      section('Persistent rotor calibration measurements use an optical gauge. Checked amber.'),
    ]),
    doc('strong-b', [
      section('Persistent rotor calibration measurements use an optical gauge. Checked violet.'),
    ]),
    ...['amber', 'violet', 'indigo'].map((name) =>
      doc(name, [section(`Orion ${name} calibration`)])
    ),
  ]);
  const result = infer(documents);
  assert.ok(
    result.topics.some((topic) => topic.documentCount === 2 && topic.label.includes('rotor'))
  );
  assert.ok(
    result.topics.some(
      (topic) =>
        topic.documentCount === 3 && topic.members.every((member) => member.text.includes('Orion'))
    )
  );
});

test('a widely reused name cannot promote small context-free facets', () => {
  const name = 'Universalcore';
  const documents = unrelatedDocuments(200).concat([
    ...['amber', 'violet', 'indigo', 'scarlet'].map((suffix) =>
      doc(suffix, [section(`${name} ${suffix}`)])
    ),
    ...Array.from({ length: 24 }, (_, index) =>
      doc(`other-${index}`, [section(`${name} ${String.fromCodePoint(0x7000 + index).repeat(80)}`)])
    ),
  ]);
  const result = infer(documents);
  assert.equal(result.topics.length, 0);
  assert.equal(result.unclassified.length, documents.length);
});

test('one coherent subject larger than the candidate neighborhood consolidates with verified evidence', () => {
  const documents = Array.from({ length: 12 }, (_, index) =>
    doc(`subject-${index}`, [
      section(
        `Helios rotor pressure calibration uses an optical gauge for the workshop. Checked shade${index}`
      ),
    ])
  ).concat(unrelatedDocuments(200));
  const result = infer(documents);
  assert.equal(result.topics.length, 1);
  assert.equal(result.topics[0].members.length, 12);
  assert.equal(result.topics[0].evidence.length, 11);
  assert.ok(result.topics[0].evidence.every((item) => item.fragments.length));
  assert.ok(result.comparedPairCount <= result.sectionCount * 5);
  assert.deepEqual(infer(documents.slice().reverse()), result);
});

test('consolidation cannot manufacture independent evidence between sections of the same content', () => {
  const common =
    'Helios rotor pressure calibration uses an optical gauge for the workshop. Checked ';
  const documents = [
    doc(
      'catalog',
      ['amber', 'violet', 'indigo', 'scarlet'].map((name, index) => ({
        ...section(common + name),
        id: String(index),
      }))
    ),
    ...['copper', 'silver', 'golden', 'bronze'].map((name) => doc(name, [section(common + name)])),
    ...unrelatedDocuments(200),
  ];
  const result = infer(documents);
  assert.ok(result.topics.length);
  assert.ok(
    result.topics.every(
      (topic) =>
        topic.members.filter((member) =>
          member.occurrences.some((origin) => origin.documentId === 'catalog')
        ).length <= 1
    )
  );
});

test('independent well-supported subjects are not truncated to a fixed topic count', () => {
  const documents = Array.from({ length: 40 }, (_, index) => {
    const body = Array.from({ length: 48 }, (_, offset) =>
      String.fromCodePoint(0x4e00 + index * 64 + offset)
    ).join('');
    return [
      doc(`a-${index}`, [section(body + String.fromCodePoint(0x9000 + index * 2))]),
      doc(`b-${index}`, [section(body + String.fromCodePoint(0x9001 + index * 2))]),
    ];
  }).flat();
  const result = infer(documents);
  assert.equal(result.topics.length, 40);
  assert.equal(new Set(result.topics.map((topic) => topic.id)).size, 40);
  assert.equal(result.unclassified.length, 0);
});

test('changed body is detected even if timestamps and lengths are unchanged', () => {
  const documents = fixture();
  const before = infer(documents);
  documents[0].sections[0].text = 'x'.repeat(documents[0].sections[0].text.length);
  const after = infer(documents);
  assert.notDeepEqual(memberships(after), memberships(before));
});

test('removed documents and their evidence disappear on the next analysis', () => {
  const documents = fixture();
  const result = infer(documents.slice(1));
  assert.ok(
    result.topics.every((topic) =>
      topic.members.every((member) => member.occurrences.every((o) => o.documentId !== 'a'))
    )
  );
});

test('rename, exclusion, split and merge apply without mutating raw results', () => {
  const raw = infer(fixture());
  const original = JSON.stringify(raw);
  const preferences = emptyTopicPreferences();
  preferences.labels[raw.topics[0].id] = 'My topic';
  preferences.excluded[raw.topics[0].id] = [raw.topics[0].members[0].id];
  preferences.collections = [
    { id: 'collection:split', label: 'Split', memberIds: [raw.topics[0].members[0].id] },
  ];
  let result = curateTopics(raw, preferences);
  assert.equal(result.topics[0].label, 'My topic');
  assert.equal(result.topics[0].searchText, 'mytopic');
  assert.ok(!result.topics[0].members.some((member) => member.id === raw.topics[0].members[0].id));
  assert.equal(result.topics.find((topic) => topic.id === 'collection:split').kind, 'CURATED');
  assert.equal(result.topics.find((topic) => topic.id === 'collection:split').searchText, 'split');
  preferences.hidden = raw.topics.map((topic) => topic.id);
  preferences.collections = [
    {
      id: 'collection:merged',
      label: 'Merged',
      memberIds: raw.topics.flatMap((topic) => topic.members.map((member) => member.id)),
    },
  ];
  result = curateTopics(raw, preferences);
  assert.equal(result.topics.length, 1);
  assert.equal(JSON.stringify(raw), original);
});

test('asynchronous analysis yields to other tasks and agrees with synchronous analysis', async () => {
  let heartbeat = false;
  setTimeout(() => {
    heartbeat = true;
  }, 0);
  let slices = 0;
  const result = await runTopicTask(inferTopicsSteps(fixture()), {
    budgetMs: 0,
    onSlice: () => slices++,
  });
  assert.equal(heartbeat, true);
  assert.ok(slices > 10);
  assert.deepEqual(result, infer(fixture()));
});

test('cancellation stops inference before it can publish results in another screen or notebook', async () => {
  const controller = new AbortController();
  let visited = 0;
  function* steps() {
    for (let i = 0; i < 10000; i++) {
      visited++;
      yield;
    }
    return 'stale';
  }
  const pending = runTopicTask(steps(), { signal: controller.signal, budgetMs: 0 });
  setTimeout(() => controller.abort(), 1);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(visited < 10000);
});

test('large notebooks use a bounded candidate index rather than all document pairs', () => {
  const documents = Array.from({ length: 1200 }, (_, i) =>
    doc(String(i), [
      section(
        Array.from({ length: 16 }, (_, k) =>
          String.fromCodePoint(0x4e00 + Math.floor(i / 2) * 20 + k)
        ).join('') + String.fromCodePoint(0x7000 + i)
      ),
    ])
  );
  documents.push(
    doc('strong-a', [
      section('Persistent rotor calibration measurements use an optical gauge. Checked amber.'),
    ]),
    doc('strong-b', [
      section('Persistent rotor calibration measurements use an optical gauge. Checked violet.'),
    ])
  );
  const result = infer(documents);
  assert.ok(result.comparedPairCount <= result.sectionCount * 5);
  assert.equal(result.topics.length, 1);
  assert.equal(result.unclassified.length, 1200);
});

test('topic preferences remain isolated by account, mode and notebook, with malformed storage ignored', () => {
  const scopes = [
    topicPreferenceScope(true, 1, 'NOTE', 1),
    topicPreferenceScope(false, 1, 'NOTE', 1),
    topicPreferenceScope(false, 2, 'NOTE', 1),
    topicPreferenceScope(false, 1, 'BOARD', 1),
    topicPreferenceScope(false, 1, 'NOTE', 2),
  ];
  assert.equal(new Set(scopes).size, scopes.length);
  for (const invalid of [null, '', 'broken', 'null'])
    assert.deepEqual(parseTopicPreferences(invalid), emptyTopicPreferences());
  const parsed = parseTopicPreferences(
    JSON.stringify({
      labels: { a: 'Named', b: 3 },
      excluded: { a: ['x', 1], b: null },
      hidden: ['a', 2],
      collections: [{ id: 'c', label: 'Collection', memberIds: ['x', null] }, null],
    })
  );
  assert.deepEqual(parsed, {
    labels: { a: 'Named' },
    excluded: { a: ['x'] },
    hidden: ['a'],
    collections: [{ id: 'c', label: 'Collection', memberIds: ['x'] }],
  });
});

test('embedded HTML is decoded as a stream across Markdown paragraphs and literal code stays escaped', () => {
  const { topicHtml } = load('topicText', { '@blacktokki/editor': { toRaw: (value) => value } });
  const html =
    '<p>&lt;table&gt;&lt;tr&gt;&lt;td&gt;First</p><p>second&lt;/td&gt;&lt;td&gt;&lt;a href=&quot;https://example.test/?a=1&amp;amp;b=2&quot;&gt;Link&lt;/a&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</p>';
  const decoded = topicHtml(html);
  assert.ok(decoded.includes('<table>'));
  assert.ok(decoded.includes('<a href="https://example.test/?a=1&amp;b=2">'));
  assert.ok(!decoded.includes('&lt;td'));
  const code = '<pre><code>&lt;table&gt;literal code&lt;/table&gt;</code></pre>';
  assert.equal(topicHtml(code), code);
  assert.equal(
    topicHtml('<p>Plain prose with no markup.</p>'),
    '<p>Plain prose with no markup.</p>'
  );
});

test('table boundaries remain inside cells and script/style content does not enter inference', () => {
  const { topicPlainText } = load('topicText', {
    '@blacktokki/editor': { toRaw: (value) => value.replace(/<[^>]*>/g, '') },
  });
  const text = topicPlainText(
    '<table><tr><td><p>Left</p></td><td>Right</td></tr><tr><td>Next</td><td>Value</td></tr></table><script>never match this</script><style>style noise</style>'
  );
  assert.equal(text, 'Left  | Right\n\nNext | Value');
  assert.ok(!text.includes('<'));
});

test('word and cell boundaries cannot invent shared name-template-ID fragments', () => {
  const documents = Array.from({ length: 20 }, (_, i) =>
    doc(String(i), [section(`Person${i} Tasks | AT-${3300 + i}`)])
  );
  const result = infer(documents);
  assert.ok(
    result.topics.every((topic) =>
      topic.evidence.every(
        (evidence) => !evidence.fragments.some((fragment) => fragment.includes('asksat'))
      )
    )
  );
});

test('HTML extraction handles all headings, missing headings, link-only blocks and exact source caches', () => {
  const originalParser = global.DOMParser;
  let parsed = 0;
  const mocks = {
    '@blacktokki/editor': {
      toRaw: (html) =>
        html
          .replace(/<div class="yaml-frontmatter"[^>]*>[\s\S]*?<\/div>/gi, '')
          .replace(/<[^>]*>/g, ''),
      extractHtmlLinks: (html) =>
        [...html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map((match) => ({
          rawUrl: match[1],
          url: match[1],
          text: match[2],
        })),
    },
    '../../components/HeaderSelectBar': {
      parseHtmlToParagraphs: () => {
        parsed++;
        return [
          {
            path: '',
            title: '',
            description: '<div class="yaml-frontmatter">opaque</div><a href="target">parent</a>',
            level: 0,
          },
          ...Array.from({ length: 6 }, (_, i) => ({
            path: `h${i}`,
            title: `Heading ${i + 1}`,
            description:
              '<p>Solar battery charging stores energy. The <a href="target">controller</a> protects the battery.</p><a href="target">More details</a>',
            level: i + 1,
          })),
        ];
      },
    },
    '../../components/SearchBar': { urlToNoteLink: () => ({ title: 'Target' }) },
  };
  const { extractTopicDocumentsSteps } = load('extractTopicDocuments', mocks);
  const complete = (steps) => {
    let next;
    do {
      next = steps.next();
    } while (!next.done);
    return next.value;
  };
  const notes = [
    { id: 1, title: 'Source', description: '<h1>Body</h1>' },
    { id: 2, title: 'Target', description: '' },
  ];
  const cache = new Map();
  try {
    global.DOMParser = function Parser() {};
    const first = complete(extractTopicDocumentsSteps(notes, cache));
    assert.equal(first[0].sections.length, 6);
    assert.ok(first[0].sections.every((item) => item.references.includes('document:2')));
    const before = parsed;
    const repeated = complete(extractTopicDocumentsSteps(notes, cache));
    assert.equal(parsed, before);
    assert.equal(repeated[0], first[0]);
    notes[0].description = '<h1>Else</h1>';
    complete(extractTopicDocumentsSteps(notes, cache));
    assert.equal(parsed, before + 1);
    notes[1].id = 3;
    const renamed = complete(extractTopicDocumentsSteps(notes, cache));
    assert.ok(renamed[0].sections.every((item) => item.references.includes('document:3')));
    complete(extractTopicDocumentsSteps(notes.slice(0, 1), cache));
    assert.equal(cache.has('2'), false);
    assert.equal(cache.has('3'), false);
    delete global.DOMParser;
    const plain = complete(
      extractTopicDocumentsSteps(
        [
          {
            id: 4,
            title: 'Flat',
            description: 'Battery storage without headings.\n\nAnother block without metadata.',
          },
        ],
        new Map()
      )
    );
    assert.equal(plain[0].sections.length, 2);
    assert.ok(plain[0].sections.every((item) => item.heading === ''));
  } finally {
    if (originalParser === undefined) delete global.DOMParser;
    else global.DOMParser = originalParser;
  }
});

test('duplicate HTML reuses parsing while relative references retain their base and stay inside their chunk', () => {
  const originalParser = global.DOMParser;
  let parsed = 0;
  const mocks = {
    '@blacktokki/editor': {
      toRaw: (html) => html.replace(/<[^>]*>/g, ''),
      extractHtmlLinks: (html) =>
        [...html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map((match) => ({
          rawUrl: match[1],
          url: match[1],
          text: match[2],
        })),
    },
    '../../components/HeaderSelectBar': {
      parseHtmlToParagraphs: (description) => {
        parsed++;
        return [{ path: '', title: '', description, level: 0 }];
      },
    },
    '../../components/SearchBar': {
      urlToNoteLink: (url, base) => ({
        title: base.split('/')[0] + '/' + url.replace(/\.md$/, ''),
      }),
    },
  };
  const { extractTopicDocumentsSteps } = load('extractTopicDocuments', mocks);
  const html =
    '<p>' +
    'α'.repeat(600) +
    '<a href="Target.md">controller</a> independent routing evidence continues.</p>';
  const notes = [
    { id: 1, title: 'one/Source', description: html },
    { id: 2, title: 'two/Source', description: html },
    { id: 10, title: 'one/Target', description: '' },
    { id: 11, title: 'two/Target', description: '' },
  ];
  try {
    global.DOMParser = function Parser() {};
    const steps = extractTopicDocumentsSteps(notes, new Map());
    let next;
    do {
      next = steps.next();
    } while (!next.done);
    assert.equal(parsed, 2);
    const [one, two] = next.value;
    assert.equal(one.sections.length, 2);
    assert.equal(two.sections.length, 2);
    assert.deepEqual(one.sections[0].references, []);
    assert.deepEqual(two.sections[0].references, []);
    assert.deepEqual(one.sections[1].references, ['document:10']);
    assert.deepEqual(two.sections[1].references, ['document:11']);
  } finally {
    if (originalParser === undefined) delete global.DOMParser;
    else global.DOMParser = originalParser;
  }
});

test('the data hook cancels inactive scopes, hides private results immediately and reuses unchanged analysis', async () => {
  const cells = [];
  let cursor = 0;
  let effects = [];
  const tasks = [];
  const storage = new Map();
  const queries = new Map();
  const context = {
    local: true,
    user: 1,
    notebook: 1,
    private: true,
    contents: [
      { id: 1, title: 'Visible' },
      { id: 2, title: '.Private' },
    ],
  };
  const dependenciesEqual = (a, b) =>
    a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!cells[i]) cells[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        cells[i].value,
        (value) => {
          cells[i].value = typeof value === 'function' ? value(cells[i].value) : value;
        },
      ];
    },
    useMemo(compute, dependencies) {
      const i = cursor++;
      if (!dependenciesEqual(cells[i]?.dependencies, dependencies))
        cells[i] = { dependencies, value: compute() };
      return cells[i].value;
    },
    useEffect(callback, dependencies) {
      const i = cursor++;
      if (!dependenciesEqual(cells[i]?.dependencies, dependencies))
        effects.push(() => {
          cells[i]?.cleanup?.();
          cells[i] = { dependencies, cleanup: callback() };
        });
    },
  };
  const mocks = {
    react: hooks,
    '@blacktokki/account': {
      useAuthContext: () => ({ auth: { isLocal: context.local, user: { id: context.user } } }),
    },
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: {
        getItem: async (key) => storage.get(key) || null,
        setItem: async (key, value) => storage.set(key, value),
      },
    },
    'react-query': {
      useQuery: ({ queryKey }) => ({
        data: queries.get(JSON.stringify(queryKey)) || emptyTopicPreferences(),
        isLoading: false,
      }),
      useQueryClient: () => ({
        setQueryData: (key, value) => queries.set(JSON.stringify(key), value),
      }),
      useMutation: (options) => options,
    },
    '../../hooks/useNoteStorage': {
      useNotePages: () => ({ data: context.contents, isLoading: false }),
    },
    '../../hooks/usePrivate': {
      usePrivate: () => ({ data: { enabled: context.private } }),
      isHiddenTitle: (title) => title.startsWith('.'),
    },
    '../../hooks/useUsageMode': {
      useUsageMode: () => ({ usageMode: 'NOTE', notebook: { id: context.notebook } }),
    },
    './extractTopicDocuments': {
      extractTopicDocumentsSteps: (contents) => ({ kind: 'extract', contents }),
    },
    './inferTopics': {
      inferTopicsSteps: (documents) => ({ kind: 'infer', documents }),
      curateTopics,
      emptyTopicPreferences,
    },
    './runTopicTask': {
      runTopicTask: (steps, { signal }) =>
        new Promise((resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
          signal.addEventListener('abort', abort, { once: true });
          tasks.push({
            steps,
            signal,
            resolve: (value) => {
              signal.removeEventListener('abort', abort);
              resolve(value);
            },
          });
        }),
    },
  };
  const { useTopicInference } = load('useTopicInference', mocks);
  const render = (enabled = true) => {
    cursor = 0;
    effects = [];
    return useTopicInference(enabled);
  };
  const flush = () => {
    effects.forEach((effect) => effect());
    effects = [];
  };
  const settle = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  render(false);
  flush();
  assert.equal(tasks.length, 0);
  let value = render();
  flush();
  const first = tasks[0];
  assert.equal(first.steps.contents.length, 2);
  context.notebook = 2;
  value = render();
  assert.equal(value.documentCount, 0);
  flush();
  await settle();
  assert.equal(first.signal.aborted, true);
  const documents = [doc('safe', [section('Visible current notebook content')])];
  tasks[1].resolve(documents);
  await settle();
  const result = {
    topics: [],
    unclassified: [],
    documentCount: 1,
    distinctContentCount: 1,
    sectionCount: 1,
    comparedPairCount: 0,
  };
  tasks[2].resolve(result);
  await settle();
  value = render();
  flush();
  assert.equal(value.documentCount, 1);
  value = render(false);
  flush();
  value = render();
  flush();
  const count = tasks.length;
  tasks.at(-1).resolve(documents);
  await settle();
  assert.equal(tasks.length, count, 'no inference is scheduled for unchanged extracted documents');
  value = render();
  flush();
  assert.equal(value.documentCount, 1);
  context.private = false;
  value = render();
  assert.equal(value.documentCount, 0, 'private results vanish before the new effect executes');
  flush();
  assert.equal(tasks.at(-1).steps.contents.length, 1);
  const oldScope = value.scope;
  const mutation = value.updatePreferences;
  context.notebook = 3;
  render();
  flush();
  assert.equal(tasks.at(-2).signal.aborted, true);
  const saved = await mutation.mutationFn((current) => ({
    ...current,
    labels: { x: 'Saved in previous notebook' },
  }));
  mutation.onSuccess(saved);
  assert.equal(saved.scope, oldScope);
  assert.ok(storage.has(`@blacktokki:notebook:topics:${oldScope}`));
  assert.equal(
    queries.get(JSON.stringify(['topicPreferences', oldScope])).labels.x,
    'Saved in previous notebook'
  );
  render(false);
  flush();
  await settle();
  assert.equal(tasks.at(-1).signal.aborted, true);
});

test('identified and unclassified screens display readable content and preserve original navigation', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { topicHtml, topicPlainText } = load('topicText', {
    '@blacktokki/editor': { toRaw: (value) => value.replace(/<[^>]*>/g, '') },
  });
  const member = {
    id: 'content:1',
    heading: 'Charging',
    text: topicPlainText(
      topicHtml(
        '<p>&lt;table&gt;&lt;tr&gt;&lt;td&gt;Battery&lt;/td&gt;&lt;td&gt;Controller&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</p>'
      )
    ),
    occurrences: [
      {
        documentId: '1',
        contentId: 'one',
        title: 'Original',
        paragraph: 'Charging',
        sectionId: 'p1',
      },
    ],
  };
  const topic = {
    id: 'topic:1',
    label: 'Solar',
    example: { memberId: member.id, text: 'Battery | Controller' },
    members: [member],
    documentCount: 2,
    kind: 'INFERRED',
    evidence: [
      {
        source: member.id,
        target: 'content:2',
        fragments: ['Battery'],
        contextFragments: ['Charging circuit protects the controller'],
        references: [],
        weight: 0.4,
      },
    ],
  };
  const data = {
    topics: [topic],
    unclassified: [member],
    scope: 'local',
    isLoading: false,
    isRefreshing: false,
    documentCount: 2,
    distinctContentCount: 2,
    updatePreferences: { isLoading: false, mutate: () => {} },
  };
  let selected, unclassified, hookIndex;
  const presses = [];
  const navigation = [];
  const wrapper =
    (tag) =>
    ({ children }) =>
      React.createElement(tag, null, children);
  const mocks = {
    react: {
      ...React,
      __esModule: true,
      default: React,
      useState: (initial) => {
        const index = hookIndex++;
        return [index === 1 ? selected : index === 6 ? unclassified : initial, () => {}];
      },
    },
    '@blacktokki/core': { Text: wrapper('span'), useLangContext: () => ({ lang: (text) => text }) },
    '@react-navigation/native': {
      useIsFocused: () => true,
      useNavigation: () => ({ push: (...params) => navigation.push(params) }),
    },
    'react-native': {
      View: wrapper('div'),
      TextInput: () => null,
      StyleSheet: { create: (styles) => styles },
      TouchableOpacity: ({ onPress, children }) => {
        presses.push(onPress);
        return React.createElement('button', null, children);
      },
      FlatList: ({ data: items, renderItem, initialNumToRender }) =>
        React.createElement(
          'section',
          null,
          items
            .slice(0, initialNumToRender)
            .map((item) =>
              React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))
            )
        ),
    },
    'react-native-paper': { Button: wrapper('button'), Checkbox: () => null },
    './useTopicInference': { useTopicInference: () => data },
    '../../components/LoadingView': { __esModule: true, default: () => null },
    '../../components/SearchBar': {
      ResponsiveSearchBar: () => null,
      toNoteParams: (title, paragraph, section) => ({ title, paragraph, section }),
    },
    '../../components/UsageButton': { __esModule: true, default: () => null },
    '../../hooks/useExtension': { useEffectExtensionScreen: () => ({ isActive: true }) },
    '../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: {} }) },
  };
  const { TopicInferenceScreens } = load('TopicInferenceScreens', mocks);
  for (const classified of [true, false]) {
    selected = classified ? topic.id : null;
    unclassified = !classified;
    hookIndex = 0;
    presses.length = 0;
    const markup = renderToStaticMarkup(React.createElement(TopicInferenceScreens));
    assert.ok(markup.includes('Battery | Controller'));
    assert.ok(!markup.includes('&lt;table'));
    assert.ok(markup.includes('Original'));
    if (classified) {
      assert.ok(markup.includes('Content example'));
      assert.ok(markup.includes('Matching surrounding content'));
      assert.ok(markup.includes('Charging circuit protects the controller'));
    }
    presses[0]();
    assert.deepEqual(navigation.at(-1), [
      'NotePage',
      { title: 'Original', paragraph: 'Charging', section: undefined },
    ]);
  }
  selected = null;
  unclassified = false;
  hookIndex = 0;
  const listing = renderToStaticMarkup(React.createElement(TopicInferenceScreens));
  assert.ok(listing.includes('Content example') && listing.includes('Battery | Controller'));
});

test('without a DOM the real editor fallback retains readable code and paragraph boundaries', () => {
  const filename = path.resolve(
    __dirname,
    '../../../../../../packages/blacktokki-editor/src/lib/dom.ts'
  );
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = module.paths;
  instance._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );
  const mocks = {
    '@blacktokki/editor': instance.exports,
    '../../components/HeaderSelectBar': {},
    '../../components/SearchBar': {},
  };
  const { extractTopicDocumentsSteps } = load('extractTopicDocuments', mocks);
  const steps = extractTopicDocumentsSteps(
    [
      {
        id: 1,
        title: 'Native',
        description:
          '<p>Battery &amp; solar controller.</p><p>Another paragraph.</p><pre><code>&lt;table&gt;literal&lt;/table&gt;</code></pre>',
      },
    ],
    new Map()
  );
  let next;
  do {
    next = steps.next();
  } while (!next.done);
  assert.equal(next.value[0].sections.length, 3);
  assert.equal(next.value[0].sections[0].text, 'Battery & solar controller.');
  assert.equal(next.value[0].sections[2].text, '<table>literal</table>');
});
