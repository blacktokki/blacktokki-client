const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const jsYaml = require('js-yaml');

const output = mkdtempSync(path.join(tmpdir(), 'knowledge-graph-use-data-'));
const knowledgeGraphDirectory = path.join(__dirname, '..');
for (const name of [
  'frontmatter',
  'relations',
  'palette',
  'externalLinkClassification',
  'axioms',
  'links',
  'paragraphClassification',
  'useKnowledgeGraphData',
]) {
  const directory =
    name === 'useKnowledgeGraphData'
      ? knowledgeGraphDirectory
      : path.join(knowledgeGraphDirectory, 'utils');
  const source = readFileSync(path.join(directory, `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const outputDirectory = name === 'useKnowledgeGraphData' ? output : path.join(output, 'utils');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, `${name}.js`), compiled.outputText);
}

const topicDashboardDirectory = path.join(knowledgeGraphDirectory, '..', 'topicDashboard');
const kgTopicDashoardDirectory = path.join(knowledgeGraphDirectory, 'topicDashoard');

const transpileHelper = (srcPath, destPath) => {
  const source = readFileSync(srcPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  mkdirSync(path.dirname(destPath), { recursive: true });
  writeFileSync(destPath, compiled.outputText);
};

transpileHelper(
  path.join(topicDashboardDirectory, 'inferBoardCandidates.ts'),
  path.join(output, 'topicDashboardInfer', 'inferBoardCandidates.js')
);
transpileHelper(
  path.join(kgTopicDashoardDirectory, 'inferTopicBoardPages.ts'),
  path.join(output, 'topicDashoard', 'inferTopicBoardPages.js')
);
transpileHelper(
  path.join(kgTopicDashoardDirectory, 'useTopicBoardToggle.ts'),
  path.join(output, 'topicDashoard', 'useTopicBoardToggle.js')
);
transpileHelper(
  path.join(kgTopicDashoardDirectory, 'topicBoardEligibility.ts'),
  path.join(output, 'topicDashoard', 'topicBoardEligibility.js')
);
transpileHelper(
  path.join(kgTopicDashoardDirectory, 'useResolvedTopicBoards.ts'),
  path.join(output, 'topicDashoard', 'useResolvedTopicBoards.js')
);
transpileHelper(
  path.join(kgTopicDashoardDirectory, 'useTopicBoardDisabled.ts'),
  path.join(output, 'topicDashoard', 'useTopicBoardDisabled.js')
);
transpileHelper(
  path.join(kgTopicDashoardDirectory, 'index.ts'),
  path.join(output, 'topicDashoard', 'index.js')
);

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
  if (request.endsWith('/TopicBoardToggle')) {
    return { TopicBoardToggle: () => null };
  }
  if (request.endsWith('/inferBoardCandidates')) {
    return require(path.join(output, 'topicDashboardInfer', 'inferBoardCandidates.js'));
  }
  if (
    request.endsWith('/topicDashboard') ||
    request === './topicDashboard' ||
    request.endsWith('/topicDashoard') ||
    request === './topicDashoard'
  ) {
    return require(path.join(output, 'topicDashoard', 'index.js'));
  }
  return originalLoad.call(this, request, parent, isMain);
};

let useKnowledgeGraphData;
try {
  ({ useKnowledgeGraphData } = require(path.join(output, 'useKnowledgeGraphData.js')));
} finally {
  Module._load = originalLoad;
}

const note = (id, title, description = '<p>내용</p>') => ({
  id,
  title,
  type: 'NOTE',
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
    const notebookGraph = useKnowledgeGraphData();
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
    assert.equal(
      useKnowledgeGraphData().nodes.find((node) => node.id === 'class:note')?.name,
      '노트'
    );

    state.usageMode = 'SIMPLE';
    assert.equal(
      useKnowledgeGraphData().nodes.find((node) => node.id === 'class:note')?.name,
      '노트'
    );

    state.usageMode = 'NOTEBOOK';
    state.notebook = null;
    assert.equal(
      useKnowledgeGraphData().nodes.find((node) => node.id === 'class:note')?.name,
      '노트'
    );
  } finally {
    state.usageMode = 'NOTE';
    state.notebook = null;
  }
});

test('creates named external-link instances, their class and source references', () => {
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
    const externalLinks = graph.nodes.filter((node) => node.instanceKind === 'EXTERNAL_LINK');
    assert.ok(externalClass);
    assert.equal(externalLinks.length, 1);
    assert.equal(externalLinks[0].name, 'React 문서');
    assert.equal(externalLinks[0].description, 'https://example.com/docs');
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'INSTANCE_OF' &&
          edge.source === externalLinks[0].id &&
          edge.target === externalClass.id
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

test('keeps internal references without producing external-link instances', () => {
  const html = '<p>내부 링크</p>';
  state.boardPages = [];
  state.notePages = [note(42, '출처', html), note(43, '대상')];
  state.htmlLinks = new Map([[html, [{ text: '대상', url: 'internal:target' }]]]);
  state.noteLinkTargets = new Map([['internal:target', { title: '대상' }]]);

  try {
    const graph = useKnowledgeGraphData();
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

test('shares one board paragraph across columns and retains each source relation', () => {
  state.boardPages = [{ ...board(71, '프로젝트'), description: '' }];
  state.notePages = [
    note(72, '프로젝트/진행', '<h2>공통 묶음</h2><h3>진행 카드</h3>'),
    note(73, '프로젝트/완료', '<h2>공통 묶음</h2><h3>완료 카드</h3>'),
  ];

  const graph = useKnowledgeGraphData();
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
  const reversed = useKnowledgeGraphData().nodes.find(
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

  const graph = useKnowledgeGraphData();
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

test('board root note and its paragraphs are never created (board root note removed)', () => {
  state.boardPages = [
    {
      ...board(31, '프로젝트'),
      description: '<h2>보드 설정의 유령 문단</h2>',
    },
  ];
  state.notePages = [note(32, '프로젝트', '<h2>실제 문단</h2>')];

  const graph = useKnowledgeGraphData();
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

  const graph = useKnowledgeGraphData();
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
    const graph = useKnowledgeGraphData();
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

  const graph = useKnowledgeGraphData();
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

  const graph = useKnowledgeGraphData();
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

test('retains an existing empty reference target', () => {
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

  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();
});

test('continues to exclude empty notes with no structural or reference role', () => {
  state.boardPages = [];
  state.notePages = [note(73, '내용 있음'), note(74, '빈 독립 노트', '')];

  const graph = useKnowledgeGraphData();

  assert.equal(
    graph.nodes.some((node) => node.instanceKind === 'NOTE' && node.name === '빈 독립 노트'),
    false
  );
});

test('shared headings do not create additional classes or subclass relations', () => {
  state.boardPages = [];
  state.notePages = [
    note(81, '첫 노트', '<h2>공통 주제</h2>'),
    note(82, '둘째 노트', '<h2>공통 주제</h2>'),
    note(83, '셋째 노트', '<h2>공통 주제</h2>'),
  ];
  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();

  const graph = useKnowledgeGraphData();
  assert.equal(
    graph.nodes.some((node) => node.role === 'CLASS' && node.classKind !== 'NOTE'),
    false
  );
  assert.equal(
    graph.edges.some((edge) => edge.type === 'SUBCLASS_OF'),
    false
  );
  assert.equal(graph.nodes.filter((node) => node.instanceKind === 'PARAGRAPH').length, 3);
});

test('toggles inferred topic board candidates into board nodes when enabled', () => {
  state.boardPages = [];
  state.notePages = [
    note(91, '프로젝트/할일', '<h3>작업 1</h3><p>내용</p>'),
    note(92, '프로젝트/진행', '<h3>작업 2</h3><p>내용</p>'),
    note(93, '프로젝트/완료', '<h3>작업 3</h3><p>내용</p>'),
  ];
  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();

  // 1. 토글 비활성화(기본값) 상태
  const defaultGraph = useKnowledgeGraphData({ enableTopicBoards: false });
  assert.equal(
    defaultGraph.nodes.some((node) => node.boardTitle === '프로젝트'),
    false
  );
  assert.equal(
    defaultGraph.nodes.some((node) => node.classKind === 'BOARD_CARD'),
    false
  );

  // 2. 토글 활성화 상태: 주제 대시보드 추론 기능으로 가상 보드 '프로젝트'가 보드 노드로 전환
  const topicBoardGraph = useKnowledgeGraphData({ enableTopicBoards: true });
  const boardClassNode = topicBoardGraph.nodes.find(
    (node) => node.role === 'CLASS' && node.name === '프로젝트' && node.classKind === 'BOARD_CARD'
  );
  assert.ok(boardClassNode, '가상 보드 클래스 노드가 생성되어야 합니다.');

  const boardNoteNodes = topicBoardGraph.nodes.filter(
    (node) => node.instanceKind === 'NOTE' && node.boardTitle === '프로젝트'
  );
  assert.equal(boardNoteNodes.length, 3, '컬럼 노트 3개가 boardTitle을 가져야 합니다.');

  const cardNodes = topicBoardGraph.nodes.filter(
    (node) => node.instanceKind === 'CARD' && node.boardTitle === '프로젝트'
  );
  assert.equal(cardNodes.length, 3, '각 컬럼의 헤딩(h3)이 카드로 전환되어야 합니다.');

  // 3. 노트북 모드(NOTEBOOK)에서도 주제 보드가 정상 생성되고 허용됨
  state.usageMode = 'NOTEBOOK';
  state.notebook = { id: 10, title: '노트북' };
  const notebookGraph = useKnowledgeGraphData({ enableTopicBoards: true });
  assert.equal(
    notebookGraph.nodes.some((node) => node.classKind === 'BOARD_CARD'),
    true,
    '노트북 모드에서도 주제 보드가 정상 생성되어야 합니다.'
  );
  assert.equal(notebookGraph.topicBoardCandidateCount, 1);

  // 4. 단순 모드(SIMPLE)에서는 주제 보드가 생성되지 않음
  state.usageMode = 'SIMPLE';
  state.notebook = null;
  const simpleGraph = useKnowledgeGraphData({ enableTopicBoards: true });
  assert.equal(
    simpleGraph.nodes.some((node) => node.classKind === 'BOARD_CARD'),
    false,
    '단순 모드(SIMPLE)에서는 주제 보드가 생성되지 않아야 합니다.'
  );
  assert.equal(simpleGraph.topicBoardCandidateCount, 0);

  // 상태 복원
  state.usageMode = 'NOTE';
  state.notebook = null;
});

