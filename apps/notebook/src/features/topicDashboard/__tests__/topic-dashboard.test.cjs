const { DOMParser: XmlDomParser, XMLSerializer } = require('@xmldom/xmldom');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '../../..');
const origin = 'https://blacktokki.test';
const previousGlobals = {
  DOMParser: global.DOMParser,
  Node: global.Node,
  location: global.location,
};
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
          node.href = new URL(href, global.location.href).href;
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
const inferCandidates = loadSource(
  readFileSync(path.join(sourceRoot, 'features/topicDashboard/inferBoardCandidates.ts'), 'utf8'),
  {
    '../../components/HeaderSelectBar': paragraphs,
  }
);
const topicDashboardUtils = loadSource(
  readFileSync(
    path.join(sourceRoot, 'features/topicDashboard/utils/extractTopicDashboard.ts'),
    'utf8'
  ),
  {
    '../../../components/HeaderSelectBar': paragraphs,
    '../inferBoardCandidates': inferCandidates,
  }
);

const { extractTopicDashboards } = topicDashboardUtils;
const { inferBoardCandidates, inferTopLevelBoardCandidates } = inferCandidates;

function note(title, description = '') {
  return {
    id: Math.floor(Math.random() * 100000),
    userId: 1,
    order: 0,
    input: title,
    title,
    type: 'NOTE',
    updated: new Date().toISOString(),
    description,
    option: {},
  };
}

function board(title) {
  return {
    id: Math.floor(Math.random() * 100000),
    userId: 1,
    order: 0,
    input: title,
    title,
    type: 'BOARD',
    updated: new Date().toISOString(),
    description: '',
    option: { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 3 },
  };
}

test('extracts topic dashboard from path-based board candidates (board candidate becomes topic dashboard)', () => {
  const pages = [
    note('Project/Todo', '<h3>Task 1</h3><p>First task</p><h3>Task 2</h3><p>Second task</p>'),
    note('Project/Done', '<h3>Task 3</h3><p>Completed task</p>'),
  ];
  const candidates = inferBoardCandidates(pages, []);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, 'Project');

  const dashboards = extractTopicDashboards(pages, []);
  assert.equal(dashboards.length, 1);

  const topicBoard = dashboards[0];
  assert.equal(topicBoard.title, 'Project');
  assert.equal(topicBoard.candidate.title, 'Project');
  assert.equal(topicBoard.isTopLevel, false);
  assert.equal(topicBoard.columnNotes.length, 2);
  assert.equal(topicBoard.cards.length, 3);

  // 카드 내용 확인 (Done이 Todo보다 알파벳순으로 앞섬)
  const cardTitles = topicBoard.cards.map((c) => c.title);
  assert.deepEqual(cardTitles, ['Task 3', 'Task 1', 'Task 2']);

  // 보드 타이틀 및 컬럼명 확인
  assert.equal(topicBoard.cards[0].boardTitle, 'Project');
  assert.equal(topicBoard.cards[0].columnName, 'Done');
  assert.equal(topicBoard.cards[0].description, '<p>Completed task</p>');
  assert.equal(topicBoard.cards[1].columnName, 'Todo');
  assert.equal(topicBoard.cards[1].description, '<p>First task</p>');
});

test('constructs scrum matrix rows when candidate option is SCRUM', () => {
  const pages = [
    note(
      'Project/Todo',
      '<h2>Sprint 1</h2><h3>Task 1</h3><p>Desc 1</p><h2>Sprint 2</h2><h3>Task 2</h3><p>Desc 2</p>'
    ),
    note(
      'Project/Done',
      '<h2>Sprint 1</h2><h3>Task 3</h3><p>Desc 3</p><h2>Sprint 2</h2><h3>Task 4</h3><p>Desc 4</p>'
    ),
  ];
  const dashboards = extractTopicDashboards(pages, []);
  assert.equal(dashboards.length, 1);

  const topicBoard = dashboards[0];
  assert.equal(topicBoard.option.BOARD_TYPE, 'SCRUM');
  assert.equal(topicBoard.rows.length, 3); // 빈 행 + Sprint 1 + Sprint 2

  const sprint1Row = topicBoard.rows.find((r) => r.name === 'Sprint 1');
  assert.ok(sprint1Row);
  const todoCol = sprint1Row.columns.find((c) => c.name === 'Todo');
  assert.ok(todoCol);
  assert.equal(todoCol.items.length, 1);
  assert.equal(todoCol.items[0].title, 'Task 1');
  assert.equal(todoCol.items[0].rowName, 'Sprint 1');
});

test('supports top-level virtual board candidate as topic dashboard', () => {
  const pages = [
    note('Alpha', '<h2>Feature</h2><h3>Login</h3><p>Login flow</p>'),
    note('Beta', '<h2>Feature</h2><h3>Signup</h3><p>Signup flow</p>'),
  ];
  const topCandidates = inferTopLevelBoardCandidates(pages, []);
  assert.equal(topCandidates.length, 1);

  const dashboards = extractTopicDashboards(pages, []);
  assert.equal(dashboards.length, 1);

  const topicBoard = dashboards[0];
  assert.equal(topicBoard.isTopLevel, true);
  assert.equal(topicBoard.title, 'Board(Alpha, Beta)');
  assert.equal(topicBoard.cards.length, 2);
  assert.deepEqual(
    topicBoard.cards.map((c) => c.title),
    ['Login', 'Signup']
  );
  assert.equal(topicBoard.cards[0].columnName, 'Alpha');
  assert.equal(topicBoard.cards[1].columnName, 'Beta');
});

test('returns empty topic dashboards when no candidates exist', () => {
  const pages = [
    note('Standalone1', '<p>No headers</p>'),
    note('Standalone2', '<p>No headers</p>'),
  ];
  const dashboards = extractTopicDashboards(pages, []);
  assert.equal(dashboards.length, 0);
});

test('reuses paragraph analysis across callers and invalidates it when a note changes', () => {
  const page = note('Project/Todo', '<h3>First</h3><p>body</p>');
  const first = inferCandidates.getBoardCandidateParagraphs(page);
  assert.equal(inferCandidates.getBoardCandidateParagraphs(page), first);
  inferBoardCandidates([page, note('Project/Done', '<h3>Done</h3>')], []);
  assert.equal(inferCandidates.getBoardCandidateParagraphs(page), first);
  page.description = '<h3>Changed</h3><p>new body</p>';
  const second = inferCandidates.getBoardCandidateParagraphs(page);
  assert.notEqual(second, first);
  assert.equal(second[1].title, 'Changed');
  assert.equal(first[1].title, 'First');
});

test('excludes candidates that already have actual boards created', () => {
  const pages = [
    note('Project/Todo', '<h3>Task 1</h3><p>First task</p>'),
    note('Project/Done', '<h3>Task 2</h3><p>Second task</p>'),
  ];
  const boards = [board('Project')];
  const dashboards = extractTopicDashboards(pages, boards);
  assert.equal(dashboards.length, 0);
});

// SSR 사이에 훅 상태와 효과를 보존하여 실제 탭·필터·저장 버튼의 동작을 검증한다.
function dashboardHarness(
  pages = [
    note('A/one', '<h2>row1</h2><h3>first card</h3><h2>row2</h2><h3>third card</h3>'),
    note('A/two', '<h2>row1</h2><h3>second card</h3>'),
    note('B/one', '<h2>row1</h2><h3>other first</h3>'),
    note('B/two', '<h2>row1</h2><h3>other second</h3>'),
  ]
) {
  const dashboards = extractTopicDashboards(pages, []);
  const states = new Map();
  const effects = new Map();
  const buttons = [];
  const boardItems = [];
  const navigationCalls = [];
  const mutationCalls = [];
  let pendingEffects = [];
  const react = {
    ...React,
    useState: (initial) => {
      const id = React.useId();
      if (!states.has(id)) states.set(id, initial);
      return [
        states.get(id),
        (update) => states.set(id, typeof update === 'function' ? update(states.get(id)) : update),
      ];
    },
    useEffect: (callback, dependencies) => {
      const id = React.useId();
      const previous = effects.get(id);
      if (!previous || dependencies.some((value, index) => value !== previous[index])) {
        effects.set(id, dependencies);
        pendingEffects.push(callback);
      }
    },
  };
  const TouchableOpacity = (props) => {
    buttons.push(props);
    return React.createElement('button', null, props.children);
  };
  const commonStyles = {
    activeTab: { color: 'black' },
    smallText: { color: 'gray' },
    card: { borderColor: 'gray' },
    container: {},
    title: {},
    text: {},
  };
  const dependencies = {
    react,
    '@blacktokki/core': {
      Text: 'span',
      Spacer: () => null,
      useLangContext: () => ({ lang: (value) => value }),
    },
    '@react-navigation/native': {
      useNavigation: () => ({ push: (...args) => navigationCalls.push(args) }),
    },
    'react-native': {
      View: ({ children }) => React.createElement('div', null, children),
      ScrollView: ({ children }) => React.createElement('div', null, children),
      TouchableOpacity,
      StyleSheet: { create: (value) => value },
      Alert: { alert: () => {} },
    },
    'react-native-vector-icons/FontAwesome': () => null,
    'react-native-vector-icons/MaterialCommunityIcons': () => null,
    '../../components/SearchBar': {
      ResponsiveSearchBar: () => null,
      toNoteParams: (title, paragraph, section) => ({ title, paragraph, section }),
    },
    '../../components/StatusCard': ({ message }) => React.createElement('span', null, message),
    '../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles }) },
    '../../hooks/useUsageMode': { useUsageMode: () => ({ isBoardEnabled: true }) },
    '../../hooks/useBoardStorage': {
      useCreateOrUpdateBoard: () => ({
        isLoading: false,
        mutateAsync: async (input) => mutationCalls.push(input),
      }),
    },
    '../../screens/main/BoardListScreen': {
      BoardListItem: ({ item, onPress }) => {
        boardItems.push(item);
        return React.createElement(TouchableOpacity, { onPress }, `주제 보드: ${item.title}`);
      },
    },
  };
  const load = (file) =>
    readFileSync(path.join(sourceRoot, 'features/topicDashboard', file), 'utf8');
  const { TopicDashboardScreen } = loadSource(load('TopicDashboardScreen.tsx'), {
    ...dependencies,
    './TopicOverviewSection': loadSource(load('TopicOverviewSection.tsx'), dependencies),
    './TopicBoardSummarySection': loadSource(load('TopicBoardSummarySection.tsx'), dependencies),
    './links/TopicLinksSection': {
      TopicLinksTabButton: ({ onPress }) =>
        React.createElement(TouchableOpacity, { onPress }, '연결 규칙'),
      TopicLinksSection: () => React.createElement('span', null, '연결 규칙 목록'),
    },
    './links/useTopicConnections': {
      useTopicConnections: () => ({
        details: [],
        proposalCount: 0,
        isLoading: false,
        isError: false,
      }),
    },
    './TopicBoardSection': {
      TopicBoardSection: ({ topicBoard }) =>
        React.createElement('span', null, `보드 뷰: ${topicBoard.title}`),
    },
    './useTopicDashboard': loadSource(load('useTopicDashboard.ts'), {
      react,
      '../../hooks/useNoteStorage': { useNotePages: () => ({ data: pages }) },
      '../../hooks/useBoardStorage': { useBoardPages: () => ({ data: [] }) },
      './utils/extractTopicDashboard': topicDashboardUtils,
    }),
    '../../hooks/useExtension': { useEffectExtensionScreen: () => {} },
  });
  const render = () => {
    let html;
    do {
      buttons.length = 0;
      boardItems.length = 0;
      pendingEffects = [];
      html = renderToStaticMarkup(React.createElement(TopicDashboardScreen));
      pendingEffects.forEach((effect) => effect());
    } while (pendingEffects.length);
    return html;
  };
  const textOf = (value) =>
    Array.isArray(value)
      ? value.map(textOf).join('')
      : React.isValidElement(value)
      ? textOf(value.props.children)
      : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
  const button = (label) => buttons.find((props) => textOf(props.children) === label);
  return { render, button, boardItems, dashboards, navigationCalls, mutationCalls };
}

test('section tabs retain combined filters and clear them when selecting another board', () => {
  const { render, button, boardItems } = dashboardHarness();
  const overview = render();
  assert.ok(overview.includes('Total Topics'));
  assert.ok(overview.indexOf('Total Topics') < overview.indexOf('Total Columns'));
  assert.ok(overview.indexOf('Total Columns') < overview.indexOf('Total Cards'));
  assert.match(overview, />4<\/span><span[^>]*>Total Columns/);
  assert.ok(!overview.includes('Kanban'));
  assert.ok(!overview.includes('Scrum'));
  assert.equal(button('Board Summary'), undefined);
  assert.equal(boardItems.find((item) => item.title === 'A').stats.cardCount, 3);
  button('주제 보드: A').onPress();
  render();
  button('one(2)').onPress();
  render();
  button('row1(2)').onPress();
  let html = render();
  assert.ok(html.includes('first card'));
  assert.ok(!html.includes('second card'));
  assert.ok(!html.includes('third card'));
  button('Board View').onPress();
  assert.ok(render().includes('보드 뷰: A'));
  button('Board Summary').onPress();
  html = render();
  assert.ok(html.includes('first card'));
  assert.ok(!html.includes('third card'));
  button('Overview').onPress();
  render();
  button('연결 규칙').onPress();
  html = render();
  assert.ok(html.includes('연결 규칙 목록'));
  assert.ok(!html.includes('Total Topics'));
  button('Board Summary').onPress();
  html = render();
  assert.ok(html.includes('first card'));
  assert.ok(!html.includes('third card'));
  button('Overview').onPress();
  render();
  button('주제 보드: B').onPress();
  html = render();
  assert.ok(html.includes('other first'));
  assert.ok(html.includes('other second'));
});

test('summary section retains saved status and exact note/card navigation across tabs', async () => {
  const { render, button, dashboards, navigationCalls, mutationCalls } = dashboardHarness();
  render();
  button('주제 보드: A').onPress();
  render();
  button('one(2)').onLongPress();
  button('onerow1first card').onPress();
  assert.deepEqual(navigationCalls, [
    ['NotePage', { title: 'A/one', paragraph: undefined, section: undefined, board: 'A' }],
    ['NotePage', { title: 'A/one', paragraph: 'first card', section: undefined, board: 'A' }],
  ]);
  await button('Save as Board').onPress();
  assert.deepEqual(mutationCalls, [{ title: 'A', description: '', option: dashboards[0].option }]);
  render();
  assert.equal(button('Saved').disabled, true);
  button('Overview').onPress();
  render();
  button('Board Summary').onPress();
  render();
  assert.equal(button('Saved').disabled, true);
});

test('top-level summary delegates board saving to batch move and empty dashboards keep their message', () => {
  const { render, button, dashboards, navigationCalls, mutationCalls } = dashboardHarness([
    note('Alpha', '<h2>Feature</h2><h3>Login</h3>'),
    note('Beta', '<h2>Feature</h2><h3>Signup</h3>'),
  ]);
  render();
  button('주제 보드: Board(Alpha, Beta)').onPress();
  render();
  button('Save as Board').onPress();
  assert.deepEqual(navigationCalls, [
    [
      'TopicBatchMove',
      {
        title: 'Board(Alpha, Beta)',
        batchTitles: ['Alpha', 'Beta'],
        boardOption: dashboards[0].option,
      },
    ],
  ]);
  assert.deepEqual(mutationCalls, []);
  const empty = dashboardHarness([]);
  assert.ok(empty.render().includes('There are no topic board candidates.'));
  assert.ok(empty.button('Overview'));
  empty.button('연결 규칙').onPress();
  assert.ok(empty.render().includes('연결 규칙 목록'));
});
