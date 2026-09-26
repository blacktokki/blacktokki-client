const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const jsYaml = require('js-yaml');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-use-data-'));
const ontologyDirectory = path.join(__dirname, '..');
for (const name of [
  'frontmatter',
  'relations',
  'palette',
  'externalLinkClassification',
  'titleKeywordClasses',
  'axioms',
  'links',
  'paragraphClassification',
  'useOntologyData',
]) {
  const directory =
    name === 'useOntologyData' ? ontologyDirectory : path.join(ontologyDirectory, 'utils');
  const source = readFileSync(path.join(directory, `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputDirectory = name === 'useOntologyData' ? output : path.join(output, 'utils');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, `${name}.js`), compiled.outputText);
}

const state = {
  boardPages: [],
  notePages: [],
  problemData: [],
  usageMode: 'NOTE',
  notebook: null,
  htmlLinks: new Map(),
  noteLinkTargets: new Map(),
};
const originalLoad = Module._load;
Module._load = function loadOntologyTestDependency(request, parent, isMain) {
  if (request === '@blacktokki/core') {
    return { useLangContext: () => ({ lang: () => '' }) };
  }
  if (request === 'js-yaml') {
    return jsYaml;
  }
  if (request === '@blacktokki/editor') {
    return {
      extractHtmlLinks: (html) => state.htmlLinks.get(html) || [],
      toRaw: (html) => html.replace(/<[^>]*>/g, ' '),
    };
  }
  if (request === 'react') {
    return {
      useCallback: (callback) => callback,
      useMemo: (factory) => factory(),
    };
  }
  if (request.endsWith('/components/HeaderSelectBar')) {
    return {
      paragraphDescription: () => '',
      parseHtmlToParagraphs: (html) => {
        const paragraphs = [
          { title: '', level: 0, path: '', description: html, autoSection: undefined },
        ];
        const ancestors = [];
        for (const [index, match] of [
          ...html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi),
        ].entries()) {
          const level = Number(match[1]);
          while (ancestors.length > 0 && ancestors.at(-1).level >= level) ancestors.pop();
          const path = [ancestors.at(-1)?.path, `heading-${index}`].filter(Boolean).join(',');
          paragraphs.push({
            title: match[2].replace(/<[^>]*>/g, '').trim(),
            level,
            path,
            header: match[0],
            description: '',
            autoSection: /data-section=["']([^"']+)["']/i.exec(match[0])?.[1],
          });
          ancestors.push({ level, path });
        }
        return paragraphs;
      },
    };
  }
  if (request.endsWith('/components/SearchBar')) {
    return { urlToNoteLink: (url) => state.noteLinkTargets.get(url) };
  }
  if (request.endsWith('/hooks/useBoardStorage')) {
    return { useBoardPages: () => ({ data: state.boardPages, isLoading: false }) };
  }
  if (request.endsWith('/hooks/useNoteStorage')) {
    return { useNotePages: () => ({ data: state.notePages, isLoading: false }) };
  }
  if (request.endsWith('/hooks/useNotebookTheme')) {
    return { useNotebookTheme: () => ({ colorScheme: 'light' }) };
  }
  if (request.endsWith('/hooks/useUsageMode')) {
    return {
      useUsageMode: () => ({ usageMode: state.usageMode, notebook: state.notebook }),
    };
  }
  if (request.endsWith('/problem/useProblem')) {
    return { __esModule: true, default: () => ({ data: state.problemData, isLoading: false }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let useOntologyData;
try {
  ({ useOntologyData } = require(path.join(output, 'useOntologyData.js')));
} finally {
  Module._load = originalLoad;
}

const note = (id, title, description = '<p>내용</p>') => ({
  id,
  title,
  description,
  updated: '2026-09-18T00:00:00.000Z',
  option: {},
});

const board = (id, title) => ({
  ...note(id, title),
  type: 'BOARD',
  option: { BOARD_HEADER_LEVEL: 3 },
});

test.after(() => rmSync(output, { recursive: true, force: true }));

test('names the Note class after the current notebook only in notebook mode', () => {
  state.boardPages = [];
  state.notePages = [note(901, '기록')];
  try {
    state.usageMode = 'NOTEBOOK';
    state.notebook = { id: 7, title: '연구실' };
    const notebookGraph = useOntologyData();
    const notebookClass = notebookGraph.nodes.find((node) => node.id === 'class:note');
    assert.equal(notebookClass?.name, '노트: 연구실');
    assert.ok(
      notebookGraph.edges.some(
        (edge) =>
          edge.source === 'note:content:901' &&
          edge.target === 'class:note' &&
          edge.type === 'INSTANCE_OF'
      )
    );

    state.usageMode = 'NOTE';
    assert.equal(useOntologyData().nodes.find((node) => node.id === 'class:note')?.name, '노트');

    state.usageMode = 'SIMPLE';
    assert.equal(useOntologyData().nodes.find((node) => node.id === 'class:note')?.name, '노트');

    state.usageMode = 'NOTEBOOK';
    state.notebook = null;
    assert.equal(useOntologyData().nodes.find((node) => node.id === 'class:note')?.name, '노트');
  } finally {
    state.usageMode = 'NOTE';
    state.notebook = null;
  }
});

test('useOntologyData keeps topic IDs stable and does not emit heuristic recommendations', () => {
  state.boardPages = [];
  state.notePages = [
    note(1, '제품/API', '<p>내용</p><h2>API 설계</h2>'),
    note(2, '업무/API 가이드', '<p>내용</p><h2>API 구현</h2>'),
    note(3, '개발/API 점검', '<p>내용</p><h2>API 테스트</h2>'),
  ];
  const before = useOntologyData();
  const beforeTopicIds = new Map(
    before.nodes
      .filter((node) => node.classKind === 'TITLE_KEYWORD')
      .map((node) => [node.name, node.id])
  );

  state.notePages = [
    ...state.notePages,
    note(4, '운영/API 모니터링', '<p>내용</p><h2>API 배포</h2>'),
  ];
  const after = useOntologyData();
  const afterTopicIds = new Map(
    after.nodes
      .filter((node) => node.classKind === 'TITLE_KEYWORD')
      .map((node) => [node.name, node.id])
  );

  assert.ok(beforeTopicIds.has('주제: api'));
  assert.equal(beforeTopicIds.has('노트 제목: api'), false);
  for (const [name, id] of beforeTopicIds) {
    assert.equal(afterTopicIds.get(name), id, `${name} ID changed with its member set`);
  }

  assert.equal(
    after.edges.some((edge) => /DEPENDS/.test(edge.type)),
    false
  );
  assert.equal(
    after.axioms.inferredEdges.some((edge) => /DEPENDS/.test(edge.type)),
    false
  );
  assert.equal(
    after.axioms.inferredEdges.some((edge) => /RELATED_NOTE/.test(edge.type)),
    false
  );

  assert.equal('recommendedEdges' in after.axioms, false);

  const genericTopic = after.nodes.find((node) => node.name === '주제: api');
  const directSupports = after.edges.filter(
    (edge) =>
      edge.target === genericTopic?.id &&
      (edge.type === 'SUBCLASS_OF' || edge.type === 'INSTANCE_OF')
  );
  assert.equal(directSupports.length, 8);
  assert.ok(directSupports.every((edge) => edge.type === 'INSTANCE_OF'));
});

test('useOntologyData uses one topic class for a shared note title', () => {
  state.boardPages = [];
  state.notePages = [
    note(11, '제품/API 계획'),
    note(12, '업무/API 구현'),
    note(13, '개발/API 점검'),
  ];

  const graph = useOntologyData();
  const topic = graph.nodes.find((node) => node.name === '주제: api');
  assert.ok(topic);
  assert.equal(
    graph.nodes.some((node) => node.name === '노트 제목: api'),
    false
  );
  assert.equal(
    graph.edges.filter((edge) => edge.type === 'INSTANCE_OF' && edge.target === topic.id).length,
    3
  );
});

test('a generic topic counts distinct source notes instead of direct member nodes', () => {
  state.boardPages = [];
  state.notePages = [
    note(14, '첫 번째', '<h2>API 설계</h2><h3>API 구현</h3>'),
    note(15, '두 번째', '<h2>API 점검</h2>'),
  ];

  const twoSourceNotes = useOntologyData();
  assert.equal(
    twoSourceNotes.nodes.some((node) => node.name === '주제: api'),
    false
  );

  state.notePages = [...state.notePages, note(16, '세 번째', '<h4>API 배포</h4>')];
  const threeSourceNotes = useOntologyData();
  assert.ok(threeSourceNotes.nodes.some((node) => node.name === '주제: api'));
});

test('overlapping source-note sets do not create topic inheritance', () => {
  state.boardPages = [];
  state.notePages = [
    note(301, '첫 번째', '<h2>API 설계</h2><h3>Beta 설계</h3>'),
    note(302, '두 번째', '<h2>API 구현</h2><h3>Beta 구현</h3>'),
    note(303, '세 번째', '<h2>API 점검</h2><h3>Beta 점검</h3>'),
    note(304, '네 번째', '<h2>Beta 배포</h2>'),
  ];

  const graph = useOntologyData();
  const api = graph.nodes.find((node) => node.name === '주제: api');
  const beta = graph.nodes.find((node) => node.name === '주제: beta');
  assert.ok(api);
  assert.ok(beta);
  assert.equal(
    graph.edges.some(
      (relation) =>
        relation.type === 'SUBCLASS_OF' &&
        [api.id, beta.id].includes(relation.source) &&
        [api.id, beta.id].includes(relation.target)
    ),
    false
  );
});

test('a topic with two proper-subset source-note sets is their parent', () => {
  state.boardPages = [];
  state.notePages = [
    note(311, '문서1', '<h2>Alpha</h2><h3>Beta</h3><h4>Gamma</h4>'),
    note(312, '문서2', '<h2>Alpha</h2><h3>Beta</h3><h4>Gamma</h4>'),
    note(313, '문서3', '<h2>Alpha</h2><h3>Beta</h3><h4>Gamma</h4>'),
    note(314, '문서4', '<h2>Alpha</h2><h3>Gamma</h3>'),
    note(315, '문서5', '<h2>Alpha</h2>'),
  ];

  const graph = useOntologyData();
  const classes = new Map(
    graph.nodes
      .filter((node) => node.classCategory === 'TOPIC')
      .map((node) => [node.matchLabel, node.id])
  );
  const subClassEdges = graph.edges.filter((edge) => edge.type === 'SUBCLASS_OF');
  assert.deepEqual(
    subClassEdges.map((edge) => [edge.source, edge.target]).sort(),
    [
      [classes.get('beta'), classes.get('alpha')],
      [classes.get('gamma'), classes.get('alpha')],
    ].sort()
  );
  assert.equal(
    subClassEdges.some(
      (edge) => edge.source === classes.get('beta') && edge.target === classes.get('gamma')
    ),
    false
  );
  assert.ok(graph.axioms.inferredEdges.some((edge) => edge.type === 'INFERRED_INSTANCE_OF'));
});

test('one proper subset or equal source-note sets do not make a topic parent', () => {
  state.boardPages = [];
  state.notePages = [
    note(321, '문서1', '<h2>Alpha</h2><h3>Beta</h3><h4>Gamma</h4>'),
    note(322, '문서2', '<h2>Alpha</h2><h3>Beta</h3><h4>Gamma</h4>'),
    note(323, '문서3', '<h2>Alpha</h2><h3>Beta</h3><h4>Gamma</h4>'),
    note(324, '문서4', '<h2>Alpha</h2><h3>Gamma</h3>'),
  ];

  const graph = useOntologyData();
  assert.equal(
    graph.edges.some((edge) => edge.type === 'SUBCLASS_OF'),
    false
  );
});

test('retains connected paragraph instances without a linked-paragraph class', () => {
  state.boardPages = [];
  state.notePages = [
    note(17, '첫 번째', '<h2>API 설계</h2>'),
    note(18, '두 번째', '<h3>API 구현</h3>'),
    note(19, '세 번째', '<h4>API 점검</h4>'),
  ];
  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();

  const graph = useOntologyData();
  const topic = graph.nodes.find((node) => node.name === '주제: api');
  const connected = graph.nodes.filter((node) => node.instanceKind === 'CONNECTED_PARAGRAPH');
  assert.ok(topic);
  assert.equal(connected.length, 3);
  assert.equal(
    graph.nodes.some((node) => node.classKind === 'LINKED_PARAGRAPH'),
    false
  );
  assert.ok(
    connected.every((node) =>
      graph.edges.some(
        (edge) => edge.type === 'INSTANCE_OF' && edge.source === node.id && edge.target === topic.id
      )
    )
  );
});

test('creates named external-link instances, their class, unified topics and references', () => {
  const firstHtml = '<p>첫 링크</p>';
  const secondHtml = '<p>둘째 링크</p>';
  const thirdHtml = '<p>셋째 링크</p>';
  state.boardPages = [];
  state.notePages = [
    note(31, '첫 번째', firstHtml),
    note(32, '두 번째', secondHtml),
    note(33, '세 번째', thirdHtml),
  ];
  state.htmlLinks = new Map([
    [firstHtml, [{ text: 'React 문서', url: 'https://example.com/docs' }]],
    [secondHtml, [{ text: 'React 문서', url: 'https://example.com/docs' }]],
    [thirdHtml, [{ text: 'React 문서', url: 'https://example.com/docs' }]],
  ]);
  state.noteLinkTargets = new Map();

  try {
    const graph = useOntologyData();
    const externalClass = graph.nodes.find((node) => node.classKind === 'EXTERNAL_LINK');
    const externalLinks = graph.nodes.filter(
      (node) => node.instanceKind === 'CONNECTED_EXTERNAL_LINK'
    );
    const linkTopic = graph.nodes.find((node) => node.name === '주제: react 문서');
    assert.ok(externalClass);
    assert.equal(externalLinks.length, 1);
    assert.equal(externalLinks[0].name, 'React 문서');
    assert.equal(externalLinks[0].description, 'https://example.com/docs');
    assert.ok(linkTopic);
    assert.equal(linkTopic.classKind, 'TITLE_KEYWORD');
    assert.equal(
      graph.nodes.some((node) => node.classKind === 'EXTERNAL_TOPIC'),
      false
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'INSTANCE_OF' &&
          edge.source === externalLinks[0].id &&
          edge.target === externalClass.id
      )
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'INSTANCE_OF' &&
          edge.source === externalLinks[0].id &&
          edge.target === linkTopic.id
      )
    );
    assert.equal(
      graph.edges.filter(
        (edge) => edge.type === 'EXTERNAL_REFERENCE' && edge.target === externalLinks[0].id
      ).length,
      3
    );
    assert.equal(
      graph.edges.some((edge) => edge.type === 'REFERENCES'),
      false
    );
  } finally {
    state.htmlLinks = new Map();
  }
});

test('uses the complete URL hostname as the sole topic keyword', () => {
  const htmls = ['<p>첫 URL</p>', '<p>둘째 URL</p>', '<p>셋째 URL</p>'];
  state.boardPages = [];
  state.notePages = htmls.map((html, index) =>
    note(39 + index, ['알파', '베타', '감마'][index], html)
  );
  state.htmlLinks = new Map(
    htmls.map((html) => [
      html,
      [{ text: 'https://docs.example.com/guide', url: 'https://docs.example.com/guide' }],
    ])
  );
  state.noteLinkTargets = new Map();

  try {
    const graph = useOntologyData();
    assert.deepEqual(
      graph.nodes.filter((node) => node.classKind === 'TITLE_KEYWORD').map((node) => node.name),
      ['주제: docs.example.com']
    );
  } finally {
    state.htmlLinks = new Map();
  }
});

test('does not create a link topic from fewer than three distinct source notes', () => {
  const htmls = ['<p>첫 링크</p>', '<p>둘째 링크</p>'];
  state.boardPages = [];
  state.notePages = htmls.map((html, index) => note(49 + index, `링크 출처 ${index}`, html));
  state.htmlLinks = new Map(
    htmls.map((html) => [html, [{ text: '고유 외부 문서', url: 'https://example.com/unique' }]])
  );
  state.noteLinkTargets = new Map();

  try {
    const graph = useOntologyData();
    assert.equal(graph.nodes.filter((node) => node.instanceKind === 'EXTERNAL_LINK').length, 1);
    assert.equal(
      graph.nodes.filter((node) => node.instanceKind === 'CONNECTED_EXTERNAL_LINK').length,
      0
    );
    assert.equal(
      graph.nodes.some(
        (node) => node.classKind === 'TITLE_KEYWORD' && node.matchLabel === '고유 외부 문서'
      ),
      false
    );
  } finally {
    state.htmlLinks = new Map();
  }
});

test('merges a link keyword into an existing title topic', () => {
  const html = '<p>외부 링크</p>';
  state.boardPages = [];
  state.notePages = [
    note(45, '제품/API 계획'),
    note(46, '개발/API 구현'),
    note(48, '링크 출처', html),
  ];
  state.htmlLinks = new Map([[html, [{ text: 'API', url: 'https://example.com/api' }]]]);
  state.noteLinkTargets = new Map();

  try {
    const graph = useOntologyData();
    const topic = graph.nodes.find((node) => node.name === '주제: api');
    const externalLink = graph.nodes.find(
      (node) => node.instanceKind === 'CONNECTED_EXTERNAL_LINK'
    );
    assert.ok(topic);
    assert.ok(externalLink);
    assert.equal(graph.nodes.filter((node) => node.name === '주제: api').length, 1);
    assert.equal(
      graph.nodes.some((node) => node.classKind === 'EXTERNAL_TOPIC'),
      false
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'INSTANCE_OF' && edge.source === externalLink.id && edge.target === topic.id
      )
    );
  } finally {
    state.htmlLinks = new Map();
  }
});

test('keeps internal references without producing external-link instances', () => {
  const html = '<p>내부 링크</p>';
  state.boardPages = [];
  state.notePages = [note(42, '출처', html), note(43, '대상')];
  state.htmlLinks = new Map([[html, [{ text: '대상', url: 'internal:target' }]]]);
  state.noteLinkTargets = new Map([['internal:target', { title: '대상' }]]);

  try {
    const graph = useOntologyData();
    assert.equal(
      graph.nodes.some((node) => node.instanceKind === 'EXTERNAL_LINK'),
      false
    );
    assert.equal(graph.edges.filter((edge) => edge.type === 'REFERENCES').length, 1);
  } finally {
    state.htmlLinks = new Map();
    state.noteLinkTargets = new Map();
  }
});

test('a board-title keyword does not classify the board class (board root note is removed)', () => {
  state.boardPages = [board(21, 'API 계획')];
  state.notePages = [note(22, 'API 계획'), note(23, 'API 구현'), note(24, 'API 설계')];

  const graph = useOntologyData();
  const topicClass = graph.nodes.find((node) => node.name === '노트 제목: api');
  const boardRootNote = graph.nodes.find(
    (node) =>
      node.instanceKind === 'NOTE' && node.name === 'API 계획' && node.boardTitle === 'API 계획'
  );
  const boardClass = graph.nodes.find(
    (node) => node.classKind === 'BOARD_CARD' && node.name === 'API 계획'
  );

  // Board root note instance is no longer created.
  assert.equal(boardRootNote, undefined);
  // Board class still exists.
  assert.ok(boardClass);
  // Topic class may or may not exist depending on other notes' keywords (general notes still produce it).
  if (topicClass) {
    // Board class must not be linked to the topic class via INSTANCE_OF.
    assert.equal(
      graph.edges.some(
        (edge) =>
          edge.type === 'INSTANCE_OF' &&
          edge.source === boardClass.id &&
          edge.target === topicClass.id
      ),
      false
    );
  }
});

test('shares one board paragraph across columns and retains each source relation', () => {
  state.boardPages = [{ ...board(71, '프로젝트'), description: '' }];
  state.notePages = [
    note(72, '프로젝트/진행', '<h2>공통 묶음</h2><h3>진행 카드</h3>'),
    note(73, '프로젝트/완료', '<h2>공통 묶음</h2><h3>완료 카드</h3>'),
  ];

  const graph = useOntologyData();
  const boardClass = graph.nodes.find((node) => node.classKind === 'BOARD_CARD');
  const boardParagraphs = graph.nodes.filter(
    (node) => node.instanceKind === 'BOARD_PARAGRAPH' && node.name === '공통 묶음'
  );
  const boardNotes = graph.nodes.filter(
    (node) => node.instanceKind === 'NOTE' && node.boardTitle === '프로젝트'
  );
  const cards = graph.nodes.filter((node) => node.instanceKind === 'CARD');

  assert.ok(boardClass);
  assert.equal(boardParagraphs.length, 1);
  assert.equal(boardParagraphs[0].paragraphOccurrences.length, 2);
  assert.equal(boardNotes.length, 2);
  assert.equal(cards.length, 2);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' &&
        edge.source === boardParagraphs[0].id &&
        edge.target === boardClass.id
    )
  );
  assert.ok(
    boardNotes.every((noteNode) =>
      graph.edges.some(
        (edge) =>
          edge.propertyLabel === 'paragraphPartOf' &&
          edge.source === boardParagraphs[0].id &&
          edge.target === noteNode.id
      )
    )
  );
  assert.ok(
    cards.every((card) =>
      graph.edges.some(
        (edge) =>
          edge.propertyLabel === 'cardPartOf' &&
          edge.source === card.id &&
          edge.target === boardParagraphs[0].id
      )
    )
  );
  state.notePages = [...state.notePages].reverse();
  const reversed = useOntologyData().nodes.find(
    (node) => node.instanceKind === 'BOARD_PARAGRAPH' && node.name === '공통 묶음'
  );
  assert.equal(reversed?.id, boardParagraphs[0].id);
  assert.deepEqual(reversed?.paragraphOccurrences, boardParagraphs[0].paragraphOccurrences);
});

test('reuses a board paragraph for matching headings in columns without cards', () => {
  state.boardPages = [{ ...board(171, '프로젝트'), description: '' }];
  state.notePages = [
    note(172, '프로젝트/진행', '<h2>공통 묶음</h2><h3>진행 카드</h3>'),
    note(173, '프로젝트/완료', '<h2>공통 묶음</h2>'),
    note(174, '프로젝트/대기', '<h2>공통 묶음</h2>'),
  ];

  const graph = useOntologyData();
  const matchingParagraphs = graph.nodes.filter(
    (node) =>
      node.name === '공통 묶음' &&
      ['BOARD_PARAGRAPH', 'PARAGRAPH', 'CONNECTED_PARAGRAPH'].includes(node.instanceKind)
  );
  const boardNotes = graph.nodes.filter(
    (node) => node.instanceKind === 'NOTE' && node.boardTitle === '프로젝트'
  );

  assert.equal(matchingParagraphs.length, 1);
  assert.equal(matchingParagraphs[0].instanceKind, 'BOARD_PARAGRAPH');
  assert.deepEqual(
    matchingParagraphs[0].paragraphOccurrences.map((occurrence) => occurrence.origin),
    ['프로젝트/대기', '프로젝트/완료', '프로젝트/진행']
  );
  assert.equal(boardNotes.length, 3);
  assert.ok(
    boardNotes.every((boardNote) =>
      graph.edges.some(
        (edge) =>
          edge.source === matchingParagraphs[0].id &&
          edge.target === boardNote.id &&
          edge.propertyLabel === 'paragraphPartOf'
      )
    )
  );
});

test('a shared board paragraph can support a topic through three source notes', () => {
  state.boardPages = [{ ...board(74, '프로젝트'), description: '' }];
  state.notePages = [
    note(75, '프로젝트/진행', '<h2>공통 묶음</h2><h3>진행 카드</h3>'),
    note(76, '프로젝트/완료', '<h2>공통 묶음</h2><h3>완료 카드</h3>'),
    note(77, '프로젝트/대기', '<h2>공통 묶음</h2><h3>대기 카드</h3>'),
  ];

  const graph = useOntologyData();
  const paragraph = graph.nodes.find(
    (node) => node.instanceKind === 'BOARD_PARAGRAPH' && node.name === '공통 묶음'
  );
  const topic = graph.nodes.find(
    (node) => node.classKind === 'TITLE_KEYWORD' && node.matchLabel === '공통 묶음'
  );
  assert.ok(paragraph);
  assert.equal(paragraph.paragraphOccurrences.length, 3);
  assert.ok(topic);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' && edge.source === paragraph.id && edge.target === topic.id
    )
  );
});

test('board root note and its paragraphs are never created (board root note removed)', () => {
  state.boardPages = [
    {
      ...board(31, '프로젝트'),
      description: '<h2>보드 설정의 유령 문단</h2>',
    },
  ];
  state.notePages = [note(32, '프로젝트', '<h2>실제 문단</h2>')];

  const graph = useOntologyData();
  // Board root note instance must NOT exist even when there is a matching notePage.
  const boardRootNote = graph.nodes.find(
    (node) =>
      node.instanceKind === 'NOTE' && node.name === '프로젝트' && node.boardTitle === '프로젝트'
  );
  assert.equal(boardRootNote, undefined);
  // Neither the board description paragraph nor the notePage paragraph should appear.
  assert.equal(
    graph.nodes.some(
      (node) => node.instanceKind === 'PARAGRAPH' && node.name === '보드 설정의 유령 문단'
    ),
    false
  );
  assert.equal(
    graph.nodes.some((node) => node.instanceKind === 'PARAGRAPH' && node.name === '실제 문단'),
    false
  );
});

test('board paragraphs belong to their board note and contain cards', () => {
  state.boardPages = [{ ...board(41, '프로젝트'), description: '' }];
  state.notePages = [note(42, '프로젝트/진행', '<h2>작업 묶음</h2><h3>카드</h3><h4>세부</h4>')];

  const graph = useOntologyData();
  // Board root note must NOT exist.
  const boardRootNote = graph.nodes.find(
    (node) =>
      node.instanceKind === 'NOTE' && node.name === '프로젝트' && node.boardTitle === '프로젝트'
  );
  assert.equal(boardRootNote, undefined);

  const columnNote = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === '프로젝트/진행'
  );
  const boardParagraph = graph.nodes.find(
    (node) => node.instanceKind === 'BOARD_PARAGRAPH' && node.name === '작업 묶음'
  );
  const card = graph.nodes.find((node) => node.instanceKind === 'CARD' && node.name === '카드');
  const detail = graph.nodes.find(
    (node) => node.instanceKind === 'PARAGRAPH' && node.name === '세부'
  );

  assert.ok(columnNote);
  assert.ok(boardParagraph);
  assert.ok(card);
  assert.ok(detail);

  const boardClass = graph.nodes.find((node) => node.classKind === 'BOARD_CARD');
  assert.ok(boardClass);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' &&
        edge.source === boardParagraph.id &&
        edge.target === boardClass.id
    )
  );
  assert.equal(
    graph.nodes.some((node) => node.classKind === 'CARD_TYPE'),
    false
  );
  assert.equal(
    graph.nodes.some((node) => node.classKind === 'BOARD_STATUS'),
    false
  );
  // Column note is an instance of boardCardClass.
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' &&
        edge.source === columnNote.id &&
        edge.target === boardClass.id
    )
  );
  // notePartOf and representedByNote edges must NOT exist (no board root note).
  assert.equal(
    graph.edges.some((edge) => edge.propertyLabel === 'notePartOf'),
    false
  );
  assert.equal(
    graph.edges.some((edge) => edge.type === 'REPRESENTED_BY_NOTE'),
    false
  );
  // The board paragraph belongs to its board note.
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'paragraphPartOf' &&
        edge.source === boardParagraph.id &&
        edge.target === columnNote.id
    )
  );
  // Card must NOT be directly instanceOf boardClass.
  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' && edge.source === card.id && edge.target === boardClass.id
    ),
    false
  );
  // No paragraph/card node named '카드' (card headings are CARD instances, not paragraphs).
  assert.equal(
    graph.nodes.some(
      (node) =>
        (node.instanceKind === 'PARAGRAPH' || node.instanceKind === 'CONNECTED_PARAGRAPH') &&
        node.name === '카드'
    ),
    false
  );
  // The card belongs to its parent board paragraph.
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'cardPartOf' &&
        edge.source === card.id &&
        edge.target === boardParagraph.id
    )
  );
  // Card's sub-paragraph is paragraphPartOf the card.
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'paragraphPartOf' &&
        edge.source === detail.id &&
        edge.target === card.id
    )
  );
});

test('creates one topic from matching board and ordinary paragraph headings across notes', () => {
  state.boardPages = [{ ...board(61, '프로젝트'), description: '' }];
  state.notePages = [
    note(62, '프로젝트/진행', '<h2>작업 묶음</h2><h3>보드 카드</h3>'),
    note(63, '일반 노트 1', '<h2>작업 묶음</h2>'),
    note(64, '일반 노트 2', '<h2>작업 묶음</h2>'),
    note(65, '일반 노트 3', '<h2>작업 묶음</h2>'),
  ];

  const graph = useOntologyData();
  const boardParagraph = graph.nodes.find(
    (node) => node.instanceKind === 'BOARD_PARAGRAPH' && node.name === '작업 묶음'
  );
  const sameTitleParagraphs = graph.nodes.filter(
    (node) =>
      (node.instanceKind === 'PARAGRAPH' || node.instanceKind === 'CONNECTED_PARAGRAPH') &&
      node.name === '작업 묶음'
  );

  assert.ok(boardParagraph);
  assert.equal(sameTitleParagraphs.length, 3);
  const topic = graph.nodes.find(
    (node) => node.classKind === 'TITLE_KEYWORD' && node.matchLabel === '작업 묶음'
  );
  assert.ok(topic);
  assert.ok(
    [boardParagraph, ...sameTitleParagraphs].every((paragraph) =>
      graph.edges.some(
        (edge) =>
          edge.type === 'INSTANCE_OF' && edge.source === paragraph.id && edge.target === topic.id
      )
    )
  );
});

test('uses a nested board paragraph while representing the card heading only as a card', () => {
  const cardHeader = '<h4>중첩 카드</h4>';
  state.boardPages = [
    { ...board(81, '중첩 프로젝트'), description: '', option: { BOARD_HEADER_LEVEL: 4 } },
  ];
  state.notePages = [
    note(82, '중첩 프로젝트/진행', `<h2>대분류</h2><h3>백엔드</h3>${cardHeader}<h5>카드 세부</h5>`),
    note(83, '참조 대상'),
  ];
  state.htmlLinks = new Map([[cardHeader, [{ text: '참조', url: 'internal:nested-card' }]]]);
  state.noteLinkTargets = new Map([['internal:nested-card', { title: '참조 대상' }]]);

  try {
    const graph = useOntologyData();
    const columnNote = graph.nodes.find(
      (node) => node.instanceKind === 'NOTE' && node.name === '중첩 프로젝트/진행'
    );
    const sourceParagraph = graph.nodes.find(
      (node) => node.instanceKind === 'BOARD_PARAGRAPH' && node.name === '백엔드'
    );
    const card = graph.nodes.find(
      (node) => node.instanceKind === 'CARD' && node.name === '중첩 카드'
    );
    const cardDetail = graph.nodes.find(
      (node) => node.instanceKind === 'PARAGRAPH' && node.name === '카드 세부'
    );

    assert.ok(columnNote);
    assert.ok(sourceParagraph);
    assert.ok(card);
    assert.ok(cardDetail);
    assert.equal(
      graph.nodes.some((node) => node.classKind === 'CARD_TYPE'),
      false
    );
    const outerParagraph = graph.nodes.find(
      (node) => node.instanceKind === 'PARAGRAPH' && node.name === '대분류'
    );
    assert.ok(outerParagraph);
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.propertyLabel === 'paragraphPartOf' &&
          edge.source === sourceParagraph.id &&
          edge.target === outerParagraph.id
      )
    );
    // Card heading must not appear as a paragraph node.
    assert.equal(
      graph.nodes.some(
        (node) =>
          (node.instanceKind === 'PARAGRAPH' || node.instanceKind === 'CONNECTED_PARAGRAPH') &&
          node.name === '중첩 카드'
      ),
      false
    );
    // Card belongs to its nearest parent board paragraph.
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'PART_OF' &&
          edge.propertyLabel === 'cardPartOf' &&
          edge.source === card.id &&
          edge.target === sourceParagraph.id
      )
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'PART_OF' &&
          edge.propertyLabel === 'paragraphPartOf' &&
          edge.source === cardDetail.id &&
          edge.target === card.id
      )
    );
    assert.ok(graph.edges.some((edge) => edge.type === 'REFERENCES' && edge.source === card.id));
  } finally {
    state.htmlLinks = new Map();
    state.noteLinkTargets = new Map();
  }
});

test('note containment does not depend on child and parent API order', () => {
  state.boardPages = [];
  state.notePages = [note(52, '부모/자식'), note(51, '부모')];

  const graph = useOntologyData();
  const child = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === '부모/자식'
  );
  const parent = graph.nodes.find((node) => node.instanceKind === 'NOTE' && node.name === '부모');

  assert.ok(child);
  assert.ok(parent);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'notePartOf' && edge.source === child.id && edge.target === parent.id
    )
  );
});

test('reference edges preserve the link section discriminator', () => {
  const sourceHtml = '<p>링크</p>';
  const targetHtml = '<h2 data-section="두 번째">중복 문단</h2>';
  state.boardPages = [];
  state.notePages = [note(61, '출발', sourceHtml), note(62, '대상', targetHtml)];
  state.htmlLinks = new Map([[sourceHtml, [{ url: 'internal:target' }]]]);
  state.noteLinkTargets = new Map([
    ['internal:target', { title: '대상', paragraph: '중복 문단', section: '두 번째' }],
  ]);

  const graph = useOntologyData();
  const target = graph.nodes.find(
    (node) =>
      node.instanceKind === 'CONNECTED_PARAGRAPH' &&
      node.name === '중복 문단' &&
      node.paragraph?.autoSection === '두 번째'
  );
  const reference = graph.edges.find(
    (edge) => edge.type === 'REFERENCES' && edge.target === target?.id
  );

  assert.ok(target);
  assert.ok(reference);
  assert.equal(reference.targetSection, '두 번째');

  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();
});

test('retains an existing empty reference target without admitting it to topic candidates', () => {
  const sourceHtml = '<p>빈 대상 링크</p>';
  state.boardPages = [];
  state.notePages = [note(71, '출발', sourceHtml), note(72, '빈 대상', '')];
  state.htmlLinks = new Map([[sourceHtml, [{ url: 'internal:empty-target' }]]]);
  state.noteLinkTargets = new Map([['internal:empty-target', { title: '빈 대상' }]]);

  const graph = useOntologyData();
  const source = graph.nodes.find((node) => node.instanceKind === 'NOTE' && node.name === '출발');
  const target = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === '빈 대상'
  );

  assert.ok(source);
  assert.ok(target);
  assert.ok(
    graph.edges.some(
      (edge) => edge.type === 'REFERENCES' && edge.source === source.id && edge.target === target.id
    )
  );
  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' && edge.source === target.id && /titleKeyword/.test(edge.id)
    ),
    false
  );

  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();
});

test('continues to exclude empty notes with no structural or reference role', () => {
  state.boardPages = [];
  state.notePages = [note(73, '내용 있음'), note(74, '빈 독립 노트', '')];

  const graph = useOntologyData();

  assert.equal(
    graph.nodes.some((node) => node.instanceKind === 'NOTE' && node.name === '빈 독립 노트'),
    false
  );
});
