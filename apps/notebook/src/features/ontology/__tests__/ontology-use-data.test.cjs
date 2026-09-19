const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const output = mkdtempSync(path.join(tmpdir(), 'ontology-use-data-'));
const ontologyDirectory = path.join(__dirname, '..');
for (const name of [
  'relations',
  'titleKeywordClasses',
  'axioms',
  'links',
  'paragraphClassification',
  'useOntologyData',
]) {
  const source = readFileSync(path.join(ontologyDirectory, `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  writeFileSync(path.join(output, `${name}.js`), compiled.outputText);
}

const state = {
  boardPages: [],
  notePages: [],
  problemData: [],
  htmlLinks: new Map(),
  noteLinkTargets: new Map(),
};
const originalLoad = Module._load;
Module._load = function loadOntologyTestDependency(request, parent, isMain) {
  if (request === '@blacktokki/core') {
    return { useLangContext: () => ({ lang: () => '' }) };
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

  assert.ok(beforeTopicIds.has('노트 제목: api'));
  assert.ok(beforeTopicIds.has('주제: api'));
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
  assert.equal(directSupports.length, 2);
});

test('useOntologyData omits a top topic supported by only one child class', () => {
  state.boardPages = [];
  state.notePages = [
    note(11, '제품/API 계획'),
    note(12, '업무/API 구현'),
    note(13, '개발/API 점검'),
  ];

  const graph = useOntologyData();
  assert.ok(graph.nodes.some((node) => node.name === '노트 제목: api'));
  assert.equal(
    graph.nodes.some((node) => node.name === '주제: api'),
    false
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

test('a board-title keyword classifies the board note instance, not the board class', () => {
  state.boardPages = [board(21, 'API 계획')];
  state.notePages = [note(22, 'API 계획'), note(23, 'API 구현'), note(24, 'API 설계')];

  const graph = useOntologyData();
  const topicClass = graph.nodes.find((node) => node.name === '노트 제목: api');
  const boardNote = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === 'API 계획'
  );
  const boardClass = graph.nodes.find(
    (node) => node.classKind === 'BOARD_CARD' && node.name === 'API 계획'
  );

  assert.ok(topicClass);
  assert.ok(boardNote);
  assert.ok(boardClass);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' && edge.source === boardNote.id && edge.target === topicClass.id
    )
  );
  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.type === 'INSTANCE_OF' &&
        edge.source === boardClass.id &&
        edge.target === topicClass.id
    ),
    false
  );
});

test('board note paragraphs come only from the actual note with the same title', () => {
  state.boardPages = [
    {
      ...board(31, '프로젝트'),
      description: '<h2>보드 설정의 유령 문단</h2>',
    },
  ];
  state.notePages = [note(32, '프로젝트', '<h2>실제 문단</h2>')];

  const graph = useOntologyData();
  const boardNote = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === '프로젝트'
  );
  const actualParagraph = graph.nodes.find(
    (node) => node.instanceKind === 'PARAGRAPH' && node.name === '실제 문단'
  );

  assert.ok(boardNote);
  assert.ok(actualParagraph);
  assert.equal(
    graph.nodes.some(
      (node) => node.instanceKind === 'PARAGRAPH' && node.name === '보드 설정의 유령 문단'
    ),
    false
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'paragraphPartOf' &&
        edge.source === actualParagraph.id &&
        edge.target === boardNote.id
    )
  );
});

test('board-column paragraphs belong to their actual column note instead of the board root', () => {
  state.boardPages = [{ ...board(41, '프로젝트'), description: '' }];
  state.notePages = [note(42, '프로젝트/진행', '<h2>작업 묶음</h2><h3>카드</h3><h4>세부</h4>')];

  const graph = useOntologyData();
  const boardNote = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === '프로젝트'
  );
  const columnNote = graph.nodes.find(
    (node) => node.instanceKind === 'NOTE' && node.name === '프로젝트/진행'
  );
  const paragraph = graph.nodes.find(
    (node) => node.instanceKind === 'PARAGRAPH' && node.name === '작업 묶음'
  );
  const card = graph.nodes.find((node) => node.instanceKind === 'CARD' && node.name === '카드');
  const detail = graph.nodes.find(
    (node) => node.instanceKind === 'PARAGRAPH' && node.name === '세부'
  );

  assert.ok(boardNote);
  assert.ok(columnNote);
  assert.ok(paragraph);
  assert.ok(card);
  assert.ok(detail);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'notePartOf' &&
        edge.source === columnNote.id &&
        edge.target === boardNote.id
    )
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'paragraphPartOf' &&
        edge.source === paragraph.id &&
        edge.target === columnNote.id
    )
  );
  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'paragraphPartOf' &&
        edge.source === paragraph.id &&
        edge.target === boardNote.id
    ),
    false
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'cardPartOf' &&
        edge.source === card.id &&
        edge.target === paragraph.id
    )
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.propertyLabel === 'paragraphPartOf' &&
        edge.source === detail.id &&
        edge.target === card.id
    )
  );
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
