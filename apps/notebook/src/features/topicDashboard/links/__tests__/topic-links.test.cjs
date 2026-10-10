const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// 실제 추론 함수와 기존 DOM/노트 fixture를 재사용하며 기존 테스트를 중복 실행하지 않는다.
const fixtureFile = path.resolve(__dirname, 'board-reference-patterns.test.cjs');
const fixture = compileFunction(
  readFileSync(fixtureFile, 'utf8').split("for (const source of ['ROW', 'COLUMN', 'CARD'])")[0] +
    '\nreturn { find, note, board, href, anchor, paragraphs, noteStorage, loadSource, inferBoardCandidates, inferTopLevelBoardCandidates, sourceBody, targetBody };',
  ['require', '__dirname']
)(require, path.dirname(fixtureFile));
const { find, note, board, href, anchor, loadSource } = fixture;
const detailModule = loadSource(
  readFileSync(path.resolve(__dirname, '../topicLinkDetails.ts'), 'utf8'),
  {
    '../../../components/HeaderSelectBar': fixture.paragraphs,
    '../../../hooks/useNoteStorage': fixture.noteStorage,
  }
);
const { buildTopicLinkDetails } = detailModule;
const boards = () => [board('A', 'KANBAN'), board('B', 'KANBAN')];
function details(notes, actualBoards = boards(), candidates = []) {
  const result = find(notes, actualBoards, candidates);
  return buildTopicLinkDetails(result, notes, actualBoards, candidates);
}
const sourceData = () => [
  note(
    'A/source',
    '<h3>a1</h3>' +
      anchor(href('B/target', 'b1')).repeat(2) +
      '<p>b1, b2</p><h3>a2</h3>' +
      anchor(href('B/target', 'b1')) +
      '<h3>a3</h3><p>b2</p><h3>a4</h3><p>unrelated</p>'
  ),
  note('B/target', '<h3>b1</h3><h3>b2</h3>'),
];

test('keeps missing-target proposals and excludes detected sources from the remaining list', () => {
  const [item] = details(sourceData());
  assert.equal(item.pattern.pattern, 'CARD->CARD');
  assert.deepEqual(
    item.links.map(({ count }) => count),
    [2, 1]
  );
  assert.deepEqual(
    item.proposals.map(({ match }) => [match.source.title, match.linkText]),
    [
      ['a1', 'b2'],
      ['a3', 'b2'],
    ]
  );
  assert.deepEqual(
    item.remainingSources.map((source) => source.title),
    ['a4']
  );
  assert.ok(
    item.proposals.every(({ targets }) => targets.every((target) => target.title === 'b2'))
  );
});

test('keeps the actual keyword paragraph and distinguishes header/body proposals', () => {
  const notes = sourceData();
  notes[0].description =
    '<h3>a1</h3>' +
    anchor(href('B/target', 'b1')) +
    '<h3>a2</h3>' +
    anchor(href('B/target', 'b1')) +
    '<h3>a3</h3><h4>b2</h4><p>b2</p><h4>details</h4><p>b2, b2</p>';
  const [item] = details(notes);
  assert.deepEqual(
    item.proposals.map(({ occurrence, count }) => [
      occurrence.sourceParagraph.paragraph,
      occurrence.sourcePart,
      count,
    ]),
    [
      ['b2', 'HEADER', 1],
      ['b2', 'BODY', 1],
      ['details', 'BODY', 2],
    ]
  );
  assert.ok(item.proposals.every(({ match }) => match.source.title === 'a3'));
});

test('only offers unconnected candidates from a partially connected target scope', () => {
  const link = anchor(href('B/first', 'install'));
  const notes = [
    note('A/source', '<h3>a1</h3>' + link + '<p>install</p><h3>a2</h3>' + link + '<p>install</p>'),
    note('B/first', '<h3>install</h3>'),
    note('B/second', '<h3>install</h3>'),
  ];
  const [before] = details(notes);
  assert.deepEqual(
    before.proposals.map(({ targets }) => targets.map((target) => target.noteTitle)),
    [['B/second'], ['B/second']]
  );
  notes[0].description = notes[0].description.replaceAll(
    link,
    link + anchor(href('B/second', 'install'))
  );
  const after = details(notes)[0];
  assert.deepEqual(after.proposals, []);
  assert.deepEqual(after.remainingSources, []);
});

for (const kind of ['ROW', 'COLUMN', 'CARD']) {
  test('includes unobserved ' + kind + ' sources with matching logical IDs', () => {
    const notes = [1, 2, 3].map((i) =>
      note(
        'A/col' + i,
        fixture
          .sourceBody(kind, i === 3 ? '' : anchor(href('B/target', 'b1')))
          .replaceAll('소스행', 'row' + i)
          .replaceAll('소스카드', 'card' + i)
      )
    );
    notes.push(note('B/target', '<h2>targetRow</h2><h3>b1</h3>'));
    const [item] = details(notes, [board('A'), board('B')]);
    assert.equal(item.remainingSources.length, 1);
    assert.ok(item.remainingSources.every((source) => source.kind === kind));
    const actualIds = new Set(item.links.map(({ match }) => match.source.id));
    assert.equal(item.remainingSources.filter((source) => actualIds.has(source.id)).length, 0);
    assert.ok(item.remainingSources.some((source) => source.noteTitle === 'A/col3'));
  });
}

test('excludes shared logical rows with detected links and keeps unobserved rows', () => {
  const notes = [
    note(
      'A/first',
      '<h2>shared</h2>' +
        anchor(href('B/target', 'b1')) +
        '<h3>c1</h3><h2>second</h2>' +
        anchor(href('B/target', 'b1')) +
        '<h3>c2</h3>'
    ),
    note('A/second', '<h2>shared</h2><h3>c3</h3><h2>unobserved</h2><h3>c4</h3>'),
    note('B/target', '<h2>targetRow</h2><h3>b1</h3>'),
  ];
  const [item] = details(notes, [board('A'), board('B')]);
  assert.deepEqual(
    item.remainingSources.map((source) => source.title),
    ['unobserved']
  );
  assert.equal(item.remainingSources[0].noteTitle, 'A/second');
});

test('retains hidden candidate cards and omits hidden actual-board cards', () => {
  const notes = [
    note(
      'A/first',
      '<h2>row</h2><h3>a1</h3>' + anchor(href('B/target', 'b1')) + '<h1>intro</h1><h3>hidden</h3>'
    ),
    note('A/second', '<h2>row</h2><h3>a2</h3>' + anchor(href('B/target', 'b1'))),
    note('B/target', '<h2>targetRow</h2><h3>b1</h3>'),
  ];
  const candidate = { title: 'A', option: board('A').option };
  const before = details(notes, [board('B')], [candidate]);
  const after = details(notes, [board('A'), board('B')]);
  assert.ok(before[0].remainingSources.some((source) => source.title === 'hidden'));
  assert.equal(
    after[0].remainingSources.some((source) => source.title === 'hidden'),
    false
  );
});

test('includes unobserved explicitly selected top-level columns', () => {
  const notes = [
    note('X', '<h3>x</h3>' + anchor(href('B/target', 'b1'))),
    note('Y', '<h3>y</h3>' + anchor(href('B/target', 'b1'))),
    note('Z', '<h3>z</h3>'),
    note('Outside', '<h3>outside</h3>'),
    note('B/target', '<h3>b1</h3>'),
  ];
  const [item] = details(
    notes,
    [board('B', 'KANBAN')],
    [
      {
        title: 'Board(X, Y, Z)',
        option: board('virtual', 'KANBAN').option,
        columnNoteTitles: ['X', 'Y', 'Z'],
      },
    ]
  );
  assert.deepEqual(
    item.remainingSources.map((source) => source.title),
    ['z']
  );
});

let notesForRender = sourceData();
let queryState = {};
const navigationCalls = [];
const buttons = [];
const native = {
  StyleSheet: { create: (styles) => styles },
  View: 'div',
  ScrollView: ({ children }) => React.createElement('div', null, children),
  ActivityIndicator: () => React.createElement('span', null, 'loading'),
  TextInput: () => React.createElement('input'),
  TouchableOpacity: (props) => {
    buttons.push(props);
    return React.createElement('button', null, props.children);
  },
  FlatList: ({ data, renderItem, ListEmptyComponent, ListHeaderComponent, keyExtractor }) =>
    React.createElement(
      'div',
      null,
      ListHeaderComponent,
      data.length
        ? data.map((item, index) =>
            React.createElement(
              React.Fragment,
              { key: keyExtractor(item) },
              renderItem({ item, index })
            )
          )
        : ListEmptyComponent
    ),
};
const commonStyles = {
  activeTab: { color: 'black' },
  smallText: { color: 'gray' },
  card: { borderColor: 'gray', backgroundColor: 'white' },
  container: { backgroundColor: 'white' },
  navButton: { backgroundColor: 'silver' },
  text: { color: 'black' },
};
const { useTopicConnections } = loadSource(
  readFileSync(path.resolve(__dirname, '../useTopicConnections.ts'), 'utf8'),
  {
    './topicLinkDetails': detailModule,
    '../../../hooks/useBoardStorage': { useBoardPages: () => ({ data: boards(), ...queryState }) },
    '../../../hooks/useNoteStorage': {
      useNotePages: () => ({ data: notesForRender, ...queryState }),
    },
    './findBoardReferencePatterns': { findBoardReferencePatterns: find },
    '../inferBoardCandidates': fixture,
  }
);
const sectionDependencies = {
  '@blacktokki/core': { Text: 'span' },
  '@react-navigation/native': {
    useNavigation: () => ({ push: (...args) => navigationCalls.push(args) }),
  },
  'react-native': native,
  'react-native-vector-icons/FontAwesome': () => null,
  './topicLinkDetails': detailModule,
  '../../../components/SearchBar': {
    toNoteParams: (title, paragraph, section) => ({ title, paragraph, section }),
  },
  '../../../components/StatusCard': ({ message }) => React.createElement('span', null, message),
  '../../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles }) },
};
const sectionSource = readFileSync(path.resolve(__dirname, '../TopicLinksSection.tsx'), 'utf8');
const diagramSource = readFileSync(
  path.resolve(__dirname, '../TopicConnectionDiagram.tsx'),
  'utf8'
);
const diagramDependencies = {
  ...sectionDependencies,
  'react-native-svg': {
    __esModule: true,
    default: ({ children, width, height, accessibilityLabel }) =>
      React.createElement('svg', { width, height, 'aria-label': accessibilityLabel }, children),
    Path: 'path',
    Polygon: 'polygon',
    Circle: 'circle',
    G: 'g',
  },
};
const diagramModule = loadSource(diagramSource, diagramDependencies);
sectionDependencies['./TopicConnectionDiagram'] = diagramModule;
const sectionModule = loadSource(sectionSource, sectionDependencies);
function ConnectionSection() {
  return React.createElement(sectionModule.TopicLinksSection, {
    connections: useTopicConnections(),
  });
}

test('rule subtitles weight proposal cards by half and mark only fully detected links', () => {
  const checks = [];
  const { TopicLinksSection } = loadSource(sectionSource, {
    ...sectionDependencies,
    'react-native-vector-icons/FontAwesome': (props) => {
      if (props.name === 'check-circle') checks.push(props);
      return null;
    },
  });
  const render = (item) => {
    checks.length = 0;
    return renderToStaticMarkup(
      React.createElement(TopicLinksSection, { connections: { details: [item] } })
    );
  };
  const [item] = details(sourceData());
  // 반복된 실제 링크의 발생 횟수 대신 화면의 세 목록에 표시하는 건수를 사용한다.
  assert.ok(render(item).includes('보드의 카드 → 보드의 카드 (60%)'));
  assert.equal(checks.length, 0);
  const connectedNotes = sourceData();
  connectedNotes[0].description = connectedNotes[0].description
    .replace('<p>b1, b2</p>', '')
    .replace('<p>b2</p>', anchor(href('B/target', 'b2')))
    .replace('<p>unrelated</p>', anchor(href('B/target', 'b1')));
  const [complete] = details(connectedNotes);
  assert.equal(complete.proposals.length, 0);
  assert.equal(complete.remainingSources.length, 0);
  assert.ok(render(complete).includes('보드의 카드 → 보드의 카드 (100%)'));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].color, '#27AE60');
  assert.equal(checks[0].accessibilityLabel, '연결 비율 100%');
  assert.ok(
    render({ ...item, proposals: item.proposals.slice(0, 1), remainingSources: [] }).includes(
      '(83.3%)'
    )
  );
  assert.equal(checks.length, 0);
  assert.ok(
    render({
      ...item,
      links: Array(1001).fill(item.links[0]),
      proposals: item.proposals.slice(0, 1),
      remainingSources: [],
    }).includes('(99.9%)')
  );
  assert.equal(checks.length, 0);
  assert.ok(render({ ...item, links: [], proposals: [], remainingSources: [] }).includes('(0%)'));
  assert.equal(checks.length, 0);
});

test('tab badge totals proposal cards across rules and hides unavailable or empty counts', () => {
  const [item] = details(sourceData());
  const items = [item, { ...item, proposals: item.proposals.slice(0, 1) }];
  const renderTab = (connections) =>
    renderToStaticMarkup(
      React.createElement(sectionModule.TopicLinksTabButton, {
        active: false,
        onPress: () => {},
        connections: {
          ...connections,
          proposalCount: connections.details.reduce(
            (total, item) => total + item.proposals.length,
            0
          ),
        },
      })
    );
  assert.match(renderTab({ details: items }), /추천 링크 편집 제안 3개[^>]*>3<\/span>/);
  for (const connections of [
    { details: [] },
    { details: [{ ...item, proposals: [] }] },
    { details: items, isLoading: true },
    { details: items, isError: true },
  ])
    assert.ok(!renderTab(connections).includes('추천 링크 편집 제안'));
});

test('dashboard entry badge shares the proposal total and preserves navigation', () => {
  let itemProps;
  let connections;
  const { TopicDashboardButton } = loadSource(
    readFileSync(path.resolve(__dirname, '../../TopicDashboardButton.tsx'), 'utf8'),
    {
      '@blacktokki/core': { useLangContext: () => ({ lang: (value) => value }) },
      '@blacktokki/navigation': { navigate: (...args) => navigationCalls.push(args) },
      'react-native-paper': {
        List: {
          Item: (props) => {
            itemProps = props;
            return props.right();
          },
        },
      },
      './links/useTopicConnections': {
        useTopicConnections: () => {
          connections = useTopicConnections();
          return connections;
        },
      },
      '../../screens/main/home/ContentGroupSection': {
        RenderIcon: () => () => null,
        CountBadge: ({ count }) => (count > 0 ? React.createElement('span', null, count) : null),
      },
    }
  );
  notesForRender = sourceData();
  const link = anchor(href('B/target', 'b1'));
  notesForRender.push(note('N', '<h2>p1</h2>' + link + '<h2>p2</h2>' + link + '<p>b2</p>'));
  queryState = {};
  navigationCalls.length = 0;
  const renderButton = () => renderToStaticMarkup(React.createElement(TopicDashboardButton));
  const html = renderButton();
  const total = connections.details.reduce((count, item) => count + item.proposals.length, 0);
  assert.ok(connections.details.length > 1);
  assert.ok(total > 2);
  assert.equal(connections.proposalCount, total);
  assert.equal(html, `<span>${total}</span>`);
  itemProps.onPress();
  assert.deepEqual(navigationCalls, [['TopicDashboard']]);
  for (const state of [{ isLoading: true }, { isError: true }]) {
    queryState = state;
    assert.equal(renderButton(), '');
  }
  queryState = {};
  notesForRender = [];
  assert.equal(renderButton(), '');
});

test('keeps viewing actions for all cards and editing for proposals and remaining sources', () => {
  notesForRender = sourceData();
  notesForRender[0].description = notesForRender[0].description.replace(
    '<p>b2</p>',
    '<h4>keyword details</h4><p>b2</p>'
  );
  buttons.length = 0;
  navigationCalls.length = 0;
  queryState = {};
  interactionStates.clear();
  const items = details(notesForRender);
  let html = renderInteractive(items);
  for (const title of ['감지된 링크', '추천 링크 편집 제안', '추천 링크 없음']) {
    findSection(title).onPress();
    html = renderInteractive(items);
  }
  for (const text of ['감지된 링크', '추천 링크 편집 제안', '추천 링크 없음', 'a4'])
    assert.ok(html.includes(text));
  const editors = buttons.filter((props) => props.accessibilityLabel?.startsWith('원문 편집:'));
  const viewers = buttons.filter((props) => props.accessibilityLabel?.startsWith('원문 보기:'));
  assert.equal(editors.length, 3);
  assert.equal(viewers.length, 5);
  assert.ok(!html.includes('출발 위치'));
  assert.ok(!html.includes('<input'));
  for (const label of ['출발', '링크', '대상']) assert.ok(!html.includes(`>${label}</span>`));
  assert.ok(html.includes(`${items[0].links[0].match.linkText} →`));
  const firstSource = viewers.find(
    (props) => props.accessibilityLabel === '원문 보기: A/source > a1'
  );
  assert.equal(firstSource.children[0].props.kind, 'CARD');
  assert.equal(firstSource.children[1].props.children, 'A/source > a1');
  assert.ok(!html.includes('(카드)'));
  assert.ok(!html.includes('(열)'));
  assert.ok(!html.includes('연결 대상을 확정'));
  assert.ok(buttons.some((props) => props.accessibilityLabel === '연결 규칙 필터: A'));
  assert.ok(buttons.some((props) => props.accessibilityLabel === '연결 규칙 필터: B'));
  assert.ok(!buttons.some((props) => props.accessibilityLabel === '보드 필터 초기화'));
  assert.ok(!buttons.some((props) => props.accessibilityLabel?.startsWith('노트 필터:')));
  assert.equal(
    buttons.filter((props) => props.accessibilityLabel === '노트↔보드 규칙만 표시').length,
    0
  );
  assert.equal(
    buttons.filter((props) => props.accessibilityLabel?.startsWith('연결 상세:')).length,
    0
  );
  editors
    .find((props) => props.accessibilityLabel === '원문 편집: A/source > keyword details')
    .onPress();
  assert.equal(navigationCalls[0][0], 'EditPage');
  assert.equal(navigationCalls[0][1].paragraph, 'keyword details');
  viewers.find((props) => props.accessibilityLabel === '원문 보기: A/source > a4').onPress();
  assert.equal(navigationCalls[1][0], 'NotePage');
  assert.equal(navigationCalls[1][1].paragraph, 'a4');
  buttons.find((props) => props.accessibilityLabel === '대상 보기: 카드 B/target > b1').onPress();
  assert.equal(navigationCalls[2][0], 'NotePage');
  assert.equal(navigationCalls[2][1].title, 'B/target');
  assert.equal(navigationCalls[2][1].paragraph, 'b1');
});

test('renders loading, error and empty states', () => {
  queryState = { isLoading: true };
  assert.ok(renderToStaticMarkup(React.createElement(ConnectionSection)).includes('loading'));
  queryState = { isError: true };
  assert.ok(
    renderToStaticMarkup(React.createElement(ConnectionSection)).includes(
      '연결 규칙을 불러오지 못했습니다.'
    )
  );
  queryState = {};
  notesForRender = [];
  assert.ok(
    renderToStaticMarkup(React.createElement(ConnectionSection)).includes(
      '반복된 연결 규칙이 아직 없습니다.'
    )
  );
});

test('container filters select source or target boards, combine by union', () => {
  const [item] = details(sourceData());
  const other = {
    ...item,
    pattern: {
      ...item.pattern,
      sourceBoard: { ...item.pattern.sourceBoard, title: 'C' },
      targetBoard: { ...item.pattern.targetBoard, title: 'D' },
    },
  };
  const all = [item, other];
  const filter = detailModule.filterTopicConnections;
  assert.deepEqual(filter(all, []), all);
  assert.deepEqual(filter(all, [{ title: 'A' }]), [item]);
  assert.deepEqual(filter(all, [{ title: 'B' }]), [item]);
  assert.deepEqual(filter(all, [{ title: 'A' }, { title: 'D' }]), all);
  assert.deepEqual(filter(all, [{ title: 'C' }]), [other]);
  assert.deepEqual(filter(all, [{ title: 'missing' }]), []);
});

const dashboardSectionDependencies = {
  '@blacktokki/core': {
    Text: 'span',
    Spacer: () => null,
    useLangContext: () => ({ lang: (value) => value }),
  },
  '@react-navigation/native': { useNavigation: () => ({ push: () => {} }) },
  'react-native': native,
  'react-native-vector-icons/FontAwesome': () => null,
  'react-native-vector-icons/MaterialCommunityIcons': () => null,
  '../../components/SearchBar': {
    ResponsiveSearchBar: () => null,
    toNoteParams: (title, paragraph, section) => ({ title, paragraph, section }),
  },
  '../../components/StatusCard': ({ message }) => React.createElement('span', null, message),
  '../../hooks/useBoardStorage': { useCreateOrUpdateBoard: () => ({}) },
  '../../hooks/useNotebookTheme': { useNotebookTheme: () => ({ commonStyles }) },
  '../../hooks/useUsageMode': { useUsageMode: () => ({ isBoardEnabled: false }) },
  '../../screens/main/BoardListScreen': { BoardListItem: () => null },
};
const overviewModule = loadSource(
  readFileSync(path.resolve(__dirname, '../../TopicOverviewSection.tsx'), 'utf8'),
  dashboardSectionDependencies
);
const summarySource = readFileSync(
  path.resolve(__dirname, '../../TopicBoardSummarySection.tsx'),
  'utf8'
);
const summaryModule = loadSource(summarySource, dashboardSectionDependencies);
const dashboardSource = readFileSync(
  path.resolve(__dirname, '../../TopicDashboardScreen.tsx'),
  'utf8'
);
const { TopicDashboardScreen } = loadSource(dashboardSource, {
  ...dashboardSectionDependencies,
  './TopicBoardSection': { TopicBoardSection: () => null },
  './TopicOverviewSection': overviewModule,
  './TopicBoardSummarySection': summaryModule,
  './links/TopicLinksSection': sectionModule,
  './links/useTopicConnections': { useTopicConnections },
  './useTopicDashboard': {
    useTopicDashboard: () => ({
      topicDashboards: [],
      currentBoard: { title: 'A', cards: [] },
      selectBoard: () => {},
      metrics: { totalTopics: 0, totalColumns: 0, totalCards: 0, topLevelCount: 0 },
      totalBoardCount: dashboardBoardCount,
    }),
  },
  '../../hooks/useExtension': { useEffectExtensionScreen: () => {} },
});
let dashboardBoardCount = 1;

test('overview restores the rule count, excludes the diagram and keeps tab order', () => {
  notesForRender = sourceData();
  queryState = {};
  dashboardBoardCount = 1;
  buttons.length = 0;
  const html = renderToStaticMarkup(React.createElement(TopicDashboardScreen));
  assert.ok(html.indexOf('Overview') < html.indexOf('연결 규칙'));
  assert.ok(html.indexOf('연결 규칙') < html.indexOf('Board Summary'));
  assert.ok(html.indexOf('Total Topics') < html.indexOf('Total Columns'));
  assert.ok(html.indexOf('Total Columns') < html.indexOf('Total Cards'));
  assert.ok(html.indexOf('Total Cards') < html.lastIndexOf('연결 규칙'));
  assert.ok(!html.includes('Kanban'));
  assert.ok(!html.includes('Scrum'));
  assert.ok(html.includes('추천 링크 편집 제안 2개'));
  assert.ok(!html.includes('연결 규칙 관계'));
  assert.ok(!html.includes('<svg'));
  const metric = buttons.find((props) => props.accessibilityLabel === '연결 규칙 보기');
  assert.equal(metric.children[1].props.children, details(sourceData()).length);
  dashboardBoardCount = 0;
  buttons.length = 0;
  const emptyDashboard = renderToStaticMarkup(React.createElement(TopicDashboardScreen));
  assert.ok(emptyDashboard.includes('There are no topic board candidates.'));
  assert.equal(
    buttons.find((props) => props.accessibilityLabel === '연결 규칙 보기').children[1].props
      .children,
    1
  );
});

const diagramRule = (
  sourceTitle,
  sourceKind,
  targetTitle,
  targetKind,
  origin = 'BOARD',
  targetOrigin = 'BOARD'
) => {
  const [item] = details(sourceData());
  return {
    ...item,
    pattern: {
      ...item.pattern,
      sourceBoard: { title: sourceTitle, origin },
      targetBoard: { title: targetTitle, origin: targetOrigin },
      pattern: sourceKind + '->' + targetKind,
      matches: item.pattern.matches.map((match) => ({
        ...match,
        source: { ...match.source, kind: sourceKind },
        target: { ...match.target, kind: targetKind },
      })),
    },
  };
};

test('diagram groups all kinds and roles of the same board or note into one card', () => {
  const graph = diagramModule.buildTopicConnectionDiagram([
    diagramRule('A', 'CARD', 'B', 'CARD'),
    diagramRule('B', 'CARD', 'C', 'COLUMN'),
    diagramRule('B', 'COLUMN', 'C', 'COLUMN'),
    diagramRule('B', 'PARAGRAPH', 'C', 'COLUMN', 'NOTE'),
    diagramRule('B', 'CARD', 'C', 'COLUMN', 'CANDIDATE'),
    diagramRule('B', 'CARD', 'C', 'COLUMN'),
  ]);
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 4);
  const first = graph.edges.find((edge) => edge.source.title === 'A');
  const next = graph.edges.find((edge) => edge.source.title === 'B' && edge.source.kind === 'CARD');
  assert.equal(first.target, next.source);
  assert.ok(first.source.x < first.target.x);
  assert.ok(next.source.x < next.target.x);
  const merged = graph.nodes.find((node) => node.title === 'B');
  assert.deepEqual(merged.origins, ['BOARD', 'CANDIDATE', 'NOTE']);
  assert.deepEqual(
    merged.children.map((child) => child.kind),
    ['COLUMN', 'CARD', 'PARAGRAPH']
  );
  assert.deepEqual(
    merged.children.map((child) => child.ruleCount),
    [1, 3, 1]
  );
  assert.equal(merged.ruleCount, 5);
  for (const kind of ['컬럼', '카드', '하위 문단'])
    assert.ok(
      graph.edges
        .filter((edge) => edge.source.title === 'B')
        .some((edge) => edge.label.includes(kind))
    );
});

test('diagram combines counts for merged rules and excludes duplicate rule records from the ratio', () => {
  const item = diagramRule('A', 'CARD', 'B', 'CARD');
  const complete = {
    ...diagramRule('A', 'CARD', 'B', 'CARD', 'CANDIDATE'),
    proposals: [],
    remainingSources: [],
  };
  const items = [item, complete, item];
  const graph = diagramModule.buildTopicConnectionDiagram(items);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].source.ruleCount, 2);
  assert.equal(graph.edges[0].ratio, 5 / 7);
  assert.deepEqual(diagramModule.buildTopicConnectionDiagram([...items].reverse()), graph);
});

test('diagram accents lines and arrows by their ratio and dims filtered connections independently', () => {
  const complete = {
    ...diagramRule('A', 'CARD', 'B', 'CARD'),
    proposals: [],
    remainingSources: [],
  };
  const middle = diagramRule('C', 'CARD', 'D', 'CARD');
  const low = {
    ...diagramRule('E', 'CARD', 'F', 'CARD'),
    remainingSources: Array(6).fill(middle.remainingSources[0]),
  };
  const render = (selections) =>
    renderToStaticMarkup(
      React.createElement(diagramModule.TopicConnectionDiagram, {
        connections: { details: [complete, middle, low] },
        selections,
        onToggle: () => {},
      })
    );
  for (const selections of [[], [{ title: 'A' }]]) {
    const groups = [...render(selections).matchAll(/<g opacity="([^"]+)">(.*?)<\/g>/g)];
    assert.equal(groups.length, 3);
    assert.deepEqual(
      groups.map((group) => Number(group[1])),
      selections.length ? [1, 0.25, 0.25] : [1, 1, 1]
    );
    for (const shape of ['path', 'polygon']) {
      const colorAttribute = shape === 'path' ? 'stroke' : 'fill';
      const accent = new RegExp(`<${shape}[^>]*${colorAttribute}="#27AE60"[^>]*opacity="([^"]+)"`);
      assert.deepEqual(
        groups.map((group) => Number(group[2].match(accent)[1])),
        [1, 0.6, 0.3]
      );
    }
  }
});

test('diagram centers the complete graph in wider viewports and centers short graphs vertically', () => {
  const graph = diagramModule.buildTopicConnectionDiagram(
    [diagramRule('A', 'CARD', 'B', 'CARD')],
    1200
  );
  const left = Math.min(...graph.nodes.map((node) => node.x));
  const right = Math.max(...graph.nodes.map((node) => node.x + node.width));
  const top = Math.min(...graph.nodes.map((node) => node.y));
  const bottom = Math.max(...graph.nodes.map((node) => node.y + node.height));
  assert.equal(graph.width, 1200);
  assert.equal((left + right) / 2, graph.width / 2);
  assert.equal((top + bottom) / 2, graph.height / 2);
});

test('diagram preserves a same-title relationship between different note and board roles', () => {
  const graph = diagramModule.buildTopicConnectionDiagram([
    diagramRule('A', 'PARAGRAPH', 'A', 'CARD', 'NOTE'),
  ]);
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(graph.nodes[0].origins, ['BOARD', 'NOTE']);
  assert.equal(graph.nodes[0].ruleCount, 1);
  assert.equal(graph.edges[0].source.title, graph.edges[0].target.title);
  assert.equal(graph.edges[0].source.kind, 'PARAGRAPH');
  assert.equal(graph.edges[0].target.kind, 'CARD');
  assert.ok(!graph.edges[0].path.includes('NaN'));
});

test('diagram connects distinct type nodes within the same pair of board cards', () => {
  const graph = diagramModule.buildTopicConnectionDiagram([
    diagramRule('A', 'CARD', 'B', 'CARD'),
    diagramRule('A', 'CARD', 'B', 'COLUMN'),
    diagramRule('A', 'COLUMN', 'B', 'CARD'),
  ]);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 3);
  const cardToCard = graph.edges.find(
    (edge) => edge.source.kind === 'CARD' && edge.target.kind === 'CARD'
  );
  const cardToColumn = graph.edges.find(
    (edge) => edge.source.kind === 'CARD' && edge.target.kind === 'COLUMN'
  );
  assert.equal(cardToCard.source, cardToColumn.source);
  assert.notEqual(cardToCard.target, cardToColumn.target);
  assert.notEqual(cardToCard.arrow, cardToColumn.arrow);
  for (const node of graph.nodes) {
    assert.equal(node.children.length, 2);
    for (const child of node.children) {
      assert.ok(child.x > node.x && child.x + child.width < node.x + node.width);
      assert.ok(child.y > node.y && child.y + child.height < node.y + node.height);
    }
    assert.ok(node.children[0].y + node.children[0].height < node.children[1].y);
  }
});

test('diagram fits every type within its parent and stacks cards with different heights without overlap', () => {
  const graph = diagramModule.buildTopicConnectionDiagram([
    ...['ROW', 'COLUMN', 'CARD', 'SUBNOTE', 'PARAGRAPH'].map((kind) =>
      diagramRule(
        'A',
        kind,
        'B',
        'CARD',
        ['SUBNOTE', 'PARAGRAPH'].includes(kind) ? 'NOTE' : 'BOARD'
      )
    ),
    diagramRule('C', 'COLUMN', 'D', 'CARD'),
  ]);
  const parent = graph.nodes.find((node) => node.title === 'A');
  assert.equal(parent.children.length, 5);
  assert.equal(parent.ruleCount, 5);
  assert.ok(parent.height > graph.nodes.find((node) => node.title === 'C').height);
  for (const node of graph.nodes) {
    for (const child of node.children) {
      assert.ok(child.x > node.x && child.x + child.width < node.x + node.width);
      assert.ok(child.y > node.y && child.y + child.height < node.y + node.height);
    }
    for (const other of graph.nodes.filter((candidate) => candidate !== node))
      assert.ok(
        node.x + node.width <= other.x ||
          other.x + other.width <= node.x ||
          node.y + node.height <= other.y ||
          other.y + other.height <= node.y
      );
  }
});

test('diagram preserves cycles, reverse and skip connections with stable nonoverlapping nodes', () => {
  const items = [
    diagramRule('A', 'CARD', 'B', 'CARD'),
    diagramRule('B', 'CARD', 'C', 'CARD'),
    diagramRule('C', 'CARD', 'A', 'CARD'),
    diagramRule('A', 'CARD', 'C', 'CARD'),
    diagramRule('D', 'COLUMN', 'E', 'ROW'),
  ];
  const before = JSON.stringify(items);
  const graph = diagramModule.buildTopicConnectionDiagram(items);
  assert.deepEqual(diagramModule.buildTopicConnectionDiagram([...items].reverse()), graph);
  assert.equal(JSON.stringify(items), before);
  assert.equal(graph.edges.length, items.length);
  assert.ok(graph.edges.some((edge) => edge.source.x > edge.target.x));
  for (const node of graph.nodes) {
    assert.ok(node.x >= 0 && node.x + node.width <= graph.width);
    assert.ok(node.y >= 0 && node.y + node.height <= graph.height);
    for (const other of graph.nodes.filter((candidate) => candidate !== node))
      assert.ok(
        node.x + node.width <= other.x ||
          other.x + other.width <= node.x ||
          node.y + node.height <= other.y ||
          other.y + other.height <= node.y
      );
  }
  for (const edge of graph.edges) {
    assert.ok(!edge.path.includes('NaN'));
    assert.ok(edge.label.includes(' → '));
    assert.ok(
      edge.arrow.startsWith(`${edge.target.x - 4},${edge.target.y + edge.target.height / 2}`)
    );
  }
});

test('diagram omits potential-only relationships rather than displaying them as detected rules', () => {
  const item = diagramRule('A', 'CARD', 'B', 'CARD');
  item.pattern.matches = item.pattern.matches.filter(
    (match) => match.referenceType === 'POTENTIAL'
  );
  const graph = diagramModule.buildTopicConnectionDiagram([item]);
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
});

test('diagram labels topic boards and notes with rule counts and selects whole cards', () => {
  let selection;
  buttons.length = 0;
  const html = renderToStaticMarkup(
    React.createElement(diagramModule.TopicConnectionDiagram, {
      connections: {
        details: [
          diagramRule('주제', 'COLUMN', '대상', 'ROW', 'CANDIDATE'),
          diagramRule('메모', 'PARAGRAPH', '대상', 'CARD', 'NOTE'),
        ],
      },
      selections: [{ title: '주제' }],
      onToggle: (title) => (selection = title),
    })
  );
  for (const label of [
    '주제 보드 (1)',
    '노트 (1)',
    '보드 (2)',
    '컬럼',
    '분류',
    '카드',
    '하위 문단',
  ])
    assert.ok(html.includes(label));
  assert.equal((html.match(/stroke="#27AE60"/g) ?? []).length, 2);
  assert.equal(
    buttons.filter((props) => props.accessibilityLabel?.startsWith('연결 규칙 필터:')).length,
    3
  );
  assert.equal(
    buttons.filter((props) => props.accessibilityLabel?.startsWith('연결 규칙 유형 필터:')).length,
    4
  );
  assert.equal(
    buttons.find((props) => props.accessibilityLabel === '연결 규칙 필터: 주제').accessibilityState
      .selected,
    true
  );
  buttons.find((props) => props.accessibilityLabel === '연결 규칙 필터: 메모').onPress();
  assert.deepEqual(selection, { title: '메모' });
  assert.ok(html.includes('opacity="0.25"'));
});

test('diagram hides stale or empty data and leaves loading and empty messages to the rule section', () => {
  for (const state of [{ isLoading: true }, { isError: true }, { details: [] }]) {
    const html = renderToStaticMarkup(
      React.createElement(diagramModule.TopicConnectionDiagram, {
        connections: { details: details(sourceData()), ...state },
        selections: [],
        onToggle: () => {},
      })
    );
    assert.equal(html, '');
  }
});

test('container filters include source and target notes as well as boards', () => {
  const [item] = details(sourceData());
  const noteBoard = {
    ...item,
    pattern: { ...item.pattern, sourceBoard: { title: 'N', origin: 'NOTE' } },
  };
  const boardNote = {
    ...item,
    pattern: { ...item.pattern, targetBoard: { title: 'N', origin: 'NOTE' } },
  };
  const all = [item, noteBoard, boardNote];
  const filter = detailModule.filterTopicConnections;
  assert.deepEqual(filter(all, []), all);
  assert.deepEqual(filter(all, [{ title: 'N' }]), [noteBoard, boardNote]);
  assert.deepEqual(filter(all, [{ title: 'N' }, { title: 'A' }]), all);
  assert.deepEqual(filter(all, [{ title: 'B' }]), [item, noteBoard]);
  assert.deepEqual(filter(all, [{ title: 'missing' }]), []);
});

test('type filters match only the selected container kind in either direction', () => {
  const items = [
    diagramRule('A', 'CARD', 'B', 'CARD'),
    diagramRule('A', 'COLUMN', 'B', 'CARD'),
    diagramRule('A', 'CARD', 'B', 'COLUMN'),
    diagramRule('N', 'PARAGRAPH', 'B', 'CARD', 'NOTE'),
  ];
  const filter = detailModule.filterTopicConnections;
  assert.deepEqual(filter(items, [{ title: 'A', kind: 'CARD' }]), [items[0], items[2]]);
  assert.deepEqual(filter(items, [{ title: 'B', kind: 'COLUMN' }]), [items[2]]);
  assert.deepEqual(filter(items, [{ title: 'N', kind: 'PARAGRAPH' }]), [items[3]]);
  assert.deepEqual(filter(items, [{ title: 'N', kind: 'CARD' }]), []);
  assert.deepEqual(filter(items, [{ title: 'A', kind: 'COLUMN' }, { title: 'N' }]), [
    items[1],
    items[3],
  ]);
});

test('selection toggles narrow parent selections, combine types and restore whole containers', () => {
  const toggle = detailModule.toggleTopicConnectionSelection;
  const original = [{ title: 'A' }, { title: 'B', kind: 'COLUMN' }];
  const narrowed = toggle(original, { title: 'A', kind: 'CARD' });
  assert.deepEqual(original, [{ title: 'A' }, { title: 'B', kind: 'COLUMN' }]);
  assert.deepEqual(narrowed, [
    { title: 'B', kind: 'COLUMN' },
    { title: 'A', kind: 'CARD' },
  ]);
  const combined = toggle(narrowed, { title: 'A', kind: 'COLUMN' });
  assert.deepEqual(toggle(combined, { title: 'A', kind: 'CARD' }), [
    { title: 'B', kind: 'COLUMN' },
    { title: 'A', kind: 'COLUMN' },
  ]);
  const whole = toggle(combined, { title: 'A' });
  assert.deepEqual(whole, [{ title: 'B', kind: 'COLUMN' }, { title: 'A' }]);
  assert.deepEqual(toggle(whole, { title: 'A' }), [{ title: 'B', kind: 'COLUMN' }]);
  assert.deepEqual(toggle([{ title: 'A', kind: 'CARD' }], { title: 'A', kind: 'CARD' }), []);
});

// SSR 재렌더 사이에 각 컴포넌트의 useId로 상태를 보존하여 실제 버튼 동작을 검증한다.
const interactionStates = new Map();
const interactiveReact = {
  ...React,
  useState: (initial) => {
    const id = React.useId();
    if (!interactionStates.has(id)) interactionStates.set(id, initial);
    return [
      interactionStates.get(id),
      (update) =>
        interactionStates.set(
          id,
          typeof update === 'function' ? update(interactionStates.get(id)) : update
        ),
    ];
  },
};
const interactiveModule = loadSource(sectionSource, {
  ...sectionDependencies,
  react: interactiveReact,
  './TopicConnectionDiagram': loadSource(diagramSource, {
    ...diagramDependencies,
    react: interactiveReact,
  }),
});
function renderInteractive(items) {
  buttons.length = 0;
  return renderToStaticMarkup(
    React.createElement(interactiveModule.TopicLinksSection, {
      connections: { details: items, isLoading: false, isError: false },
    })
  );
}
const findSection = (title, rule = 'A → B (CARD->CARD)') =>
  buttons.find((props) => props.accessibilityLabel === `${title} 접기/펼치기: ${rule}`);

test('collapsing the relationship area preserves type filters and expanded rule lists', () => {
  interactionStates.clear();
  const items = [diagramRule('A', 'CARD', 'B', 'CARD'), diagramRule('A', 'COLUMN', 'B', 'CARD')];
  const toggle = () =>
    buttons.find((props) => props.accessibilityLabel === '연결 규칙 관계 접기/펼치기');
  let html = renderInteractive(items);
  assert.equal(toggle().accessibilityState.expanded, true);
  assert.ok(html.includes('<svg'));
  buttons.find((props) => props.accessibilityLabel === '연결 규칙 유형 필터: A의 카드').onPress();
  renderInteractive(items);
  findSection('감지된 링크').onPress();
  renderInteractive(items);
  toggle().onPress();
  html = renderInteractive(items);
  assert.equal(toggle().accessibilityState.expanded, false);
  assert.ok(html.includes('연결 규칙 관계'));
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('보드·노트는 전체 규칙을'));
  assert.ok(!buttons.some((props) => props.accessibilityLabel?.startsWith('연결 규칙 필터:')));
  assert.equal(findSection('감지된 링크').accessibilityState.expanded, true);
  assert.ok(!findSection('감지된 링크', 'A → B (COLUMN->CARD)'));
  assert.equal(
    buttons.filter((props) => props.accessibilityLabel?.startsWith('원문 보기:')).length,
    items[0].links.length
  );
  toggle().onPress();
  html = renderInteractive(items);
  assert.equal(toggle().accessibilityState.expanded, true);
  assert.ok(html.includes('<svg'));
  assert.equal(
    buttons.find((props) => props.accessibilityLabel === '연결 규칙 유형 필터: A의 카드')
      .accessibilityState.selected,
    true
  );
  assert.equal(findSection('감지된 링크').accessibilityState.expanded, true);
  assert.ok(!findSection('감지된 링크', 'A → B (COLUMN->CARD)'));
});

function dashboardHarness() {
  const mutationCalls = [];
  const boardData = {
    title: 'A',
    option: { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 3 },
    columnNotes: [note('A/one'), note('A/two')],
    rows: [{ name: 'row1' }, { name: 'row2' }],
    cards: [
      ['first card', 'A/one', 'row1'],
      ['second card', 'A/two', 'row1'],
      ['third card', 'A/one', 'row2'],
    ].map(([title, noteTitle, rowName], index) => ({
      id: String(index),
      title,
      noteTitle,
      rowName,
      columnName: noteTitle.split('/')[1],
      boardTitle: 'A',
      paragraph: { origin: noteTitle, title, autoSection: rowName },
    })),
    stats: { columnCount: 2, cardCount: 3 },
    isTopLevel: false,
  };
  const dependencies = {
    ...dashboardSectionDependencies,
    react: interactiveReact,
    '@react-navigation/native': {
      useNavigation: () => ({ push: (...args) => navigationCalls.push(args) }),
    },
    'react-native': { ...native, Alert: { alert: () => {} } },
    '../../hooks/useUsageMode': { useUsageMode: () => ({ isBoardEnabled: true }) },
    '../../hooks/useBoardStorage': {
      useCreateOrUpdateBoard: () => ({
        isLoading: false,
        mutateAsync: async (input) => mutationCalls.push(input),
      }),
    },
    '../../screens/main/BoardListScreen': {
      BoardListItem: ({ item, onPress }) =>
        React.createElement(native.TouchableOpacity, { onPress }, `주제 보드: ${item.title}`),
    },
  };
  const module = loadSource(dashboardSource, {
    ...dependencies,
    './TopicBoardSection': {
      TopicBoardSection: () => React.createElement('span', null, 'board view'),
    },
    './TopicOverviewSection': loadSource(
      readFileSync(path.resolve(__dirname, '../../TopicOverviewSection.tsx'), 'utf8'),
      dependencies
    ),
    './TopicBoardSummarySection': loadSource(summarySource, dependencies),
    './links/TopicLinksSection': interactiveModule,
    './links/useTopicConnections': { useTopicConnections },
    './useTopicDashboard': {
      useTopicDashboard: () => ({
        topicDashboards: [boardData],
        currentBoard: boardData,
        selectBoard: () => {},
        metrics: { totalTopics: 1, totalColumns: 2, totalCards: 3, topLevelCount: 0 },
        totalBoardCount: 1,
      }),
    },
    '../../hooks/useExtension': { useEffectExtensionScreen: () => {} },
  });
  interactionStates.clear();
  navigationCalls.length = 0;
  notesForRender = [];
  queryState = {};
  const render = () => {
    buttons.length = 0;
    return renderToStaticMarkup(React.createElement(module.TopicDashboardScreen));
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
  return { render, button, mutationCalls, boardData };
}

test('split sections preserve summary filters across tabs and combine column and row filters', () => {
  const { render, button } = dashboardHarness();
  render();
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
  assert.ok(render().includes('board view'));
  button('Board Summary').onPress();
  html = render();
  assert.ok(html.includes('first card'));
  assert.ok(!html.includes('third card'));
  button('Overview').onPress();
  render();
  buttons.find((props) => props.accessibilityLabel === '연결 규칙 보기').onPress();
  assert.ok(render().includes('반복된 연결 규칙이 아직 없습니다.'));
  button('Board Summary').onPress();
  render();
  const clearButtons = buttons.filter((props) => props.children?.props?.children === 'Clear');
  clearButtons[clearButtons.length - 1].onPress();
  html = render();
  for (const title of ['first card', 'second card', 'third card']) assert.ok(html.includes(title));
});

test('split summary preserves save completion and exact note/card navigation', async () => {
  const { render, button, mutationCalls, boardData } = dashboardHarness();
  render();
  button('Board Summary').onPress();
  render();
  button('one(2)').onLongPress();
  button('onerow1first card').onPress();
  assert.deepEqual(navigationCalls, [
    ['NotePage', { title: 'A/one', paragraph: undefined, section: undefined, board: 'A' }],
    ['NotePage', { title: 'A/one', paragraph: 'first card', section: 'row1', board: 'A' }],
  ]);
  await button('Save as Board').onPress();
  assert.deepEqual(mutationCalls, [{ title: 'A', description: '', option: boardData.option }]);
  render();
  assert.equal(button('Saved').disabled, true);
  button('Overview').onPress();
  render();
  button('Board Summary').onPress();
  render();
  assert.equal(button('Saved').disabled, true);
});

test('starts all lists collapsed, shows counts only in section headers and expands independently', () => {
  interactionStates.clear();
  const items = details(sourceData());
  let html = renderInteractive(items);
  const editorCount = () =>
    buttons.filter((props) => props.accessibilityLabel?.startsWith('원문 편집:')).length;
  assert.equal(editorCount(), 0);
  assert.ok(html.includes('A → B'));
  for (const [title, count] of [
    ['감지된 링크', 2],
    ['추천 링크 편집 제안', 2],
    ['추천 링크 없음', 1],
  ]) {
    assert.equal(findSection(title).accessibilityState.expanded, false);
    assert.ok(html.includes(`${title} (${count})`));
  }
  assert.ok(!html.includes('실제 링크 2'));
  assert.ok(!html.includes('편집 제안 2 ·'));
  assert.ok(!html.includes('추천 없는 요소 2'));
  assert.equal(
    buttons.filter(
      (props) => props.accessibilityState?.expanded !== undefined && !props.accessibilityLabel
    ).length,
    0
  );
  findSection('감지된 링크').onPress();
  renderInteractive(items);
  assert.equal(findSection('감지된 링크').accessibilityState.expanded, true);
  assert.equal(findSection('추천 링크 편집 제안').accessibilityState.expanded, false);
  assert.equal(findSection('추천 링크 없음').accessibilityState.expanded, false);
  assert.equal(editorCount(), 0);
  assert.equal(
    buttons.filter((props) => props.accessibilityLabel?.startsWith('원문 보기:')).length,
    2
  );
  findSection('추천 링크 편집 제안').onPress();
  renderInteractive(items);
  assert.equal(editorCount(), 2);
  findSection('추천 링크 없음').onPress();
  renderInteractive(items);
  assert.equal(editorCount(), 3);
  findSection('감지된 링크').onPress();
  html = renderInteractive(items);
  assert.ok(html.includes('A → B'));
  assert.equal(findSection('감지된 링크').accessibilityState.expanded, false);
  assert.equal(findSection('추천 링크 편집 제안').accessibilityState.expanded, true);
  assert.equal(findSection('추천 링크 없음').accessibilityState.expanded, true);
  assert.equal(editorCount(), 3);
});

test('diagram replaces filter badges, toggles cards by union and preserves all nodes above the rules', () => {
  interactionStates.clear();
  const items = details(
    [
      ...sourceData(),
      note(
        'C/source',
        '<h3>c1</h3>' +
          anchor(href('D/target', 'd1')) +
          '<h3>c2</h3>' +
          anchor(href('D/target', 'd1'))
      ),
      note('D/target', '<h3>d1</h3>'),
    ],
    [...boards(), board('C', 'KANBAN'), board('D', 'KANBAN')]
  );
  const filterCard = (title) =>
    buttons.find((props) => props.accessibilityLabel === '연결 규칙 필터: ' + title);
  const shownRules = () =>
    buttons.filter((props) => props.accessibilityLabel?.includes('감지된 링크 접기/펼치기:'))
      .length;
  let html = renderInteractive(items);
  assert.equal(shownRules(), 2);
  assert.ok(html.indexOf('연결 규칙 관계') < html.indexOf('감지된 링크'));
  assert.ok(!buttons.some((props) => props.accessibilityLabel?.startsWith('보드 필터:')));
  assert.ok(!buttons.some((props) => props.accessibilityLabel === '노트↔보드 규칙만 표시'));
  filterCard('A').onPress();
  html = renderInteractive(items);
  assert.equal(shownRules(), 1);
  assert.equal(filterCard('A').accessibilityState.selected, true);
  assert.ok(html.includes('opacity="0.25"'));
  for (const title of ['A', 'B', 'C', 'D']) assert.ok(filterCard(title));
  filterCard('C').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 2);
  filterCard('A').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 1);
  assert.equal(filterCard('A').accessibilityState.selected, false);
  assert.equal(findSection('감지된 링크'), undefined);
  filterCard('C').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 2);
  filterCard('B').onPress();
  renderInteractive(items);
  assert.ok(findSection('감지된 링크'));
  assert.equal(shownRules(), 1);
});

test('child-node clicks narrow rules, match target note types and keep every parent card visible', () => {
  interactionStates.clear();
  const items = [
    diagramRule('A', 'COLUMN', 'B', 'CARD'),
    diagramRule('A', 'CARD', 'B', 'COLUMN'),
    diagramRule('A', 'CARD', 'N', 'PARAGRAPH', 'BOARD', 'NOTE'),
    diagramRule('N', 'PARAGRAPH', 'C', 'CARD', 'NOTE'),
  ];
  const parent = (title) =>
    buttons.find((props) => props.accessibilityLabel === '연결 규칙 필터: ' + title);
  const child = (title, kind) =>
    buttons.find(
      (props) => props.accessibilityLabel === '연결 규칙 유형 필터: ' + title + '의 ' + kind
    );
  const shownRules = () =>
    buttons.filter((props) => props.accessibilityLabel?.startsWith('감지된 링크 접기/펼치기:'))
      .length;
  renderInteractive(items);
  assert.equal(shownRules(), 4);
  parent('A').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 3);
  child('A', '카드').onPress();
  const narrowed = renderInteractive(items);
  assert.equal(shownRules(), 2);
  assert.equal(parent('A').accessibilityState.selected, false);
  assert.equal(child('A', '카드').accessibilityState.selected, true);
  assert.equal(child('A', '컬럼').accessibilityState.selected, false);
  assert.ok(narrowed.includes('opacity="0.25"'));
  for (const title of ['A', 'B', 'N', 'C']) assert.ok(parent(title));
  parent('B').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 3);
  child('A', '카드').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 2);
  parent('B').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 4);
  child('N', '하위 문단').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 2);
  parent('N').onPress();
  renderInteractive(items);
  assert.equal(child('N', '하위 문단').accessibilityState.selected, false);
  assert.equal(parent('N').accessibilityState.selected, true);
  child('N', '하위 문단').onPress();
  renderInteractive(items);
  assert.equal(parent('N').accessibilityState.selected, false);
  child('N', '하위 문단').onPress();
  renderInteractive(items);
  assert.equal(shownRules(), 4);
});

function mixedDetails(notes, actualBoards, candidates = []) {
  const result = find(notes, actualBoards, candidates, { includeNoteBoardPatterns: true });
  return buildTopicLinkDetails(result, notes, actualBoards, candidates);
}

for (const boardKind of ['ROW', 'COLUMN', 'CARD']) {
  for (const noteKind of ['SUBNOTE', 'PARAGRAPH']) {
    test(
      'supports distinct actual observations for ' +
        boardKind +
        '->' +
        noteKind +
        ' without duplicate board-note roles',
      () => {
        const url = noteKind === 'SUBNOTE' ? href('N/child') : href('N', 'p1');
        const notes = [1, 2].map((i) =>
          note(
            'A/col' + i,
            fixture.sourceBody(boardKind, anchor(url)).replaceAll('소스행', 'row' + i)
          )
        );
        notes.push(note('N', '<h2>p1</h2>'), note('N/child', '<p>body</p>'));
        const items = mixedDetails(notes, [board('A')]);
        const item = items.find(({ pattern }) => pattern.pattern === boardKind + '->' + noteKind);
        assert.ok(item);
        assert.equal(item.pattern.targetBoard.origin, 'NOTE');
        assert.equal(
          item.pattern.matches.filter((match) => match.referenceType === 'LINK').length,
          2
        );
        assert.ok(item.pattern.qed.includes("노트 'N'"));
        assert.ok(
          item.pattern.matches.every(
            (match) =>
              match.source.containerType === 'BOARD' && match.target.containerType === 'NOTE'
          )
        );
        assert.equal(detailModule.filterTopicConnections(items, []).length, items.length);
        assert.deepEqual(detailModule.filterTopicConnections(items, [{ title: 'N' }]), [item]);
      }
    );
    test(
      'supports ' +
        noteKind +
        '->' +
        boardKind +
        ' with the same threshold and board-first ownership',
      () => {
        const url = href(
          'B/target',
          boardKind === 'ROW' ? '대상행' : boardKind === 'CARD' ? '대상카드' : undefined
        );
        const notes = [
          note('B/target', fixture.targetBody),
          note(
            'N',
            noteKind === 'PARAGRAPH'
              ? '<h2>p1</h2>' + anchor(url) + '<h2>p2</h2>' + anchor(url)
              : ''
          ),
        ];
        if (noteKind === 'SUBNOTE')
          notes.push(note('N/one', anchor(url)), note('N/two', anchor(url)));
        const items = mixedDetails(notes, [board('B')]);
        const item = items.find(({ pattern }) => pattern.pattern === noteKind + '->' + boardKind);
        assert.ok(item);
        assert.equal(item.pattern.sourceBoard.origin, 'NOTE');
        assert.ok(
          item.pattern.matches.every(
            (match) =>
              match.source.containerType === 'NOTE' && match.target.containerType === 'BOARD'
          )
        );
        assert.ok(item.pattern.matches.every((match) => match.proposition.includes("노트 'N'")));
      }
    );
  }
}

test('mixed rules require two actual source observations, not duplicate links and a potential mention', () => {
  const link = anchor(href('B/target', 'b1'));
  const result = find(
    [
      note('N', '<h2>p1</h2>' + link.repeat(2) + '<h2>p2</h2><p>b1</p>'),
      note('B/target', '<h3>b1</h3>'),
    ],
    [board('B', 'KANBAN')],
    [],
    { includeNoteBoardPatterns: true }
  );
  assert.deepEqual(result.patterns, []);
  assert.ok(result.linkClassifications.linkClassifications.length);
});

test('mixed rules keep physical paragraph edits, unseen note sources and partially linked targets', () => {
  const link = anchor(href('B/first', 'install'));
  const notes = [
    note(
      'N',
      '<h2>p1</h2>' +
        link +
        '<p>install</p><h2>p2</h2>' +
        link +
        '<h2>p3</h2><h4>details</h4><p>install</p><h2>p4</h2><p>unrelated</p>'
    ),
    note('B/first', '<h3>install</h3>'),
    note('B/second', '<h3>install</h3>'),
  ];
  const items = mixedDetails(notes, [board('B', 'KANBAN')]);
  const item = items.find(({ pattern }) => pattern.pattern === 'PARAGRAPH->CARD');
  assert.ok(item);
  assert.ok(
    item.proposals.some(({ occurrence }) => occurrence.sourceParagraph.paragraph === 'details')
  );
  const p1 = item.proposals.find(({ occurrence }) => occurrence.sourceParagraph.paragraph === 'p1');
  assert.deepEqual(
    p1.targets.map((target) => target.noteTitle),
    ['B/second']
  );
  assert.ok(item.remainingSources.some((source) => source.title === 'p4'));
  interactionStates.clear();
  navigationCalls.length = 0;
  renderInteractive([item]);
  findSection('추천 링크 편집 제안', 'N → B (PARAGRAPH->CARD)').onPress();
  renderInteractive([item]);
  buttons.find((props) => props.accessibilityLabel === '원문 편집: N > details').onPress();
  assert.equal(navigationCalls[0][0], 'EditPage');
  assert.equal(navigationCalls[0][1].paragraph, 'details');
  buttons
    .find((props) => props.accessibilityLabel === '대상 보기: 카드 후보 B/second > install')
    .onPress();
  assert.equal(navigationCalls[1][0], 'NotePage');
  assert.equal(navigationCalls[1][1].title, 'B/second');
  assert.equal(navigationCalls[1][1].paragraph, 'install');
  assert.ok(buttons.some((props) => props.accessibilityLabel === '연결 규칙 필터: N'));
  assert.ok(buttons.some((props) => props.accessibilityLabel === '연결 규칙 필터: B'));
});

test('mixed rules do not reclassify board elements or hidden cards as note roles', () => {
  const notes = sourceData();
  const boardItems = mixedDetails(notes, boards());
  assert.ok(
    boardItems.every(({ pattern }) =>
      pattern.matches.every(
        ({ source, target }) => source.containerType === 'BOARD' && target.containerType === 'BOARD'
      )
    )
  );
  const hidden = find(
    [
      note(
        'A/one',
        '<h2>row</h2><h3>visible</h3><h1>intro</h1><h3>hidden</h3>' + anchor(href('N', 'p1'))
      ),
      note(
        'A/two',
        '<h2>row</h2><h3>visible</h3><h1>intro</h1><h3>hidden</h3>' + anchor(href('N', 'p1'))
      ),
      note('N', '<h2>p1</h2>'),
    ],
    [board('A')],
    [],
    { includeNoteBoardPatterns: true }
  );
  assert.deepEqual(hidden.patterns, []);
  const same = find(
    [
      note(
        'A',
        '<h2>one</h2>' +
          anchor(href('A/col', 'card')) +
          '<h2>two</h2>' +
          anchor(href('A/col', 'card'))
      ),
      note('A/col', '<h3>card</h3>'),
    ],
    [board('A', 'KANBAN')],
    [],
    { includeNoteBoardPatterns: true }
  );
  assert.deepEqual(same.patterns, []);
  assert.ok(same.linkClassifications.excludedLinkClassifications.SAME_BOARD.length);
});

test('potential subnote targets terminate and preserve separate note roles', () => {
  const notes = [
    note(
      'A/col',
      '<h3>a1</h3>' +
        anchor(href('N/child')) +
        '<h3>a2</h3>' +
        anchor(href('N/child')) +
        '<h3>a3</h3><p>N/child</p>'
    ),
    note('N'),
    note('N/child', '<p>body</p>'),
  ];
  const items = mixedDetails(notes, [board('A', 'KANBAN')]);
  assert.ok(items.some(({ pattern }) => pattern.pattern === 'CARD->SUBNOTE'));
  const item = items.find(({ pattern }) => pattern.pattern === 'CARD->SUBNOTE');
  assert.equal(item.proposals.length, 1);
  assert.ok(item.proposals[0].match.target.containerType === 'NOTE');
});

test('selecting a note card displays its mixed rules and toggling restores board-only rules', () => {
  const notes = [
    ...sourceData(),
    note(
      'N',
      '<h2>n1</h2>' +
        anchor(href('B/target', 'b1')) +
        '<h2>n2</h2>' +
        anchor(href('B/target', 'b1')) +
        '<h2>n3</h2><p>b2</p>'
    ),
  ];
  const items = mixedDetails(notes, boards());
  assert.ok(items.some(({ pattern }) => pattern.pattern === 'CARD->CARD'));
  assert.ok(items.some(({ pattern }) => pattern.pattern === 'PARAGRAPH->CARD'));
  interactionStates.clear();
  renderInteractive(items);
  buttons.find((props) => props.accessibilityLabel === '연결 규칙 필터: N').onPress();
  renderInteractive(items);
  assert.equal(findSection('감지된 링크'), undefined);
  assert.ok(findSection('감지된 링크', 'N → B (PARAGRAPH->CARD)'));
  assert.ok(buttons.some((props) => props.accessibilityLabel === '연결 규칙 필터: N'));
  buttons.find((props) => props.accessibilityLabel === '연결 규칙 필터: N').onPress();
  renderInteractive(items);
  assert.ok(findSection('감지된 링크'));
});
