const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const load = require('../keywordRelation/__tests__/loadTs.cjs');
const knowledgeGraphDirectory = path.resolve(__dirname, '..');
const state = {
  boardPages: [],
  notePages: [],
  problemData: [],
  problemLoading: false,
  usageMode: 'NOTE',
  notebook: null,
  htmlLinks: new Map(),
  noteLinkTargets: new Map(),
  memoCache: undefined,
  memoIndex: 0,
};
const lang = () => '';
const { useKnowledgeGraphData } = load('../useKnowledgeGraphData.ts', {
  '@blacktokki/core': { useLangContext: () => ({ lang }) },
  '@blacktokki/editor': {
    extractHtmlLinks: (html) => state.htmlLinks.get(html) || [],
    toRaw: (html) => html.replace(/<[^>]*>/g, ' '),
  },
  react: {
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
  },
  '../../components/HeaderSelectBar': {
    paragraphDescription: () => '',
    parseHtmlToParagraphs: (html) => {
      const paragraphs = [
        { title: '', level: 0, path: '', description: html, autoSection: undefined },
      ];
      const ancestors = [];
      for (const [index, match] of [...html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi)].entries()) {
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
  },
  '../../components/SearchBar': {
    urlToNoteLink: (url, sourceTitle) =>
      state.noteLinkParser
        ? state.noteLinkParser(url, sourceTitle)
        : state.noteLinkTargets.get(url),
  },
  '../../hooks/useBoardStorage': {
    useBoardPages: () => ({ data: state.boardPages, isLoading: false }),
  },
  '../../hooks/useNoteStorage': {
    useNotePages: () => ({ data: state.notePages, isLoading: false }),
  },
  '../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ colorScheme: 'light' }) },
  '../../hooks/useUsageMode': {
    useUsageMode: () => ({ usageMode: state.usageMode, notebook: state.notebook }),
  },
  '../problem/useProblem': {
    __esModule: true,
    default: (_, options) => {
      state.problemOptions = options;
      return { data: state.problemData, isLoading: state.problemLoading };
    },
  },
});

const note = (id, title, description = '<p>내용</p>') => ({
  id,
  title,
  type: 'NOTE',
  description,
  updated: '2026-09-18T00:00:00.000Z',
  option: {},
});

test('search shares its source projection and skips problem validation while the graph view still validates', () => {
  state.notePages = [note('search-only', 'Synthetic source', '<h2>Section</h2><p>Data</p>')];
  state.boardPages = [];
  state.problemData = [{ title: 'Synthetic source', subtitles: ['Isolated note'] }];
  state.problemLoading = true;
  try {
    const first = useKnowledgeGraphData({ validation: false });
    const second = useKnowledgeGraphData({ validation: false });
    assert.equal(state.problemOptions.enabled, false);
    assert.equal(first.isLoading, false, 'search must not wait for unrelated document validation');
    assert.deepEqual(first.axioms.violations, []);
    assert.equal(first.nodes, second.nodes);
    assert.equal(first.edges, second.edges);
    const validated = useKnowledgeGraphData();
    assert.equal(state.problemOptions.enabled, true);
    assert.equal(validated.isLoading, true);
    assert.equal(validated.axioms.violations.length, 1);
    assert.notEqual(validated.nodes, first.nodes, 'layout must own a separate mutable projection');
    state.notePages = [note('search-only', 'Synthetic source', '<h2>Changed</h2><p>New data</p>')];
    const changed = useKnowledgeGraphData({ validation: false });
    assert.notEqual(changed.nodes, first.nodes);
    assert.ok(changed.nodes.some((node) => node.name === 'Changed'));
  } finally {
    state.problemLoading = false;
    state.problemData = [];
  }
});

test('only note instances receive YAML properties from their source', () => {
  state.boardPages = [{ id: 'b1', title: '프로젝트', option: { BOARD_HEADER_LEVEL: 3 } }];
  state.notePages = [
    note(
      'n1',
      '일반 노트',
      '---\nauthor: Alice\nschedule: 2026-09-21\n---\n<h1>섹션 제목</h1><p>본문 2026-09-99</p>'
    ),
    note('n2', '프로젝트/할 일', '<h3>카드 작업</h3><h4>카드 하위 헤더</h4>'),
  ];
  const graph = useKnowledgeGraphData();
  for (const kind of ['CLASS', 'CARD', 'PARAGRAPH']) {
    const nodes = graph.nodes.filter((node) => node.role === kind || node.instanceKind === kind);
    assert.ok(nodes.length > 0, kind);
    for (const node of nodes) assert.deepEqual(node.properties, {});
  }
  const source = graph.nodes.find((node) => node.id === 'note:content:n1');
  assert.deepEqual(source.properties, { author: 'Alice', schedule: '2026-09-21' });
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

test('creates named external-link instances and source references without an external-link class', () => {
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
    assert.equal(externalClass, undefined);
    assert.equal(externalLinks.length, 1);
    assert.equal(externalLinks[0].name, 'React 문서');
    assert.equal(externalLinks[0].description, 'https://example.com/docs');
    assert.equal(
      graph.edges.some(
        (edge) => edge.type === 'INSTANCE_OF' && edge.source === externalLinks[0].id
      ),
      false
    );
    const ids = new Set(graph.nodes.map((node) => node.id));
    assert.ok(graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
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
  global.DOMParser = function DOMParser() {
    return { parseFromString: (html) => domino.createWindow(html, global.location.href).document };
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

test('only topmost represented notes connect to the mode root while descendants follow their closest note ancestor', () => {
  const pages = [
    note(1001, 'Root'),
    note(1002, 'Root/Child'),
    note(1003, 'Root/Child/Leaf'),
    note(1004, 'Root/Gap/Leaf'),
    note(1005, 'Missing/Top'),
    note(1006, 'EmptyRoot', ''),
    note(1007, 'EmptyRoot/Child'),
    note(1008, 'Work'),
    note(1009, 'Work/Board/Doing', '<h3>Card</h3>'),
  ];
  state.boardPages = [board(1000, 'Work/Board')];
  state.htmlLinks = new Map();
  state.noteLinkTargets = new Map();
  try {
    for (const mode of ['NOTE', 'NOTEBOOK']) {
      state.usageMode = mode;
      state.notebook = mode === 'NOTEBOOK' ? { id: 7, title: 'Notebook' } : null;
      for (const notes of [pages, [...pages].reverse()]) {
        state.notePages = notes;
        const graph = useKnowledgeGraphData();
        assert.deepEqual(
          new Set(
            graph.edges.filter((edge) => edge.target === 'class:note').map((edge) => edge.source)
          ),
          new Set([1001, 1005, 1006, 1008].map((id) => `note:content:${id}`))
        );
        const parent = (id) =>
          graph.edges.find(
            (edge) => edge.source === `note:content:${id}` && edge.propertyLabel === 'notePartOf'
          )?.target;
        assert.equal(parent(1002), 'note:content:1001');
        assert.equal(parent(1003), 'note:content:1002');
        assert.equal(parent(1004), 'note:content:1001');
        assert.equal(parent(1007), 'note:content:1006');
        assert.equal(
          parent(1009),
          undefined,
          'board columns do not escape their board and attach to an outer note'
        );
        assert.ok(
          graph.edges.some(
            (edge) => edge.source === 'note:content:1009' && edge.target === 'class:boardCard:1000'
          )
        );
      }
    }
  } finally {
    state.usageMode = 'NOTE';
    state.notebook = null;
  }
});
