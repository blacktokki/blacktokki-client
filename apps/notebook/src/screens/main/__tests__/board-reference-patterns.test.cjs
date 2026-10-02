const { DOMParser: XmlDomParser, XMLSerializer } = require('@xmldom/xmldom');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '../../..');
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
    elements.filter((node) => node.tagName === selector.toUpperCase());
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
  readFileSync(path.join(sourceRoot, 'screens/main/inferBoardCandidates.ts'), 'utf8'),
  {
    '../../components/HeaderSelectBar': paragraphs,
  }
);
const { findBoardReferencePatterns: find } = loadSource(
  readFileSync(path.join(sourceRoot, 'screens/main/findBoardReferencePatterns.ts'), 'utf8'),
  {
    '@blacktokki/editor': editor,
    '../../components/HeaderSelectBar': paragraphs,
    '../../components/SearchBar': noteLinks,
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
const variedCardLinks = () =>
  anchor(href('B/대상', '대상카드')) + anchor(href('B/대상', '추가카드'));
const variedCardData = (kind) => data(kind, variedCardLinks(), variedTargetBody);
const actualBoards = () => [board('A'), board('B')];
const linkOccurrences = (result) =>
  result.linkClassifications.flatMap((group) => group.occurrences);
const excludedLinkOccurrences = (result) =>
  Object.values(result.excludedLinkClassifications)
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
  assert.equal(result.hasRepeatedPatterns, false);
  assert.equal(result.patternCount, 0);
  assert.deepEqual(result.patterns, []);
  assert.deepEqual(result.linkClassifications, []);
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
      assert.equal(result.hasRepeatedPatterns, false);
      assert.equal(result.patternCount, 0);
      assert.deepEqual(result.patterns, []);
      assert.deepEqual(result.excludedLinkClassifications, {});
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
function distinctElements(root, kind, links = ['', '']) {
  if (boardKinds.includes(kind)) {
    return [1, 2].map((i) =>
      note(
        root + '/열' + i,
        '<p>' +
          (kind === 'COLUMN' ? links[i - 1] : '') +
          '</p><h2>행' +
          i +
          '</h2><p>' +
          (kind === 'ROW' ? links[i - 1] : '') +
          '</p><h3>카드' +
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
          ...distinctElements(sourceRoot, sourceKind, links),
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
        assert.equal(result.hasRepeatedPatterns, true);
        assert.equal(result.patternCount, 1);
        const pattern = expectedPattern(
          result,
          sourceKind + '->' + targetKind,
          sourceRoot,
          targetRoot
        );
        assert.equal(pattern.pattern, sourceKind + '->' + targetKind);
        assert.equal(pattern.count, 2);
        assert.equal(pattern.matches.length, 2);
        assert.equal(result.linkClassifications.length, 2);
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
  assert.equal(result.patternCount, 1);
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

test('retains duplicate references when another distinct target qualifies the pattern', () => {
  const pages = variedCardData('CARD');
  pages[0].description += anchor(href('B/대상', '대상카드'));
  const result = find(pages, actualBoards(), []);
  const pattern = expectedPattern(result, 'CARD->CARD', 'A', 'B');
  assert.equal(pattern.count, 3);
  assert.equal(pattern.matches.length, 3);
  assert.deepEqual(
    pattern.matches.map((match) => match.target.title),
    ['대상카드', '추가카드', '대상카드']
  );
  assert.equal(result.linkClassifications.length, 1);
  assert.equal(result.linkClassifications[0].count, 3);
  for (const occurrence of linkOccurrences(result)) {
    assert.equal(occurrence.isRepeatedPattern, true);
  }
  expectOnlyBoardPatterns(result);
  for (const repeated of result.patterns) {
    assert.ok(new Set(repeated.matches.map((match) => match.target.id)).size >= 2);
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
  assert.equal(result.patternCount, 0);
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
  assert.equal(result.patternCount, 0);
  expectOnlyBoardPatterns(result);
});

test('one reference does not reach the repetition threshold', () => {
  const { linkClassifications, ...summary } = find(
    data('CARD', anchors(href('B/대상', '대상카드'), 1)),
    actualBoards(),
    []
  );
  assert.deepEqual(summary, {
    hasRepeatedPatterns: false,
    patternCount: 0,
    patterns: [],
    excludedLinkClassifications: {},
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
  assert.equal(result.patternCount, 0);
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
  assert.equal(find(pages, [...actualBoards(), board('C')], []).hasRepeatedPatterns, false);
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
  assert.equal(find(pages, actualBoards(), []).hasRepeatedPatterns, false);
});
test('resolves normalized heading hashes', () => {
  const url = new URL(href('B/대상'));
  url.hash = 'target-card';
  const pages = data('CARD', anchors(url.href), '<h2>대상행</h2><h3>Target Card</h3>');
  const result = find(pages, actualBoards(), []);
  assert.equal(result.patternCount, 0);
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
    assert.equal(result.hasRepeatedPatterns, false);
    assert.equal(result.linkClassifications.length, 0);
    assert.deepEqual(Object.keys(result.excludedLinkClassifications), [reason]);
    assert.equal(result.excludedLinkClassifications[reason].length, 2);
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
  assert.equal(result.patternCount, 0);
  assert.equal(result.linkClassifications.length, 0);
  assert.equal(result.excludedLinkClassifications.SAME_BOARD.length, 2);
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
  assert.equal(ambiguous.patternCount, 0);
  expectUnsupported(ambiguous, 2);
  const result = find(
    data('CARD', anchors(href('B/대상', '대상카드', '둘째행')), body),
    actualBoards(),
    []
  );
  assert.equal(result.patternCount, 0);
  assert.equal(expectedDecisions(result, 'CARD->CARD', 'A', 'B')[0].target.section, '둘째행');
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
  assert.equal(result.patternCount, 0);
  const decisions = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.equal(decisions[0].source.title, '소스카드');
  assert.equal(decisions[0].target.title, '대상카드');
});
test('includes links inside headings', () => {
  const pages = data('ROW', '', variedTargetBody);
  pages[0].description = '<h2>소스행' + variedCardLinks() + '</h2><h3>소스카드</h3>';
  assert.equal(find(pages, actualBoards(), []).patterns[0].pattern, 'ROW->CARD');
});
test('excludes hidden board cards without creating mixed note patterns', () => {
  const pages = data('CARD', anchors(href('B/대상', '대상카드')));
  pages[0].description = '<h3>소스카드</h3>' + anchors(href('B/대상', '대상카드'));
  const hiddenSource = find(pages, actualBoards(), []);
  assert.equal(boardPatterns(hiddenSource).length, 0);
  assert.equal(hiddenSource.patternCount, 0);
  expectUnsupported(hiddenSource, 2);
  const hiddenTarget = find(
    data('CARD', anchors(href('B/대상', '대상카드')), '<h3>대상카드</h3>'),
    actualBoards(),
    []
  );
  assert.equal(boardPatterns(hiddenTarget).length, 0);
  assert.equal(hiddenTarget.patternCount, 0);
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
  assert.equal(find(pages, boards, []).hasRepeatedPatterns, false);
  pages[0].description += '<p>' + anchor(href('N', '문단')) + '</p>';
  assert.equal(find(pages, boards, []).hasRepeatedPatterns, false);
  pages[0].description += '<p>' + anchor(href('M/하위')) + '</p>';
  assert.equal(find(pages, boards, []).hasRepeatedPatterns, false);
  pages[2].description = '<p>' + anchor(href('A/원본', '소스카드')) + '</p>';
  assert.equal(find(pages, boards, []).hasRepeatedPatterns, false);
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
  const { linkClassifications, excludedLinkClassifications, ...summary } = find(
    pages,
    [board('A')],
    []
  );
  const result = { ...summary, linkClassifications, excludedLinkClassifications };
  expectUnsupported(result, 6);
  assert.equal(excludedLinkClassifications.UNSUPPORTED_PATTERN.length, 6);
});
test('ignores missing note elements and ambiguous paragraphs', () => {
  const pages = [
    note('A/원본', ''),
    note('N', '<h1>첫째</h1><h2>문단</h2><h1>둘째</h1><h2>문단</h2>'),
  ];
  for (const url of [href('N/없는노트'), href('N', '없는문단'), href('N', '문단')]) {
    pages[0].description = sourceBody('CARD', anchors(url));
    assert.equal(find(pages, [board('A')], []).hasRepeatedPatterns, false);
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
  assert.equal(result.patternCount, 0);
  expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.equal(result.linkClassifications.length, 2);
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
  assert.equal(result.patternCount, 0);
  assert.equal(result.linkClassifications.length, 3);
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
  assert.notEqual(result.linkClassifications[0].linkText, result.linkClassifications[1].linkText);
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
  const classification = find(pages, actualBoards(), []).linkClassifications[0].occurrences[0];
  assert.equal(classification.sourceParagraph.paragraph, '세부문단');
  assert.equal(classification.source.paragraph, '소스카드');
  assert.equal(classification.pattern, 'CARD->CARD');
});
test('returns an empty classification list when notes have no links', () => {
  assert.deepEqual(find(data('CARD', ''), actualBoards(), []), {
    hasRepeatedPatterns: false,
    patternCount: 0,
    patterns: [],
    linkClassifications: [],
    excludedLinkClassifications: {},
  });
});
test('groups repeated links while preserving separate source paragraphs and source notes', () => {
  const url = href('B/대상', '대상카드');
  const link = anchor(url, '같은 링크');
  const pages = data('ROW', link);
  pages[0].description += '<p>' + link + link + '</p>';
  pages.push(note('C/원본', sourceBody('CARD', link)), note('A', '<p>' + link + '</p>'));
  const result = find(pages, [...actualBoards(), board('C')], []);
  assert.equal(result.linkClassifications.length, 3);
  assert.deepEqual(
    result.linkClassifications.map((group) => group.count),
    [1, 2, 1]
  );
  const links = linkOccurrences(result);
  assert.equal(links.length, 4);
  assert.equal(new Set(links).size, 4);
  assert.deepEqual(links[1], links[2]);
  for (const group of result.linkClassifications) {
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
  assert.equal(result.patternCount, 0);
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
    result.linkClassifications.map(({ linkText }) => linkText),
    ['첫 링크', '둘째 링크']
  );
  assert.equal(result.patternCount, 0);
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
  assert.equal(result.linkClassifications.length, 1);
  assert.equal(result.linkClassifications[0].count, 2);
  assert.equal(result.linkClassifications[0].targetNoteTitle, 'B/대상');
  assert.deepEqual(
    linkOccurrences(result).map(({ linkText, target }) => [linkText, target.kind, target.title]),
    [
      ['같은 텍스트', 'CARD', '대상카드'],
      ['같은 텍스트', 'ROW', '대상행'],
    ]
  );
  assert.equal(boardPatterns(result).length, 0);
  assert.equal(result.patternCount, 0);
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
    result.linkClassifications.map(({ targetNoteTitle, count }) => ({ targetNoteTitle, count })),
    [
      { targetNoteTitle: 'B', count: 1 },
      { targetNoteTitle: 'B/대상', count: 1 },
    ]
  );
  assert.deepEqual(
    linkOccurrences(result).map((link) => link.target.noteTitle),
    ['B/대상', 'B/대상']
  );
  assert.equal(result.patternCount, 0);
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
  assert.equal(result.linkClassifications.length, 2);
  const [first, second] = result.linkClassifications;
  assert.equal(first.linkText, second.linkText);
  assert.equal(first.sourceNoteTitle, second.sourceNoteTitle);
  assert.equal(first.targetNoteTitle, second.targetNoteTitle);
  assert.equal(first.sourceParagraph.paragraph, second.sourceParagraph.paragraph);
  assert.notEqual(first.sourceParagraph.section, second.sourceParagraph.section);
  assert.notEqual(first.sourceParagraph.path, second.sourceParagraph.path);
  assert.deepEqual(
    result.linkClassifications.map((group) => group.count),
    [1, 1]
  );
  assert.equal(result.patternCount, 0);
  const decisions = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.notEqual(decisions[0].source.id, decisions[1].source.id);
  assert.equal(decisions[0].target.id, decisions[1].target.id);
});
test('groups links in the default body without source paragraph metadata', () => {
  const link = anchor(href('B/대상', '대상카드'), '같은 링크');
  const result = find(data('COLUMN', link + link), actualBoards(), []);
  assert.equal(result.linkClassifications.length, 1);
  const group = result.linkClassifications[0];
  assert.equal(Object.hasOwn(group, 'sourceParagraph'), false);
  assert.equal(group.targetNoteTitle, 'B/대상');
  assert.equal(group.count, 2);
  assert.equal(group.occurrences.length, 2);
  for (const occurrence of group.occurrences) {
    assert.equal(occurrence.classifications.length, 1);
  }
  assert.equal(result.patternCount, 0);
  expectedDecisions(result, 'COLUMN->CARD', 'A', 'B');
});
test('preserves linked titles and groups repeated links to missing target notes', () => {
  const first = anchor(href('없는A', '문단'), '같은 링크');
  const second = anchor(href('없는B', '문단'), '같은 링크');
  const result = find(data('CARD', first + second + first), actualBoards(), []);
  assert.equal(result.patternCount, 0);
  assert.equal(result.linkClassifications.length, 0);
  assert.deepEqual(
    result.excludedLinkClassifications.UNRESOLVED_TARGET.map(({ targetNoteTitle, count }) => ({
      targetNoteTitle,
      count,
    })),
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
  assert.equal(result.linkClassifications.length, 0);
  const groupsByReason = result.excludedLinkClassifications;
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
  assert.equal(result.patternCount, 0);
});
test('excludes root note body references even when their target is the same-titled board', () => {
  const link = anchor(href('A', '카드'), '같은 링크');
  const result = find(
    [note('A', link + link), note('A/열', '<h2>행</h2><h3>카드</h3>')],
    [board('A')],
    []
  );
  const occurrences = expectUnsupported(result, 2);
  assert.equal(result.excludedLinkClassifications.UNSUPPORTED_PATTERN.length, 1);
  assert.equal(result.excludedLinkClassifications.UNSUPPORTED_PATTERN[0].count, 2);
  assert.equal(occurrences[0].source.containerType, 'NOTE');
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
  assert.equal(result.linkClassifications.length, 1);
  assert.deepEqual(Object.keys(result.excludedLinkClassifications), ['UNRESOLVED_TARGET']);
  assert.equal(result.excludedLinkClassifications.UNRESOLVED_TARGET.length, 1);
  const valid = result.linkClassifications[0];
  const excluded = result.excludedLinkClassifications.UNRESOLVED_TARGET[0];
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
  assert.equal(result.patternCount, 0);
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
  assert.equal(result.linkClassifications.length, 3);
  assert.deepEqual(Object.keys(result.excludedLinkClassifications).sort(), [
    'INVALID_LINK',
    'NOT_INTERNAL_NOTE_LINK',
  ]);
  assert.equal(result.linkClassifications[2].linkText, '');
  assert.equal(
    result.excludedLinkClassifications.NOT_INTERNAL_NOTE_LINK[0].occurrences[0].exclusionReason,
    'NOT_INTERNAL_NOTE_LINK'
  );
  assert.equal(
    result.excludedLinkClassifications.INVALID_LINK[0].occurrences[0].exclusionReason,
    'INVALID_LINK'
  );
  assert.equal(result.patternCount, 0);
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
      assert.equal(result.patternCount, 0, url);
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
      assert.equal(result.patternCount, 0);
      assert.equal(result.linkClassifications.length, 0);
      assert.deepEqual(Object.keys(result.excludedLinkClassifications), ['UNSUPPORTED_PATTERN']);
      assert.equal(result.excludedLinkClassifications.UNSUPPORTED_PATTERN.length, 2);
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
          const links = [1, 2]
            .map((i) =>
              anchor(
                noteKind === 'SUBNOTE'
                  ? href(i === 1 ? 'N/첫열' : 'N/둘째열')
                  : href('N', '노트문단' + i)
              )
            )
            .join('');
          const pages = [
            note('A/원본', sourceBody(boardKind, links)),
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
          assert.equal(result.patternCount, 1);
          for (const match of pattern.matches) {
            assert.equal(match.target.containerType, 'BOARD');
            assert.equal(match.target.kind, 'COLUMN');
          }
          assert.equal(result.linkClassifications.length, 2);
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
          const links = [1, 2]
            .map((i) =>
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
            )
            .join('');
          const pages = [
            ...[1, 2].map((i) =>
              note('B/대상' + i, '<h2>대상행' + i + '</h2><h3>대상카드' + i + '</h3>')
            ),
            note('N', '<h2>노트문단</h2>' + (noteKind === 'PARAGRAPH' ? links : '')),
            note('N/첫열', sourceBody('COLUMN', noteKind === 'SUBNOTE' ? links : '')),
            note('N/둘째열', sourceBody('COLUMN', '')),
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
          assert.equal(result.patternCount, 1);
          for (const match of pattern.matches) {
            assert.equal(match.source.containerType, 'BOARD');
            assert.equal(match.source.kind, 'COLUMN');
          }
          assert.equal(result.linkClassifications.length, 2);
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
            ...distinctElements('A', sourceKind, links),
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
          assert.equal(result.patternCount, 1);
          const occurrences = linkOccurrences(result);
          assert.equal(occurrences.length, 2);
          for (const occurrence of occurrences) {
            assert.equal(occurrence.source.containerType, 'BOARD');
            assert.equal(occurrence.target.containerType, 'BOARD');
            assert.equal(occurrence.source.kind, sourceKind);
            assert.equal(occurrence.target.kind, targetKind);
            assert.equal(occurrence.classifications.length, 1);
          }
          assert.deepEqual(result.excludedLinkClassifications, {});
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
    note('A/둘째열', targetBody),
    note(
      'B/첫열',
      '<h2>B행</h2><h3>B카드1</h3><h4>B세부1</h4>' +
        anchor(href('A/첫열', 'A세부1')) +
        '<h3>B카드2</h3><h4>B세부2</h4>' +
        anchor(href('A/첫열', 'A세부2'))
    ),
    note('B/둘째열', targetBody),
    note('B/첫열/첫하위열', targetBody),
    note('B/첫열/둘째하위열', targetBody),
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
  assert.equal(result.patternCount, 2);
  const outgoing = expectedDecisions(result, 'CARD->CARD', 'A', 'B');
  assert.deepEqual(
    outgoing.map((decision) => [decision.source.title, decision.target.title]),
    [
      ['A카드1', 'B카드1'],
      ['A카드2', 'B카드2'],
    ]
  );
  assert.deepEqual(result.excludedLinkClassifications, {});
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
    note('A/둘째열', targetBody),
    note(
      'N',
      '<h2>공통행</h2><h3>N카드1</h3>' +
        anchor(href('A/첫열', 'A카드1')) +
        '<h3>N카드2</h3>' +
        anchor(href('A/첫열', 'A카드2'))
    ),
    note('M', '<h2>공통행</h2><h3>M카드1</h3><h3>M카드2</h3>'),
    note('N/첫열', targetBody),
    note('N/둘째열', targetBody),
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
  assert.equal(result.patternCount, 2);
  assert.deepEqual(result.excludedLinkClassifications, {});
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
  assert.equal(result.patternCount, 0);
  assert.equal(result.linkClassifications.length, 0);
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
          assert.equal(result.hasRepeatedPatterns, false);
          assert.equal(result.patternCount, 0);
          assert.equal(result.linkClassifications.length, 0);
          assert.deepEqual(Object.keys(result.excludedLinkClassifications), ['SAME_BOARD']);
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
    note(
      'B/원본',
      sourceBody('COLUMN', anchor(href('A/첫열', '소개')) + anchor(href('A/둘째열', '소개')))
    ),
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
  assert.deepEqual(result.excludedLinkClassifications, {});
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
      sourceBody('CARD', anchor(href('A/첫열', '첫카드')) + anchor(href('A/둘째열', '둘째카드')))
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
  assert.deepEqual(result.excludedLinkClassifications, {});
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
        const outgoing = [1, 2]
          .map((i) =>
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
          )
          .join('');
        const incoming = [1, 2]
          .map((i) =>
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
          )
          .join('');
        const pages = [
          ...[1, 2].map((i) =>
            note(
              '최상위' + i,
              sourceBody(sourceKind, i === 1 ? outgoing : '') +
                '<h2>구별행' +
                i +
                '</h2><h3>구별카드' +
                i +
                '</h3>'
            )
          ),
          note('B/원본', sourceBody(sourceKind, incoming)),
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
        assert.deepEqual(result.excludedLinkClassifications, {});
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
        assert.equal(result.patternCount, 0);
        assert.deepEqual(result.linkClassifications, []);
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
  assert.deepEqual(result.excludedLinkClassifications, {});
});

test('does not use a board alias to bypass an ambiguous physical root paragraph', () => {
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
  const result = find(pages, boards, candidates);
  assert.deepEqual(result.linkClassifications, []);
  assert.equal(excludedLinkOccurrences(result)[0].exclusionReason, 'UNRESOLVED_TARGET');
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
/* eslint @typescript-eslint/consistent-type-assertions: "off" */
