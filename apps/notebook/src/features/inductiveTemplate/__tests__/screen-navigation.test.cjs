const getPathFromState = require('@react-navigation/core/lib/commonjs/getPathFromState').default;
const getStateFromPath = require('@react-navigation/core/lib/commonjs/getStateFromPath').default;
const MarkdownIt = require('markdown-it');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { setImmediate, setTimeout } = require('node:timers');
const { URLSearchParams } = require('node:url');

const loadTs = require('./loadTs.cjs');
const template = loadTs('template.ts');
const {
  templateChecksum,
  templateGroupKey,
  templateLinkParams,
  resolveTemplateLink,
  validateTemplateNavigationParams,
} = template;
const { discoverTemplates, templateNotes } = loadTs('discovery.ts');
const templateStyles = loadTs('styles.ts', {
  'react-native': { StyleSheet: { create: (styles) => styles, absoluteFill: {} } },
}).templateStyles;
const titleTemplates = loadTs('titleTemplates.ts', {
  './template': template,
  './titleGrouping': loadTs('titleGrouping.ts'),
});
const candidate = {
  name: 'Meetings',
  markdown: '## Agenda\n\n{{Agenda}}',
  canonicalMarkdown: '## Agenda\n\n{{Agenda}}',
  sourceTitles: ['Team/Meetings/One', 'Team/Meetings/Two'],
};

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return (node.props?.children || [])
    .flat()
    .map((child) => find(child, predicate))
    .find(Boolean);
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node?.props?.children || []).flat().map(textContent).join('');
}

function titleButton(node, title) {
  return find(node, (item) => item.type === 'TouchableOpacity' && textContent(item) === title);
}

/** Exercise screen callbacks with persistent hook state and inert native rendering surfaces. */
async function screens({
  fromNote = false,
  noteTitle,
  missingTemplate = false,
  selectedTemplate = candidate,
  translations = {},
  routeParams,
  sourceState = {},
  boardState = { data: [] },
  boardEnabled = true,
} = {}) {
  selectedTemplate = {
    ...selectedTemplate,
    canonicalMarkdown: selectedTemplate.canonicalMarkdown ?? selectedTemplate.markdown,
  };
  const defaultParams = await template.templateLinkParams(selectedTemplate, [], noteTitle);
  const currentParams =
    routeParams !== undefined ? routeParams : missingTemplate ? undefined : defaultParams;
  const catalog = { templates: [selectedTemplate] };
  const state = new Map();
  let slots;
  let cursor;
  let notePageHeader;
  const react = {
    Suspense: 'Suspense',
    memo: (component) => component,
    lazy: () => 'LazyComponent',
    useCallback: (callback) => callback,
    createElement: (type, props, ...children) =>
      type === notePageHeader
        ? type({ ...props, children })
        : { type, props: { ...props, children } },
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
  const boardChanges = [];
  const discoveries = [];
  const sourceTitles = Array.isArray(selectedTemplate?.sourceTitles)
    ? selectedTemplate.sourceTitles.filter((title) => typeof title === 'string')
    : [];
  const notes = sourceTitles.map((title) => ({
    title,
    description: '<h2>Agenda</h2>',
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
      isFetchedAfterMount: true,
      isError: false,
      refetch: () => {},
      ...sourceState,
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
      StyleSheet: { flatten: (style) => style, create: (styles) => styles },
      useWindowDimensions: () => ({ height: 900 }),
    },
    'react-native-paper': {
      Icon: 'Icon',
      Card: Object.assign(() => {}, { Content: 'CardContent' }),
    },
    'react-native-vector-icons/MaterialCommunityIcons': 'MaterialCommunityIcon',
    '@blacktokki/core': {
      Text: 'Text',
      useLangContext: () => ({ lang }),
      useResizeContext: () => 'landscape',
      CommonButton: 'CommonButton',
    },
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
    'react-query': {
      useQuery: (options) => ({
        data: options.enabled
          ? {
              key: options.queryKey[1],
              template:
                currentParams?.template?.toLowerCase() === defaultParams.template &&
                currentParams?.group?.toLowerCase() === defaultParams.group
                  ? catalog.templates.find(
                      (item) => item.canonicalMarkdown === selectedTemplate.canonicalMarkdown
                    ) || null
                  : null,
            }
          : undefined,
        isSuccess: options.enabled,
        isLoading: !options.enabled,
        isFetching: false,
        isError: false,
        refetch: () => {},
      }),
    },
    '@react-navigation/native': {
      useRoute: () => ({
        key: 'item',
        params:
          routeParams !== undefined ? routeParams : missingTemplate ? undefined : defaultParams,
      }),
      useNavigationState: (select) =>
        select({
          routes: [
            { key: 'origin', name: fromNote ? 'NotePage' : 'TemplateList' },
            { key: 'item', name: 'TemplateItem' },
          ],
        }),
    },
    '../styles': { templateStyles },
    '../template': template,
    '../tableLayout': loadTs('tableLayout.ts', { './template': template }),
    '../titleTemplates': titleTemplates,
    '../titleGrouping': loadTs('titleGrouping.ts'),
    '../useInductiveTemplates': { useInductiveTemplates: () => data },
    '../discovery': {
      discoverTemplates: (...args) => {
        discoveries.push(args);
        return catalog.templates;
      },
      templateNotes,
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
    './TemplateSheetSection': { TemplateSheetSection: 'TemplateSheetSection' },
    './TemplateWriteSection': { TemplateWriteSection: 'TemplateWriteSection' },
    '../../../components/LoadingView': 'LoadingView',
    '../../../components/StatusCard': 'StatusCard',
    '../../../components/SearchBar': { ResponsiveSearchBar: 'ResponsiveSearchBar' },
    '../../../components/UsageButton': {
      __esModule: true,
      default: 'UsageButton',
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
    '../../../hooks/useUsageMode': { useUsageMode: () => ({ isBoardEnabled: boardEnabled }) },
    '../../../hooks/useBoardStorage': {
      useBoardPages: () => boardState,
      useCreateOrUpdateBoard: () => ({
        mutate: (value) => {
          const previous = boardState.data.find(
            (board) => board.id === value.id || board.title === value.title
          );
          const board = {
            ...previous,
            ...value,
            id: previous?.id ?? Math.max(0, ...boardState.data.map((item) => item.id)) + 1,
          };
          boardState.data = [...boardState.data.filter((item) => item.id !== board.id), board];
          boardChanges.push({ type: 'save', board });
        },
      }),
      useDeleteBoard: () => ({
        mutate: (id) => {
          boardState.data = boardState.data.filter((item) => item.id !== id);
          boardChanges.push({ type: 'delete', id });
        },
      }),
    },
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({
        commonStyles: new Proxy(
          {
            container: { paddingHorizontal: 24, paddingVertical: 16 },
            title: { color: '#111' },
            pressibleText: { color: '#888' },
          },
          { get: (styles, key) => styles[key] || {} }
        ),
      }),
    },
    '../../../screens/main/NoteItemSections': {
      HeaderIconButton: 'HeaderIconButton',
      NotePageHeader: 'NotePageHeader',
      NotePageSection: 'NotePageSection',
      pageStyles: { title: { fontSize: 20 } },
    },
    '../../../screens/main/CardPageSection': {
      useToCardPage: (onPress, scale, renderTitle) => (item) => ({
        ...item,
        title: renderTitle ? renderTitle(item) : item.title,
        onPress: () => onPress(item),
        scale,
      }),
      renderCardPage: ({ item }) => react.createElement('CardPage', { item }),
    },
    './TemplateSourceBoardSection': { TemplateSourceBoardSection: 'TemplateSourceBoardSection' },
    './TemplateSourceGroupCard': { TemplateSourceGroupCard: 'TemplateSourceGroupCard' },
    '../../../screens/main/home/ConfigSection': { OptionButton: 'OptionButton' },
  };
  notePageHeader = loadTs('../../screens/main/NoteItemSections.tsx', {
    ...dependencies,
    '@react-navigation/core': { useNavigation: () => ({}) },
    'react-native-vector-icons/FontAwesome': 'FontAwesomeIcon',
    './home/ContentGroupSection': {},
    '../../components/HeaderSelectBar': {},
    '../../components/SearchBar': {},
    '../../hooks/useNoteStorage': {
      getSplitTitle: (title) => {
        const parts = title.split('/');
        return parts.length > 1 ? [parts.slice(0, -1).join('/'), parts.at(-1)] : parts;
      },
    },
    '../../hooks/useNotebookTheme': dependencies['../../../hooks/useNotebookTheme'],
    '../../styles': {},
  }).NotePageHeader;
  dependencies['../../../screens/main/NoteItemSections'].NotePageHeader = notePageHeader;
  const load = (file, overrides = {}) => loadTs(file, { ...dependencies, ...overrides });
  const workspace = (screen) => {
    const node = find(render(screen), (item) => typeof item.type === 'function');
    return () => render(node.type, node.props);
  };
  return {
    load,
    render,
    workspace,
    actions,
    saved,
    discoveries,
    data,
    catalog,
    boardState,
    boardChanges,
    notePageHeader,
  };
}

test('the list discovers templates independently and pushes each selection to the item screen', async () => {
  const fixture = await screens();
  const { TemplateListScreen } = fixture.load('screens/TemplateListScreen.tsx');
  const view = fixture.workspace(TemplateListScreen);
  assert.equal(
    find(view(), (node) => node.type === 'Switch'),
    undefined
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  const choice = find(view(), (node) => node.type === 'TemplateChoice');
  assert.equal(choice.props.disabled, false);
  await Promise.all([choice.props.onPress(), choice.props.onPress()]);
  assert.deepEqual(fixture.actions, [
    {
      method: 'push',
      screen: 'TemplateItem',
      params: await template.templateLinkParams(candidate),
    },
  ]);
  assert.equal(fixture.discoveries.length, 1);
  assert.equal(fixture.discoveries[0].length, 3);
});

test('preview, sources and writing retain the draft and save its exact content as a new note', async () => {
  const fixture = await screens();
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  assert.equal(view().type, 'ScrollView');
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
  const previewContentStyle = Object.assign({}, ...view().props.contentContainerStyle);
  const previewWorkspace = find(view(), (node) =>
    node.props.style?.includes?.(templateStyles.pageWorkspace)
  );
  assert.equal(Object.assign({}, ...previewWorkspace.props.style).maxWidth, '100%');
  let preview = find(view(), (node) => node.type === 'TemplatePreviewSection');
  icon(preview, 'th-large').props.onPress();
  const sources = find(view(), (node) => node.type === 'TemplateSourcesSection');
  assert.equal(view().type, 'View');
  assert.equal(
    find(view(), (node) => node.type === 'ScrollView'),
    undefined
  );
  assert.ok(find(view(), (node) => node.props.style?.includes?.(templateStyles.sourceWorkspace)));
  const sourceStyle = Object.assign({}, ...view().props.style);
  assert.equal(sourceStyle.paddingHorizontal, 0);
  assert.equal(sourceStyle.paddingBottom, 0);
  assert.equal(sources.props.paddingHorizontal, previewContentStyle.paddingHorizontal);
  assert.equal(
    sourceStyle.paddingTop ?? sourceStyle.paddingVertical,
    previewContentStyle.paddingTop ?? previewContentStyle.paddingVertical
  );
  const sourcesWorkspace = find(view(), (node) =>
    node.props.style?.includes?.(templateStyles.pageWorkspace)
  );
  assert.equal(Object.assign({}, ...sourcesWorkspace.props.style).maxWidth, '100%');
  assert.ok(icon(sources, 'pencil'));
  sources.props.onSelect(candidate.sourceTitles[0]);
  assert.equal(fixture.actions[0].screen, 'NotePage');
  assert.equal(icon(sources, 'file-text-o'), undefined);
  titleButton(header(sources), candidate.name).props.onPress();
  preview = find(view(), (node) => node.type === 'TemplatePreviewSection');
  icon(preview, 'th-large').props.onPress();
  icon(
    find(view(), (node) => node.type === 'TemplateSourcesSection'),
    'pencil'
  ).props.onPress();
  const sheet = find(view(), (node) => node.type === 'TemplateSheetSection');
  assert.equal(view().type, 'View');
  assert.equal(sheet.props.templateName, candidate.name);
  assert.deepEqual(
    sheet.props.notes.map((note) => note.title),
    candidate.sourceTitles
  );
  assert.equal(
    find(view(), (node) => node.type === 'TemplateWriteSection'),
    undefined
  );
  sheet.props.onCancel();
  find(view(), (node) => node.type === 'TemplateSourcesSection').props.onPreviewTemplate();
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  let writing = find(view(), (node) => node.type === 'TemplateWriteSection');
  assert.equal(view().type, 'ScrollView');
  writing.props.form.onChooseTitle(null);
  writing.props.form.onChangeTitle('Team/Meetings/New');
  writing.props.form.onChangeValue('Agenda', 'Review release');
  const { TemplateWriteSection } = fixture.load('screens/TemplateWriteSection.tsx');
  const writingView = fixture.render(TemplateWriteSection, writing.props);
  assert.equal(
    find(writingView, (node) => node.props.name === 'file-text-o'),
    undefined
  );
  titleButton(
    header(writing),
    candidate.name + ' - Write a note from the template'
  ).props.onPress();
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  writing = find(view(), (node) => node.type === 'TemplateWriteSection');
  assert.equal(writing.props.form.noteTitle, 'Team/Meetings/New');
  assert.equal(writing.props.form.values.Agenda, 'Review release');
  await writing.props.onSave();
  assert.deepEqual(fixture.saved, [
    {
      title: 'Team/Meetings/New',
      description: '<h2>Agenda</h2>\n<p>Review release</p>\n',
      createOnly: true,
    },
  ]);
  assert.deepEqual(fixture.actions.at(-1), {
    method: 'push',
    screen: 'NotePage',
    params: { title: 'Team/Meetings/New' },
  });
  writing.props.onPreview();
  preview = find(view(), (node) => node.type === 'TemplatePreviewSection');
  const catalogButton = find(
    header(preview),
    (node) => node.props.accessibilityLabel === 'Back to templates'
  );
  assert.ok(find(catalogButton, (node) => node.props.name === 'file-document-multiple-outline'));
  catalogButton.props.onPress();
  assert.deepEqual(fixture.actions.at(-1), {
    method: 'navigate',
    screen: 'TemplateList',
    params: undefined,
  });
});

test('bulk editing scopes notes and its title to the current group and restores that group on cancel', async () => {
  const titles = [
    'Book/Group',
    'Book/Group/One',
    'Book/Group/Sub',
    'Book/Group/Sub/Two',
    'Book/GroupExtra/Three',
    'Book/Other/Four',
  ];
  const fixture = await screens({ selectedTemplate: { ...candidate, sourceTitles: titles } });
  fixture.data.notebookRoots = ['Book'];
  fixture.data.examples.data.push({
    title: 'Outside/Existing',
    description: '<p>Other format</p>',
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onSources();
  let { TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx');
  const { TemplateHeaderSection } = fixture.load('screens/TemplateHeaderSection.tsx');
  const sources = () =>
    fixture.render(
      TemplateSourcesSection,
      find(view(), (node) => node.type === 'TemplateSourcesSection').props
    );
  const header = () =>
    fixture.render(
      TemplateHeaderSection,
      find(sources(), (node) => node.type === 'TemplateHeaderSection').props
    );
  const enter = (name) =>
    find(sources(), (node) => node.type === 'Suspense')
      .props.children[0].find((node) => node.props.item.title === name)
      .props.item.onPress();
  const edit = () => {
    find(
      header(),
      (node) => node.type === 'HeaderIconButton' && node.props.name === 'pencil'
    ).props.onPress();
    return find(view(), (node) => node.type === 'TemplateSheetSection');
  };
  const cancel = (sheet) => {
    sheet.props.onCancel();
    ({ TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx'));
  };
  const noteTitles = (sheet) => sheet.props.notes.map((note) => note.title);

  enter('Group');
  enter('./Sub');
  let sheet = edit();
  assert.deepEqual(noteTitles(sheet), ['Book/Group/Sub', 'Book/Group/Sub/Two']);
  assert.equal(sheet.props.templateName, candidate.name + '/Group/Sub');
  assert.equal(
    textContent(
      fixture.render(TemplateHeaderSection, {
        templateName: sheet.props.templateName,
        titleSuffix: 'Edit',
      })
    ),
    candidate.name + '/Group/Sub - Edit'
  );
  assert.deepEqual(
    sheet.props.allNotes.map((note) => note.title),
    [...titles, 'Outside/Existing']
  );
  cancel(sheet);
  assert.equal(textContent(header()), candidate.name + '/Group/Sub');

  titleButton(header(), candidate.name + '/Group').props.onPress();
  sheet = edit();
  assert.deepEqual(noteTitles(sheet), titles.slice(0, 4));
  assert.equal(sheet.props.templateName, candidate.name + '/Group');
  cancel(sheet);
  titleButton(header(), candidate.name).props.onPress();
  sheet = edit();
  assert.deepEqual(noteTitles(sheet), titles);
  assert.equal(sheet.props.templateName, candidate.name);
  cancel(sheet);

  enter('GroupExtra');
  sheet = edit();
  assert.deepEqual(noteTitles(sheet), ['Book/GroupExtra/Three']);
  assert.equal(sheet.props.templateName, candidate.name + '/GroupExtra');
});

test('source cards browse folders by latest update and open original note paths', async () => {
  const fixture = await screens();
  const { TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx');
  const opened = [];
  let previews = 0;
  const props = {
    templateName: 'Meeting template',
    notebookRoots: ['Book'],
    canWrite: true,
    onPreviewTemplate: () => previews++,
    onWriting: () => {},
    onSelect: (title) => opened.push(title),
    notes: [
      { title: 'Book/Older', updated: '2026-11-01' },
      { title: 'Book/Meetings/Recent', updated: '2026-11-04', description: '<p>Recent</p>' },
      { title: 'Book/Meetings/Archive/Old', updated: '2026-11-02' },
      { title: 'Book/Meetings/Second', updated: '2026-11-03' },
      { title: 'Book/Other/Newest', updated: '2026-11-05' },
    ],
  };
  const view = () => fixture.render(TemplateSourcesSection, props);
  const cards = () =>
    find(view(), (node) => node.type === 'Suspense')
      .props.children[0].map((node) => node.props.item)
      .filter((item) => item.title !== undefined);
  const titles = () => cards().map((item) => item.title);
  assert.deepEqual(titles(), ['Other', 'Meetings', 'Older']);
  const { TemplateHeaderSection } = fixture.load('screens/TemplateHeaderSection.tsx');
  const templateHeader = find(view(), (node) => node.type === 'TemplateHeaderSection');
  const titleHeader = fixture.render(TemplateHeaderSection, templateHeader.props);
  assert.equal(
    find(titleHeader, (node) => node.props.name === 'file-text-o'),
    undefined
  );
  find(titleHeader, (node) => node.type === 'TouchableOpacity').props.onPress();
  assert.equal(previews, 1);
  assert.equal(cards()[1].description, '<p>Recent</p>');
  assert.equal(cards()[0].noteCount, 1);
  assert.equal(cards()[1].noteCount, 3);
  cards()[1].onPress();
  assert.deepEqual(titles(), ['./Recent', './Second', './Archive']);
  cards()[0].onPress();
  assert.deepEqual(opened, ['Book/Meetings/Recent']);
  cards()[2].onPress();
  assert.deepEqual(titles(), ['./Old']);
  const header = () =>
    fixture.render(
      TemplateHeaderSection,
      find(view(), (node) => node.type === 'TemplateHeaderSection').props
    );
  assert.equal(textContent(header()), 'Meeting template/Meetings/Archive');
  const titleColor = (title) =>
    Object.assign(
      {},
      ...find(header(), (node) => node.type === 'Text' && textContent(node) === title)
        .props.style.flat(Infinity)
        .filter(Boolean)
    ).color;
  assert.equal(titleColor('Meeting template/Meetings'), '#888');
  assert.equal(titleColor('Archive'), '#111');
  assert.equal(
    find(view(), (node) => node.props.name === 'arrow-left'),
    undefined
  );
  titleButton(header(), 'Archive').props.onPress();
  assert.deepEqual(titles(), ['./Old']);
  titleButton(header(), 'Meeting template/Meetings').props.onPress();
  assert.deepEqual(titles(), ['./Recent', './Second', './Archive']);
  assert.equal(textContent(header()), 'Meeting template/Meetings');
  titleButton(header(), props.templateName).props.onPress();
  assert.deepEqual(titles(), ['Other', 'Meetings', 'Older']);
  assert.equal(previews, 1);
  assert.equal(textContent(header()), 'Meeting template');
  assert.equal(titleColor('Meeting template'), '#111');
  titleButton(header(), props.templateName).props.onPress();
  assert.equal(previews, 2);
  props.notes = [];
  assert.deepEqual(titles(), []);
  assert.ok(find(view(), (node) => node.props.children?.includes('No similar notes.')));
});

test('reusing the note header preserves default parent and current-note navigation', async () => {
  const fixture = await screens();
  const pressed = [];
  const header = (title) =>
    fixture.render(fixture.notePageHeader, {
      title,
      onPress: (path, hasChild) => pressed.push({ path, hasChild }),
    });
  const view = header('Parent/Child/Note');
  find(
    view,
    (node) => node.type === 'TouchableOpacity' && textContent(node) === 'Parent/Child'
  ).props.onPress();
  find(
    view,
    (node) => node.type === 'TouchableOpacity' && textContent(node) === 'Note'
  ).props.onPress();
  find(header('Single'), (node) => node.type === 'TouchableOpacity').props.onPress();
  assert.deepEqual(pressed, [
    { path: 'Parent/Child', hasChild: true },
    { path: 'Parent/Child/Note', hasChild: false },
    { path: 'Single', hasChild: false },
  ]);
});

test('template header navigation keeps literal template slashes separate from source groups', async () => {
  const fixture = await screens();
  const { TemplateHeaderSection } = fixture.load('screens/TemplateHeaderSection.tsx');
  const groups = [];
  let previews = 0;
  const header = (groupPath = '') =>
    fixture.render(TemplateHeaderSection, {
      templateName: 'ID/Description',
      titleSuffix: 'Edit',
      groupPath,
      onTitlePress: () => previews++,
      onGroupPress: (path) => groups.push(path),
    });
  titleButton(header(), 'ID').props.onPress();
  titleButton(header(), 'Description - Edit').props.onPress();
  assert.equal(previews, 2);
  titleButton(header('Parent/Child'), 'ID/Description - Edit/Parent').props.onPress();
  titleButton(header('Parent/Child'), 'Child').props.onPress();
  titleButton(header('Parent'), 'ID/Description - Edit').props.onPress();
  assert.deepEqual(groups, ['Parent', 'Parent/Child', '']);
  assert.equal(previews, 2);
});

test('parent notes and their descendants share a card group while both remain accessible', async () => {
  const fixture = await screens();
  const { TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx');
  const opened = [];
  const props = {
    templateName: 'Template',
    notebookRoots: ['Book'],
    canWrite: true,
    onPreviewTemplate: () => {},
    onWriting: () => {},
    onSelect: (title) => opened.push(title),
    notes: [
      { title: 'Book/Meetings', description: '<p>Parent</p>', updated: '2026-11-01' },
      { title: 'Book/Meetings/Weekly', description: '<p>Weekly</p>', updated: '2026-11-02' },
      { title: 'Book/Meetings/Weekly/One', updated: '2026-11-05' },
    ],
  };
  const view = () => fixture.render(TemplateSourcesSection, props);
  const cards = () =>
    find(view(), (node) => node.type === 'Suspense')
      .props.children[0].map((node) => node.props.item)
      .filter((item) => item.title !== undefined);
  assert.deepEqual(
    cards().map((item) => item.title),
    ['Meetings']
  );
  let group = cards()[0];
  assert.equal(group.description, '<p>Parent</p>');
  assert.equal(group.updated, '2026-11-05');
  assert.equal(group.noteCount, 3);
  group.onPress();
  assert.deepEqual(
    cards().map((item) => item.title),
    ['./Weekly', './Meetings']
  );
  cards()[1].onPress();
  assert.deepEqual(opened, ['Book/Meetings']);
  group = cards()[0];
  assert.equal(group.description, '<p>Weekly</p>');
  assert.equal(group.noteCount, 2);
  group.onPress();
  assert.deepEqual(
    cards().map((item) => item.title),
    ['./One', './Weekly']
  );
  cards()[0].onPress();
  cards()[1].onPress();
  assert.deepEqual(opened, ['Book/Meetings', 'Book/Meetings/Weekly/One', 'Book/Meetings/Weekly']);
});

test('path groups show exact source counts and stay stacked with a single source', async () => {
  const fixture = await screens();
  const { TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx');
  const { TemplateSourceGroupCard } = fixture.load('screens/TemplateSourceGroupCard.tsx');
  const sourceView = fixture.render(TemplateSourcesSection, {
    templateName: 'Template',
    notebookRoots: ['Book'],
    canWrite: true,
    onPreviewTemplate: () => {},
    onWriting: () => {},
    onSelect: () => {},
    notes: [
      { title: 'Book/Virtual/Only' },
      { title: 'Book/Parent' },
      { title: 'Book/Parent/Child' },
      { title: 'Book/Multiple/One' },
      { title: 'Book/Multiple/Two' },
      { title: 'Book/Multiple/Two', updated: '2026-11-05' },
    ],
  });
  const cards = find(sourceView, (node) => node.type === 'Suspense').props.children[0];
  for (const [title, expectedCount] of [
    ['Virtual', 1],
    ['Parent', 2],
    ['Multiple', 2],
  ]) {
    const group = cards.find((node) => node.props.item.title === title);
    const view = fixture.render(TemplateSourceGroupCard, group.props);
    const count = find(view, (node) =>
      node.props.style?.includes?.(templateStyles.sourceGroupCount)
    );
    assert.equal(count.props.children.join(''), `( ${expectedCount} )`);
    assert.ok(find(view, (node) => node.props.style?.some?.((style) => style?.zIndex === -1)));
  }
});

test('source views switch between cards, Kanban and Scrum with scoped notes and heading levels', async () => {
  const fixture = await screens();
  const { TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx');
  const { TemplateHeaderSection } = fixture.load('screens/TemplateHeaderSection.tsx');
  let refreshes = 0;
  let previews = 0;
  const props = {
    templateName: 'Template',
    notebookRoots: ['Book'],
    paddingHorizontal: 16,
    canWrite: true,
    notes: [
      { title: 'Book/Group/One', description: '<h2>One</h2>' },
      { title: 'Book/Other/Two', description: '<h2>Two</h2>' },
    ],
    onPreviewTemplate: () => previews++,
    onWriting: () => {},
    onSelect: () => {},
    onNotesChange: async () => refreshes++,
  };
  const view = () => fixture.render(TemplateSourcesSection, props);
  const icon = (name) => {
    const header = find(view(), (node) => node.type === 'TemplateHeaderSection');
    return find(
      fixture.render(TemplateHeaderSection, header.props),
      (node) => node.type === 'HeaderIconButton' && node.props.name === name
    );
  };
  const board = () => find(view(), (node) => node.type === 'TemplateSourceBoardSection');
  const pressTemplateTitle = () => {
    const header = find(view(), (node) => node.type === 'TemplateHeaderSection');
    const titleHeader = fixture.render(TemplateHeaderSection, header.props);
    assert.equal(icon('file-text-o'), undefined);
    find(titleHeader, (node) => node.type === 'TouchableOpacity').props.onPress();
  };
  assert.equal(board(), undefined);
  pressTemplateTitle();
  assert.equal(previews, 1);
  assert.equal(view().props.style.flex, 1);
  const cardsScroll = find(view(), (node) => node.type === 'ScrollView');
  assert.equal(Object.assign({}, ...cardsScroll.props.contentContainerStyle).paddingHorizontal, 16);
  assert.equal(Object.assign({}, ...cardsScroll.props.contentContainerStyle).paddingBottom, 16);
  icon('columns').props.onPress();
  assert.equal(
    find(view(), (node) => node.type === 'ScrollView'),
    undefined
  );
  assert.equal(view().props.children[0].props.style.paddingHorizontal, 16);
  const boardContainer = find(view(), (node) => node.props.style === templateStyles.sourceBoard);
  assert.equal(boardContainer.props.style.flex, 1);
  assert.equal(boardContainer.props.style.minHeight, 0);
  assert.equal(boardContainer.props.style.height, undefined);
  assert.equal(board().props.option.BOARD_TYPE, 'KANBAN');
  pressTemplateTitle();
  assert.equal(previews, 2);
  assert.equal(board().props.option.BOARD_HEADER_LEVEL, 3);
  assert.deepEqual(board().props.notes, props.notes);
  await board().props.onChange();
  assert.equal(refreshes, 1);
  icon('cog').props.onPress();
  find(view(), (node) => node.type === 'OptionButton' && node.props.title === 'H2').props.onPress();
  assert.equal(board().props.option.BOARD_HEADER_LEVEL, 2);
  icon('trello').props.onPress();
  assert.equal(
    find(view(), (node) => node.type === 'ScrollView'),
    undefined
  );
  assert.equal(board().props.option.BOARD_TYPE, 'SCRUM');
  pressTemplateTitle();
  assert.equal(previews, 3);
  assert.equal(board().props.option.BOARD_HEADER_LEVEL, 2);
  icon('th-large').props.onPress();
  assert.equal(board(), undefined);
  assert.ok(find(view(), (node) => node.type === 'ScrollView'));
  const cards = find(view(), (node) => node.type === 'Suspense').props.children[0];
  cards.find((node) => node.props.item.title === 'Group').props.item.onPress();
  icon('columns').props.onPress();
  assert.deepEqual(board().props.notes, [props.notes[0]]);
  assert.equal(board().props.title, 'Book/Group');
  pressTemplateTitle();
  assert.equal(board(), undefined);
  icon('columns').props.onPress();
  assert.deepEqual(board().props.notes, props.notes);
  assert.equal(board().props.option.BOARD_HEADER_LEVEL, 2);
  assert.equal(fixture.boardChanges.length, 1);
  assert.equal(previews, 3);
  pressTemplateTitle();
  assert.equal(previews, 4);
});

test('groups share corresponding note board settings while keeping other groups and the template root independent', async () => {
  const existing = {
    id: 11,
    title: 'Book/Group',
    description: 'Board metadata',
    option: { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 4 },
  };
  const other = {
    id: 22,
    title: 'Book/Other',
    option: { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 2 },
  };
  const unrelated = {
    id: 33,
    title: 'Another/Group',
    option: { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 6 },
  };
  const fixture = await screens({ boardState: { data: [existing, other, unrelated] } });
  const { TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx');
  const { TemplateHeaderSection } = fixture.load('screens/TemplateHeaderSection.tsx');
  const props = {
    templateName: 'Template',
    notebookRoots: ['Book'],
    canWrite: true,
    notes: [
      { title: 'Book/Group', description: '<p>Parent</p>' },
      { title: 'Book/Group/One' },
      { title: 'Book/Other/Two' },
      { title: 'Book/Virtual/Sub/Only' },
    ],
    onPreviewTemplate: () => {},
    onWriting: () => {},
    onSelect: () => {},
  };
  const view = () => fixture.render(TemplateSourcesSection, props);
  const header = () =>
    fixture.render(
      TemplateHeaderSection,
      find(view(), (node) => node.type === 'TemplateHeaderSection').props
    );
  const icon = (name) => find(header(), (node) => node.props.name === name);
  const root = () => titleButton(header(), 'Template').props.onPress();
  const enter = (name) =>
    find(view(), (node) => node.type === 'Suspense')
      .props.children[0].find((node) => node.props.item.title === name)
      .props.item.onPress();
  const board = () => find(view(), (node) => node.type === 'TemplateSourceBoardSection');
  enter('Group');
  assert.equal(board().props.title, existing.title);
  assert.deepEqual(board().props.option, existing.option);
  assert.deepEqual(board().props.notes, [props.notes[1]]);
  icon('cog').props.onPress();
  find(view(), (node) => node.props.title === 'H5').props.onPress();
  icon('columns').props.onPress();
  const saved = fixture.boardState.data.find((item) => item.id === existing.id);
  assert.deepEqual(saved.option, { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 5 });
  assert.equal(saved.description, existing.description);
  root();
  assert.equal(board(), undefined);
  enter('Other');
  assert.deepEqual(board().props.option, other.option);
  fixture.boardState.data = fixture.boardState.data.map((item) =>
    item.id === other.id
      ? {
          ...item,
          option: { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 6 },
        }
      : item
  );
  assert.deepEqual(board().props.option, { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 6 });
  icon('th-large').props.onPress();
  assert.equal(board(), undefined);
  assert.ok(!fixture.boardState.data.some((item) => item.id === other.id));
  root();
  enter('Group');
  assert.deepEqual(board().props.option, { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 5 });
  icon('th-large').props.onPress();
  icon('columns').props.onPress();
  assert.equal(fixture.boardChanges.at(-1).board.title, existing.title);
  assert.deepEqual(board().props.option, { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 3 });
  root();
  enter('Virtual');
  assert.equal(board(), undefined);
  icon('columns').props.onPress();
  assert.equal(board().props.title, 'Book/Virtual');
  assert.equal(fixture.boardChanges.at(-1).board.title, 'Book/Virtual');
  icon('th-large').props.onPress();
  enter('./Sub');
  icon('trello').props.onPress();
  assert.equal(board().props.title, 'Book/Virtual/Sub');
  assert.equal(fixture.boardChanges.at(-1).board.title, 'Book/Virtual/Sub');
  assert.deepEqual(
    fixture.boardState.data.find((item) => item.id === unrelated.id),
    unrelated
  );
  assert.deepEqual(fixture.saved, []);
});

test('groups retain independent local views when notebook board settings are unavailable', async () => {
  const fixture = await screens({ boardEnabled: false });
  const { TemplateSourcesSection } = fixture.load('screens/TemplateSourcesSection.tsx');
  const props = {
    templateName: 'Template',
    notebookRoots: ['Book'],
    canWrite: true,
    notes: [{ title: 'Book/Group/One' }],
    onPreviewTemplate: () => {},
    onWriting: () => {},
    onSelect: () => {},
  };
  const view = () => fixture.render(TemplateSourcesSection, props);
  const { TemplateHeaderSection } = fixture.load('screens/TemplateHeaderSection.tsx');
  const header = () =>
    fixture.render(
      TemplateHeaderSection,
      find(view(), (node) => node.type === 'TemplateHeaderSection').props
    );
  const icon = (name) => find(header(), (node) => node.props.name === name);
  const enter = () =>
    find(view(), (node) => node.type === 'Suspense')
      .props.children[0].find((node) => node.props.item.title === 'Group')
      .props.item.onPress();
  const board = () => find(view(), (node) => node.type === 'TemplateSourceBoardSection');
  enter();
  icon('trello').props.onPress();
  icon('cog').props.onPress();
  find(view(), (node) => node.props.title === 'H2').props.onPress();
  titleButton(header(), 'Template').props.onPress();
  assert.equal(board(), undefined);
  enter();
  assert.deepEqual(board().props.option, { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 2 });
  assert.deepEqual(fixture.boardChanges, []);
});

test('source boards retain exact note paths, Scrum rows and paragraph moves without unrelated columns', async () => {
  const fixture = await screens();
  const parsed = new Map();
  const makeNote = (title, sections) => {
    const paragraphs = [{ title: '', path: '', level: 0, header: '', description: '' }];
    let row = '';
    for (const [level, heading, description = ''] of sections) {
      if (level === 2) row = Buffer.from(heading).toString('base64');
      const path =
        level === 2
          ? row
          : [row, Buffer.from(heading).toString('base64')].filter(Boolean).join(',');
      paragraphs.push({
        title: heading,
        path,
        level,
        header: `<h${level}>${heading}</h${level}>`,
        description,
      });
    }
    const description = paragraphs.map((p) => p.header + p.description).join('');
    parsed.set(description, paragraphs);
    return { title, description };
  };
  const archive = makeNote('Archive/Items', [
    [2, 'Sprint'],
    [3, 'Done', '<p>Finished</p>'],
  ]);
  const team = makeNote('Team/Items', [
    [3, 'Unassigned', '<p>Unassigned body</p>'],
    [2, 'Sprint'],
    [3, 'Todo', '<p>Pending</p>'],
  ]);
  const loose = makeNote('Loose', [[3, 'Loose task', '<p>Loose body</p>']]);
  let refreshes = 0;
  const { TemplateSourceBoardSection } = fixture.load('screens/TemplateSourceBoardSection.tsx', {
    '@react-navigation/native': {
      useNavigation: () => ({
        push: (screen, params) => fixture.actions.push({ screen, params }),
      }),
    },
    '../../../../screens/main/CardPageSection': {
      useToCardPage: (onPress) => (item) => ({ ...item, onPress: () => onPress(item) }),
      renderCardPage: ({ item }) => ({ type: 'CardPage', props: { item } }),
    },
    '../../../components/Board': 'Board',
    '../../../components/StatusCard': 'StatusCard',
    '../../../components/HeaderSelectBar': {
      parseHtmlToParagraphs: (html) => {
        assert.ok(parsed.has(html), `Unexpected source: ${html}`);
        return parsed.get(html);
      },
      paragraphDescription: (paragraphs, path) =>
        paragraphs.find((p) => p.path === path)?.description || '',
    },
    '../../../components/SearchBar': {
      toNoteParams: (title, paragraph, section) => ({ title, paragraph, section }),
    },
    '../../../hooks/useNoteStorage': {
      useCreateOrUpdatePage: () => ({ mutateAsync: async (note) => fixture.saved.push(note) }),
    },
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({ commonStyles: new Proxy({}, { get: () => ({}) }) }),
    },
    '../../../hooks/useTapDetector': { useTapDetector: () => (single) => single() },
  });
  const props = {
    title: '',
    option: { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 3 },
    notes: [team, archive, loose],
    onChange: async () => refreshes++,
  };
  const board = () =>
    find(fixture.render(TemplateSourceBoardSection, props), (node) => node.type === 'Board');
  const columns = () => board().props.rows[0].columns;
  assert.deepEqual(
    columns().map((c) => c.name),
    ['Archive/Items', 'Loose', 'Team/Items']
  );
  assert.deepEqual(
    columns().map((c) => c.items.map((item) => item.title)),
    [['Done'], ['Loose task'], ['Unassigned', 'Todo']]
  );
  board().props.renderHeader({ item: columns()[0], index: 0 }).props.onPress();
  assert.equal(fixture.actions.at(-1).params.title, archive.title);
  assert.equal(fixture.actions.at(-1).params.board, undefined);
  const card = board().props.renderItem({ item: columns()[2].items[1], index: 0 });
  card.props.children[0].props.item.onPress();
  assert.equal(fixture.actions.at(-1).params.title, team.title);
  assert.equal(fixture.actions.at(-1).params.paragraph, 'Todo');
  props.option = { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 3 };
  const rows = board().props.rows;
  assert.deepEqual(
    rows.map((row) => row.name),
    ['', 'Sprint']
  );
  assert.deepEqual(
    rows[0].columns.map((c) => c.items.map((item) => item.title)),
    [[], ['Loose task'], ['Unassigned']]
  );
  assert.deepEqual(
    rows[1].columns.map((c) => c.items.map((item) => item.title)),
    [['Done'], [], ['Todo']]
  );
  props.option = { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 3 };
  assert.equal(board().props.onEnd(0, 0, 0, 2, 0), true);
  assert.equal(board().props.onEnd(0, 0, 0, 2, 0), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.saved.length, 2);
  assert.equal(fixture.saved[0].title, team.title);
  assert.match(fixture.saved[0].description, /<h3>Done<\/h3><p>Finished<\/p>/);
  assert.match(fixture.saved[0].description, /<h3>Todo<\/h3>/);
  assert.equal(fixture.saved[1].title, archive.title);
  assert.doesNotMatch(fixture.saved[1].description, /Done|Finished/);
  assert.equal(refreshes, 1);
  const sourceHtml = '<h3>Unassigned</h3><p>Unassigned body</p><h2>Sprint</h2>-';
  parsed.set(
    sourceHtml,
    parsed
      .get(team.description)
      .filter((p) => p.title !== 'Todo')
      .map((p) => (p.title === 'Sprint' ? { ...p, description: '-' } : p))
  );
  props.option = { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 3 };
  assert.equal(board().props.onEnd(1, 0, 2, 2, 0), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.saved.length, 3);
  assert.equal(fixture.saved[2].title, team.title);
  assert.equal(fixture.saved[2].isLast, true);
  assert.match(fixture.saved[2].description, /<h3>Todo<\/h3>[\s\S]*<h3>Unassigned<\/h3>/);
  assert.equal(refreshes, 2);
  props.notes = [];
  assert.equal(board(), undefined);
  assert.ok(
    find(fixture.render(TemplateSourceBoardSection, props), (node) => node.type === 'StatusCard')
  );

  const old = {
    ...makeNote('A/Old', [
      [2, 'Alpha'],
      [3, 'Old task'],
    ]),
    updated: '2026-11-01',
  };
  const newest = {
    ...makeNote('Z/Newest', [
      [2, 'Zulu'],
      [3, 'New task'],
      [2, 'Shared'],
      [3, 'New shared'],
      [2, 'Empty'],
    ]),
    updated: '2026-11-05',
  };
  const middle = {
    ...makeNote('M/Middle', [
      [2, 'Beta'],
      [3, 'Mid task'],
      [2, 'Shared'],
      [3, 'Mid shared'],
    ]),
    updated: '2026-11-03',
  };
  const missing = makeNote('B/Missing', [
    [2, 'Gamma'],
    [3, 'Missing date'],
  ]);
  const invalid = {
    ...makeNote('C/Invalid', [
      [2, 'Gamma'],
      [3, 'Invalid date'],
    ]),
    updated: 'invalid',
  };
  props.notes = [old, missing, newest, invalid, middle];
  props.option = { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 3 };
  assert.deepEqual(
    columns().map((column) => column.name),
    [newest.title, middle.title, old.title, missing.title, invalid.title]
  );
  props.option = { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 3 };
  const sortedRows = board().props.rows;
  assert.deepEqual(
    sortedRows.map((row) => row.name),
    ['Shared', 'Zulu', 'Beta', 'Alpha', '', 'Empty', 'Gamma']
  );
  for (const row of sortedRows) {
    assert.deepEqual(
      row.columns.map((column) => column.name),
      [newest.title, middle.title, old.title, missing.title, invalid.title]
    );
  }
  assert.equal(
    board().props.onEnd(
      sortedRows.findIndex((row) => row.name === 'Alpha'),
      sortedRows.findIndex((row) => row.name === 'Beta'),
      2,
      1,
      0
    ),
    true
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.saved.at(-2).title, middle.title);
  assert.match(fixture.saved.at(-2).description, /<h2>Beta<\/h2>[\s\S]*<h3>Old task<\/h3>/);
  assert.equal(fixture.saved.at(-1).title, old.title);
  assert.doesNotMatch(fixture.saved.at(-1).description, /Old task/);

  const groupTitle = 'Book/Meetings';
  const step10 = {
    ...makeNote(groupTitle + '/Step 10', [
      [2, 'Sprint'],
      [3, 'Ten'],
    ]),
    updated: '2026-11-05',
  };
  const step2 = {
    ...makeNote(groupTitle + '/Step 2', [
      [2, 'Sprint'],
      [3, 'Two'],
    ]),
    updated: '2026-11-01',
  };
  const nested = {
    ...makeNote(groupTitle + '/Archive/Item', [
      [2, 'Sprint'],
      [3, 'Archived'],
    ]),
    updated: '2026-11-03',
  };
  props.title = groupTitle;
  props.notes = [step10, step2, nested];
  for (const type of ['KANBAN', 'SCRUM']) {
    props.option = { BOARD_TYPE: type, BOARD_HEADER_LEVEL: 3 };
    for (const row of board().props.rows) {
      assert.deepEqual(
        row.columns.map((column) => column.name),
        ['Archive/Item', 'Step 2', 'Step 10']
      );
    }
  }
  const groupRow = board().props.rows.find((row) => row.name === 'Sprint');
  board().props.renderHeader({ item: groupRow.columns[1], index: 1 }).props.onPress();
  assert.equal(fixture.actions.at(-1).params.title, step2.title);
  const rowIndex = board().props.rows.findIndex((row) => row.name === 'Sprint');
  assert.equal(board().props.onEnd(rowIndex, rowIndex, 1, 2, 0), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.saved.at(-2).title, step10.title);
  assert.equal(fixture.saved.at(-1).title, step2.title);
});

test('a missing-note tag passes its full path and opens sources before prefilling the writing form', async () => {
  const noteTitle = 'Team/Meetings/New';
  const fixture = await screens({ fromNote: true, noteTitle });
  const TagSection = fixture.load('screens/TemplateTagSection.tsx').default;
  await find(
    fixture.render(TagSection, { title: noteTitle, paragraphs: [] }),
    (node) => node.type === 'TouchableOpacity'
  ).props.onPress();
  assert.deepEqual(fixture.actions[0], {
    method: 'push',
    screen: 'TemplateItem',
    params: await template.templateLinkParams(candidate, [], noteTitle),
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplateSourcesSection').props.onPreviewTemplate();
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  const form = find(view(), (node) => node.type === 'TemplateWriteSection').props.form;
  assert.equal(form.titleTemplateId, null);
  assert.equal(form.noteTitle, noteTitle);
  assert.equal(form.resolvedTitle, noteTitle);
});

test('resizing both table axes survives preview transitions and saves exactly the live preview', async () => {
  const fixture = await screens({
    selectedTemplate: {
      ...candidate,
      markdown: [
        '| ID | Sprint 1 | Sprint 2 |',
        '| --- | --- | --- |',
        '| REQ-000 | {{REQ-000 · Sprint 1}} | {{REQ-000 · Sprint 2}} |',
        '| REQ-001 | {{REQ-001 · Sprint 1}} | {{REQ-001 · Sprint 2}} |',
      ].join('\n'),
    },
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  const writing = () => find(view(), (node) => node.type === 'TemplateWriteSection');
  writing().props.form.onChooseTitle(null);
  writing().props.form.onChangeTitle('Team/Requirements/New');
  const groups = writing().props.form.tables[0].groups;
  const rows = groups.find((group) => group.axis === 'row');
  const columns = groups.find((group) => group.axis === 'column');
  writing().props.form.onChangeValue('REQ-001 · Sprint 2', 'Preserved value');
  writing().props.form.onChangeTable(rows.id);
  writing().props.form.onChangeTable(columns.id);
  const newCell = writing().props.form.tables[0].rows.at(-1).cells.at(-1).variables[0];
  writing().props.form.onChangeValue(newCell, 'New intersection | value');
  writing().props.form.onChangeTableColumn(columns.id, 2, 'Review | Result');
  writing().props.form.onChangeTable(rows.id, 0);
  writing().props.form.onChangeTable(columns.id, 0);
  const html = writing().props.templateHtml;
  assert.match(html, /REQ-002/);
  assert.match(html, /<th>Review \| Result<\/th>/);
  assert.match(html, /Preserved value/);
  assert.match(html, /New intersection \| value/);
  assert.doesNotMatch(html, /REQ-000|Sprint 1/);
  assert.equal((html.match(/<td>/g) || []).length, 6);
  writing().props.onPreview();
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  assert.equal(writing().props.templateHtml, html);
  await writing().props.onSave();
  assert.deepEqual(fixture.saved, [
    { title: 'Team/Requirements/New', description: html, createOnly: true },
  ]);
});

test('writing toggles the body form and content preview exclusively while keeping title, table inputs and saving available', async () => {
  const fixture = await screens({
    selectedTemplate: {
      ...candidate,
      markdown:
        candidate.markdown +
        '\n\n| ID | Value |\n| --- | --- |\n| REQ-000 | {{Value 0}} |\n| REQ-001 | {{Value 1}} |',
    },
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  const view = fixture.workspace(TemplateItemScreen);
  find(view(), (node) => node.type === 'TemplatePreviewSection').props.onWriting();
  const writing = () => find(view(), (node) => node.type === 'TemplateWriteSection');
  writing().props.form.onChooseTitle(null);
  writing().props.form.onChangeTitle('Meetings/New');
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
    (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Agenda'
  ).props.onChangeText('Review decisions');
  const table = find(body(), (node) => node.type === 'TemplateTableForm');
  table.props.onChangeValue('Value 1', 'Kept cell');
  table.props.onChangeTable(table.props.table.groups[0].id);
  assert.equal(
    find(body(), (node) => node.props.accessibilityLabel === 'save').props.disabled,
    false
  );
  tab('Content preview').props.onPress();
  assert.equal(tab('Content preview').props.accessibilityState.selected, true);
  assert.equal(
    find(body(), (node) => node.type === 'TemplateTableForm'),
    undefined
  );
  assert.equal(
    find(body(), (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Agenda'),
    undefined
  );
  assert.equal(titleInput().props.value, 'Meetings/New');
  let preview = find(body(), (node) => node.type === 'EditorViewer');
  assert.match(preview.props.value, /Review decisions/);
  assert.match(preview.props.value, /Kept cell/);
  assert.match(preview.props.value, /REQ-002/);
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
    find(body(), (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Agenda')
      .props.value,
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
    (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Agenda'
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
  await find(body(), (node) => node.props.accessibilityLabel === 'save').props.onPress();
  assert.deepEqual(fixture.saved, [
    { title: 'Meetings/New', description: preview.props.value, createOnly: true },
  ]);
});

test('title warnings show an icon while saving stays guarded and cancel returns to preview', async () => {
  const ko = require('../../../lang/ko.json');
  const fixture = await screens({ translations: ko });
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
  const reason = (tree) => {
    const warning = find(tree, (node) => node.props.accessibilityRole === 'alert');
    if (!warning) return undefined;
    assert.ok(find(warning, (node) => node.props.source === 'alert-circle-outline'));
    return textContent(warning);
  };
  const save = (tree) => find(tree, (node) => node.props.accessibilityLabel === ko.save);
  assert.equal(save(body()).props.disabled, true);
  assert.equal(save(body()).props.onPress, undefined);
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
  input.props.onChangeText('Team/Bad?Name');
  assert.match(reason(body()), /사용할 수 없는 문자/);
  assert.equal(save(body()).props.disabled, true);
  input.props.onChangeText('Team/New');
  assert.equal(reason(body()), undefined);
  assert.equal(save(body()).props.disabled, false);
  assert.equal(reason(body({}, { busy: true })), undefined);
  assert.equal(save(body({}, { busy: true })).props.disabled, true);
  assert.equal(reason(body({ templateHtml: '' })), undefined);
  assert.equal(save(body({ templateHtml: '' })).props.disabled, true);
  const title = {
    id: 'title',
    pattern: 'Note {{날짜}}-{{번호}}',
    path: '',
    variables: ['날짜', '번호'],
    sourceTitles: [],
  };
  const form = {
    titleTemplates: [title],
    titleTemplateId: 'title',
    values: {},
    resolvedTitle: null,
  };
  assert.match(reason(body({}, form)), /필수 제목 항목.*날짜, 번호/);
  assert.equal(save(body({}, form)).props.disabled, true);
  form.values = { 날짜: '2026-10-17', 번호: '../Invalid' };
  assert.match(reason(body({}, form)), /사용할 수 없는 문자.*번호/);
  assert.equal(save(body({}, form)).props.disabled, true);
  assert.equal(
    reason(body({ error: new Error('Could not create note.') })),
    ko['Could not create note.']
  );
  find(body(), (node) => node.props.accessibilityLabel === ko.cancel).props.onPress();
  assert.ok(find(view(), (node) => node.type === 'TemplatePreviewSection'));
  assert.deepEqual(fixture.saved, []);
});

test('opening an item without a selected template returns to the list', async () => {
  const fixture = await screens({ missingTemplate: true });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  fixture.render(TemplateItemScreen);
  assert.deepEqual(fixture.actions, [
    { method: 'navigate', screen: 'TemplateList', params: undefined },
  ]);
});

test('a scalar template link waits for fresh sources and resolves the current candidate', async () => {
  const fixture = await screens({
    routeParams: await template.templateLinkParams(candidate),
    sourceState: { data: undefined, isLoading: true, isFetching: true, isFetchedAfterMount: false },
  });
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  let tree = fixture.render(TemplateItemScreen);
  assert.ok(find(tree, (node) => node.type === 'LoadingView'));
  assert.equal(
    find(tree, (node) => typeof node.type === 'function'),
    undefined
  );
  assert.deepEqual(fixture.actions, []);
  const fresh = {
    ...candidate,
    name: 'Current name',
    sourceTitles: [...candidate.sourceTitles, 'Team/Meetings/New'],
  };
  fixture.catalog.templates = [fresh];
  Object.assign(fixture.data.examples, {
    data: fresh.sourceTitles.map((title) => ({ title, description: '<h2>Agenda</h2>' })),
    isLoading: false,
    isFetching: false,
    isFetchedAfterMount: true,
  });
  tree = fixture.render(TemplateItemScreen);
  const workspace = find(tree, (node) => typeof node.type === 'function');
  assert.equal(workspace.props.initialTemplate, fresh);
  assert.deepEqual(fixture.actions, []);
});

test('asynchronous link checks retain drafts during refresh, isolate scopes and expose checksum failures for retry', async () => {
  const fixture = await screens();
  let options;
  let queryRetries = 0;
  let sourceRetries = 0;
  const response = {
    data: undefined,
    isLoading: true,
    isFetching: true,
    isSuccess: false,
    isError: false,
    refetch: () => queryRetries++,
  };
  fixture.data.examples.refetch = () => sourceRetries++;
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx', {
    'react-query': {
      useQuery: (value) => {
        options = value;
        return response;
      },
    },
  });
  let tree = fixture.render(TemplateItemScreen);
  assert.ok(find(tree, (node) => node.type === 'LoadingView'));
  assert.deepEqual(fixture.actions, []);
  response.data = await options.queryFn();
  Object.assign(response, { isLoading: false, isFetching: false, isSuccess: true });
  tree = fixture.render(TemplateItemScreen);
  const workspace = find(tree, (node) => typeof node.type === 'function');
  assert.equal(workspace.props.initialTemplate, fixture.catalog.templates[0]);
  response.isFetching = true;
  fixture.data.examples.dataUpdatedAt = 2;
  tree = fixture.render(TemplateItemScreen);
  const refreshing = find(tree, (node) => typeof node.type === 'function');
  assert.equal(refreshing.type, workspace.type);
  assert.equal(refreshing.props.key, workspace.props.key);
  assert.equal(refreshing.props.resolving, true);
  fixture.data.scope = 'local:2:normal';
  tree = fixture.render(TemplateItemScreen);
  assert.equal(
    find(tree, (node) => typeof node.type === 'function'),
    undefined
  );
  assert.ok(find(tree, (node) => node.type === 'LoadingView'));
  const digest = globalThis.crypto.subtle.digest;
  try {
    globalThis.crypto.subtle.digest = async () => {
      throw new Error('Digest failed');
    };
    await assert.rejects(options.queryFn(), /Digest failed/);
  } finally {
    globalThis.crypto.subtle.digest = digest;
  }
  Object.assign(response, { data: undefined, isFetching: false, isSuccess: false, isError: true });
  const status = find(fixture.render(TemplateItemScreen), (node) => node.type === 'StatusCard');
  status.props.onButtonPress();
  assert.equal(sourceRetries, 1);
  assert.equal(queryRetries, 1);
  assert.deepEqual(fixture.actions, []);
});

test('unmatched links redirect only after scoped fetching finishes and read errors can retry', async () => {
  const fixture = await screens({ sourceState: { isFetching: true, isFetchedAfterMount: false } });
  fixture.catalog.templates = [];
  const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
  fixture.render(TemplateItemScreen);
  assert.deepEqual(fixture.actions, []);
  fixture.data.examples.isFetchedAfterMount = true;
  fixture.render(TemplateItemScreen);
  assert.deepEqual(fixture.actions, []);
  fixture.data.examples.isFetching = false;
  fixture.render(TemplateItemScreen);
  assert.deepEqual(fixture.actions, [
    { method: 'navigate', screen: 'TemplateList', params: undefined },
  ]);
  const failed = await screens({ sourceState: { data: undefined, isError: true } });
  const Screen = failed.load('screens/TemplateItemScreen.tsx').TemplateItemScreen;
  let retries = 0;
  failed.data.examples.refetch = () => retries++;
  const status = find(failed.render(Screen), (node) => node.type === 'StatusCard');
  assert.equal(status.props.buttonTitle, 'Retry');
  status.props.onButtonPress();
  assert.equal(retries, 1);
  assert.deepEqual(failed.actions, []);
});

test('changing notebook, account or privacy scope cannot reuse the previous template snapshot', async () => {
  for (const scope of ['local:2:normal', 'user:2:1:normal', 'local:1:private']) {
    const fixture = await screens();
    const { TemplateItemScreen } = fixture.load('screens/TemplateItemScreen.tsx');
    assert.ok(find(fixture.render(TemplateItemScreen), (node) => typeof node.type === 'function'));
    fixture.data.scope = scope;
    Object.assign(fixture.data.examples, {
      data: undefined,
      isFetching: true,
      isFetchedAfterMount: false,
    });
    assert.equal(
      find(fixture.render(TemplateItemScreen), (node) => typeof node.type === 'function'),
      undefined
    );
    assert.deepEqual(fixture.actions, []);
    fixture.catalog.templates = [];
    Object.assign(fixture.data.examples, {
      data: [],
      isFetching: false,
      isFetchedAfterMount: true,
    });
    fixture.render(TemplateItemScreen);
    assert.deepEqual(fixture.actions, [
      { method: 'navigate', screen: 'TemplateList', params: undefined },
    ]);
  }
});

test('malformed template links return to the list before mounting a workspace', async () => {
  const valid = await template.templateLinkParams(candidate);
  for (const routeParams of [
    null,
    {},
    { template: candidate },
    { template: '[object Object]' },
    { ...valid, template: 'stale-template-id' },
    { ...valid, template: 'f'.repeat(63) },
    { ...valid, template: [] },
    { ...valid, group: undefined },
    { ...valid, group: 'unknown' },
    { ...valid, group: [] },
  ]) {
    const fixture = await screens({ routeParams });
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

test('an invalid restored note title returns to the list instead of reaching string operations', async () => {
  const fixture = await screens({ noteTitle: 42 });
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

const body = '<h2>Agenda</h2><p>One</p><h2>Actions</h2><p>Two</p>';
const note = (title, description = body) => ({ title, description });
const sources = ['Teams/One', 'Teams/Two', 'Archive/One', 'Archive/Two'].map((title) =>
  note(title)
);

test('content checksums use SHA-256 and normalize Unicode and line endings', async () => {
  const markdown = '## 회의록\n\n{{Agenda}}';
  assert.equal(
    await templateChecksum(markdown),
    createHash('sha256').update(markdown).digest('hex')
  );
  assert.equal(
    await templateChecksum('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.equal(
    await templateChecksum(' \n' + markdown.normalize('NFD').replaceAll('\n', '\r\n') + '\n'),
    await templateChecksum(markdown)
  );
  assert.notEqual(
    await templateChecksum(markdown + '\n\n## Results'),
    await templateChecksum(markdown)
  );
  assert.notEqual(await templateChecksum('A\n\nB'), await templateChecksum('A\nB'));
});

test('equal bodies share a checksum but different source groups resolve independently', async () => {
  const templates = discoverTemplates(sources);
  assert.equal(templates.length, 2);
  assert.equal(
    await templateChecksum(templates[0].canonicalMarkdown),
    await templateChecksum(templates[1].canonicalMarkdown)
  );
  const links = await Promise.all(templates.map((template) => templateLinkParams(template)));
  assert.notEqual(links[0].group, links[1].group);
  for (let index = 0; index < links.length; index++) {
    assert.equal(await resolveTemplateLink(templates, links[index]), templates[index]);
    assert.deepEqual(
      await templateLinkParams({ ...templates[index], name: 'Renamed' }),
      links[index]
    );
  }
  assert.equal(
    await resolveTemplateLink(templates, { ...links[0], group: '0'.repeat(64) }),
    undefined
  );
  assert.equal(
    await resolveTemplateLink(templates, { ...links[0], template: '0'.repeat(64) }),
    undefined
  );
  assert.equal(await resolveTemplateLink([], links[0]), undefined);
});

test('source keys survive note additions, ordering and notebook-root aliases', async () => {
  assert.equal(
    await templateGroupKey(['Team/One', 'Team/Two']),
    await templateGroupKey(['Team/New', 'Team/Two', 'Team/One'])
  );
  assert.equal(
    await templateGroupKey(['노트북/팀/첫째', 'Local/팀/둘째'], ['노트북', 'Local']),
    await templateGroupKey(['팀/셋째'.normalize('NFD')])
  );
  assert.equal(await templateGroupKey(['One', 'Two']), await templateGroupKey(['Three', 'Four']));
  assert.notEqual(await templateGroupKey(['Team/One']), await templateGroupKey(['Other/One']));
  assert.notEqual(
    await templateGroupKey(['Team/One']),
    await templateGroupKey(['Loose', 'Team/One'])
  );
  const templates = discoverTemplates(sources);
  const link = await templateLinkParams(
    templates.find((item) => item.sourceTitles.includes('Teams/One'))
  );
  const refreshed = discoverTemplates([...sources, note('Teams/New')].reverse());
  assert.ok((await resolveTemplateLink(refreshed, link)).sourceTitles.includes('Teams/New'));
});

test('localized date placeholders do not change the content identity', async () => {
  const notes = [note('One', '<p>2026-01-01</p>' + body), note('Two', '<p>2026-02-02</p>' + body)];
  const [english] = discoverTemplates(notes, 'Date');
  const [korean] = discoverTemplates(notes, '날짜');
  assert.notEqual(english.markdown, korean.markdown);
  assert.equal(
    await templateChecksum(english.canonicalMarkdown),
    await templateChecksum(korean.canonicalMarkdown)
  );
  assert.deepEqual(await templateLinkParams(english), await templateLinkParams(korean));
});

test('URL generation and parsing restore the exact template from freshly discovered sources', async () => {
  const templates = discoverTemplates(sources);
  const selected = templates.find((item) => item.sourceTitles.includes('Archive/One'));
  const params = await templateLinkParams(selected, [], '팀/새 문서');
  const config = { screens: { TemplateItem: 'blacktokki-notebook/templates/item' } };
  const path = getPathFromState({ routes: [{ name: 'TemplateItem', params }] }, config);
  const query = new URLSearchParams(path.split('?')[1]);
  assert.match(query.get('template'), /^[a-f0-9]{64}$/);
  assert.match(query.get('group'), /^[a-f0-9]{64}$/);
  assert.equal(query.get('noteTitle'), '팀/새 문서');
  assert.equal(query.size, 3);
  assert.ok(!path.includes('object'));
  const restored = getStateFromPath(path, config).routes.at(-1).params;
  assert.ok(validateTemplateNavigationParams(restored));
  assert.deepEqual(restored, params);
  assert.deepEqual(
    (await resolveTemplateLink(discoverTemplates(sources), restored)).sourceTitles,
    selected.sourceTitles
  );
  const changed = sources.map((source) => note(source.title, body + '<h2>Results</h2>'));
  assert.equal(await resolveTemplateLink(discoverTemplates(changed), restored), undefined);
  assert.equal(
    await resolveTemplateLink(templates, {
      ...params,
      template: params.template.toUpperCase(),
      group: params.group.toUpperCase(),
    }),
    selected
  );
});
