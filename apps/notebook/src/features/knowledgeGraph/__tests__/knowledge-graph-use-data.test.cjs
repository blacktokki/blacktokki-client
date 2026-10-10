const jsYaml = require('js-yaml');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

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

const state = {
  boardPages: [],
  notePages: [],
  problemData: [],
  usageMode: 'NOTE',
  notebook: null,
  htmlLinks: new Map(),
  noteLinkTargets: new Map(),
  memoCache: undefined,
  memoIndex: 0,
};
const lang = () => '';
const originalLoad = Module._load;
Module._load = function loadKnowledgeGraphTestDependency(request, parent, isMain) {
  if (request === '@blacktokki/core') {
    return { useLangContext: () => ({ lang }) };
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
      useMemo: (factory, dependencies) => {
        if (!state.memoCache) return factory();
        const index = state.memoIndex++;
        const previous = state.memoCache[index];
        if (previous && dependencies.every((value, i) => value === previous.dependencies[i]))
          return previous.value;
        const value = factory();
        state.memoCache[index] = { dependencies, value };
        return value;
      },
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
    return {
      urlToNoteLink: (url, sourceTitle) =>
        state.noteLinkParser
          ? state.noteLinkParser(url, sourceTitle)
          : state.noteLinkTargets.get(url),
    };
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

test('validation updates reuse graph nodes and edges without rebuilding their layout data', () => {
  state.boardPages = [];
  state.notePages = [note(991, '검증 대상')];
  state.problemData = [];
  state.usageMode = 'NOTE';
  state.notebook = null;
  state.memoCache = [];
  state.memoIndex = 0;
  try {
    const first = useKnowledgeGraphData();
    state.problemData = [{ title: '검증 대상', subtitles: ['Isolated note'] }];
    state.memoIndex = 0;
    const second = useKnowledgeGraphData();
    assert.equal(second.nodes, first.nodes);
    assert.equal(second.edges, first.edges);
    assert.equal(first.axioms.violations.length, 0);
    assert.equal(second.axioms.violations.length, 1);
  } finally {
    state.memoCache = undefined;
    state.problemData = [];
  }
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

test('keeps structured ordinary notes as notes without creating board classes', () => {
  state.boardPages = [];
  state.notePages = [
    note(91, '프로젝트/할일', '<h3>작업 1</h3><p>내용</p>'),
    note(92, '프로젝트/진행', '<h3>작업 2</h3><p>내용</p>'),
    note(93, '프로젝트/완료', '<h3>작업 3</h3><p>내용</p>'),
  ];
  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();

  try {
    for (const usageMode of ['NOTE', 'NOTEBOOK', 'SIMPLE']) {
      state.usageMode = usageMode;
      state.notebook = usageMode === 'NOTEBOOK' ? { id: 10, title: '노트북' } : null;
      const graph = useKnowledgeGraphData();
      assert.equal(
        graph.nodes.some((node) => node.boardTitle === '프로젝트'),
        false
      );
      assert.equal(
        graph.nodes.some((node) => node.classKind === 'BOARD_CARD'),
        false
      );
      assert.equal(
        graph.nodes.some((node) => node.instanceKind === 'CARD'),
        false
      );
      assert.equal(graph.nodes.filter((node) => node.instanceKind === 'NOTE').length, 3);
      assert.equal(graph.nodes.filter((node) => node.instanceKind === 'PARAGRAPH').length, 3);
    }
  } finally {
    state.usageMode = 'NOTE';
    state.notebook = null;
  }
});

test('uses raw relative Markdown links for references and retaining empty target notes', () => {
  const { compileFunction } = require('node:vm');
  const domino = require('@mixmark-io/domino');
  const sourceRoot = path.resolve(knowledgeGraphDirectory, '../..');
  const searchSource = ts.createSourceFile(
    'SearchBar.tsx',
    readFileSync(path.join(sourceRoot, 'components/SearchBar.tsx'), 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX
  );
  const functions = searchSource.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) && ['toNoteParams', 'urlToNoteLink'].includes(node.name?.text)
  );
  const compile = (source) => {
    const exports = {};
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    compileFunction(js, ['exports'])(exports);
    return exports;
  };
  const { urlToNoteLink } = compile(functions.map((node) => node.getText(searchSource)).join('\n'));
  const { extractHtmlLinks } = compile(
    readFileSync(
      path.resolve(sourceRoot, '../../../packages/blacktokki-editor/src/lib/dom.ts'),
      'utf8'
    )
  );
  const previousLocation = global.location;
  const previousDOMParser = global.DOMParser;
  global.location = {
    origin: 'https://notebook.test',
    href: 'https://notebook.test/Home?title=unrelated',
  };
  global.DOMParser = class {
    parseFromString(html) {
      return domino.createWindow(html, global.location.href).document;
    }
  };
  const relative =
    '../%EB%8C%80%EC%83%81%20%5B1%5D.md?section=' +
    encodeURIComponent('둘째') +
    '#' +
    encodeURIComponent('중복 문단');
  const sourceHtml =
    '<a href="' +
    relative +
    '">문단 연결</a><a href="%EB%B9%88%20%EB%85%B8%ED%8A%B8.markdown">빈 노트</a><a href="https://external.test/docs.md">외부 문서</a><a href="https://notebook.test/NotePage?title=legacy">기존 링크</a>';
  state.boardPages = [];
  state.notePages = [
    note(991, '폴더/원본', sourceHtml),
    note(
      992,
      '대상 [1]',
      '<h2 data-section="첫째">중복 문단</h2><h2 data-section="둘째">중복 문단</h2>'
    ),
    note(993, '폴더/빈 노트', ''),
    note(994, 'legacy'),
  ];
  state.problemData = [];
  state.noteLinkTargets = new Map();
  state.noteLinkParser = urlToNoteLink;
  state.htmlLinks = new Map([[sourceHtml, extractHtmlLinks(sourceHtml)]]);
  try {
    const [link] = state.htmlLinks.get(sourceHtml);
    assert.notEqual(link.url, link.rawUrl);
    const graph = useKnowledgeGraphData();
    const paragraph = graph.nodes.find((node) => node.paragraph?.autoSection === '둘째');
    assert.ok(paragraph);
    assert.ok(graph.nodes.some((node) => node.id === 'note:content:993'));
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.type === 'REFERENCES' &&
          edge.source === 'note:content:991' &&
          edge.target === paragraph.id &&
          edge.targetSection === '둘째'
      )
    );
    assert.ok(
      graph.edges.some((edge) => edge.type === 'REFERENCES' && edge.target === 'note:content:993')
    );
    assert.ok(
      graph.edges.some((edge) => edge.type === 'REFERENCES' && edge.target === 'note:content:994')
    );
    const externalLinks = graph.nodes.filter((node) => node.instanceKind === 'EXTERNAL_LINK');
    assert.deepEqual(
      externalLinks.map((node) => node.description),
      ['https://external.test/docs.md']
    );
  } finally {
    global.location = previousLocation;
    global.DOMParser = previousDOMParser;
    state.noteLinkParser = undefined;
    state.htmlLinks = new Map();
    state.noteLinkTargets = new Map();
  }
});
