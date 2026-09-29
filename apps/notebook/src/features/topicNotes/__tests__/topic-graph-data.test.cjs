const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const jsYaml = require('js-yaml');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-use-data-'));
const knowledgeGraphDirectory = path.join(__dirname, '../../knowledgeGraph');
for (const name of [
  'frontmatter',
  'relations',
  'palette',
  'externalLinkClassification',
  'text',
  'axioms',
  'links',
  'paragraphClassification',
  'useKnowledgeGraphData',
]) {
  const sourceFile =
    name === 'relations'
      ? path.join(knowledgeGraphDirectory, 'utils/relations.ts')
      : name === 'useKnowledgeGraphData'
      ? path.join(knowledgeGraphDirectory, `${name}.ts`)
      : path.join(knowledgeGraphDirectory, 'utils', `${name}.ts`);
  const source = readFileSync(sourceFile, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputDirectory = name === 'useKnowledgeGraphData' ? output : path.join(output, 'utils');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, `${name}.js`), compiled.outputText);
}
writeFileSync(
  path.join(output, 'types.js'),
  ts.transpileModule(readFileSync(path.join(__dirname, '../types.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
);
for (const name of ['titleKeywordClasses', 'topicNodes']) {
  const file = path.join(__dirname, '../utils', `${name}.ts`);
  const source = readFileSync(file, 'utf8')
    .replaceAll('../../knowledgeGraph/utils/text', './text')
    .replaceAll('../../knowledgeGraph/useKnowledgeGraphData', '../useKnowledgeGraphData')
    .replaceAll('../../knowledgeGraph/utils/palette', './palette')
    .replaceAll('../../knowledgeGraph/utils/paragraphClassification', './paragraphClassification')
    .replaceAll(
      '../../knowledgeGraph/utils/externalLinkClassification',
      './externalLinkClassification'
    );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  writeFileSync(path.join(output, 'utils', `${name}.js`), compiled.outputText);
}
writeFileSync(
  path.join(output, 'inference.js'),
  ts.transpileModule(
    readFileSync(path.join(knowledgeGraphDirectory, 'owlrdf/inference.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
);

const state = {
  boardPages: [],
  notePages: [],
  problemData: [],
  usageMode: 'NOTE',
  notebook: null,
  htmlLinks: new Map(),
  noteLinkTargets: new Map(),
  extensions: { topicNotes: true },
};
const originalLoad = Module._load;
Module._load = function loadKnowledgeGraphTestDependency(request, parent, isMain) {
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

let useKnowledgeGraphData;
try {
  const { useKnowledgeGraphData: useBaseGraphData } = require(path.join(
    output,
    'useKnowledgeGraphData.js'
  ));
  const { addTopicNodes } = require(path.join(output, 'utils/topicNodes.js'));
  const { evaluateKnowledgeGraphAxioms } = require(path.join(output, 'utils/axioms.js'));
  const { inferKnowledgeGraphRelations } = require(path.join(output, 'inference.js'));
  useKnowledgeGraphData = (options = {}) => {
    const base = useBaseGraphData();
    const includeTopics = options.includeTopics ?? state.extensions.topicNotes;
    if (!includeTopics) {
      return {
        ...base,
        axioms: {
          ...base.axioms,
          inferredEdges: inferKnowledgeGraphRelations(base.nodes, base.edges),
        },
      };
    }
    const result = addTopicNodes(base, false, () => '');
    return {
      ...result,
      axioms: {
        ...evaluateKnowledgeGraphAxioms(result.nodes, result.edges, state.problemData),
        inferredEdges: inferKnowledgeGraphRelations(result.nodes, result.edges),
      },
    };
  };
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

test('useKnowledgeGraphData keeps topic IDs stable and does not emit heuristic recommendations', () => {
  state.boardPages = [];
  state.notePages = [
    note(1, '제품/API', '<p>내용</p><h2>API 설계</h2>'),
    note(2, '업무/API 가이드', '<p>내용</p><h2>API 구현</h2>'),
    note(3, '개발/API 점검', '<p>내용</p><h2>API 테스트</h2>'),
  ];
  const before = useKnowledgeGraphData();
  const beforeTopicIds = new Map(
    before.nodes
      .filter((node) => node.classKind === 'TITLE_KEYWORD')
      .map((node) => [node.name, node.id])
  );

  state.notePages = [
    ...state.notePages,
    note(4, '운영/API 모니터링', '<p>내용</p><h2>API 배포</h2>'),
  ];
  const after = useKnowledgeGraphData();
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

test('useKnowledgeGraphData uses one topic class for a shared note title', () => {
  state.boardPages = [];
  state.notePages = [
    note(11, '제품/API 계획'),
    note(12, '업무/API 구현'),
    note(13, '개발/API 점검'),
  ];

  const graph = useKnowledgeGraphData();
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

  const twoSourceNotes = useKnowledgeGraphData();
  assert.equal(
    twoSourceNotes.nodes.some((node) => node.name === '주제: api'),
    false
  );

  state.notePages = [...state.notePages, note(16, '세 번째', '<h4>API 배포</h4>')];
  const threeSourceNotes = useKnowledgeGraphData();
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

  const graph = useKnowledgeGraphData();
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

  const graph = useKnowledgeGraphData();
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

  const graph = useKnowledgeGraphData();
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

  const graph = useKnowledgeGraphData();
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
    const graph = useKnowledgeGraphData();
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
    const graph = useKnowledgeGraphData();
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
    const graph = useKnowledgeGraphData();
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
    const graph = useKnowledgeGraphData();
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

test('a board-title keyword does not classify the board class (board root note is removed)', () => {
  state.boardPages = [board(21, 'API 계획')];
  state.notePages = [note(22, 'API 계획'), note(23, 'API 구현'), note(24, 'API 설계')];

  const graph = useKnowledgeGraphData();
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

test('a shared board paragraph can support a topic through three source notes', () => {
  state.boardPages = [{ ...board(74, '프로젝트'), description: '' }];
  state.notePages = [
    note(75, '프로젝트/진행', '<h2>공통 묶음</h2><h3>진행 카드</h3>'),
    note(76, '프로젝트/완료', '<h2>공통 묶음</h2><h3>완료 카드</h3>'),
    note(77, '프로젝트/대기', '<h2>공통 묶음</h2><h3>대기 카드</h3>'),
  ];

  const graph = useKnowledgeGraphData();
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

test('creates one topic from matching board and ordinary paragraph headings across notes', () => {
  state.boardPages = [{ ...board(61, '프로젝트'), description: '' }];
  state.notePages = [
    note(62, '프로젝트/진행', '<h2>작업 묶음</h2><h3>보드 카드</h3>'),
    note(63, '일반 노트 1', '<h2>작업 묶음</h2>'),
    note(64, '일반 노트 2', '<h2>작업 묶음</h2>'),
    note(65, '일반 노트 3', '<h2>작업 묶음</h2>'),
  ];

  const graph = useKnowledgeGraphData();
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

test('retains an existing empty reference target without admitting it to topic candidates', () => {
  const sourceHtml = '<p>빈 대상 링크</p>';
  state.boardPages = [];
  state.notePages = [note(71, '출발', sourceHtml), note(72, '빈 대상', '')];
  state.htmlLinks = new Map([[sourceHtml, [{ url: 'internal:empty-target' }]]]);
  state.noteLinkTargets = new Map([['internal:empty-target', { title: '빈 대상' }]]);

  const graph = useKnowledgeGraphData();
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

test('omits topic nodes and topic edges when topicNotes extension is inactive', () => {
  state.boardPages = [];
  state.notePages = [note(81, '리액트 컴포넌트'), note(82, '리액트 훅'), note(83, '리액트 상태')];
  state.extensions.topicNotes = false;

  const inactiveGraph = useKnowledgeGraphData();
  const topicNodes = inactiveGraph.nodes.filter(
    (node) => node.role === 'CLASS' && node.classCategory === 'TOPIC'
  );
  const topicEdges = inactiveGraph.edges.filter(
    (edge) => edge.id.startsWith('edge:topic:') || edge.id.startsWith('edge:topicSubclass:')
  );

  assert.equal(topicNodes.length, 0);
  assert.equal(topicEdges.length, 0);

  // When topicNotes is active, topic nodes and edges are present
  state.extensions.topicNotes = true;
  const activeGraph = useKnowledgeGraphData();
  const activeTopicNodes = activeGraph.nodes.filter(
    (node) => node.role === 'CLASS' && node.classCategory === 'TOPIC'
  );
  const activeTopicEdges = activeGraph.edges.filter(
    (edge) => edge.id.startsWith('edge:topic:') || edge.id.startsWith('edge:topicSubclass:')
  );

  assert.ok(activeTopicNodes.length > 0);
  assert.ok(activeTopicEdges.length > 0);

  // Explicit option overrides extension active state
  const overriddenGraph = useKnowledgeGraphData({ includeTopics: false });
  assert.equal(
    overriddenGraph.nodes.filter((node) => node.role === 'CLASS' && node.classCategory === 'TOPIC')
      .length,
    0
  );

  state.extensions.topicNotes = false;
  const forcedGraph = useKnowledgeGraphData({ includeTopics: true });
  assert.ok(
    forcedGraph.nodes.filter((node) => node.role === 'CLASS' && node.classCategory === 'TOPIC')
      .length > 0
  );

  // Restore state
  state.extensions.topicNotes = true;
});
