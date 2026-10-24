const assert = require('node:assert/strict');
const { test } = require('node:test');
const MarkdownIt = require('markdown-it');
const loadTs = require('./loadTs.cjs');
const template = loadTs('template.ts');
const titleTemplates = loadTs('titleTemplates.ts', {
  './template': template,
  './titleGrouping': loadTs('titleGrouping.ts'),
});
const candidate = {
  name: 'Shapes',
  markdown: '## Vertices\n\n{{Vertices}}',
  sourceTitles: ['Samples/Shapes/One', 'Samples/Shapes/Two'],
};

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return (node.props?.children || [])
    .flat()
    .map((child) => find(child, predicate))
    .find(Boolean);
}

/** Exercise screen callbacks with persistent hook state and inert native rendering surfaces. */
function screens({
  fromNote = false,
  noteTitle,
  missingTemplate = false,
  selectedTemplate = candidate,
  translations = {},
} = {}) {
  const state = new Map();
  let slots;
  let cursor;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useMemo: (calculate, dependencies) => {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))
      ) {
        slots[index] = { value: calculate(), dependencies };
      }
      return slots[index].value;
    },
    useState: (initial) => {
      const current = slots;
      const index = cursor++;
      if (!(index in current)) current[index] = typeof initial === 'function' ? initial() : initial;
      return [
        current[index],
        (value) => {
          current[index] = typeof value === 'function' ? value(current[index]) : value;
        },
      ];
    },
    useRef: (value) => react.useState({ current: value })[0],
    useEffect: (effect, dependencies) => {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
        slots[index] = dependencies;
        effect();
      }
    },
  };
  const render = (component, props) => {
    if (!state.has(component)) state.set(component, []);
    slots = state.get(component);
    cursor = 0;
    return component(props);
  };
  const actions = [];
  const saved = [];
  const discoveries = [];
  const sourceTitles = Array.isArray(selectedTemplate?.sourceTitles)
    ? selectedTemplate.sourceTitles.filter((title) => typeof title === 'string')
    : [];
  const notes = sourceTitles.map((title) => ({
    title,
    description: '<h2>Vertices</h2>',
  }));
  const data = {
    enabled: true,
    scope: 'local:1',
    isPrivate: false,
    notebookRoots: [],
    examples: {
      data: notes,
      isFetching: false,
      isLoading: false,
      isError: false,
      refetch: () => {},
    },
  };
  const lang = (value) => translations[value] || value;
  const dependencies = {
    react,
    'react-native': {
      Platform: { OS: 'web' },
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
      View: 'View',
      Text: 'Text',
      TextInput: 'TextInput',
      TouchableOpacity: 'TouchableOpacity',
      StyleSheet: { flatten: (style) => style },
      useWindowDimensions: () => ({ height: 900 }),
    },
    'react-native-paper': { Icon: 'Icon' },
    'react-native-vector-icons/MaterialCommunityIcons': 'MaterialCommunityIcon',
    '@blacktokki/core': { useLangContext: () => ({ lang }), CommonButton: 'CommonButton' },
    '@blacktokki/editor': {
      toHtml: (markdown) => new MarkdownIt().render(markdown),
      EditorViewer: 'EditorViewer',
    },
    '@blacktokki/navigation': Object.fromEntries(
      ['push', 'navigate'].map((method) => [
        method,
        (screen, params) => actions.push({ method, screen, params }),
      ])
    ),
    '@react-navigation/native': {
      useRoute: () => ({
        key: 'item',
        params: missingTemplate ? undefined : { template: selectedTemplate, noteTitle },
      }),
      useNavigationState: (select) =>
        select({
          routes: [
            { key: 'origin', name: fromNote ? 'NotePage' : 'TemplateList' },
            { key: 'item', name: 'TemplateItem' },
          ],
        }),
    },
    '../styles': { templateStyles: {} },
    '../template': template,
    '../tableLayout': loadTs('tableLayout.ts', { './template': template }),
    '../titleTemplates': titleTemplates,
    '../titleGrouping': loadTs('titleGrouping.ts'),
    '../useInductiveTemplates': { useInductiveTemplates: () => data },
    '../discovery': {
      discoverTemplates: (...args) => {
        discoveries.push(args);
        return [candidate];
      },
      templateNotes: (_candidate, sources) => sources,
    },
    '../inference': { extractStructure: () => [] },
    '../templateSimilarity': {
      groupSimilarTemplates: (templates) =>
        templates.length ? [{ templates, similarity: null }] : [],
    },
    '../templateTags': loadTs('templateTags.ts'),
    '../components/TemplateChoice': { TemplateChoice: 'TemplateChoice' },
    '../components/TemplateTableForm': { TemplateTableForm: 'TemplateTableForm' },
    './TemplatePreviewSection': { TemplatePreviewSection: 'TemplatePreviewSection' },
    './TemplateHeaderSection': { TemplateHeaderSection: 'TemplateHeaderSection' },
    './TemplateSourcesSection': { TemplateSourcesSection: 'TemplateSourcesSection' },
    './TemplateWriteSection': { TemplateWriteSection: 'TemplateWriteSection' },
    '../../../components/LoadingView': 'LoadingView',
    '../../../components/SearchBar': { ResponsiveSearchBar: 'ResponsiveSearchBar' },
    '../../../components/UsageButton': {
      __esModule: true,
      default: 'UsageButton',
      usageButtonStyles: { compactAction: {}, inlineAction: {}, compactCaption: {} },
    },
    '../../../hooks/useExtension': {
      useEffectExtensionScreen: () => ({ isActive: true, isReady: true }),
    },
    '../../../hooks/useNoteStorage': {
      useNotePages: () => ({ data: [] }),
      useCreateOrUpdatePage: () => ({
        reset: () => {},
        mutateAsync: async (value) => saved.push(value),
      }),
    },
    '../../../hooks/usePrivate': { isHiddenTitle: () => false },
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: new Proxy({}, { get: () => ({}) }) }),
    },
    '../../../screens/main/NoteItemSections': {
      HeaderIconButton: 'HeaderIconButton',
      NotePageSection: 'NotePageSection',
      pageStyles: {},
    },
  };
  const load = (file) => loadTs(file, dependencies);
  const workspace = (screen) => {
    const node = find(render(screen), (item) => typeof item.type === 'function');
    return () => render(node.type, node.props);
  };
  return { load, render, workspace, actions, saved, discoveries };
}

test('the list discovers templates independently and pushes each selection to the item screen', async () => {
  const fixture = screens();
  const { TemplateListScreen } = fixture.load('screens/TemplateListScreen.tsx');
  const view = fixture.workspace(TemplateListScreen);
  assert.equal(
    find(view(), (node) => node.type === 'Switch'),
    undefined
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  const choice = find(view(), (node) => node.type === 'TemplateChoice');
  assert.equal(choice.props.disabled, false);
  choice.props.onPress();
  assert.deepEqual(fixture.actions, [
    { method: 'push', screen: 'TemplateItem', params: { template: candidate } },
  ]);
  assert.equal(fixture.discoveries.length, 1);
  assert.equal(fixture.discoveries[0].length, 3);
});

test('preview, sources and writing retain the draft and save its exact content as a new note', async () => {
  const fixture = screens();
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  const { TemplateHeaderSection } = fixture.load('screens/TemplateHeaderSection.tsx');
  const header = (section) => {
    const Component = fixture.load('screens/' + section.type + '.tsx')[section.type];
    const node = find(
      fixture.render(Component, section.props),
      (item) => item.type === 'TemplateHeaderSection'
    );
    return fixture.render(TemplateHeaderSection, node.props);
  };
  const icon = (section, name) =>
    find(header(section), (node) => node.type === 'HeaderIconButton' && node.props.name === name);
  let preview = find(view(), (node) => node.type === 'TemplatePreviewSection');
  icon(preview, 'list').props.onPress();
  const sources = find(view(), (node) => node.type === 'TemplateSourcesSection');
  assert.ok(icon(sources, 'pencil'));
  sources.props.onSelect(candidate.sourceTitles[0]);
  assert.equal(fixture.actions[0].screen, 'NotePage');
  icon(sources, 'list').props.onPress();
  preview = find(view(), (node) => node.type === 'TemplatePreviewSection');
  icon(preview, 'list').props.onPress();
  icon(
    find(view(), (node) => node.type === 'TemplateSourcesSection'),
    'pencil'
  ).props.onPress();
  let writing = find(view(), (node) => node.type === 'TemplateWriteSection');
  writing.props.form.onChooseTitle(null);
  writing.props.form.onChangeTitle('Samples/Shapes/New');
  writing.props.form.onChangeValue('Vertices', 'Review release');
  writing.props.onPreview();
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  writing = find(view(), (node) => node.type === 'TemplateWriteSection');
  assert.equal(writing.props.form.noteTitle, 'Samples/Shapes/New');
  assert.equal(writing.props.form.values.Vertices, 'Review release');
  await writing.props.onSave();
  assert.deepEqual(fixture.saved, [
    {
      title: 'Samples/Shapes/New',
      description: '<h2>Vertices</h2>\n<p>Review release</p>\n',
      createOnly: true,
    },
  ]);
  assert.deepEqual(fixture.actions.at(-1), {
    method: 'push',
    screen: 'NotePage',
    params: { title: 'Samples/Shapes/New' },
  });
  find(view(), (node) => node.props.accessibilityLabel === 'Back to templates').props.onPress();
  assert.equal(fixture.actions.at(-1).screen, 'TemplateList');
});

test('a missing-note tag passes its full path and opens sources before prefilling the writing form', () => {
  const noteTitle = 'Samples/Shapes/New';
  const fixture = screens({ fromNote: true, noteTitle });
  const TagSection = fixture.load('screens/TemplateTagSection.tsx').default;
  find(
    fixture.render(TagSection, { title: noteTitle, paragraphs: [] }),
    (node) => node.type === 'TouchableOpacity'
  ).props.onPress();
  assert.deepEqual(fixture.actions[0], {
    method: 'push',
    screen: 'TemplateItem',
    params: { template: candidate, noteTitle },
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplateSourcesSection').props.onWriting();
  const form = find(view(), (node) => node.type === 'TemplateWriteSection').props.form;
  assert.equal(form.titleTemplateId, null);
  assert.equal(form.noteTitle, noteTitle);
  assert.equal(form.resolvedTitle, noteTitle);
});

test('resizing both table axes survives preview transitions and saves exactly the live preview', async () => {
  const fixture = screens({
    selectedTemplate: {
      ...candidate,
      markdown: [
        '| ID | Sample 1 | Sample 2 |',
        '| --- | --- | --- |',
        '| FIG-000 | {{FIG-000 · Sample 1}} | {{FIG-000 · Sample 2}} |',
        '| FIG-001 | {{FIG-001 · Sample 1}} | {{FIG-001 · Sample 2}} |',
      ].join('\n'),
    },
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  const writing = () => find(view(), (node) => node.type === 'TemplateWriteSection');
  writing().props.form.onChooseTitle(null);
  writing().props.form.onChangeTitle('Samples/Figures/New');
  const groups = writing().props.form.tables[0].groups;
  const rows = groups.find((group) => group.axis === 'row');
  const columns = groups.find((group) => group.axis === 'column');
  writing().props.form.onChangeValue('FIG-001 · Sample 2', 'Preserved value');
  writing().props.form.onChangeTable(rows.id);
  writing().props.form.onChangeTable(columns.id);
  const newCell = writing().props.form.tables[0].rows.at(-1).cells.at(-1).variables[0];
  writing().props.form.onChangeValue(newCell, 'New intersection | value');
  writing().props.form.onChangeTableColumn(columns.id, 2, 'Review | Result');
  writing().props.form.onChangeTable(rows.id, 0);
  writing().props.form.onChangeTable(columns.id, 0);
  const html = writing().props.templateHtml;
  assert.match(html, /FIG-002/);
  assert.match(html, /<th>Review \| Result<\/th>/);
  assert.match(html, /Preserved value/);
  assert.match(html, /New intersection \| value/);
  assert.doesNotMatch(html, /FIG-000|Sample 1/);
  assert.equal((html.match(/<td>/g) || []).length, 6);
  writing().props.onPreview();
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  assert.equal(writing().props.templateHtml, html);
  await writing().props.onSave();
  assert.deepEqual(fixture.saved, [
    { title: 'Samples/Figures/New', description: html, createOnly: true },
  ]);
});

test('writing toggles the body form and content preview exclusively while keeping title, table inputs and saving available', async () => {
  const fixture = screens({
    selectedTemplate: {
      ...candidate,
      markdown:
        candidate.markdown +
        '\n\n| ID | Value |\n| --- | --- |\n| FIG-000 | {{Value 0}} |\n| FIG-001 | {{Value 1}} |',
    },
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  const writing = () => find(view(), (node) => node.type === 'TemplateWriteSection');
  writing().props.form.onChooseTitle(null);
  writing().props.form.onChangeTitle('Shapes/New');
  const { TemplateWriteSection } = fixture.load('screens/TemplateWriteSection.tsx');
  const body = () => fixture.render(TemplateWriteSection, writing().props);
  const tab = (name) =>
    find(
      body(),
      (node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === name
    );
  const titleInput = () =>
    find(
      body(),
      (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'New note title'
    );
  assert.equal(tab('Content template').props.accessibilityState.selected, true);
  assert.equal(tab('Content template').props.tabIndex, 0);
  assert.equal(tab('Content preview').props.tabIndex, -1);
  assert.equal(
    find(body(), (node) => node.type === 'EditorViewer'),
    undefined
  );
  find(
    body(),
    (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Vertices'
  ).props.onChangeText('Review decisions');
  const table = find(body(), (node) => node.type === 'TemplateTableForm');
  table.props.onChangeValue('Value 1', 'Kept cell');
  table.props.onChangeTable(table.props.table.groups[0].id);
  assert.ok(find(body(), (node) => node.type === 'CommonButton'));
  tab('Content preview').props.onPress();
  assert.equal(tab('Content preview').props.accessibilityState.selected, true);
  assert.equal(
    find(body(), (node) => node.type === 'TemplateTableForm'),
    undefined
  );
  assert.equal(
    find(
      body(),
      (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Vertices'
    ),
    undefined
  );
  assert.equal(titleInput().props.value, 'Shapes/New');
  let preview = find(body(), (node) => node.type === 'EditorViewer');
  assert.match(preview.props.value, /Review decisions/);
  assert.match(preview.props.value, /Kept cell/);
  assert.match(preview.props.value, /FIG-002/);
  assert.equal(preview.props.autoResize, true);
  const viewer = preview;
  tab('Content template').props.onPress();
  assert.equal(
    find(body(), (node) => node.type === 'EditorViewer'),
    viewer
  );
  const hidden = find(
    body(),
    (node) => node.props.importantForAccessibility === 'no-hide-descendants'
  );
  assert.equal(hidden.props.accessibilityElementsHidden, true);
  assert.equal(
    find(
      body(),
      (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Vertices'
    ).props.value,
    'Review decisions'
  );
  assert.equal(
    find(body(), (node) => node.type === 'TemplateTableForm').props.table.rows.length,
    3
  );
  tab('Content preview').props.onPress();
  preview = find(body(), (node) => node.type === 'EditorViewer');
  assert.equal(preview, viewer);
  assert.equal(
    find(body(), (node) => node.props.importantForAccessibility === 'no-hide-descendants'),
    undefined
  );
  tab('Content template').props.onPress();
  find(
    body(),
    (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Vertices'
  ).props.onChangeText('Updated decisions');
  tab('Content preview').props.onPress();
  preview = find(body(), (node) => node.type === 'EditorViewer');
  assert.notEqual(preview, viewer);
  assert.match(preview.props.value, /Updated decisions/);
  assert.match(preview.props.value, /Kept cell/);
  const updatedViewer = preview;
  const focus = [];
  tab('Content template').props.ref({ focus: () => focus.push('form') });
  tab('Content preview').props.ref({ focus: () => focus.push('preview') });
  let prevented = 0;
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    find(body(), (node) => node.props.accessibilityRole === 'tablist').props.onKeyDown({
      key,
      preventDefault: () => prevented++,
    });
  }
  assert.deepEqual(focus, ['form', 'preview', 'form', 'preview']);
  assert.equal(prevented, 4);
  assert.equal(tab('Content preview').props.tabIndex, 0);
  assert.equal(tab('Content template').props.tabIndex, -1);
  assert.equal(
    find(body(), (node) => node.type === 'EditorViewer'),
    updatedViewer
  );
  await find(body(), (node) => node.type === 'CommonButton').props.onPress();
  assert.deepEqual(fixture.saved, [
    { title: 'Shapes/New', description: preview.props.value, createOnly: true },
  ]);
});

test('a localized reason replaces the save button until every saving requirement is satisfied', () => {
  const ko = require('../../../lang/ko.json');
  const fixture = screens({ translations: ko });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  const writing = () => find(view(), (node) => node.type === 'TemplateWriteSection');
  writing().props.form.onChooseTitle(null);
  const { TemplateWriteSection } = fixture.load('screens/TemplateWriteSection.tsx');
  const body = (props = {}, form = {}) =>
    fixture.render(TemplateWriteSection, {
      ...writing().props,
      ...props,
      form: { ...writing().props.form, ...form },
    });
  const reason = (tree) =>
    find(tree, (node) => node.props.accessibilityLiveRegion === 'polite')?.props.children.join('');
  const save = (tree) => find(tree, (node) => node.type === 'CommonButton');
  assert.equal(save(body()), undefined);
  assert.match(reason(body()), /노트 제목을 입력/);
  assert.equal(
    find(
      body(),
      (node) =>
        node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === '제목 확인'
    ),
    undefined
  );
  const input = find(
    body(),
    (node) => node.type === 'TextInput' && node.props.accessibilityLabel === ko['New note title']
  );
  input.props.onChangeText('Samples/Bad?Name');
  assert.match(reason(body()), /사용할 수 없는 문자/);
  assert.equal(save(body()), undefined);
  input.props.onChangeText('Samples/New');
  assert.equal(reason(body()), undefined);
  assert.ok(save(body()));
  assert.match(reason(body({}, { busy: true })), /작업을 처리 중/);
  assert.equal(save(body({}, { busy: true })), undefined);
  assert.match(reason(body({ templateHtml: '' })), /저장할 내용이 없습니다/);
  assert.equal(save(body({ templateHtml: '' })), undefined);
  const title = {
    id: 'title',
    pattern: 'Note {{날짜}}-{{번호}}',
    path: '',
    variables: ['날짜', '번호'],
    sourceTitles: [],
  };
  let form = { titleTemplates: [title], titleTemplateId: 'title', values: {}, resolvedTitle: null };
  assert.match(reason(body({}, form)), /필수 제목 항목.*날짜, 번호/);
  assert.equal(save(body({}, form)), undefined);
  form.values = { 날짜: '2026-10-17', 번호: '../Invalid' };
  assert.match(reason(body({}, form)), /사용할 수 없는 문자.*번호/);
  assert.equal(save(body({}, form)), undefined);
});

test('opening an item without a selected template returns to the list', () => {
  const fixture = screens({ missingTemplate: true });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  fixture.render(TemplateItemScreen);
  assert.deepEqual(fixture.actions, [
    { method: 'navigate', screen: 'TemplateList', params: undefined },
  ]);
});

test('incomplete or malformed restored templates return to the list before mounting their workspace', () => {
  for (const selectedTemplate of [
    {},
    null,
    'stale-template-id',
    { ...candidate, markdown: undefined },
    { ...candidate, markdown: null },
    { ...candidate, markdown: 42 },
    { ...candidate, markdown: '' },
    { ...candidate, markdown: '   ' },
    { ...candidate, name: undefined },
    { ...candidate, name: '' },
    { ...candidate, sourceTitles: undefined },
    { ...candidate, sourceTitles: [null] },
    { ...candidate, folderName: 42 },
  ]) {
    const fixture = screens({ selectedTemplate });
    const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
    const tree = fixture.render(TemplateItemScreen);
    assert.equal(
      find(tree, (node) => typeof node.type === 'function'),
      undefined
    );
    assert.deepEqual(fixture.actions, [
      { method: 'navigate', screen: 'TemplateList', params: undefined },
    ]);
    assert.deepEqual(fixture.saved, []);
  }
});

test('an invalid restored note title returns to the list instead of reaching string operations', () => {
  const fixture = screens({ noteTitle: 42 });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const tree = fixture.render(TemplateItemScreen);
  assert.equal(
    find(tree, (node) => typeof node.type === 'function'),
    undefined
  );
  assert.deepEqual(fixture.actions, [
    { method: 'navigate', screen: 'TemplateList', params: undefined },
  ]);
});
