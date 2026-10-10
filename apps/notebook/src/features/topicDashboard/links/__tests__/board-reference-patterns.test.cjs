const { DOMParser: XmlDomParser, XMLSerializer } = require('@xmldom/xmldom');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '../../../..');
const origin = 'https://blacktokki.test';
const previousGlobals = {
  DOMParser: global.DOMParser,
  Node: global.Node,
  location: global.location,
};
let resolveFixtureAnchorUrls = true;
global.location = { origin, href: origin + '/' };
global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
global.DOMParser = function DOMParserFixture() {
  return { parseFromString: parseFixtureHtml };
};
function parseFixtureHtml(html) {
  const doc = new XmlDomParser().parseFromString('<body>' + html + '</body>', 'text/xml');
  doc.body = doc.documentElement;
  const elements = [];
  const serializer = new XMLSerializer();
  function visit(node) {
    if (node.nodeType === 1) {
      node.outerHTML = serializer.serializeToString(node);
      node.remove = () => node.parentNode?.removeChild(node);
      Object.defineProperty(node, 'innerHTML', {
        get: () =>
          Array.from(node.childNodes)
            .map((child) => serializer.serializeToString(child))
            .join(''),
      });
      node.tagName = node.tagName.toUpperCase();
      elements.push(node);
      if (node.tagName === 'A') {
        const href = node.getAttribute('href');
        try {
          node.href = resolveFixtureAnchorUrls ? new URL(href, global.location.href).href : href;
        } catch {
          node.href = href;
        }
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  }
  visit(doc.body);
  doc.querySelectorAll = (selector) =>
    elements.filter((node) =>
      selector.startsWith('.')
        ? (node.getAttribute('class') ?? '').split(/\s+/).includes(selector.slice(1))
        : node.tagName === selector.toUpperCase()
    );
  return doc;
}
test.after(() => Object.assign(global, previousGlobals));

function loadSource(source, dependencies = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  compileFunction(code, ['require', 'module', 'exports'])(
    (name) => (Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)),
    module,
    module.exports
  );
  return module.exports;
}
const editor = loadSource(
  readFileSync(
    path.resolve(sourceRoot, '../../../packages/blacktokki-editor/src/lib/dom.ts'),
    'utf8'
  )
);
const paragraphs = loadSource(
  readFileSync(path.join(sourceRoot, 'components/HeaderSelectBar.tsx'), 'utf8'),
  {
    '@blacktokki/core': { Text: () => null },
    '@blacktokki/editor': editor,
    'react-native': { StyleSheet: { create: (x) => x } },
    'react-native-vector-icons/FontAwesome': () => null,
    '../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles: {} }) },
  }
);
const searchFile = ts.createSourceFile(
  'SearchBar.tsx',
  readFileSync(path.join(sourceRoot, 'components/SearchBar.tsx'), 'utf8'),
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX
);
const noteLinks = loadSource(
  searchFile.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        ['toNoteParams', 'urlToNoteLink'].includes(node.name?.text)
    )
    .map((node) => node.getText(searchFile))
    .join('\n')
);
const { inferBoardCandidates, inferTopLevelBoardCandidates } = loadSource(
  readFileSync(path.join(sourceRoot, 'features/topicDashboard/inferBoardCandidates.ts'), 'utf8'),
  {
    '../../components/HeaderSelectBar': paragraphs,
  }
);
function loadVariable(relativePath, name) {
  const source = ts.createSourceFile(
    relativePath,
    readFileSync(path.join(sourceRoot, relativePath), 'utf8'),
    ts.ScriptTarget.ES2022,
    true
  );
  return loadSource(
    source.statements
      .filter(
        (node) =>
          ts.isVariableStatement(node) &&
          node.declarationList.declarations.some((item) => item.name.getText(source) === name)
      )
      .map((node) => node.getText(source))
      .join('\n')
  );
}
const problem = loadVariable('features/problem/useProblem.ts', 'matchUnlinkedKeyword');
const noteStorage = loadVariable('hooks/useNoteStorage.ts', 'getSplitTitle');
const { findBoardReferencePatterns: find } = loadSource(
  readFileSync(
    path.join(sourceRoot, 'features/topicDashboard/links/findBoardReferencePatterns.ts'),
    'utf8'
  ),
  {
    '@blacktokki/editor': editor,
    '../../../components/HeaderSelectBar': paragraphs,
    '../../../components/SearchBar': noteLinks,
    '../../problem/useProblem': problem,
    '../../../hooks/useNoteStorage': noteStorage,
  }
);

let id = 0;
const note = (title, description = '') => ({
  id: ++id,
  type: 'NOTE',
  title,
  description,
  option: {},
  userId: 1,
  order: 0,
  input: title,
  updated: '2026-10-02T00:00:00Z',
});
const board = (title, mode = 'SCRUM') => ({
  ...note(title),
  type: 'BOARD',
  option: { BOARD_TYPE: mode, BOARD_HEADER_LEVEL: 3 },
});
const href = (title, paragraph, section) => {
  const url = new URL(origin + '/NotePage');
  url.searchParams.set('title', title);
  if (paragraph) url.searchParams.set('paragraph', paragraph);
  if (section) url.searchParams.set('section', section);
  return url.href;
};
const anchor = (url, text = '연결') =>
  '<a href="' + url.replaceAll('&', '&amp;') + '">' + text + '</a>';
const anchors = (url, count = 2) =>
  Array.from({ length: count }, (_, i) => anchor(url, '연결 ' + i)).join('');
const targetBody = '<h2>대상행</h2><h3>대상카드</h3>';
const sourceBody = (kind, links) =>
  '<p>' +
  (kind === 'COLUMN' ? links : '') +
  '</p><h2>소스행</h2><p>' +
  (kind === 'ROW' ? links : '') +
  '</p><h3>소스카드</h3><p>' +
  (kind === 'CARD' ? links : '') +
  '</p>';
const data = (kind, links, body = targetBody) => [
  note('A/원본', sourceBody(kind, links)),
  note('B/대상', body),
];
const variedTargetBody = targetBody + '<h3>추가카드</h3>';
const variedCardData = (kind) => [
  note('A/원본', sourceBody(kind, anchor(href('B/대상', '대상카드')))),
  note('B/대상', variedTargetBody),
  note(
    'A/추가열',
    sourceBody(kind, anchor(href('B/대상', '추가카드'))).replace('소스행', '추가행')
  ),
];
const actualBoards = () => [board('A'), board('B')];
const linkOccurrences = (result) =>
  result.linkClassifications.linkClassifications.flatMap((group) => group.occurrences);
const excludedLinkOccurrences = (result) =>
  Object.values(result.linkClassifications.excludedLinkClassifications)
    .flat()
    .flatMap((group) => group.occurrences);
const boardPatterns = (result) =>
  result.patterns.filter((pattern) => pattern.sourceBoard && pattern.targetBoard);
function expectedPattern(result, pattern, source, target) {
  const matches = result.patterns.filter(
    (group) =>
      group.pattern === pattern &&
      (group.sourceBoard?.title ?? group.sourceNote?.title) === source &&
      (group.targetBoard?.title ?? group.targetNote?.title) === target
  );
  assert.equal(matches.length, 1, source + '->' + target + ': ' + pattern);
  return matches[0];
}

function expectedDecisions(result, pattern, source, target, count = 2) {
  const decisions = linkOccurrences(result)
    .flatMap((occurrence) => occurrence.classifications)
    .filter(
      (decision) =>
        decision.pattern === pattern &&
        (decision.source.boardTitle ?? decision.source.ownerNoteTitle) === source &&
        (decision.target.boardTitle ?? decision.target.ownerNoteTitle) === target
    );
  assert.equal(decisions.length, count, source + '->' + target + ': ' + pattern);
  return decisions;
}

function expectOnlyBoardPatterns(result) {
  for (const pattern of result.patterns) {
    assert.ok(
      new Set(
        pattern.matches
          .filter((match) => match.referenceType === 'LINK')
          .map((match) => match.source.id)
      ).size >= 2
    );
    assert.match(pattern.pattern, /^(ROW|COLUMN|CARD)->(ROW|COLUMN|CARD)$/);
    assert.ok(pattern.sourceBoard);
    assert.ok(pattern.targetBoard);
    assert.equal(Object.hasOwn(pattern, 'sourceNote'), false);
    assert.equal(Object.hasOwn(pattern, 'targetNote'), false);
    for (const match of pattern.matches) {
      assert.equal(match.source.containerType, 'BOARD');
      assert.equal(match.target.containerType, 'BOARD');
    }
  }
  for (const occurrence of linkOccurrences(result)) {
    assert.equal(occurrence.classifications.length, 1);
    const classification = occurrence.classifications[0];
    assert.match(classification.pattern, /^(ROW|COLUMN|CARD)->(ROW|COLUMN|CARD)$/);
    assert.equal(classification.source.containerType, 'BOARD');
    assert.equal(classification.target.containerType, 'BOARD');
  }
}

function expectUnsupported(result, count) {
  assert.equal(result.patterns.length, 0);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.linkClassifications.linkClassifications, []);
  const occurrences = excludedLinkOccurrences(result);
  assert.equal(occurrences.length, count);
  for (const occurrence of occurrences) {
    assert.equal(occurrence.pattern, null);
    assert.equal(occurrence.isRepeatedPattern, false);
    assert.equal(occurrence.exclusionReason, 'UNSUPPORTED_PATTERN');
    assert.equal(occurrence.classifications.length, 1);
    assert.equal(occurrence.classifications[0].exclusionReason, 'UNSUPPORTED_PATTERN');
  }
  return occurrences;
}

for (const source of ['ROW', 'COLUMN', 'CARD']) {
  for (const target of ['ROW', 'COLUMN', 'CARD']) {
    test('rejects repeated ' + source + '->' + target + ' references to one target', () => {
      const url = href(
        'B/대상',
        target === 'ROW' ? '대상행' : target === 'CARD' ? '대상카드' : undefined
      );
      const result = find(data(source, anchors(url)), actualBoards(), []);
      assert.equal(result.patterns.length, 0);
      assert.deepEqual(result.patterns, []);
      assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
      const decisions = expectedDecisions(result, source + '->' + target, 'A', 'B');
      assert.equal(decisions[0].target.id, decisions[1].target.id);
      for (const decision of decisions) {
        assert.equal(decision.source.kind, source);
        assert.equal(decision.target.kind, target);
        assert.equal(decision.isRepeatedPattern, false);
      }
    });
  }
}

for (const boardKind of ['ROW', 'COLUMN', 'CARD']) {
  for (const noteKind of ['SUBNOTE', 'PARAGRAPH']) {
    test('rejects repeated ' + boardKind + '->' + noteKind + ' references to one target', () => {
      const url = noteKind === 'SUBNOTE' ? href('N/하위') : href('N', '대상문단');
      const pages = [
        note('A/원본', sourceBody(boardKind, anchors(url))),
        note('N', '<h2>대상문단</h2>'),
        note('N/하위', '<p>하위노트 본문</p>'),
      ];
      const result = find(pages, [board('A')], []);
      const occurrences = expectUnsupported(result, 2);
      assert.equal(occurrences[0].target.id, occurrences[1].target.id);
      for (const occurrence of occurrences) {
        assert.equal(occurrence.source.kind, boardKind);
        assert.equal(occurrence.target.kind, noteKind);
      }
    });
    test('rejects repeated ' + noteKind + '->' + boardKind + ' references to one target', () => {
      const url = href(
        'B/대상',
        boardKind === 'ROW' ? '대상행' : boardKind === 'CARD' ? '대상카드' : undefined
      );
      const pages = [
        note('B/대상', targetBody),
        note('N', '<h2>소스문단</h2>' + (noteKind === 'PARAGRAPH' ? anchors(url) : '')),
        note('N/하위', '<p>' + (noteKind === 'SUBNOTE' ? anchors(url) : '') + '</p>'),
      ];
      const result = find(pages, [board('B')], []);
      const occurrences = expectUnsupported(result, 2);
      assert.equal(occurrences[0].target.id, occurrences[1].target.id);
      for (const occurrence of occurrences) {
        assert.equal(occurrence.source.kind, noteKind);
        assert.equal(occurrence.target.kind, boardKind);
      }
    });
  }
}

const boardKinds = ['ROW', 'COLUMN', 'CARD'];
const elementKinds = [...boardKinds, 'SUBNOTE', 'PARAGRAPH'];
function distinctElements(root, kind, links = ['', ''], headingPrefix = '') {
  if (boardKinds.includes(kind)) {
    return [1, 2].map((i) =>
      note(
        root + '/열' + i,
        '<p>' +
          (kind === 'COLUMN' ? links[i - 1] : '') +
          '</p><h2>' +
          headingPrefix +
          '행' +
          i +
          '</h2><p>' +
          (kind === 'ROW' ? links[i - 1] : '') +
          '</p><h3>' +
          headingPrefix +
          '카드' +
          i +
          '</h3><p>' +
          (kind === 'CARD' ? links[i - 1] : '') +
          '</p>'
      )
    );
  }
  if (kind === 'SUBNOTE') {
    return [
      note(root),
      ...[1, 2].map((i) => note(root + '/하위' + i, '<p>' + links[i - 1] + '</p>')),
    ];
  }
  return [note(root, '<h2>문단1</h2><p>' + links[0] + '</p><h2>문단2</h2><p>' + links[1] + '</p>')];
}

for (const sourceKind of boardKinds) {
  for (const targetKind of boardKinds) {
    test(
      'accepts distinct sources for ' + sourceKind + '->' + targetKind + ' with one target',
      () => {
        const url = href(
          'B/대상',
          targetKind === 'ROW' ? '대상행' : targetKind === 'CARD' ? '대상카드' : undefined
        );
        const pages = [
          ...distinctElements('A', sourceKind, [anchor(url), anchor(url)]),
          note('B/대상', targetBody),
        ];
        const result = find(pages, actualBoards(), []);
        const pattern = expectedPattern(result, sourceKind + '->' + targetKind, 'A', 'B');
        assert.equal(pattern.count, 2);
        assert.equal(pattern.occurrenceCount, 2);
        assert.equal(pattern.uniqueSourceCount, 2);
        assert.equal(pattern.uniqueTargetCount, 1);
        for (const decision of expectedDecisions(result, pattern.pattern, 'A', 'B')) {
          assert.equal(decision.isRepeatedPattern, true);
        }
      }
    );

    test(
      'rejects one source for ' + sourceKind + '->' + targetKind + ' with distinct targets',
      () => {
        const links = [1, 2].map((i) =>
          anchor(
            href(
              'B/열' + i,
              targetKind === 'ROW' ? '행' + i : targetKind === 'CARD' ? '카드' + i : undefined
            )
          )
        );
        const pages = [
          note('A/원본', sourceBody(sourceKind, links.join(''))),
          ...distinctElements('B', targetKind),
        ];
        const result = find(pages, actualBoards(), []);
        assert.equal(result.patterns.length, 0);
        const decisions = expectedDecisions(result, sourceKind + '->' + targetKind, 'A', 'B');
        assert.equal(decisions[0].source.id, decisions[1].source.id);
        assert.notEqual(decisions[0].target.id, decisions[1].target.id);
        for (const decision of decisions) assert.equal(decision.isRepeatedPattern, false);
      }
    );
  }
}

test('treats a shared source row across columns as one source observation', () => {
  const pages = [
    note('A/첫열', sourceBody('ROW', anchor(href('B/대상', '대상카드')))),
    note('A/둘째열', sourceBody('ROW', anchor(href('B/대상', '추가카드')))),
    note('B/대상', variedTargetBody),
  ];
  const result = find(pages, actualBoards(), []);
  assert.equal(result.patterns.length, 0);
  const decisions = expectedDecisions(result, 'ROW->CARD', 'A', 'B');
  assert.notEqual(decisions[0].source.noteTitle, decisions[1].source.noteTitle);
  assert.equal(decisions[0].source.id, decisions[1].source.id);
  for (const decision of decisions) assert.equal(decision.isRepeatedPattern, false);
});

test('deduplicates connections across source subparagraphs and target aliases', () => {
  const pages = [
    note(
      'A/원본',
      '<h2>행</h2><h3>a1</h3>' +
        anchor(href('B/대상', 'b1'), '직접 참조') +
        '<h4>출발세부</h4>' +
        anchor(href('B', '대상세부'), '별칭 참조') +
        '<h3>a2</h3>' +
        anchor(href('B/대상', 'b2'))
    ),
    note('B/대상', '<h2>행</h2><h3>b1</h3><h4>대상세부</h4><h3>b2</h3>'),
  ];
  const result = find(pages, actualBoards(), []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.count, 2);
  assert.equal(pattern.occurrenceCount, 3);
  assert.equal(pattern.uniqueSourceCount, 2);
  assert.equal(pattern.uniqueTargetCount, 2);
  assert.equal(pattern.matches.length, 3);
  assert.equal(pattern.matches[0].source.id, pattern.matches[1].source.id);
  assert.equal(pattern.matches[0].target.id, pattern.matches[1].target.id);
  assert.notEqual(pattern.matches[0].linkText, pattern.matches[1].linkText);
  assert.equal(linkOccurrences(result).length, 3);
});

test('duplicate occurrences do not increase pattern priority or break source-count ties', () => {
  const pages = [
    note(
      'A/원본',
      '<h2>행</h2><h3>a1</h3>' +
        anchor(href('B/대상', 'b1')) +
        '<h3>a2</h3>' +
        anchor(href('B/대상', 'b2'))
    ),
    note(
      'M/원본',
      '<h2>행</h2><h3>m1</h3>' +
        anchor(href('B/대상', 'b1')) +
        '<h3>m2</h3>' +
        anchor(href('B/대상', 'b2')) +
        '<h3>m3</h3>' +
        anchor(href('B/대상', 'b1'))
    ),
    note(
      'Z/원본',
      '<h2>행</h2><h3>z1</h3>' +
        anchors(href('B/대상', 'b1'), 100) +
        '<h3>z2</h3>' +
        anchor(href('B/대상', 'b2'))
    ),
    note('B/대상', '<h2>행</h2><h3>b1</h3><h3>b2</h3>'),
  ];
  const result = find(
    pages,
    ['A', 'M', 'Z', 'B'].map((title) => board(title)),
    []
  );
  assert.deepEqual(
    result.patterns.map(({ sourceBoard, count, occurrenceCount }) => [
      sourceBoard.title,
      count,
      occurrenceCount,
    ]),
    [
      ['M', 3, 3],
      ['A', 2, 2],
      ['Z', 2, 101],
    ]
  );
  const duplicates = expectedPattern(result, 'CARD->CARD', 'Z', 'B');
  assert.equal(duplicates.matches.length, 101);
  assert.equal(duplicates.uniqueSourceCount, 2);
  assert.equal(duplicates.uniqueTargetCount, 2);
  assert.equal(expectedDecisions(result, 'CARD->CARD', 'Z', 'B', 101).length, 101);
});

function recommendationData(total, supporting) {
  return [
    note(
      'A/원본',
      Array.from(
        { length: total },
        (_, index) =>
          '<h3>a' + (index + 1) + '</h3>' + (index < supporting ? anchor(href('B/대상', 'b1')) : '')
      ).join('')
    ),
    note('B/대상', '<h3>b1</h3>'),
  ];
}
const recommendationBoards = () => [board('A', 'KANBAN'), board('B', 'KANBAN')];

test('recommends only unconnected keyword sources without population thresholds', () => {
  const pages = recommendationData(99, 2);
  const before = expectedPattern(find(pages, recommendationBoards(), []), 'CARD->CARD', 'A', 'B');
  assert.deepEqual(before.recommendationSources, []);
  assert.equal(before.isRecommendationSupported, false);
  for (let i = 3; i <= 19; i++) {
    pages[0].description = pages[0].description.replace(
      '<h3>a' + i + '</h3>',
      '<h3>a' + i + '</h3><p>b1</p>'
    );
  }
  const result = find(pages, recommendationBoards(), []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.isRecommendationSupported, true);
  assert.deepEqual(
    Object.keys(pattern).sort(),
    [
      'count',
      'isRecommendationSupported',
      'matches',
      'occurrenceCount',
      'pattern',
      'qed',
      'recommendationSources',
      'sourceBoard',
      'targetBoard',
      'uniqueSourceCount',
      'uniqueTargetCount',
    ].sort()
  );
  assert.deepEqual(
    pattern.recommendationSources.map((source) => source.title),
    Array.from({ length: 17 }, (_, i) => 'a' + (i + 3))
  );
  for (const source of pattern.recommendationSources) {
    assert.equal(source.boardTitle, 'A');
    assert.equal(source.kind, 'CARD');
    assert.equal(Object.hasOwn(source, 'target'), false);
    assert.ok(
      pattern.matches.some(
        (match) => match.referenceType === 'POTENTIAL' && match.source.id === source.id
      )
    );
    assert.equal(
      pattern.matches.some(
        (match) => match.referenceType === 'LINK' && match.source.id === source.id
      ),
      false
    );
  }
});

test('recommends a keyword source even when actual links mostly use another target kind', () => {
  const source = note(
    'A/원본',
    Array.from(
      { length: 27 },
      (_, i) =>
        '<h3>a' +
        (i + 1) +
        '</h3>' +
        anchor(href('B/대상', i < 8 ? 'b1' : undefined)) +
        (i === 8 ? '<p>b1</p>' : '')
    ).join('')
  );
  const pattern = expectedPattern(
    find([source, note('B/대상', '<h3>b1</h3>')], recommendationBoards(), []),
    'CARD->CARD',
    'A',
    'B'
  );
  assert.equal(pattern.isRecommendationSupported, true);
  assert.deepEqual(
    pattern.recommendationSources.map((source) => source.title),
    ['a9']
  );
});

test('keeps one-source target kinds out of patterns and does not recommend unrelated elements', () => {
  const columnLinks = Array.from({ length: 198 }, (_, index) => anchor(href('B/열' + index))).join(
    ''
  );
  const pages = [
    note(
      'A/원본',
      '<h3>a1</h3>' +
        anchor(href('B/대상', 'b1')) +
        columnLinks +
        anchor(href('B/대상', '대상행')) +
        '<h3>a2</h3>' +
        anchor(href('B/대상', 'b1')) +
        '<h3>a3</h3>'
    ),
    note('B/대상', '<h2>대상행</h2><h3>b1</h3>'),
    ...Array.from({ length: 198 }, (_, index) => note('B/열' + index)),
  ];
  const result = find(pages, [board('A', 'KANBAN'), board('B')], []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(result.patterns.length, 1);

  assert.equal(pattern.isRecommendationSupported, false);
  assert.deepEqual(pattern.recommendationSources, []);
});

for (const competingRow of [false, true]) {
  test(
    'unique target fanout cannot change source counts or recommendations with competing row=' +
      competingRow,
    () => {
      const columnLinks = Array.from({ length: 8 }, (_, index) =>
        anchor(href('B/열' + index))
      ).join('');
      const extraLinks = Array.from({ length: 30 }, (_, index) =>
        anchor(href('B/대상', 'b' + (index + 2)))
      ).join('');
      const targetCards = Array.from(
        { length: 31 },
        (_, index) => '<h3>b' + (index + 1) + '</h3>'
      ).join('');
      const makePages = (links) => [
        note(
          'A/원본',
          '<h3>a1</h3>' +
            anchor(href('B/대상', 'b1')) +
            links +
            columnLinks +
            (competingRow ? anchor(href('B/대상', '대상행')) : '') +
            '<h3>a2</h3>' +
            anchor(href('B/대상', 'b1')) +
            '<h3>a3</h3>'
        ),
        note('B/대상', '<h2>대상행</h2>' + targetCards),
        ...Array.from({ length: 8 }, (_, index) => note('B/열' + index)),
      ];
      const boards = [board('A', 'KANBAN'), board('B')];
      const before = expectedPattern(find(makePages(''), boards, []), 'CARD->CARD', 'A', 'B');
      const after = expectedPattern(
        find(makePages(extraLinks), boards, []),
        'CARD->CARD',
        'A',
        'B'
      );
      assert.equal(before.count, 2);
      assert.equal(after.count, 32);
      assert.equal(after.uniqueSourceCount, 2);
      assert.equal(before.isRecommendationSupported, false);
      assert.equal(after.isRecommendationSupported, before.isRecommendationSupported);
      assert.deepEqual(after.recommendationSources, before.recommendationSources);
    }
  );
}

test('prioritizes independent source observations over many unique targets from one source', () => {
  const pages = recommendationData(3, 3);
  pages[1].description = Array.from(
    { length: 31 },
    (_, index) => '<h3>b' + (index + 1) + '</h3>'
  ).join('');
  pages.push(
    note(
      'Z/원본',
      '<h3>z1</h3>' +
        Array.from({ length: 31 }, (_, index) => anchor(href('B/대상', 'b' + (index + 1)))).join(
          ''
        ) +
        '<h3>z2</h3>' +
        anchor(href('B/대상', 'b1')) +
        '<h3>z3</h3>'
    )
  );
  const result = find(pages, [...recommendationBoards(), board('Z', 'KANBAN')], []);
  assert.deepEqual(
    result.patterns.map(({ sourceBoard, uniqueSourceCount, count }) => [
      sourceBoard.title,
      uniqueSourceCount,
      count,
    ]),
    [
      ['A', 3, 3],
      ['Z', 2, 32],
    ]
  );
  assert.ok(result.patterns.every((pattern) => !pattern.isRecommendationSupported));
});

test('duplicate links do not change distinct connections or recommended sources', () => {
  const pages = recommendationData(3, 2);
  const before = expectedPattern(find(pages, recommendationBoards(), []), 'CARD->CARD', 'A', 'B');
  pages[0].description = pages[0].description.replace(
    '<h3>a2</h3>',
    anchors(href('B/대상', 'b1'), 100) + '<h3>a2</h3>'
  );
  const after = expectedPattern(find(pages, recommendationBoards(), []), 'CARD->CARD', 'A', 'B');
  assert.equal(after.count, 2);
  assert.equal(after.occurrenceCount, 102);
  assert.deepEqual(after.recommendationSources, before.recommendationSources);
});

test('counts shared rows once and does not recommend a row without a keyword', () => {
  const link = anchor(href('B/대상', '대상카드'));
  const pages = [
    note(
      'A/첫열',
      '<h2>공유행</h2>' + link + '<h3>카드1</h3><h2>둘째행</h2>' + link + '<h3>카드2</h3>'
    ),
    note('A/둘째열', '<h2>공유행</h2>' + link + '<h3>카드3</h3><h2>남은행</h2><h3>카드4</h3>'),
    note('B/대상', targetBody),
  ];
  const pattern = expectedPattern(find(pages, actualBoards(), []), 'ROW->CARD', 'A', 'B');
  assert.equal(pattern.count, 2);
  assert.equal(pattern.occurrenceCount, 3);
  assert.equal(pattern.isRecommendationSupported, false);
  assert.deepEqual(
    pattern.recommendationSources.map((source) => source.title),
    []
  );
});

test('recommends a hidden keyword card only before conversion to an actual board', () => {
  const link = anchor(href('B/대상', '대상카드'));
  const pages = [
    note(
      'A/첫열',
      '<h2>행</h2><h3>a1</h3>' + link + '<h4>세부</h4><h1>소개</h1><h3>숨긴카드</h3><p>대상카드</p>'
    ),
    note('A/둘째열', '<h2>행</h2><h3>a2</h3>' + link),
    note('B/대상', targetBody),
  ];
  const actual = expectedPattern(find(pages, actualBoards(), []), 'CARD->CARD', 'A', 'B');
  const candidate = expectedPattern(
    find(pages, [board('B')], [{ title: 'A', option: board('A').option }]),
    'CARD->CARD',
    'A',
    'B'
  );
  assert.deepEqual(actual.recommendationSources, []);
  assert.deepEqual(
    candidate.recommendationSources.map((source) => source.title),
    ['숨긴카드']
  );
  assert.equal(candidate.isRecommendationSupported, true);
});

test('does not recommend unrelated sources when other directions and kinds have links', () => {
  const pages = recommendationData(3, 2);
  pages[0].description =
    anchor(href('B/대상')) + pages[0].description + anchor(href('C/대상', 'c1'));
  pages[1].description += anchor(href('A/원본', 'a1'));
  pages.push(note('C/대상', '<h3>c1</h3>'));
  const result = find(pages, [...recommendationBoards(), board('C', 'KANBAN')], []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.isRecommendationSupported, false);
  assert.deepEqual(
    pattern.recommendationSources.map((source) => source.title),
    []
  );
});

test('keeps unresolved links in diagnostics without counting them as competing resolved links', () => {
  const pages = recommendationData(3, 2);
  pages[0].description += anchor(href('B/없는열', '대상카드'));
  const result = find(pages, recommendationBoards(), []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.isRecommendationSupported, false);
  assert.equal(
    result.linkClassifications.excludedLinkClassifications.UNRESOLVED_TARGET[0].count,
    1
  );
  assert.deepEqual(
    pattern.recommendationSources.map((source) => source.title),
    []
  );
});

test('prioritizes patterns with recommendation candidates over larger patterns without keywords', () => {
  const pages = recommendationData(99, 2);
  pages[0].description = pages[0].description.replaceAll(
    anchor(href('B/대상', 'b1')),
    anchor(href('B/대상', 'b1')) + anchor(href('B/대상', 'b2'))
  );
  pages[1].description += '<h3>b2</h3>';
  pages.push(
    note(
      'C/원본',
      '<h3>c1</h3>' +
        anchor(href('B/대상', 'b1')) +
        '<h3>c2</h3>' +
        anchor(href('B/대상', 'b1')) +
        '<h3>c3</h3><p>b1</p>'
    )
  );
  const result = find(pages, [...recommendationBoards(), board('C', 'KANBAN')], []);
  assert.deepEqual(
    result.patterns.map(({ sourceBoard, count, isRecommendationSupported }) => [
      sourceBoard.title,
      count,
      isRecommendationSupported,
    ]),
    [
      ['C', 3, true],
      ['A', 4, false],
    ]
  );
  assert.deepEqual(
    result.patterns[0].recommendationSources.map((source) => source.title),
    ['c3']
  );
  assert.deepEqual(result.patterns[1].recommendationSources, []);
});

for (const sourceKind of elementKinds) {
  for (const targetKind of elementKinds) {
    if (!boardKinds.includes(sourceKind) && !boardKinds.includes(targetKind)) continue;
    test(
      'classifies distinct ' + sourceKind + '->' + targetKind + ' pairs within the supported scope',
      () => {
        const sourceRoot = boardKinds.includes(sourceKind) ? 'A' : 'N';
        const targetRoot = boardKinds.includes(targetKind) ? 'B' : 'M';
        const links = [1, 2].map((i) =>
          anchor(
            boardKinds.includes(targetKind)
              ? href(
                  targetRoot + '/열' + i,
                  targetKind === 'ROW' ? '행' + i : targetKind === 'CARD' ? '카드' + i : undefined
                )
              : targetKind === 'SUBNOTE'
              ? href(targetRoot + '/하위' + i)
              : href(targetRoot, '문단' + i)
          )
        );
        const pages = [
          ...distinctElements(sourceRoot, sourceKind, links, '출발'),
          ...distinctElements(targetRoot, targetKind),
        ];
        const boards = [];
        if (boardKinds.includes(sourceKind)) boards.push(board(sourceRoot));
        if (boardKinds.includes(targetKind)) boards.push(board(targetRoot));
        const result = find(pages, boards, []);
        if (!boardKinds.includes(sourceKind) || !boardKinds.includes(targetKind)) {
          expectUnsupported(result, 2);
          return;
        }
        expectOnlyBoardPatterns(result);
        assert.ok(result.patterns.length > 0);
        assert.equal(result.patterns.length, 1);
        const pattern = expectedPattern(
          result,
          sourceKind + '->' + targetKind,
          sourceRoot,
          targetRoot
        );
        assert.equal(pattern.pattern, sourceKind + '->' + targetKind);
        assert.equal(pattern.count, 2);
        assert.equal(pattern.matches.length, 2);
        assert.equal(result.linkClassifications.linkClassifications.length, 2);
        for (const classification of linkOccurrences(result)) {
          assert.equal(classification.pattern, sourceKind + '->' + targetKind);
          assert.equal(classification.isRepeatedPattern, true);
          assert.equal(classification.exclusionReason, undefined);
          assert.equal(classification.source.kind, sourceKind);
          assert.equal(classification.target.kind, targetKind);
        }
        assert.equal(pattern.matches[0].pattern, sourceKind + '->' + targetKind);
        assert.notEqual(pattern.matches[0].source.id, pattern.matches[1].source.id);
        assert.notEqual(pattern.matches[0].target.id, pattern.matches[1].target.id);
      }
    );
  }
}

test('groups a1->b1 and a2->b2 within the same column notes as one card pattern', () => {
  const pages = [
    note(
      'A/원본',
      '<h2>행</h2><h3>a1</h3>' +
        anchor(href('B/대상', 'b1')) +
        '<h3>a2</h3>' +
        anchor(href('B/대상', 'b2'))
    ),
    note('B/대상', '<h2>행</h2><h3>b1</h3><h3>b2</h3>'),
  ];
  const result = find(pages, actualBoards(), []);
  assert.equal(result.patterns.length, 1);
  assert.equal(boardPatterns(result).length, 1);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.count, 2);
  assert.deepEqual(
    pattern.matches.map(({ source, target }) => [source.title, target.title]),
    [
      ['a1', 'b1'],
      ['a2', 'b2'],
    ]
  );
  assert.deepEqual(
    pattern.matches.map((match) => match.proposition),
    [
      "보드 'A'의 열 'A/원본'에 있는 카드 'a1'에 포함된 '연결'은(는) 보드 'B'의 열 'B/대상'에 있는 카드 'b1'에 연결된다.",
      "보드 'A'의 열 'A/원본'에 있는 카드 'a2'에 포함된 '연결'은(는) 보드 'B'의 열 'B/대상'에 있는 카드 'b2'에 연결된다.",
    ]
  );
  assert.equal(pattern.qed, "보드 'A'의 카드은(는) 보드 'B'의 카드로 연결된다.");
  expectOnlyBoardPatterns(result);
});

test('counts unique connections while preserving duplicate reference occurrences', () => {
  const pages = variedCardData('CARD');
  pages[0].description += anchor(href('B/대상', '대상카드'));
  const result = find(pages, actualBoards(), []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.count, 2);
  assert.equal(pattern.occurrenceCount, 3);
  assert.equal(pattern.uniqueSourceCount, 2);
  assert.equal(pattern.uniqueTargetCount, 2);
  assert.equal(pattern.matches.length, 3);
  assert.deepEqual(
    pattern.matches.map((match) => match.target.title),
    ['대상카드', '대상카드', '추가카드']
  );
  assert.equal(result.linkClassifications.linkClassifications.length, 2);
  assert.deepEqual(
    result.linkClassifications.linkClassifications.map((group) => group.count),
    [2, 1]
  );
  for (const occurrence of linkOccurrences(result)) {
    assert.equal(occurrence.isRepeatedPattern, true);
  }
  expectOnlyBoardPatterns(result);
  for (const repeated of result.patterns) {
    assert.ok(new Set(repeated.matches.map((match) => match.source.id)).size >= 2);
  }
});

test('treats a shared row reached through different columns as one target', () => {
  const pages = [
    note(
      'A/원본',
      sourceBody('CARD', anchor(href('B/첫열', '공유행')) + anchor(href('B/둘째열', '공유행')))
    ),
    note('B/첫열', '<h2>공유행</h2><h3>첫카드</h3>'),
    note('B/둘째열', '<h2>공유행</h2><h3>둘째카드</h3>'),
  ];
  const result = find(pages, actualBoards(), []);
  assert.equal(boardPatterns(result).length, 0);
  const rows = expectedDecisions(result, 'CARD->ROW', 'A', 'B');
  assert.notEqual(rows[0].target.noteTitle, rows[1].target.noteTitle);
  assert.equal(rows[0].target.id, rows[1].target.id);
  assert.equal(rows[0].isRepeatedPattern, false);
  assert.equal(rows[1].isRepeatedPattern, false);
  assert.equal(result.patterns.length, 0);
  expectOnlyBoardPatterns(result);
});

test('treats different subparagraphs of the same card as one board target', () => {
  const pages = data(
    'CARD',
    anchor(href('B/대상', '세부1')) + anchor(href('B/대상', '세부2')),
    targetBody + '<h4>세부1</h4><h4>세부2</h4>'
  );
  const result = find(pages, actualBoards(), []);
  assert.equal(boardPatterns(result).length, 0);
  const cards = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.equal(cards[0].target.id, cards[1].target.id);
  assert.equal(cards[0].isRepeatedPattern, false);
  assert.equal(cards[1].isRepeatedPattern, false);
  assert.equal(result.patterns.length, 0);
  expectOnlyBoardPatterns(result);
});

test('one reference does not reach the repetition threshold', () => {
  const result = find(data('CARD', anchors(href('B/대상', '대상카드'), 1)), actualBoards(), []);
  assert.deepEqual(Object.keys(result).sort(), ['linkClassifications', 'patterns']);
  const { linkClassifications, ...otherClassifications } = result.linkClassifications;
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(otherClassifications, {
    excludedLinkClassifications: {},
    potentialLinkClassifications: [],
    excludedPotentialLinkClassifications: {},
  });
  assert.equal(linkClassifications.length, 1);
  assert.equal(linkClassifications[0].occurrences[0].pattern, 'CARD->CARD');
  assert.equal(linkClassifications[0].occurrences[0].isRepeatedPattern, false);
  assert.equal(linkClassifications[0].occurrences[0].classifications.length, 1);
  for (const classification of linkClassifications[0].occurrences[0].classifications) {
    assert.equal(classification.isRepeatedPattern, false);
  }
});
test('different patterns are counted separately', () => {
  const url = href('B/대상', '대상카드');
  const pages = data('ROW', anchor(url));
  pages[0].description += '<p>' + anchor(url) + '</p>';
  const result = find(pages, actualBoards(), []);
  assert.equal(boardPatterns(result).length, 0);
  assert.equal(result.patterns.length, 0);
  const decisions = linkOccurrences(result);
  assert.deepEqual(
    decisions.map((decision) => decision.pattern),
    ['ROW->CARD', 'CARD->CARD']
  );
  assert.equal(decisions[0].target.id, decisions[1].target.id);
  expectOnlyBoardPatterns(result);
});
test('different board pairs are counted separately', () => {
  const pages = data(
    'ROW',
    anchor(href('B/대상', '대상카드')) + anchor(href('C/대상', '대상카드'))
  );
  pages.push(note('C/대상', targetBody));
  assert.equal(find(pages, [...actualBoards(), board('C')], []).patterns.length, 0);
});
test('actual boards and inferred candidates can form a pattern together', () => {
  const pages = variedCardData('ROW');
  pages.push(note('B/다른열', targetBody));
  const boards = [board('A')];
  const candidates = inferBoardCandidates(pages, boards);
  const result = find(pages, boards, candidates);
  assert.equal(result.patterns[0].sourceBoard.origin, 'BOARD');
  assert.equal(result.patterns[0].targetBoard.origin, 'CANDIDATE');
});
test('actual settings override an overlapping candidate', () => {
  const result = find(
    variedCardData('ROW'),
    [board('A', 'KANBAN'), board('B')],
    [{ title: 'A', option: board('A').option }]
  );
  assert.equal(result.patterns[0].pattern, 'COLUMN->CARD');
  assert.equal(result.patterns[0].sourceBoard.origin, 'BOARD');
});
test('candidate source boards and candidate-only board pairs are included', () => {
  const pages = variedCardData('CARD');
  pages.push(note('A/다른열', sourceBody('CARD', '')), note('B/다른열', targetBody));
  for (const boards of [[board('B')], []]) {
    const result = find(pages, boards, inferBoardCandidates(pages, boards));
    assert.equal(result.patterns[0].sourceBoard.origin, 'CANDIDATE');
    assert.equal(result.patterns[0].targetBoard.origin, boards.length ? 'BOARD' : 'CANDIDATE');
  }
});
test('opposite directions are counted separately', () => {
  const pages = data('CARD', anchor(href('B/대상', '대상카드')));
  pages[1].description += '<p>' + anchor(href('A/원본', '소스카드')) + '</p>';
  assert.equal(find(pages, actualBoards(), []).patterns.length, 0);
});
test('resolves normalized heading hashes', () => {
  const url = new URL(href('B/대상'));
  url.hash = 'target-card';
  const pages = data('CARD', anchors(url.href), '<h2>대상행</h2><h3>Target Card</h3>');
  const result = find(pages, actualBoards(), []);
  assert.equal(result.patterns.length, 0);
  assert.equal(expectedDecisions(result, 'CARD->CARD', 'A', 'B')[0].target.title, 'Target Card');
});
for (const [name, url, reason] of [
  [
    'external links',
    'https://external.test/?title=B%2F대상&paragraph=대상카드',
    'NOT_INTERNAL_NOTE_LINK',
  ],
  ['malformed links', 'http://[broken', 'INVALID_LINK'],
  ['missing notes', href('B/없는열', '대상카드'), 'UNRESOLVED_TARGET'],
  ['missing paragraphs', href('B/대상', '없는문단'), 'UNRESOLVED_TARGET'],
  ['board-only links', href('B'), 'UNRESOLVED_TARGET'],
]) {
  test('ignores ' + name + ' and reports the reason for each occurrence', () => {
    const result = find(data('CARD', anchors(url)), actualBoards(), []);
    assert.equal(result.patterns.length, 0);
    assert.equal(result.linkClassifications.linkClassifications.length, 0);
    assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [reason]);
    assert.equal(result.linkClassifications.excludedLinkClassifications[reason].length, 2);
    for (const classification of excludedLinkOccurrences(result)) {
      assert.equal(classification.pattern, null);
      assert.equal(classification.exclusionReason, reason);
      assert.equal(classification.isRepeatedPattern, false);
      assert.equal(classification.sourceNoteTitle, 'A/원본');
      assert.equal(classification.sourceParagraph.paragraph, '소스카드');
    }
  });
}
test('excludes both board and note roles of a same-board reference', () => {
  const result = find(data('CARD', anchors(href('A/원본', '소스카드'))), actualBoards(), []);
  assert.equal(boardPatterns(result).length, 0);
  assert.equal(result.patterns.length, 0);
  assert.equal(result.linkClassifications.linkClassifications.length, 0);
  assert.equal(result.linkClassifications.excludedLinkClassifications.SAME_BOARD.length, 2);
  for (const occurrence of excludedLinkOccurrences(result)) {
    assert.equal(occurrence.exclusionReason, 'SAME_BOARD');
    assert.equal(occurrence.isRepeatedPattern, false);
    assert.equal(occurrence.source.boardTitle, 'A');
    assert.equal(occurrence.target.boardTitle, 'A');
  }
});
test('disambiguates duplicate card titles using section', () => {
  const body = '<h2>첫행</h2><h3>대상카드</h3><h2>둘째행</h2><h3>대상카드</h3>';
  const ambiguous = find(
    data('CARD', anchors(href('B/대상', '대상카드')), body),
    actualBoards(),
    []
  );
  assert.equal(boardPatterns(ambiguous).length, 0);
  assert.equal(ambiguous.patterns.length, 0);
  assert.deepEqual(ambiguous.linkClassifications.excludedLinkClassifications, {});
  const ambiguousDecisions = expectedDecisions(ambiguous, 'CARD->CARD', 'A', 'B');
  for (const decision of ambiguousDecisions) {
    assert.equal(decision.target.resolution, 'BOARD_KIND');
    assert.equal(decision.target.candidateElements.length, 2);
    assert.equal(Object.hasOwn(decision.target, 'id'), false);
  }
  const result = find(
    data('CARD', anchors(href('B/대상', '대상카드', '둘째행')), body),
    actualBoards(),
    []
  );
  assert.equal(result.patterns.length, 0);
  assert.equal(expectedDecisions(result, 'CARD->CARD', 'A', 'B')[0].target.section, '둘째행');
});
for (const origin of ['BOARD', 'CANDIDATE']) {
  test('preserves same-kind ambiguous actual observations for ' + origin, () => {
    const pages = [
      note(
        'A/원본',
        '<h3>a1</h3>' +
          anchor(href('B', '설치')) +
          '<h3>a2</h3>' +
          anchor(href('B', '설치')) +
          '<h3>a3</h3>'
      ),
      note('B/첫열', '<h3>설치</h3>'),
      note('B/둘째열', '<h3>설치</h3>'),
    ];
    const result = find(
      pages,
      origin === 'BOARD' ? recommendationBoards() : [board('A', 'KANBAN')],
      origin === 'CANDIDATE' ? [{ title: 'B', option: board('B', 'KANBAN').option }] : []
    );
    const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
    assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
    assert.equal(pattern.count, 0);
    assert.equal(pattern.uniqueTargetCount, 0);
    assert.equal(pattern.uniqueSourceCount, 2);
    assert.equal(pattern.occurrenceCount, 2);
    assert.equal(pattern.isRecommendationSupported, false);
    assert.deepEqual(
      pattern.recommendationSources.map((element) => element.title),
      []
    );
    for (const match of pattern.matches) {
      assert.equal(match.target.resolution, 'BOARD_KIND');
      assert.equal(match.target.boardTitle, 'B');
      assert.equal(match.target.boardOrigin, origin);
      assert.equal(match.target.kind, 'CARD');
      assert.deepEqual(
        match.target.candidateElements.map((element) => element.noteTitle),
        ['B/둘째열', 'B/첫열']
      );
      assert.equal(Object.hasOwn(match.target, 'id'), false);
      assert.equal(Object.hasOwn(match.target, 'noteTitle'), false);
      assert.match(match.proposition, /개별 대상 미확정/);
    }
    assert.equal(linkOccurrences(result).length, 2);
    assert.ok(linkOccurrences(result).every((occurrence) => occurrence.isRepeatedPattern));
  });
}

test('preserves a column target scope when a board alias matches paragraphs in several columns', () => {
  const result = find(
    [
      note(
        'A/원본',
        '<h3>a1</h3>' +
          anchor(href('B', '소개')) +
          '<h3>a2</h3>' +
          anchor(href('B', '소개')) +
          '<h3>a3</h3>'
      ),
      note('B/첫열', '<h2>소개</h2>'),
      note('B/둘째열', '<h2>소개</h2>'),
    ],
    recommendationBoards(),
    []
  );
  const pattern = expectedPattern(result, 'CARD->COLUMN', 'A', 'B');
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
  assert.equal(pattern.count, 0);
  assert.equal(pattern.uniqueTargetCount, 0);
  assert.equal(pattern.isRecommendationSupported, false);
  assert.deepEqual(
    pattern.recommendationSources.map((element) => element.title),
    []
  );
  for (const match of pattern.matches) {
    assert.equal(match.target.resolution, 'BOARD_KIND');
    assert.equal(match.target.kind, 'COLUMN');
    assert.equal(match.target.candidateElements.length, 2);
    assert.ok(match.target.candidateElements.every((element) => element.kind === 'COLUMN'));
  }
});

test('does not recommend a source that already has a same-kind ambiguous link', () => {
  const result = find(
    [
      note(
        'A/원본',
        '<h3>a1</h3>' +
          anchor(href('B/첫열', '설치')) +
          '<h3>a2</h3>' +
          anchor(href('B/첫열', '설치')) +
          '<h3>a3</h3>' +
          anchor(href('B', '설치'))
      ),
      note('B/첫열', '<h3>설치</h3>'),
      note('B/둘째열', '<h3>설치</h3>'),
    ],
    recommendationBoards(),
    []
  );
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
  assert.equal(pattern.count, 2);
  assert.equal(pattern.uniqueTargetCount, 1);
  assert.equal(pattern.uniqueSourceCount, 3);
  assert.equal(pattern.matches[2].target.resolution, 'BOARD_KIND');
  assert.equal(pattern.isRecommendationSupported, false);
  assert.deepEqual(pattern.recommendationSources, []);
});

test('counts resolved and ambiguous links from one source once in recommendation evidence', () => {
  const result = find(
    [
      note(
        'A/원본',
        '<h3>a1</h3>' +
          anchor(href('B/첫열', '설치')) +
          anchor(href('B', '설치')) +
          '<h3>a2</h3>' +
          anchor(href('B', '설치')) +
          '<h3>a3</h3>'
      ),
      note('B/첫열', '<h3>설치</h3>'),
      note('B/둘째열', '<h3>설치</h3>'),
    ],
    recommendationBoards(),
    []
  );
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.count, 1);
  assert.equal(pattern.occurrenceCount, 3);
  assert.equal(pattern.uniqueSourceCount, 2);
  assert.equal(pattern.isRecommendationSupported, false);
  assert.deepEqual(
    pattern.recommendationSources.map((element) => element.title),
    []
  );
});

test('cannot turn one source into a repeated pattern by duplicating an ambiguous link', () => {
  const result = find(
    [
      note('A/원본', '<h3>a1</h3>' + anchor(href('B', '설치')).repeat(4) + '<h3>a2</h3>'),
      note('B/첫열', '<h3>설치</h3>'),
      note('B/둘째열', '<h3>설치</h3>'),
    ],
    recommendationBoards(),
    []
  );
  assert.equal(result.patterns.length, 0);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
  assert.equal(result.linkClassifications.linkClassifications.length, 1);
  assert.equal(result.linkClassifications.linkClassifications[0].count, 4);
  assert.equal(linkOccurrences(result).length, 4);
  assert.ok(
    linkOccurrences(result).every(
      (occurrence) => !occurrence.isRepeatedPattern && occurrence.target.resolution === 'BOARD_KIND'
    )
  );
});

test('does not infer a target kind when matching board aliases include both cards and columns', () => {
  const result = find(
    [
      note(
        'A/원본',
        '<h3>a1</h3>' + anchor(href('B', '공통')) + '<h3>a2</h3>' + anchor(href('B', '공통'))
      ),
      note('B/첫열', '<h3>공통</h3>'),
      note('B/둘째열', '<h2>공통</h2>'),
    ],
    recommendationBoards(),
    []
  );
  assert.equal(result.patterns.length, 0);
  assert.deepEqual(result.linkClassifications.linkClassifications, []);
  assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
    'UNRESOLVED_TARGET',
  ]);
  assert.equal(excludedLinkOccurrences(result).length, 2);
});

test('does not infer a visible card target when another matching paragraph belongs to a hidden card', () => {
  const result = find(
    [
      note(
        'A/원본',
        '<h3>a1</h3>' + anchor(href('B', '공통')) + '<h3>a2</h3>' + anchor(href('B', '공통'))
      ),
      note('B/첫열', '<h2>행</h2><h3>공통</h3>'),
      note('B/둘째열', '<h1>소개</h1><h3>공통</h3>'),
    ],
    [board('A', 'KANBAN'), board('B')],
    []
  );
  assert.equal(result.patterns.length, 0);
  assert.deepEqual(result.linkClassifications.linkClassifications, []);
  assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
    'UNRESOLVED_TARGET',
  ]);
  assert.equal(excludedLinkOccurrences(result).length, 2);
});

test('deduplicates a shared row targeted by board title', () => {
  const pages = data('CARD', anchors(href('B', '대상행')));
  pages.push(note('B/다른열', targetBody));
  const result = find(pages, actualBoards(), []);
  assert.equal(boardPatterns(result).length, 0);
  const decisions = expectedDecisions(result, 'CARD->ROW', 'A', 'B');
  assert.equal(decisions[0].target.id, decisions[1].target.id);
  assert.equal(decisions[0].isRepeatedPattern, false);
});
test('attributes links and destinations in subparagraphs to their containing card', () => {
  const pages = data('CARD', '', targetBody + '<h4>하위문단</h4>');
  pages[0].description += '<h4>하위문단</h4><p>' + anchors(href('B/대상', '하위문단')) + '</p>';
  const result = find(pages, actualBoards(), []);
  assert.equal(result.patterns.length, 0);
  const decisions = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.equal(decisions[0].source.title, '소스카드');
  assert.equal(decisions[0].target.title, '대상카드');
});
test('includes links inside headings', () => {
  const pages = data('ROW', '', variedTargetBody);
  pages[0].description =
    '<h2>소스행' +
    anchor(href('B/대상', '대상카드')) +
    '</h2><h3>소스카드</h3>' +
    '<h2>추가행' +
    anchor(href('B/대상', '추가카드')) +
    '</h2><h3>추가카드</h3>';
  assert.equal(find(pages, actualBoards(), []).patterns[0].pattern, 'ROW->CARD');
});
test('excludes hidden board cards without creating mixed note patterns', () => {
  const pages = data('CARD', anchors(href('B/대상', '대상카드')));
  pages[0].description = '<h3>소스카드</h3>' + anchors(href('B/대상', '대상카드'));
  const hiddenSource = find(pages, actualBoards(), []);
  assert.equal(boardPatterns(hiddenSource).length, 0);
  assert.equal(hiddenSource.patterns.length, 0);
  expectUnsupported(hiddenSource, 2);
  const hiddenTarget = find(
    data('CARD', anchors(href('B/대상', '대상카드')), '<h3>대상카드</h3>'),
    actualBoards(),
    []
  );
  assert.equal(boardPatterns(hiddenTarget).length, 0);
  assert.equal(hiddenTarget.patterns.length, 0);
  expectUnsupported(hiddenTarget, 2);
});
test('keeps the input notes unchanged', () => {
  const pages = data('CARD', anchors(href('B/대상', '대상카드')));
  const before = JSON.stringify(pages);
  pages.forEach(Object.freeze);
  Object.freeze(pages);
  find(pages, actualBoards(), []);
  assert.equal(JSON.stringify(pages), before);
});

test('mixed references preserve the threshold, direction, kind and note pair', () => {
  const pages = [
    note('A/원본', sourceBody('CARD', anchor(href('N/하위')))),
    note('N', '<h2>문단</h2>'),
    note('N/하위'),
    note('M/하위'),
  ];
  const boards = [board('A')];
  assert.equal(find(pages, boards, []).patterns.length, 0);
  pages[0].description += '<p>' + anchor(href('N', '문단')) + '</p>';
  assert.equal(find(pages, boards, []).patterns.length, 0);
  pages[0].description += '<p>' + anchor(href('M/하위')) + '</p>';
  assert.equal(find(pages, boards, []).patterns.length, 0);
  pages[2].description = '<p>' + anchor(href('A/원본', '소스카드')) + '</p>';
  assert.equal(find(pages, boards, []).patterns.length, 0);
});
test('excludes links from ordinary child notes while preserving distinct source metadata', () => {
  const url = href('B/대상', '대상카드');
  const pages = [
    note('B/대상', targetBody),
    note('N'),
    note('N/첫째', '<p>' + anchor(url) + '</p>'),
    note('N/둘째', '<p>' + anchor(url) + '</p>'),
  ];
  const result = find(pages, [board('B')], []);
  const occurrences = expectUnsupported(result, 2);
  assert.notEqual(occurrences[0].source.id, occurrences[1].source.id);
  assert.equal(occurrences[0].target.id, occurrences[1].target.id);
});
test('excludes links from ordinary paragraphs without duplicating parent paragraphs', () => {
  const url = href('B/대상', '대상카드');
  const pages = [
    note('B/대상', targetBody),
    note('N', '<h1>첫문단</h1>' + anchor(url) + '<h6>하위문단</h6>' + anchor(url)),
  ];
  const result = find(pages, [board('B')], []);
  const occurrences = expectUnsupported(result, 2);
  assert.notEqual(occurrences[0].source.id, occurrences[1].source.id);
  assert.equal(occurrences[0].target.id, occurrences[1].target.id);
});
test('excludes ordinary child paragraphs and subnotes in both directions', () => {
  const pages = [
    note('A/원본', sourceBody('CARD', anchors(href('N/하위', '문단')))),
    note('N'),
    note('N/하위', '<h2>문단</h2>' + anchors(href('A/원본', '소스카드'))),
  ];
  const result = find(pages, [board('A')], []);
  expectUnsupported(result, 4);
});
test('excludes root note body targets and ordinary note pairs', () => {
  const pages = [
    note('A/원본', sourceBody('CARD', anchors(href('N')))),
    note('N', '<h2>문단</h2>' + anchors(href('M/하위'))),
    note('N/하위', '<p>' + anchors(href('M', '문단')) + '</p>'),
    note('M', '<h2>문단</h2>'),
    note('M/하위'),
  ];
  const result = find(pages, [board('A')], []);
  expectUnsupported(result, 6);
  assert.equal(
    result.linkClassifications.excludedLinkClassifications.UNSUPPORTED_PATTERN.length,
    6
  );
});
test('ignores missing note elements and ambiguous paragraphs', () => {
  const pages = [
    note('A/원본', ''),
    note('N', '<h1>첫째</h1><h2>문단</h2><h1>둘째</h1><h2>문단</h2>'),
  ];
  for (const url of [href('N/없는노트'), href('N', '없는문단'), href('N', '문단')]) {
    pages[0].description = sourceBody('CARD', anchors(url));
    assert.equal(find(pages, [board('A')], []).patterns.length, 0);
  }
  pages[0].description = sourceBody('CARD', anchors(href('N', '문단', '둘째')));
  const result = find(pages, [board('A')], []);
  const occurrences = expectUnsupported(result, 2);
  assert.equal(occurrences[0].target.section, '둘째');
});
test('preserves resolved ordinary heading hashes in excluded link diagnostics', () => {
  const url = new URL(href('N'));
  url.hash = 'target-paragraph';
  const pages = [
    note('A/원본', sourceBody('CARD', anchors(url.href))),
    note('N', '<h2>Target Paragraph</h2>'),
  ];
  const result = find(pages, [board('A')], []);
  const occurrences = expectUnsupported(result, 2);
  assert.equal(occurrences[0].target.title, 'Target Paragraph');
});
test('excludes mixed links involving child notes whose parent exists only as a title path', () => {
  const pages = [
    note('A/원본', sourceBody('CARD', anchors(href('N/하위')))),
    note('N/하위', '<p>' + anchors(href('A/원본', '소스카드')) + '</p>'),
  ];
  const result = find(pages, [board('A')], []);
  const occurrences = expectUnsupported(result, 4);
  assert.equal(occurrences[0].target.ownerNoteExists, false);
  assert.equal(occurrences[2].source.ownerNoteExists, false);
});
test('keeps only board roles without multiplying the physical link count', () => {
  const pages = data('CARD', anchors(href('B/대상', '대상카드')));
  pages.push(note('A'), note('B'));
  const result = find(pages, actualBoards(), []);
  assert.equal(result.patterns.length, 0);
  expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.equal(result.linkClassifications.linkClassifications.length, 2);
  expectOnlyBoardPatterns(result);
});
test('excludes both directions between inferred boards and ordinary note elements', () => {
  const pages = [
    note('A/첫열', sourceBody('CARD', anchor(href('N/첫째')) + anchor(href('N/둘째')))),
    note('A/둘째열', sourceBody('CARD', '')),
    note(
      'N',
      '<h2>문단</h2>' + anchor(href('A/첫열', '소스카드')) + anchor(href('A/둘째열', '소스카드'))
    ),
    note('N/첫째'),
    note('N/둘째'),
  ];
  const candidates = inferBoardCandidates(pages, []);
  const result = find(pages, [], candidates);
  expectUnsupported(result, 4);
});
test('reports independent repetition decisions for each classified link', () => {
  const repeatedUrl = href('B/대상', '대상카드');
  const singleUrl = href('B/대상', '대상행');
  const result = find(data('CARD', anchors(repeatedUrl) + anchor(singleUrl)), actualBoards(), []);
  assert.equal(result.patterns.length, 0);
  assert.equal(result.linkClassifications.linkClassifications.length, 3);
  assert.deepEqual(
    linkOccurrences(result).map(({ pattern, isRepeatedPattern }) => ({
      pattern,
      isRepeatedPattern,
    })),
    [
      { pattern: 'CARD->CARD', isRepeatedPattern: false },
      { pattern: 'CARD->CARD', isRepeatedPattern: false },
      { pattern: 'CARD->ROW', isRepeatedPattern: false },
    ]
  );
  assert.notEqual(
    result.linkClassifications.linkClassifications[0].linkText,
    result.linkClassifications.linkClassifications[1].linkText
  );
  expectOnlyBoardPatterns(result);
});
test('excludes ordinary roots, board root bodies and hidden board cards as note sources', () => {
  const url = href('B/대상', '대상카드');
  const pages = [
    note('A', anchor(url)),
    note('A/원본', '<h3>숨겨진카드</h3>' + anchor(url)),
    note('B/대상', targetBody),
    note('N', '<p>' + anchor(url) + '</p>'),
  ];
  const result = find(pages, actualBoards(), []);
  const occurrences = expectUnsupported(result, 3);
  assert.deepEqual(occurrences.map((occurrence) => occurrence.sourceNoteTitle).sort(), [
    'A',
    'A/원본',
    'N',
  ]);
  for (const occurrence of occurrences) {
    assert.equal(occurrence.target.kind, 'CARD');
    assert.equal(occurrence.source.kind, 'PARAGRAPH');
  }
});
test('keeps a subparagraph location alongside its containing card classification', () => {
  const pages = data('CARD', '');
  pages[0].description += '<h4>세부문단</h4>' + anchor(href('B/대상', '대상카드'));
  const classification = find(pages, actualBoards(), []).linkClassifications.linkClassifications[0]
    .occurrences[0];
  assert.equal(classification.sourceParagraph.paragraph, '세부문단');
  assert.equal(classification.source.paragraph, '소스카드');
  assert.equal(classification.pattern, 'CARD->CARD');
});
test('returns an empty classification list when notes have no links', () => {
  assert.deepEqual(find(data('CARD', ''), actualBoards(), []), {
    patterns: [],
    linkClassifications: {
      linkClassifications: [],
      excludedLinkClassifications: {},
      potentialLinkClassifications: [],
      excludedPotentialLinkClassifications: {},
    },
  });
});
test('groups repeated links while preserving separate source paragraphs and source notes', () => {
  const url = href('B/대상', '대상카드');
  const link = anchor(url, '같은 링크');
  const pages = data('ROW', link);
  pages[0].description += '<p>' + link + link + '</p>';
  pages.push(note('C/원본', sourceBody('CARD', link)), note('A', '<p>' + link + '</p>'));
  const result = find(pages, [...actualBoards(), board('C')], []);
  assert.equal(result.linkClassifications.linkClassifications.length, 3);
  assert.deepEqual(
    result.linkClassifications.linkClassifications.map((group) => group.count),
    [1, 2, 1]
  );
  const links = linkOccurrences(result);
  assert.equal(links.length, 4);
  assert.equal(new Set(links).size, 4);
  assert.deepEqual(links[1], links[2]);
  for (const group of result.linkClassifications.linkClassifications) {
    assert.equal(group.linkText, '같은 링크');
    assert.equal(group.targetNoteTitle, 'B/대상');
    assert.equal(group.count, group.occurrences.length);
  }
  assert.deepEqual(
    links.map(({ pattern, isRepeatedPattern }) => ({ pattern, isRepeatedPattern })),
    [
      { pattern: 'ROW->CARD', isRepeatedPattern: false },
      { pattern: 'CARD->CARD', isRepeatedPattern: false },
      { pattern: 'CARD->CARD', isRepeatedPattern: false },
      { pattern: 'CARD->CARD', isRepeatedPattern: false },
    ]
  );
  assert.deepEqual(
    links.map((occurrence) => occurrence.sourceNoteTitle),
    ['A/원본', 'A/원본', 'A/원본', 'C/원본']
  );
  assert.equal(excludedLinkOccurrences(result).length, 1);
  assert.equal(excludedLinkOccurrences(result)[0].sourceNoteTitle, 'A');
  assert.equal(excludedLinkOccurrences(result)[0].exclusionReason, 'UNSUPPORTED_PATTERN');
  assert.equal(result.patterns.length, 0);
  expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  expectOnlyBoardPatterns(result);
});
test('preserves different link texts for the same URL in separate entries', () => {
  const url = href('B/대상', '대상카드');
  const result = find(
    data('CARD', anchor(url, '첫 링크') + anchor(url, '둘째 링크')),
    actualBoards(),
    []
  );
  assert.deepEqual(
    result.linkClassifications.linkClassifications.map(({ linkText }) => linkText),
    ['첫 링크', '둘째 링크']
  );
  assert.equal(result.patterns.length, 0);
  expectedDecisions(result, 'CARD->CARD', 'A', 'B');
});
test('groups different target paragraphs when the four grouping fields match', () => {
  const cardUrl = href('B/대상', '대상카드');
  const rowUrl = href('B/대상', '대상행');
  const result = find(
    data('CARD', anchor(cardUrl, '같은 텍스트') + anchor(rowUrl, '같은 텍스트')),
    actualBoards(),
    []
  );
  assert.equal(result.linkClassifications.linkClassifications.length, 1);
  assert.equal(result.linkClassifications.linkClassifications[0].count, 2);
  assert.equal(result.linkClassifications.linkClassifications[0].targetNoteTitle, 'B/대상');
  assert.deepEqual(
    linkOccurrences(result).map(({ linkText, target }) => [linkText, target.kind, target.title]),
    [
      ['같은 텍스트', 'CARD', '대상카드'],
      ['같은 텍스트', 'ROW', '대상행'],
    ]
  );
  assert.equal(boardPatterns(result).length, 0);
  assert.equal(result.patterns.length, 0);
  expectOnlyBoardPatterns(result);
});
test('keeps different linked note titles separate even when they resolve to the same card', () => {
  const result = find(
    data(
      'CARD',
      anchor(href('B', '대상카드'), '같은 링크') + anchor(href('B/대상', '대상카드'), '같은 링크')
    ),
    actualBoards(),
    []
  );
  assert.deepEqual(
    result.linkClassifications.linkClassifications.map(({ targetNoteTitle, count }) => ({
      targetNoteTitle,
      count,
    })),
    [
      { targetNoteTitle: 'B', count: 1 },
      { targetNoteTitle: 'B/대상', count: 1 },
    ]
  );
  assert.deepEqual(
    linkOccurrences(result).map((link) => link.target.noteTitle),
    ['B/대상', 'B/대상']
  );
  assert.equal(result.patterns.length, 0);
  const decisions = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.equal(decisions[0].target.id, decisions[1].target.id);
  assert.equal(decisions[0].isRepeatedPattern, false);
});
test('keeps same-named source paragraphs in different sections in separate groups', () => {
  const link = anchor(href('B/대상', '대상카드'), '같은 링크');
  const pages = [
    note('A/원본', '<h2>첫행</h2><h3>카드</h3>' + link + '<h2>둘째행</h2><h3>카드</h3>' + link),
    note('B/대상', targetBody),
  ];
  const result = find(pages, actualBoards(), []);
  assert.equal(result.linkClassifications.linkClassifications.length, 2);
  const [first, second] = result.linkClassifications.linkClassifications;
  assert.equal(first.linkText, second.linkText);
  assert.equal(first.sourceNoteTitle, second.sourceNoteTitle);
  assert.equal(first.targetNoteTitle, second.targetNoteTitle);
  assert.equal(first.sourceParagraph.paragraph, second.sourceParagraph.paragraph);
  assert.notEqual(first.sourceParagraph.section, second.sourceParagraph.section);
  assert.notEqual(first.sourceParagraph.path, second.sourceParagraph.path);
  assert.deepEqual(
    result.linkClassifications.linkClassifications.map((group) => group.count),
    [1, 1]
  );
  assert.equal(result.patterns.length, 1);
  const decisions = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.notEqual(decisions[0].source.id, decisions[1].source.id);
  assert.equal(decisions[0].target.id, decisions[1].target.id);
  for (const decision of decisions) assert.equal(decision.isRepeatedPattern, true);
});
test('groups links in the default body without source paragraph metadata', () => {
  const link = anchor(href('B/대상', '대상카드'), '같은 링크');
  const result = find(data('COLUMN', link + link), actualBoards(), []);
  assert.equal(result.linkClassifications.linkClassifications.length, 1);
  const group = result.linkClassifications.linkClassifications[0];
  assert.equal(Object.hasOwn(group, 'sourceParagraph'), false);
  assert.equal(group.targetNoteTitle, 'B/대상');
  assert.equal(group.count, 2);
  assert.equal(group.occurrences.length, 2);
  for (const occurrence of group.occurrences) {
    assert.equal(occurrence.classifications.length, 1);
  }
  assert.equal(result.patterns.length, 0);
  expectedDecisions(result, 'COLUMN->CARD', 'A', 'B');
});
test('preserves linked titles and groups repeated links to missing target notes', () => {
  const first = anchor(href('없는A', '문단'), '같은 링크');
  const second = anchor(href('없는B', '문단'), '같은 링크');
  const result = find(data('CARD', first + second + first), actualBoards(), []);
  assert.equal(result.patterns.length, 0);
  assert.equal(result.linkClassifications.linkClassifications.length, 0);
  assert.deepEqual(
    result.linkClassifications.excludedLinkClassifications.UNRESOLVED_TARGET.map(
      ({ targetNoteTitle, count }) => ({
        targetNoteTitle,
        count,
      })
    ),
    [
      { targetNoteTitle: '없는A', count: 2 },
      { targetNoteTitle: '없는B', count: 1 },
    ]
  );
  for (const occurrence of excludedLinkOccurrences(result)) {
    assert.equal(occurrence.exclusionReason, 'UNRESOLVED_TARGET');
    assert.equal(occurrence.isRepeatedPattern, false);
  }
});
test('separates different exclusion reasons even when all four grouping fields match', () => {
  const result = find(
    data(
      'CARD',
      anchor('https://external.test/', '같은 링크') +
        anchor('http://[broken', '같은 링크') +
        anchor('https://external.test/', '같은 링크')
    ),
    actualBoards(),
    []
  );
  assert.equal(result.linkClassifications.linkClassifications.length, 0);
  const groupsByReason = result.linkClassifications.excludedLinkClassifications;
  assert.deepEqual(Object.keys(groupsByReason).sort(), ['INVALID_LINK', 'NOT_INTERNAL_NOTE_LINK']);
  assert.equal(groupsByReason.NOT_INTERNAL_NOTE_LINK.length, 1);
  assert.equal(groupsByReason.INVALID_LINK.length, 1);
  const external = groupsByReason.NOT_INTERNAL_NOTE_LINK[0];
  const invalid = groupsByReason.INVALID_LINK[0];
  for (const field of ['linkText', 'sourceNoteTitle', 'sourceParagraph', 'targetNoteTitle']) {
    assert.deepEqual(external[field], invalid[field]);
  }
  assert.equal(external.count, 2);
  assert.equal(invalid.count, 1);
  assert.equal(excludedLinkOccurrences(result).length, 3);
  for (const [reason, groups] of Object.entries(groupsByReason)) {
    for (const group of groups) {
      assert.equal(Object.hasOwn(group, 'targetNoteTitle'), false);
      assert.equal(group.count, group.occurrences.length);
      for (const occurrence of group.occurrences) {
        assert.equal(occurrence.exclusionReason, reason);
        assert.equal(occurrence.classifications[0].exclusionReason, reason);
        assert.equal(occurrence.isRepeatedPattern, false);
      }
    }
  }
  assert.equal(result.patterns.length, 0);
});
test('marks root note body references to their own board as SAME_BOARD', () => {
  const link = anchor(href('A', '카드'), '같은 링크');
  const result = find(
    [note('A', link + link), note('A/열', '<h2>행</h2><h3>카드</h3>')],
    [board('A')],
    []
  );
  const occurrences = excludedLinkOccurrences(result);
  assert.equal(result.patterns.length, 0);
  assert.deepEqual(result.linkClassifications.linkClassifications, []);
  assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
    'SAME_BOARD',
  ]);
  assert.equal(result.linkClassifications.excludedLinkClassifications.SAME_BOARD.length, 1);
  assert.equal(result.linkClassifications.excludedLinkClassifications.SAME_BOARD[0].count, 2);
  assert.equal(occurrences.length, 2);
  assert.ok(occurrences.every((occurrence) => occurrence.exclusionReason === 'SAME_BOARD'));
  assert.equal(occurrences[0].source.containerType, 'NOTE');
});

for (const origin of ['BOARD', 'CANDIDATE']) {
  for (const [name, targetBody, targetParagraph] of [
    ['present column', '<h4>질문</h4>', undefined],
    ['missing column', undefined, undefined],
    ['missing paragraph', '<h4>질문</h4>', '없는 문단'],
    ['ambiguous paragraph', '<h4>질문</h4><h4>질문</h4>', '질문'],
  ]) {
    test('marks ' + origin + ' root links to a ' + name + ' as SAME_BOARD', () => {
      const option = { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 4 };
      const pages = [
        note('프로젝트', anchor(href('프로젝트/질문', targetParagraph), '프로젝트/질문')),
        ...(targetBody === undefined ? [] : [note('프로젝트/질문', targetBody)]),
      ];
      const result = find(
        pages,
        origin === 'BOARD' ? [{ ...board('프로젝트'), option }] : [],
        origin === 'CANDIDATE' ? [{ title: '프로젝트', option }] : []
      );
      assert.equal(result.patterns.length, 0);
      assert.deepEqual(result.linkClassifications.linkClassifications, []);
      assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
        'SAME_BOARD',
      ]);
      const occurrences = excludedLinkOccurrences(result);
      assert.equal(occurrences.length, 1);
      const occurrence = occurrences[0];
      assert.equal(occurrence.exclusionReason, 'SAME_BOARD');
      assert.equal(occurrence.targetNoteTitle, '프로젝트/질문');
      assert.equal(occurrence.source.containerType, 'NOTE');
      assert.equal(occurrence.pattern, null);
      assert.equal(occurrence.isRepeatedPattern, false);
      if (name === 'missing column' || name === 'missing paragraph') {
        assert.equal(occurrence.target, undefined);
      }
    });
  }
}

test('marks a column link to its board root as SAME_BOARD when the root note is absent', () => {
  const result = find(
    [note('프로젝트/작업', '<h4>작업</h4>' + anchor(href('프로젝트')))],
    [],
    [{ title: '프로젝트', option: { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 4 } }]
  );
  assert.equal(result.patterns.length, 0);
  assert.deepEqual(result.linkClassifications.linkClassifications, []);
  assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
    'SAME_BOARD',
  ]);
  const [occurrence] = excludedLinkOccurrences(result);
  assert.equal(occurrence.source.kind, 'CARD');
  assert.equal(occurrence.target, undefined);
  assert.equal(occurrence.exclusionReason, 'SAME_BOARD');
});

test('limits title-based board membership to direct columns and respects explicit column lists', () => {
  const option = { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 4 };
  for (const [targetTitle, columnNoteTitles] of [
    ['프로젝트X/질문', undefined],
    ['프로젝트/질문/하위', undefined],
    ['프로젝트/미지정열', ['프로젝트/지정열']],
    ['프로젝트/미지정열', []],
  ]) {
    const result = find(
      [note('프로젝트', anchor(href(targetTitle)))],
      [],
      [{ title: '프로젝트', option, columnNoteTitles }]
    );
    expectUnsupported(result, 1);
    assert.equal(excludedLinkOccurrences(result)[0].targetNoteTitle, targetTitle);
  }
});

for (const [name, targetBody, targetParagraph] of [
  ['present target', '<h3>개요</h3>', undefined],
  ['missing target', undefined, undefined],
  ['missing paragraph', '<h3>개요</h3>', '없는 문단'],
  ['ambiguous paragraph', '<h3>개요</h3><h3>개요</h3>', '개요'],
]) {
  test('marks ordinary note links with a ' + name + ' as UNSUPPORTED_PATTERN', () => {
    const result = find(
      [
        note(
          '연간보고서 초본',
          '<h2>2024</h2>' + anchor(href('Django', targetParagraph), 'Django')
        ),
        ...(targetBody === undefined ? [] : [note('Django', targetBody)]),
      ],
      [],
      []
    );
    const [occurrence] = expectUnsupported(result, 1);
    assert.equal(occurrence.source.containerType, 'NOTE');
    assert.equal(occurrence.sourceParagraph.paragraph, '2024');
    assert.equal(occurrence.targetNoteTitle, 'Django');
    if (name === 'present target') {
      assert.equal(occurrence.target.containerType, 'NOTE');
    } else {
      assert.equal(occurrence.target, undefined);
    }
  });
}

test('preserves malformed and external link reasons for ordinary note sources', () => {
  const result = find(
    [
      note(
        '연간보고서 초본',
        anchor('http://[broken') + anchor('https://external.test/?title=Django')
      ),
    ],
    [],
    []
  );
  assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications).sort(), [
    'INVALID_LINK',
    'NOT_INTERNAL_NOTE_LINK',
  ]);
  assert.equal(excludedLinkOccurrences(result).length, 2);
  assert.deepEqual(result.linkClassifications.linkClassifications, []);
});
test('separates excluded occurrences from valid occurrences with the same grouping fields', () => {
  const result = find(
    data(
      'CARD',
      anchor(href('B/대상', '대상카드'), '같은 링크') +
        anchor(href('B/대상', '없는문단'), '같은 링크') +
        anchor(href('B/대상', '대상행'), '같은 링크')
    ),
    actualBoards(),
    []
  );
  assert.equal(result.linkClassifications.linkClassifications.length, 1);
  assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
    'UNRESOLVED_TARGET',
  ]);
  assert.equal(result.linkClassifications.excludedLinkClassifications.UNRESOLVED_TARGET.length, 1);
  const valid = result.linkClassifications.linkClassifications[0];
  const excluded = result.linkClassifications.excludedLinkClassifications.UNRESOLVED_TARGET[0];
  for (const field of ['linkText', 'sourceNoteTitle', 'sourceParagraph', 'targetNoteTitle']) {
    assert.deepEqual(valid[field], excluded[field]);
  }
  assert.equal(valid.count, 2);
  assert.equal(valid.occurrences.length, 2);
  assert.equal(excluded.count, 1);
  assert.equal(excluded.occurrences.length, 1);
  assert.deepEqual(
    valid.occurrences.map((occurrence) => occurrence.pattern),
    ['CARD->CARD', 'CARD->ROW']
  );
  for (const occurrence of valid.occurrences) {
    assert.equal(Object.hasOwn(occurrence, 'exclusionReason'), false);
    for (const classification of occurrence.classifications) {
      assert.equal(Object.hasOwn(classification, 'exclusionReason'), false);
    }
  }
  assert.equal(excluded.occurrences[0].exclusionReason, 'UNRESOLVED_TARGET');
  assert.equal(excluded.occurrences[0].pattern, null);
  assert.equal(excluded.occurrences[0].isRepeatedPattern, false);
  assert.equal(result.patterns.length, 0);
  expectOnlyBoardPatterns(result);
});
test('omits URL fields from all responses and preserves empty link text', () => {
  const url = href('B/대상', '대상카드');
  const result = find(
    data(
      'CARD',
      anchors(url) +
        anchor(url, '') +
        anchor('https://external.test/', '외부 링크') +
        anchor('http://[broken', '잘못된 링크')
    ),
    actualBoards(),
    []
  );
  assert.equal(result.linkClassifications.linkClassifications.length, 3);
  assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications).sort(), [
    'INVALID_LINK',
    'NOT_INTERNAL_NOTE_LINK',
  ]);
  assert.equal(result.linkClassifications.linkClassifications[2].linkText, '');
  assert.equal(
    result.linkClassifications.excludedLinkClassifications.NOT_INTERNAL_NOTE_LINK[0].occurrences[0]
      .exclusionReason,
    'NOT_INTERNAL_NOTE_LINK'
  );
  assert.equal(
    result.linkClassifications.excludedLinkClassifications.INVALID_LINK[0].occurrences[0]
      .exclusionReason,
    'INVALID_LINK'
  );
  assert.equal(result.patterns.length, 0);
  expectedDecisions(result, 'CARD->CARD', 'A', 'B', 3);
  const pending = [result];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    assert.equal(Object.hasOwn(value, 'url'), false);
    pending.push(...Object.values(value));
  }
});
test('excludes root note body links to boards', () => {
  const pages = [
    note('N', '<p>' + anchors(href('B/대상', '대상카드')) + '</p>'),
    note('B/대상', targetBody),
  ];
  const result = find(pages, [board('B')], []);
  const occurrences = expectUnsupported(result, 2);
  assert.equal(occurrences[0].source.ownerNoteExists, true);
});
test('excludes board links to ordinary root note bodies', () => {
  const pages = [note('A/원본', sourceBody('CARD', anchors(href('N')))), note('N', '<p>본문</p>')];
  const result = find(pages, [board('A')], []);
  const occurrences = expectUnsupported(result, 2);
  assert.equal(occurrences[0].target.ownerNoteExists, true);
  assert.equal(occurrences[0].target.path, '');
});
test('resolves editor-generated relative links when detached anchors expose raw hrefs', () => {
  const params = new URLSearchParams({ title: 'B/대상' });
  const fragment = '#' + encodeURIComponent('대상카드');
  resolveFixtureAnchorUrls = false;
  try {
    for (const url of [
      '?' + params + fragment,
      '/NotePage?' + params + fragment,
      './NotePage?' + params + fragment,
    ]) {
      const result = find(data('CARD', anchors(url)), actualBoards(), []);
      assert.equal(result.patterns.length, 0, url);
      expectedDecisions(result, 'CARD->CARD', 'A', 'B');
      for (const group of linkOccurrences(result)) {
        assert.equal(group.exclusionReason, undefined);
      }
    }
  } finally {
    resolveFixtureAnchorUrls = true;
  }
});
test('resolves fragment and paragraph-only links against the original note rather than Home', () => {
  const previousLocation = global.location;
  global.location = { origin, href: href('B/대상', '대상카드') };
  try {
    for (const url of [
      '#' + encodeURIComponent('文段'),
      '?paragraph=' + encodeURIComponent('文段'),
    ]) {
      const pages = [note('N', '<h2>文段</h2>' + anchors(url)), note('B/대상', targetBody)];
      const result = find(pages, [board('B')], []);
      assert.equal(result.patterns.length, 0);
      assert.equal(result.linkClassifications.linkClassifications.length, 0);
      assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
        'UNSUPPORTED_PATTERN',
      ]);
      assert.equal(
        result.linkClassifications.excludedLinkClassifications.UNSUPPORTED_PATTERN.length,
        2
      );
      for (const group of excludedLinkOccurrences(result)) {
        const occurrence = group;
        assert.equal(occurrence.target.noteTitle, 'N');
        assert.equal(occurrence.target.paragraph, '文段');
        assert.equal(occurrence.exclusionReason, 'UNSUPPORTED_PATTERN');
      }
    }
  } finally {
    global.location = previousLocation;
  }
});
for (const noteBoardOrigin of ['BOARD', 'CANDIDATE']) {
  for (const boardKind of boardKinds) {
    for (const noteKind of ['SUBNOTE', 'PARAGRAPH']) {
      test(
        'removes ' +
          boardKind +
          '->' +
          noteKind +
          ' when the note has a ' +
          noteBoardOrigin +
          ' view',
        () => {
          const links = [1, 2].map((i) =>
            anchor(
              noteKind === 'SUBNOTE'
                ? href(i === 1 ? 'N/첫열' : 'N/둘째열')
                : href('N', '노트문단' + i)
            )
          );
          const pages = [
            ...distinctElements('A', boardKind, links),
            note('N', '<h2>노트문단1</h2><h2>노트문단2</h2>'),
            note('N/첫열', targetBody),
            note('N/둘째열', targetBody),
          ];
          const boards = [board('A'), ...(noteBoardOrigin === 'BOARD' ? [board('N')] : [])];
          const candidates = inferBoardCandidates(pages, boards);
          if (noteBoardOrigin === 'CANDIDATE')
            assert.equal(
              candidates.some((candidate) => candidate.title === 'N'),
              true
            );
          const result = find(pages, boards, candidates);
          if (noteKind === 'PARAGRAPH') {
            expectUnsupported(result, 2);
            return;
          }
          const pattern = expectedPattern(result, boardKind + '->COLUMN', 'A', 'N');
          assert.equal(pattern.count, 2);
          assert.equal(pattern.targetBoard.origin, noteBoardOrigin);
          assert.equal(result.patterns.length, 1);
          for (const match of pattern.matches) {
            assert.equal(match.target.containerType, 'BOARD');
            assert.equal(match.target.kind, 'COLUMN');
          }
          assert.equal(result.linkClassifications.linkClassifications.length, 2);
          assert.equal(linkOccurrences(result).length, 2);
          for (const link of linkOccurrences(result)) {
            const classification = link.classifications[0];
            assert.equal(classification.pattern, boardKind + '->COLUMN');
            assert.equal(classification.isRepeatedPattern, true);
            assert.equal(classification.exclusionReason, undefined);
          }
          expectOnlyBoardPatterns(result);
        }
      );
      test(
        'removes ' +
          noteKind +
          '->' +
          boardKind +
          ' when the note has a ' +
          noteBoardOrigin +
          ' view',
        () => {
          const links = [1, 2].map((i) =>
            anchor(
              href(
                'B/대상' + i,
                boardKind === 'ROW'
                  ? '대상행' + i
                  : boardKind === 'CARD'
                  ? '대상카드' + i
                  : undefined
              )
            )
          );
          const pages = [
            ...[1, 2].map((i) =>
              note('B/대상' + i, '<h2>대상행' + i + '</h2><h3>대상카드' + i + '</h3>')
            ),
            note('N', '<h2>노트문단</h2>' + (noteKind === 'PARAGRAPH' ? links.join('') : '')),
            note('N/첫열', sourceBody('COLUMN', noteKind === 'SUBNOTE' ? links[0] : '')),
            note('N/둘째열', sourceBody('COLUMN', noteKind === 'SUBNOTE' ? links[1] : '')),
          ];
          const boards = [board('B'), ...(noteBoardOrigin === 'BOARD' ? [board('N')] : [])];
          const candidates = inferBoardCandidates(pages, boards);
          if (noteBoardOrigin === 'CANDIDATE')
            assert.equal(
              candidates.some((candidate) => candidate.title === 'N'),
              true
            );
          const result = find(pages, boards, candidates);
          if (noteKind === 'PARAGRAPH') {
            expectUnsupported(result, 2);
            return;
          }
          const pattern = expectedPattern(result, 'COLUMN->' + boardKind, 'N', 'B');
          assert.equal(pattern.count, 2);
          assert.equal(pattern.sourceBoard.origin, noteBoardOrigin);
          assert.equal(result.patterns.length, 1);
          for (const match of pattern.matches) {
            assert.equal(match.source.containerType, 'BOARD');
            assert.equal(match.source.kind, 'COLUMN');
          }
          assert.equal(result.linkClassifications.linkClassifications.length, 2);
          for (const link of linkOccurrences(result)) {
            const classification = link.classifications[0];
            assert.equal(classification.pattern, 'COLUMN->' + boardKind);
            assert.equal(classification.isRepeatedPattern, true);
            assert.equal(classification.exclusionReason, undefined);
          }
          expectOnlyBoardPatterns(result);
        }
      );
    }
  }
}
for (const mode of ['SCRUM', 'KANBAN']) {
  const kinds = mode === 'SCRUM' ? boardKinds : ['COLUMN', 'CARD'];
  for (const sourceKind of kinds) {
    for (const targetKind of kinds) {
      test(
        'keeps only board roles between two ' +
          mode +
          ' candidates for ' +
          sourceKind +
          '->' +
          targetKind,
        () => {
          const links = [1, 2].map((i) =>
            anchor(
              href(
                'B/열' + i,
                targetKind === 'ROW' ? '행' + i : targetKind === 'CARD' ? '카드' + i : undefined
              )
            )
          );
          const pages = [
            note('A'),
            note('B'),
            ...distinctElements('A', sourceKind, links, '출발'),
            ...distinctElements('B', targetKind),
          ];
          const candidates = inferBoardCandidates(
            pages,
            [],
            mode === 'KANBAN' ? { minRows: 99 } : {}
          );
          assert.equal(candidates.length, 2);
          for (const candidate of candidates) assert.equal(candidate.option.BOARD_TYPE, mode);
          const result = find(pages, [], candidates);
          const boardPattern = expectedPattern(result, sourceKind + '->' + targetKind, 'A', 'B');
          assert.equal(boardPattern.count, 2);
          assert.equal(boardPattern.sourceBoard.origin, 'CANDIDATE');
          assert.equal(boardPattern.targetBoard.origin, 'CANDIDATE');
          assert.equal(result.patterns.length, 1);
          const occurrences = linkOccurrences(result);
          assert.equal(occurrences.length, 2);
          for (const occurrence of occurrences) {
            assert.equal(occurrence.source.containerType, 'BOARD');
            assert.equal(occurrence.target.containerType, 'BOARD');
            assert.equal(occurrence.source.kind, sourceKind);
            assert.equal(occurrence.target.kind, targetKind);
            assert.equal(occurrence.classifications.length, 1);
          }
          assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
          expectOnlyBoardPatterns(result);
        }
      );
    }
  }
}

test('keeps only card roles of a candidate column that is itself another candidate', () => {
  const pages = [
    note('A'),
    note('B'),
    note(
      'A/첫열',
      '<h2>A행</h2><h3>A카드1</h3><h4>A세부1</h4>' +
        anchor(href('B/첫열', 'B세부1')) +
        '<h3>A카드2</h3><h4>A세부2</h4>' +
        anchor(href('B/첫열', 'B세부2'))
    ),
    note('A/둘째열', '<h2>A보조행</h2><h3>A보조카드</h3>'),
    note(
      'B/첫열',
      '<h2>B행</h2><h3>B카드1</h3><h4>B세부1</h4>' +
        anchor(href('A/첫열', 'A세부1')) +
        '<h3>B카드2</h3><h4>B세부2</h4>' +
        anchor(href('A/첫열', 'A세부2'))
    ),
    note('B/둘째열', '<h2>B보조행</h2><h3>B보조카드</h3>'),
    note('B/첫열/첫하위열', '<h2>하위행</h2><h3>첫하위카드</h3>'),
    note('B/첫열/둘째하위열', '<h2>하위행</h2><h3>둘째하위카드</h3>'),
  ];
  const candidates = inferBoardCandidates(pages);
  assert.deepEqual(
    new Set(candidates.map((candidate) => candidate.title)),
    new Set(['A', 'B', 'B/첫열'])
  );
  const result = find(pages, [], candidates);
  for (const [source, target] of [
    ['A', 'B'],
    ['B', 'A'],
  ]) {
    assert.equal(expectedPattern(result, 'CARD->CARD', source, target).count, 2);
  }
  assert.equal(result.patterns.length, 2);
  const outgoing = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.deepEqual(
    outgoing.map((decision) => [decision.source.title, decision.target.title]),
    [
      ['A카드1', 'B카드1'],
      ['A카드2', 'B카드2'],
    ]
  );
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
  expectOnlyBoardPatterns(result);
});

test('keeps only board patterns for a hierarchy candidate root that is also a top-level candidate column', () => {
  const pages = [
    note(
      'A/첫열',
      '<h2>A행</h2><h3>A카드1</h3>' +
        anchor(href('N', 'N카드1')) +
        '<h3>A카드2</h3>' +
        anchor(href('N', 'N카드2'))
    ),
    note('A/둘째열', '<h2>A보조행</h2><h3>A보조카드</h3>'),
    note(
      'N',
      '<h2>공통행</h2><h3>N카드1</h3>' +
        anchor(href('A/첫열', 'A카드1')) +
        '<h3>N카드2</h3>' +
        anchor(href('A/첫열', 'A카드2'))
    ),
    note('M', '<h2>공통행</h2><h3>M카드1</h3><h3>M카드2</h3>'),
    note('N/첫열', '<h2>N하위행</h2><h3>N첫하위카드</h3>'),
    note('N/둘째열', '<h2>N하위행</h2><h3>N둘째하위카드</h3>'),
  ];
  const candidates = [...inferBoardCandidates(pages), ...inferTopLevelBoardCandidates(pages)];
  assert.equal(
    candidates.some((candidate) => candidate.title === 'N'),
    true
  );
  const top = candidates.find((candidate) => candidate.grouping === 'TOP_LEVEL_NOTES');
  assert.deepEqual(top.columnNoteTitles, ['M', 'N']);
  const result = find(pages, [], candidates);
  assert.equal(expectedPattern(result, 'CARD->CARD', 'A', top.title).count, 2);
  assert.equal(expectedPattern(result, 'CARD->CARD', top.title, 'A').count, 2);
  assert.equal(result.patterns.length, 2);
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
  expectOnlyBoardPatterns(result);
});

test('excludes note roles inside the same board when a column is itself a candidate', () => {
  const pages = [
    note('A/원본', sourceBody('CARD', anchors(href('A/대상', '노트문단')))),
    note('A/대상', '<h2>노트문단</h2>' + anchors(href('A/원본', '소스카드'))),
    note('A/대상/첫열', targetBody),
    note('A/대상/둘째열', targetBody),
  ];
  const boards = [board('A')];
  const candidates = inferBoardCandidates(pages, boards);
  assert.equal(
    candidates.some((candidate) => candidate.title === 'A/대상'),
    true
  );
  const result = find(pages, boards, candidates);
  assert.equal(boardPatterns(result).length, 0);
  assert.equal(result.patterns.length, 0);
  assert.equal(result.linkClassifications.linkClassifications.length, 0);
  assert.equal(excludedLinkOccurrences(result).length, 4);
  for (const link of excludedLinkOccurrences(result)) {
    assert.equal(link.exclusionReason, 'SAME_BOARD');
  }
});

for (const origin of ['BOARD', 'CANDIDATE']) {
  for (const sourceKind of boardKinds) {
    for (const targetKind of boardKinds) {
      test(
        'marks ' + origin + ' internal ' + sourceKind + '->' + targetKind + ' as SAME_BOARD',
        () => {
          const target = href(
            'A/대상',
            targetKind === 'ROW' ? '대상행' : targetKind === 'CARD' ? '대상카드' : undefined
          );
          const pages = [
            note('A/원본', sourceBody(sourceKind, anchors(target))),
            note('A/대상', targetBody),
          ];
          const boards = origin === 'BOARD' ? [board('A')] : [];
          const candidates = origin === 'CANDIDATE' ? inferBoardCandidates(pages, []) : [];
          if (origin === 'CANDIDATE') assert.equal(candidates[0].title, 'A');
          const result = find(pages, boards, candidates);
          assert.equal(result.patterns.length, 0);
          assert.equal(result.linkClassifications.linkClassifications.length, 0);
          assert.deepEqual(Object.keys(result.linkClassifications.excludedLinkClassifications), [
            'SAME_BOARD',
          ]);
          const occurrences = excludedLinkOccurrences(result);
          assert.equal(occurrences.length, 2);
          for (const occurrence of occurrences) {
            assert.equal(occurrence.exclusionReason, 'SAME_BOARD');
            assert.equal(occurrence.source.kind, sourceKind);
            assert.equal(occurrence.target.kind, targetKind);
            assert.equal(occurrence.source.boardOrigin, origin);
            assert.equal(occurrence.target.boardOrigin, origin);
            assert.equal(occurrence.isRepeatedPattern, false);
          }
        }
      );
    }
  }
}

test('maps candidate child paragraphs outside rows and cards to columns in both directions', () => {
  const candidateBody = '<h1>소개</h1><h2>행</h2><h3>카드</h3>';
  const pages = [
    note('B/원본', sourceBody('COLUMN', anchor(href('A/첫열', '소개')))),
    note('B/추가열', sourceBody('COLUMN', anchor(href('A/둘째열', '소개')))),
    note('A/첫열', '<h1>소개</h1>' + anchor(href('B/원본')) + '<h2>행</h2><h3>카드</h3>'),
    note('A/둘째열', candidateBody),
  ];
  const boards = [board('B')];
  const candidates = inferBoardCandidates(pages, boards);
  assert.equal(candidates[0].title, 'A');
  const result = find(pages, boards, candidates);
  const pattern = expectedPattern(result, 'COLUMN->COLUMN', 'B', 'A');
  assert.equal(pattern.count, 2);
  assert.equal(pattern.targetBoard.origin, 'CANDIDATE');
  const outgoing = linkOccurrences(result).find(
    (occurrence) => occurrence.sourceNoteTitle === 'A/첫열'
  );
  assert.equal(outgoing.source.kind, 'COLUMN');
  assert.equal(outgoing.source.boardTitle, 'A');
  assert.equal(outgoing.source.boardOrigin, 'CANDIDATE');
  assert.equal(outgoing.target.kind, 'COLUMN');
  assert.equal(outgoing.target.boardTitle, 'B');
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
});

test('maps candidate card paragraphs and their descendants even without a visible scrum row', () => {
  const pages = [
    note(
      'A/첫열',
      '<h3>첫카드</h3>' +
        anchor(href('B/원본', '소스카드')) +
        '<h4>세부문단</h4>' +
        anchor(href('B/원본', '소스카드'))
    ),
    note('A/둘째열', '<h3>둘째카드</h3>'),
    note(
      'B/원본',
      sourceBody('CARD', anchor(href('A/첫열', '첫카드'))) +
        '<h3>추가카드</h3>' +
        anchor(href('A/둘째열', '둘째카드'))
    ),
  ];
  const candidates = [{ title: 'A', option: board('A').option }];
  const result = find(pages, [board('B')], candidates);
  const outgoing = linkOccurrences(result).filter(
    (occurrence) => occurrence.sourceNoteTitle === 'A/첫열'
  );
  assert.equal(outgoing.length, 2);
  for (const occurrence of outgoing) {
    assert.equal(occurrence.source.kind, 'CARD');
    assert.equal(occurrence.source.boardOrigin, 'CANDIDATE');
    assert.equal(occurrence.source.title, '첫카드');
  }
  assert.equal(outgoing[1].sourceParagraph.paragraph, '세부문단');
  assert.equal(outgoing[0].source.id, outgoing[1].source.id);
  const incoming = expectedPattern(result, 'CARD->CARD', 'B', 'A');
  assert.equal(incoming.count, 2);
  assert.equal(incoming.targetBoard.origin, 'CANDIDATE');
  assert.deepEqual(
    incoming.matches.map((match) => match.target.title),
    ['첫카드', '둘째카드']
  );
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
});
test('infers top-level columns with cards at the same level and an active common row', () => {
  const pages = [
    note('개발 지식', '<h2>공통행</h2><h3>개발카드</h3>'),
    note('Spring Boot', '<h2>공통행</h2><h3>스프링카드</h3>'),
    note('일반 노트', '<h2>다른행</h2><h3>다른카드</h3>'),
  ];
  assert.deepEqual(inferBoardCandidates(pages), []);
  const candidates = inferTopLevelBoardCandidates(pages);
  assert.equal(candidates.length, 1);
  const candidate = candidates[0];
  assert.match(candidate.title, /^Board\((Spring Boot, 개발 지식|개발 지식, Spring Boot)\)$/);
  assert.equal(candidate.noteExists, false);
  assert.equal(candidate.grouping, 'TOP_LEVEL_NOTES');
  assert.deepEqual(new Set(candidate.columnNoteTitles), new Set(['개발 지식', 'Spring Boot']));
  assert.deepEqual(candidate.option, { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 3 });
  assert.deepEqual(candidate.stats, {
    columnCount: 2,
    activeColumnCount: 2,
    cardCount: 2,
    rowCount: 1,
    sharedRowCount: 1,
    scrumPreservesCards: true,
  });
  assert.deepEqual(inferTopLevelBoardCandidates([...pages].reverse()), candidates);
});

for (const [reason, pages] of [
  ['cards without named rows', [note('A', '<h3>카드</h3>'), note('B', '<h3>카드</h3>')]],
  [
    'different row names',
    [note('A', '<h2>첫행</h2><h3>카드</h3>'), note('B', '<h2>둘행</h2><h3>카드</h3>')],
  ],
  [
    'common rows without cards in one column',
    [note('A', '<h2>공통행</h2><h3>카드</h3>'), note('B', '<h2>공통행</h2>')],
  ],
  [
    'common rows whose cards are under other rows',
    [
      note('A', '<h2>공통행</h2><h2>첫행</h2><h3>카드</h3>'),
      note('B', '<h2>공통행</h2><h2>둘행</h2><h3>카드</h3>'),
    ],
  ],
  ['blank row names', [note('A', '<h2></h2><h3>카드</h3>'), note('B', '<h2></h2><h3>카드</h3>')]],
  [
    'different card levels',
    [note('A', '<h2>공통행</h2><h3>카드</h3>'), note('B', '<h3>공통행</h3><h4>카드</h4>')],
  ],
  [
    'nested notes',
    [
      note('A/첫열', '<h2>공통행</h2><h3>카드</h3>'),
      note('B/둘열', '<h2>공통행</h2><h3>카드</h3>'),
    ],
  ],
]) {
  test('does not infer top-level columns from ' + reason, () => {
    assert.deepEqual(inferTopLevelBoardCandidates(pages), []);
  });
}

test('does not confuse similar encoded row path prefixes with shared row names', () => {
  const pages = [
    note('A', '<h2>abc</h2><h2>abcd</h2><h3>첫카드</h3>'),
    note('B', '<h2>abc</h2><h3>둘카드</h3>'),
  ];
  assert.deepEqual(inferTopLevelBoardCandidates(pages), []);
});

test('counts only rows with cards in multiple columns for top-level shared-row thresholds', () => {
  const pages = [
    note('A', '<h2>공통</h2><h3>첫카드</h3><h2>abc</h2><h2>abcd</h2><h3>다른카드</h3>'),
    note('B', '<h2>공통</h2><h3>둘카드</h3><h2>abc</h2><h3>다른카드</h3>'),
  ];
  const [candidate] = inferTopLevelBoardCandidates(pages);
  assert.equal(candidate.stats.sharedRowCount, 1);
  assert.deepEqual(inferTopLevelBoardCandidates(pages, [], { minSharedRows: 2 }), []);
});

test('retains top-level groups with repeated row names even when scrum would omit their cards', () => {
  const pages = [
    note('A', '<h1>첫분류</h1><h2>공통</h2><h1>둘분류</h1><h2>공통</h2><h3>첫카드</h3>'),
    note('B', '<h2>공통</h2><h3>둘카드</h3>'),
  ];
  const [candidate] = inferTopLevelBoardCandidates(pages);
  assert.deepEqual(candidate.columnNoteTitles, ['A', 'B']);
  assert.equal(candidate.stats.sharedRowCount, 1);
  assert.equal(candidate.stats.scrumPreservesCards, false);
  assert.equal(candidate.option.BOARD_TYPE, 'KANBAN');
});

test('groups connected row-sharing notes while keeping unrelated groups separate', () => {
  const pages = [
    note('A', '<h2>DB</h2><h3>A카드</h3>'),
    note('B', '<h2>DB</h2><h3>B카드</h3><h2>API</h2><h3>B다른카드</h3>'),
    note('C', '<h2>API</h2><h3>C카드</h3>'),
    note('D', '<h2>문서</h2><h3>D카드</h3>'),
    note('E', '<h2>문서</h2><h3>E카드</h3>'),
    note('독립', '<h2>독립행</h2><h3>독립카드</h3>'),
  ];
  const candidates = inferTopLevelBoardCandidates(pages);
  assert.deepEqual(
    candidates.map((candidate) => candidate.columnNoteTitles),
    [
      ['A', 'B', 'C'],
      ['D', 'E'],
    ]
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.title),
    ['Board(A, B, C)', 'Board(D, E)']
  );
  assert.equal(candidates[0].stats.sharedRowCount, 2);
  assert.deepEqual(inferTopLevelBoardCandidates([...pages].reverse()), candidates);
});

test('applies top-level candidate thresholds and requires a common row even with minSharedRows zero', () => {
  const pages = [note('A', targetBody), note('B', targetBody)];
  for (const criteria of [{ minActiveColumns: 3 }, { minCards: 3 }, { minSharedRows: 2 }]) {
    assert.deepEqual(inferTopLevelBoardCandidates(pages, [], criteria), []);
  }
  assert.equal(inferTopLevelBoardCandidates(pages, [], { minSharedRows: 0 }).length, 1);
  const [candidate] = inferTopLevelBoardCandidates(pages, [], { minRows: 2 });
  assert.equal(candidate.option.BOARD_TYPE, 'KANBAN');
  assert.deepEqual(
    inferTopLevelBoardCandidates([note('A', '<h3>카드</h3>'), note('B', '<h3>카드</h3>')], [], {
      minSharedRows: 0,
    }),
    []
  );
});

for (const level of [2, 6]) {
  test('infers top-level cards at H' + level, () => {
    const body =
      '<h' + (level - 1) + '>공통행</h' + (level - 1) + '><h' + level + '>카드</h' + level + '>';
    const [candidate] = inferTopLevelBoardCandidates([note('A', body), note('B', body)]);
    assert.equal(candidate.option.BOARD_HEADER_LEVEL, level);
    assert.equal(candidate.option.BOARD_TYPE, 'SCRUM');
  });
}

test('prefers H3 when competing top-level card levels have equal statistics', () => {
  const body = '<h2>공통행</h2><h3>공통카드</h3><h4>상세카드</h4>';
  const [candidate] = inferTopLevelBoardCandidates([note('A', body), note('B', body)]);
  assert.equal(candidate.option.BOARD_HEADER_LEVEL, 3);
});

test('recomputes row connections after choosing another card level without overlapping columns', () => {
  const moreCards = '<h4>선택행</h4>' + [1, 2, 3, 4].map((i) => '<h5>카드' + i + '</h5>').join('');
  const pages = [
    note('A', '<h2>첫행</h2><h3>A카드</h3>'),
    note('B', '<h2>둘행</h2><h3>B카드</h3>'),
    note('C', '<h2>첫행</h2><h3>C카드</h3><h2>둘행</h2><h3>C둘카드</h3>' + moreCards),
    note('D', moreCards),
  ];
  const candidates = inferTopLevelBoardCandidates(pages);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].columnNoteTitles, ['C', 'D']);
  assert.equal(candidates[0].option.BOARD_HEADER_LEVEL, 5);
});

test('avoids virtual title collisions with notes, boards and inferred parent paths', () => {
  const pages = [
    note('A', targetBody),
    note('B', targetBody),
    note('Board(A, B) (2)/자식'),
    note('Board(A, B) (3)'),
  ];
  const [candidate] = inferTopLevelBoardCandidates(pages, [board('Board(A, B)')]);
  assert.equal(candidate.title, 'Board(A, B) (4)');
});

test('uses only latest NOTE content while permitting existing board root notes as top-level columns', () => {
  const pages = [
    note('A', targetBody),
    note('B', '<h2>다른행</h2><h3>카드</h3>'),
    note('B', targetBody),
    board('보드만'),
  ];
  const [candidate] = inferTopLevelBoardCandidates(pages, [board('A')]);
  assert.deepEqual(candidate.columnNoteTitles, ['A', 'B']);
  assert.equal(candidate.stats.cardCount, 2);
});

for (const sourceKind of ['ROW', 'COLUMN', 'CARD']) {
  for (const targetKind of ['ROW', 'COLUMN', 'CARD']) {
    test(
      'classifies top-level candidate ' +
        sourceKind +
        '->' +
        targetKind +
        ' links in both directions',
      () => {
        const outgoing = [1, 2].map((i) =>
          anchor(
            href(
              'B/대상' + i,
              targetKind === 'ROW'
                ? '대상행' + i
                : targetKind === 'CARD'
                ? '대상카드' + i
                : undefined
            )
          )
        );
        const incoming = [1, 2].map((i) =>
          anchor(
            href(
              '최상위' + i,
              targetKind === 'ROW'
                ? '구별행' + i
                : targetKind === 'CARD'
                ? '구별카드' + i
                : undefined
            )
          )
        );
        const pages = [
          ...[1, 2].map((i) =>
            note(
              '최상위' + i,
              sourceBody(sourceKind, outgoing[i - 1])
                .replace('소스행', '출발행' + i)
                .replace('소스카드', '출발카드' + i) +
                '<h2>공유행</h2><h3>공유카드</h3>' +
                '<h2>구별행' +
                i +
                '</h2><h3>구별카드' +
                i +
                '</h3>'
            )
          ),
          ...[1, 2].map((i) =>
            note(
              'B/원본' + i,
              sourceBody(sourceKind, incoming[i - 1])
                .replace('소스행', '보드출발행' + i)
                .replace('소스카드', '보드출발카드' + i)
            )
          ),
          ...[1, 2].map((i) =>
            note('B/대상' + i, '<h2>대상행' + i + '</h2><h3>대상카드' + i + '</h3>')
          ),
        ];
        const boards = [board('B')];
        const candidates = [
          ...inferBoardCandidates(pages, boards),
          ...inferTopLevelBoardCandidates(pages, boards),
        ];
        assert.equal(candidates.length, 1);
        const title = candidates[0].title;
        const result = find(pages, boards, candidates);
        const outPattern = expectedPattern(result, sourceKind + '->' + targetKind, title, 'B');
        const inPattern = expectedPattern(result, sourceKind + '->' + targetKind, 'B', title);
        assert.equal(outPattern.count, 2);
        assert.equal(inPattern.count, 2);
        assert.equal(outPattern.sourceBoard.origin, 'CANDIDATE');
        assert.equal(inPattern.targetBoard.origin, 'CANDIDATE');
        if (sourceKind === 'COLUMN') assert.equal(outPattern.matches[0].source.title, '최상위1');
        if (targetKind === 'COLUMN')
          assert.deepEqual(
            inPattern.matches.map((match) => match.target.title),
            ['최상위1', '최상위2']
          );
        assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
      }
    );

    test(
      'marks top-level internal ' + sourceKind + '->' + targetKind + ' links as SAME_BOARD',
      () => {
        const target = href(
          '둘째',
          targetKind === 'ROW' ? '소스행' : targetKind === 'CARD' ? '소스카드' : undefined
        );
        const pages = [
          note('첫째', sourceBody(sourceKind, anchors(target))),
          note('둘째', sourceBody('CARD', '')),
        ];
        const candidates = inferTopLevelBoardCandidates(pages);
        assert.equal(candidates.length, 1);
        const result = find(pages, [], candidates);
        assert.equal(result.patterns.length, 0);
        assert.deepEqual(result.linkClassifications.linkClassifications, []);
        const occurrences = excludedLinkOccurrences(result);
        assert.equal(occurrences.length, 2);
        for (const occurrence of occurrences) {
          assert.equal(occurrence.exclusionReason, 'SAME_BOARD');
          assert.equal(occurrence.source.kind, sourceKind);
          assert.equal(occurrence.target.kind, targetKind);
        }
      }
    );
  }
}

test('excludes note paragraph roles in both directions for top-level candidates', () => {
  const pages = [
    note('첫째', sourceBody('CARD', anchor(href('N', '첫문단')) + anchor(href('N', '둘문단')))),
    note('둘째', sourceBody('CARD', '')),
    note(
      'N',
      '<h1>첫문단</h1>' +
        anchor(href('첫째', '소스카드')) +
        '<h1>둘문단</h1>' +
        anchor(href('둘째', '소스카드'))
    ),
  ];
  const candidates = inferTopLevelBoardCandidates(pages);
  assert.equal(candidates.length, 1);
  const result = find(pages, [], candidates);
  expectUnsupported(result, 4);
});

test('resolves physical root paragraphs before board aliases and falls back to child cards when absent', () => {
  const pages = [
    note('A', '<h2>공통행</h2><h3>루트카드</h3><h3>겹친카드</h3>'),
    note('다른루트', '<h2>공통행</h2><h3>다른카드</h3>'),
    note('A/첫열', '<h2>하위행</h2><h3>하위카드</h3><h3>겹친카드</h3>'),
    note('A/둘째열', '<h2>하위행</h2><h3>둘카드</h3>'),
    note(
      'B/원본',
      sourceBody(
        'CARD',
        ['루트카드', '하위카드', '겹친카드']
          .map((title) => anchor(href('A', title), title))
          .join('')
      )
    ),
  ];
  const boards = [board('B')];
  const candidates = [
    ...inferBoardCandidates(pages, boards),
    ...inferTopLevelBoardCandidates(pages, boards),
  ];
  const top = candidates.find((candidate) => candidate.grouping === 'TOP_LEVEL_NOTES');
  const result = find(pages, boards, candidates);
  const occurrences = linkOccurrences(result);
  assert.deepEqual(
    occurrences.map((link) => [link.linkText, link.target.boardTitle, link.target.kind]),
    [
      ['루트카드', top.title, 'CARD'],
      ['하위카드', 'A', 'CARD'],
      ['겹친카드', top.title, 'CARD'],
    ]
  );
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
});

test('keeps a resolved board alias across boards when its root is a column in the source board', () => {
  const option = { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 3 };
  const result = find(
    [
      note('A', '<h3>루트카드</h3>' + anchor(href('A', '하위카드'))),
      note('M', '<h3>다른카드</h3>'),
      note('A/열', '<h3>하위카드</h3>'),
    ],
    [],
    [
      { title: 'A', option },
      { title: 'V', option, columnNoteTitles: ['A', 'M'] },
    ]
  );
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
  const occurrences = linkOccurrences(result);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].source.boardTitle, 'V');
  assert.equal(occurrences[0].target.boardTitle, 'A');
  assert.equal(occurrences[0].pattern, 'CARD->CARD');
});

test('preserves an ambiguous physical root scope without falling back to another board alias', () => {
  const pages = [
    note('A', '<h2>공통행</h2><h3>같은카드</h3><h3>같은카드</h3>'),
    note('다른루트', '<h2>공통행</h2><h3>다른카드</h3>'),
    note('A/첫열', '<h2>행</h2><h3>같은카드</h3>'),
    note('A/둘째열', targetBody),
    note('B/원본', sourceBody('CARD', anchor(href('A', '같은카드')))),
  ];
  const boards = [board('B')];
  const candidates = [
    ...inferBoardCandidates(pages, boards),
    ...inferTopLevelBoardCandidates(pages, boards),
  ];
  const top = candidates.find((candidate) => candidate.grouping === 'TOP_LEVEL_NOTES');
  const result = find(pages, boards, candidates);
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
  const [occurrence] = linkOccurrences(result);
  assert.equal(occurrence.target.boardTitle, top.title);
  assert.equal(occurrence.target.kind, 'CARD');
  assert.equal(occurrence.target.resolution, 'BOARD_KIND');
  assert.equal(Object.hasOwn(occurrence.target, 'id'), false);
  assert.equal(occurrence.target.candidateElements.length, 2);
  assert.ok(occurrence.target.candidateElements.every((element) => element.noteTitle === 'A'));
});

test('actual board definitions override explicit candidate columns of the same title', () => {
  const pages = [
    note('첫째', targetBody),
    note('둘째', targetBody),
    note('V/실제열', targetBody),
    note('B/원본', sourceBody('COLUMN', anchor(href('첫째')) + anchor(href('V/실제열')))),
  ];
  const candidates = [
    { title: 'V', option: board('V').option, columnNoteTitles: ['첫째', '둘째'] },
  ];
  const result = find(pages, [board('B'), board('V')], candidates);
  const occurrences = linkOccurrences(result);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].target.boardTitle, 'V');
  assert.equal(occurrences[0].target.boardOrigin, 'BOARD');
  const excluded = excludedLinkOccurrences(result);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].target.containerType, 'NOTE');
  assert.equal(excluded[0].exclusionReason, 'UNSUPPORTED_PATTERN');
  expectOnlyBoardPatterns(result);
});

test('explicit candidate columns ignore missing and duplicate notes and respect empty lists', () => {
  const pages = [
    note('V/첫열', sourceBody('CARD', anchor(href('V/둘째열', '대상카드')))),
    note('V/둘째열', targetBody),
  ];
  const option = board('V').option;
  const valid = find(
    pages,
    [],
    [{ title: 'V', option, columnNoteTitles: ['V/첫열', '없음', 'V/둘째열', 'V/둘째열'] }]
  );
  assert.equal(excludedLinkOccurrences(valid)[0].exclusionReason, 'SAME_BOARD');
  const empty = find(pages, [], [{ title: 'V', option, columnNoteTitles: [] }]);
  assert.equal(excludedLinkOccurrences(empty)[0].exclusionReason, 'UNSUPPORTED_PATTERN');
});
const potentialOccurrences = (result) =>
  result.linkClassifications.potentialLinkClassifications.flatMap((group) => group.occurrences);
const excludedPotentialOccurrences = (result, reason) =>
  (result.linkClassifications.excludedPotentialLinkClassifications[reason] ?? []).flatMap(
    (group) => group.occurrences
  );

for (const sourceKind of boardKinds) {
  for (const targetKind of boardKinds) {
    test(
      'requires actual evidence for potential ' + sourceKind + '->' + targetKind + ' patterns',
      () => {
        const keyword =
          targetKind === 'COLUMN' ? 'B/대상' : targetKind === 'ROW' ? '대상행' : '대상카드';
        const classify = (links) =>
          find(
            [...distinctElements('A', sourceKind, links), note('B/대상', targetBody)],
            actualBoards(),
            []
          );
        const potentialOnly = classify([keyword, keyword]);
        assert.deepEqual(potentialOnly.patterns, []);
        assert.equal(potentialOccurrences(potentialOnly).length, 2);
        for (const item of potentialOccurrences(potentialOnly)) {
          assert.equal(item.pattern, sourceKind + '->' + targetKind);
          assert.equal(item.isRepeatedPattern, false);
        }
        const url = href('B/대상', targetKind === 'COLUMN' ? undefined : keyword);
        const oneActual = classify([anchor(url), keyword]);
        assert.deepEqual(oneActual.patterns, []);
        assert.equal(linkOccurrences(oneActual).length, 1);
        assert.equal(potentialOccurrences(oneActual).length, 1);
        for (const item of [...linkOccurrences(oneActual), ...potentialOccurrences(oneActual)])
          assert.equal(item.isRepeatedPattern, false);
        const duplicated = classify([anchors(url), keyword]);
        assert.deepEqual(duplicated.patterns, []);
        assert.equal(linkOccurrences(duplicated).length, 2);
        assert.equal(potentialOccurrences(duplicated).length, 1);
        for (const item of [...linkOccurrences(duplicated), ...potentialOccurrences(duplicated)])
          assert.equal(item.isRepeatedPattern, false);
        const result = classify([anchor(url) + keyword, anchor(url) + keyword]);
        const pattern = expectedPattern(result, sourceKind + '->' + targetKind, 'A', 'B');
        assert.deepEqual(
          [pattern.count, pattern.uniqueSourceCount, pattern.uniqueTargetCount],
          [2, 2, 1]
        );
        assert.equal(pattern.isRecommendationSupported, false);
        assert.equal(linkOccurrences(result).length, 2);
        assert.equal(potentialOccurrences(result).length, 2);
        assert.deepEqual(
          pattern.matches.map((match) => match.referenceType),
          ['LINK', 'POTENTIAL', 'LINK', 'POTENTIAL']
        );
        for (const match of pattern.matches) {
          if (match.referenceType === 'POTENTIAL')
            assert.ok(match.proposition.endsWith('연결할 수 있다.'));
        }
        assert.ok(pattern.qed.endsWith('연결할 수 있다.'));
        const withCandidates = find(
          [
            ...distinctElements('A', sourceKind, [anchor(url), anchor(url)]),
            note(
              'A/키워드',
              sourceBody(sourceKind, keyword)
                .replace('소스행', '키워드행')
                .replace('소스카드', '키워드카드')
            ),
            note(
              'A/무관',
              sourceBody(sourceKind, '').replace('소스행', '무관행').replace('소스카드', '무관카드')
            ),
            note('B/대상', targetBody),
          ],
          actualBoards(),
          []
        );
        const recommendation = expectedPattern(
          withCandidates,
          sourceKind + '->' + targetKind,
          'A',
          'B'
        );
        assert.equal(recommendation.isRecommendationSupported, true);
        assert.equal(recommendation.recommendationSources.length, 1);
        assert.equal(recommendation.recommendationSources[0].kind, sourceKind);
        assert.equal(recommendation.recommendationSources[0].noteTitle, 'A/키워드');
      }
    );
    test(
      'recommends missing targets for connected ' + sourceKind + '->' + targetKind + ' sources',
      () => {
        const keyword = (i) =>
          targetKind === 'COLUMN'
            ? 'B/열' + i
            : '대상' + (targetKind === 'ROW' ? '행' : '카드') + i;
        const url = (i) => href('B/열' + i, targetKind === 'COLUMN' ? undefined : keyword(i));
        const firstLink = anchor(url(1));
        const pages = [
          ...distinctElements('A', sourceKind, [
            firstLink + keyword(1) + ', ' + keyword(2),
            firstLink + keyword(1),
          ]),
          ...distinctElements('B', targetKind, ['', ''], '대상'),
        ];
        const before = expectedPattern(
          find(pages, actualBoards(), []),
          sourceKind + '->' + targetKind,
          'A',
          'B'
        );
        assert.equal(before.isRecommendationSupported, true);
        assert.deepEqual(
          before.recommendationSources.map((source) => source.noteTitle),
          ['A/열1']
        );
        const missing = before.matches.find(
          (match) => match.referenceType === 'POTENTIAL' && match.linkText === keyword(2)
        );
        assert.deepEqual(before.recommendationSources, [missing.source]);
        pages[0].description = pages[0].description.replace(firstLink, firstLink + anchor(url(2)));
        const after = expectedPattern(
          find(pages, actualBoards(), []),
          sourceKind + '->' + targetKind,
          'A',
          'B'
        );
        assert.deepEqual(after.recommendationSources, []);
        assert.equal(after.isRecommendationSupported, false);
      }
    );
  }
}

test('recommends the shared-row location that actually contains the potential reference', () => {
  const result = find(
    [
      note(
        'A/열1',
        '<h2>행1</h2>' +
          anchor(href('B/대상', '대상카드')) +
          '<h3>카드1</h3>' +
          '<h2>행2</h2>' +
          anchor(href('B/대상', '대상카드')) +
          '<h3>카드2</h3>' +
          '<h2>공유행</h2><p>무관한 본문</p><h3>카드3</h3>'
      ),
      note('A/열2', '<h2>공유행</h2><p>대상카드, 대상카드</p><h3>카드4</h3>'),
      note('B/대상', targetBody),
    ],
    actualBoards(),
    []
  );
  const pattern = expectedPattern(result, 'ROW->CARD', 'A', 'B');
  const potential = pattern.matches.find((match) => match.referenceType === 'POTENTIAL');
  assert.deepEqual(pattern.recommendationSources, [potential.source]);
  assert.equal(pattern.recommendationSources[0].noteTitle, 'A/열2');
  assert.equal(pattern.recommendationSources[0].paragraph, '공유행');
});

test('groups header/body mentions separately from actual links and preserves unrepeated occurrences', () => {
  const result = find(
    [
      note(
        'A/원본',
        '<h3>대상카드 비교</h3>' +
          anchor(href('B/대상', '대상카드'), '대상카드') +
          '<p>대상카드, 대상카드</p>'
      ),
      note('B/대상', targetBody),
    ],
    recommendationBoards(),
    []
  );
  const [group] = result.linkClassifications.potentialLinkClassifications;
  assert.equal(group.count, 3);
  assert.equal(group.sourceParagraph.paragraph, '대상카드 비교');
  assert.deepEqual(
    group.occurrences.map((item) => item.sourcePart),
    ['HEADER', 'BODY', 'BODY']
  );
  assert.equal(linkOccurrences(result).length, 1);
  assert.equal(result.patterns.length, 0);
  for (const item of potentialOccurrences(result)) assert.equal(item.isRepeatedPattern, false);
});

test('combines potential and actual evidence without inflating distinct connections or sources', () => {
  const source = note(
    'A/원본',
    '<h3>a1</h3>' + anchors(href('B/대상', 'b1')) + anchor(href('B/대상')) + '<p>b1, b2, b1</p>'
  );
  const target = note('B/대상', '<h2>대상행</h2><h3>b1</h3><h3>b2</h3>');
  const single = find([source, target], recommendationBoards(), []);
  assert.equal(single.patterns.length, 0);
  assert.equal(potentialOccurrences(single).length, 3);
  source.description +=
    '<h3>a2</h3>' +
    anchor(href('B/대상', 'b1')) +
    '<p>b1</p><h3>a3</h3><h3>a4</h3><p>b1, b1, b2, 대상행</p><h3>a5</h3><p>b1</p>';
  const result = find([source, target], recommendationBoards(), []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.deepEqual([pattern.count, pattern.occurrenceCount, pattern.uniqueSourceCount], [6, 11, 4]);
  assert.deepEqual(
    pattern.recommendationSources.map((item) => item.title),
    ['a1', 'a4', 'a5']
  );
  assert.equal(linkOccurrences(result)[0].isRepeatedPattern, true);
});

test('shares literal keyword boundaries and excludes anchors, code, metadata and joined blocks', () => {
  const html =
    '<h3>a1</h3>' +
    anchor(href('B/대상', 'Spring Boot'), 'Spring Boot') +
    '<p title="Spring Boot">다른 본문</p><code>Spring Boot</code><pre>Spring Boot</pre>' +
    '<script>Spring Boot</script><style>Spring Boot</style><div class="yaml-frontmatter">Spring Boot</div>' +
    '<p>Spring</p><p>Boot</p><p>Spring<br/> Boot</p><p>Spring <a href="https://example.test">링크</a>Boot</p>' +
    '<p>spring <strong>boot</strong>, JavaScript, JAVa, C&amp;C</p>';
  const pages = [
    note('A/원본', html),
    note('B/대상', '<h3>Spring Boot</h3><h3>Java</h3><h3>C&amp;C</h3>'),
  ];
  const before = JSON.stringify(pages);
  pages.forEach(Object.freeze);
  const result = find(pages, recommendationBoards(), []);
  assert.equal(JSON.stringify(pages), before);
  assert.deepEqual(
    potentialOccurrences(result).map((item) => item.linkText),
    ['spring boot', 'JAVa', 'C&C']
  );
  assert.equal(linkOccurrences(result).length, 1);
  assert.equal(JSON.stringify(result).includes('"url"'), false);
});

test('keeps agreed board-kind scopes and allows separate cross-board keyword cases', () => {
  const pages = [
    note(
      'A/원본',
      '<h3>a1</h3>' +
        anchor(href('B', '설치')) +
        '<p>설치</p><h3>a2</h3>' +
        anchor(href('B', '설치')) +
        '<p>설치</p>'
    ),
    note('B/첫열', '<h3>설치</h3>'),
    note('B/둘째열', '<h3>설치</h3>'),
  ];
  const result = find(pages, recommendationBoards(), []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.deepEqual(
    [pattern.count, pattern.uniqueSourceCount, pattern.uniqueTargetCount],
    [0, 2, 0]
  );
  assert.equal(pattern.matches[0].target.resolution, 'BOARD_KIND');
  assert.equal(pattern.matches[0].target.candidateElements.length, 2);
  assert.deepEqual(pattern.recommendationSources, []);
  const ambiguous = find(
    [...pages, note('C/대상', '<h3>설치</h3>')],
    [...recommendationBoards(), board('C', 'KANBAN')],
    []
  );
  const cases = potentialOccurrences(ambiguous).filter((item) => item.sourceNoteTitle === 'A/원본');
  assert.equal(cases.length, 6);
  assert.deepEqual(
    [...new Set(cases.map((item) => item.targetNoteTitle))],
    ['B/첫열', 'B/둘째열', 'C/대상']
  );
  for (const item of cases) {
    assert.equal(item.candidateTargets.length, 1);
    assert.equal(item.pattern, 'CARD->CARD');
    assert.equal(item.isRepeatedPattern, item.targetNoteTitle.startsWith('B/'));
  }
  assert.equal(expectedPattern(ambiguous, 'CARD->CARD', 'A', 'B').count, 4);
  assert.equal(
    ambiguous.patterns.some(
      (item) => item.sourceBoard.title === 'A' && item.targetBoard.title === 'C'
    ),
    false
  );
  assert.equal(
    Object.hasOwn(
      ambiguous.linkClassifications.excludedPotentialLinkClassifications,
      'AMBIGUOUS_KEYWORD'
    ),
    false
  );
});

test('recommends partially connected target scopes until every candidate is already linked', () => {
  const firstLink = anchor(href('B/첫열', '설치'));
  const pages = [
    note(
      'A/원본',
      '<h3>a1</h3>' + firstLink + '<p>설치</p><h3>a2</h3>' + firstLink + '<p>설치</p>'
    ),
    note('B/첫열', '<h3>설치</h3>'),
    note('B/둘째열', '<h3>설치</h3>'),
  ];
  const before = expectedPattern(find(pages, recommendationBoards(), []), 'CARD->CARD', 'A', 'B');
  assert.equal(
    before.matches.find((match) => match.referenceType === 'POTENTIAL').target.resolution,
    'BOARD_KIND'
  );
  assert.deepEqual(
    before.recommendationSources.map((source) => source.title),
    ['a1', 'a2']
  );
  pages[0].description = pages[0].description.replaceAll(
    firstLink,
    firstLink + anchor(href('B/둘째열', '설치'))
  );
  const after = expectedPattern(find(pages, recommendationBoards(), []), 'CARD->CARD', 'A', 'B');
  assert.deepEqual(after.recommendationSources, []);
  assert.equal(after.isRecommendationSupported, false);
});

test('preserves SAME_BOARD priority and unsupported note roles for potential references', () => {
  const result = find(
    [
      note('X', '<h3>x1</h3><p>X, Y, 공통 제목, 일반 노트</p>'),
      note('Y', '<h2>공통 제목</h2><h3>공통 제목</h3>'),
      note('일반 노트', '<p>X</p>'),
    ],
    [],
    [{ title: 'Board(X, Y)', option: board('unused').option, columnNoteTitles: ['X', 'Y'] }]
  );
  assert.equal(result.patterns.length, 0);
  assert.equal(excludedPotentialOccurrences(result, 'SAME_BOARD').length, 2);
  assert.equal(excludedPotentialOccurrences(result, 'UNSUPPORTED_PATTERN').length, 2);
  assert.deepEqual(result.linkClassifications.excludedLinkClassifications, {});
});

test('separates same-note keyword cases by header path while preserving the four-field groups', () => {
  const result = find(
    [
      note('A/원본', '<h3>a1</h3><p>동일</p><h3>a2</h3><p>동일</p>'),
      note('B/대상', '<h2>동일</h2><h3>동일</h3>'),
    ],
    [board('A', 'KANBAN'), board('B')],
    []
  );
  const cases = potentialOccurrences(result).filter((item) => item.sourceNoteTitle === 'A/원본');
  assert.equal(cases.length, 4);
  assert.deepEqual(
    cases.map((item) => item.target.kind),
    ['ROW', 'CARD', 'ROW', 'CARD']
  );
  assert.notEqual(cases[0].target.path, cases[1].target.path);
  assert.deepEqual(result.patterns, []);
  for (const item of cases) assert.equal(item.isRepeatedPattern, false);
  assert.deepEqual(
    result.linkClassifications.potentialLinkClassifications.map((group) => group.count),
    [2, 2]
  );
});

test('multiple keyword alternatives from one source do not satisfy the repetition threshold', () => {
  const result = find(
    [
      note('A/원본', '<h3>a1</h3><p>설치</p>'),
      note('B/대상', '<h3>설치</h3>'),
      note('C/대상', '<h3>설치</h3>'),
    ],
    [...recommendationBoards(), board('C', 'KANBAN')],
    []
  );
  const cases = potentialOccurrences(result).filter((item) => item.sourceNoteTitle === 'A/원본');
  assert.equal(cases.length, 2);
  assert.deepEqual(
    cases.map((item) => item.targetNoteTitle),
    ['B/대상', 'C/대상']
  );
  for (const item of cases) assert.equal(item.isRepeatedPattern, false);
  assert.equal(result.patterns.length, 0);
});

/* eslint @typescript-eslint/consistent-type-assertions: "off" */
