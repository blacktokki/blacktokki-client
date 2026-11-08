const domino = require('@mixmark-io/domino');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const loadTs = require('./loadTs.cjs');

const DOMParser = class {
  parseFromString(html) {
    return domino.createWindow(html).document;
  }
};
global.DOMParser = DOMParser;
const markdown = loadTs('../../../../../packages/blacktokki-editor/src/lib/markdown.ts');
const dependencies = {
  react: {},
  '@blacktokki/account': {},
  '@blacktokki/editor': {
    toHtml: markdown.renderer,
    toMarkdown: markdown.parser,
    toRaw: markdown.toRaw,
  },
  'react-query': {},
  '../../hooks/useUsageMode': {},
  '../../services/notebook': {},
  '../../services/storage': {},
};
const sheet = loadTs('useTemplateSheet.ts', dependencies);
const table = (headers, rows) =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
const rowTemplate =
  '## Tasks\n\n' +
  table(
    ['ID', 'Description', 'Owner'],
    [
      ['REQ-000', '{{D0}}', '{{O0}}'],
      ['REQ-001', '{{D1}}', '{{O1}}'],
    ]
  );
const note = (title, body) => ({ title, description: markdown.renderer(body) });
const rowNote = (headers, rows) => note('Tasks/One', '## Tasks\n\n' + table(headers, rows));
const [rowGroup] = sheet.sheetRepeatGroups(rowTemplate);
const complete = sheet.templateSheetRow(
  rowTemplate,
  rowNote(
    ['ID', 'Description', 'Owner'],
    [
      ['REQ-000', 'Original', 'Alice'],
      ['REQ-001', 'Second', 'Bob'],
      ['REQ-002', 'Third', 'Carol'],
    ]
  )
);
const descriptionCell = sheet.sheetRepeatItems(rowTemplate, complete, rowGroup)[0].cells[0];
const cellValues = (template, row, group) =>
  sheet.sheetRepeatItems(template, row, group).map((item) => item.cells.map((cell) => cell.value));

test('editing an empty repeat cell creates only the edited note’s missing items', () => {
  const source = rowNote(['ID', 'Description', 'Owner'], [['REQ-000', '**Keep**', 'Alice']]);
  const original = sheet.templateSheetRow(rowTemplate, source);
  assert.equal(
    sheet.editSheetRepeatCell(rowTemplate, original, rowGroup, 2, descriptionCell, 0, ''),
    original
  );
  assert.deepEqual(sheet.sheetChanges(rowTemplate, [original, complete]), []);
  let edited = sheet.editSheetRepeatCell(
    rowTemplate,
    original,
    rowGroup,
    2,
    descriptionCell,
    0,
    'New **value**'
  );
  assert.deepEqual(cellValues(rowTemplate, edited, rowGroup), [
    ['**Keep**', 'Alice'],
    ['', ''],
    ['New **value**', ''],
  ]);
  edited = sheet.editSheetRepeatCell(
    rowTemplate,
    edited,
    rowGroup,
    2,
    descriptionCell,
    0,
    'Changed again'
  );
  assert.equal(cellValues(rowTemplate, edited, rowGroup)[2][0], 'Changed again');
  assert.equal(sheet.sheetRepeatItems(rowTemplate, original, rowGroup).length, 1);
  assert.equal(sheet.renderSheetRow(rowTemplate, complete), complete.original.description);
  assert.equal(sheet.sheetChanges(rowTemplate, [edited, complete]).length, 1);
});

test('an absent repeat table can be edited while unrelated content stays intact', () => {
  const original = sheet.templateSheetRow(
    rowTemplate,
    note(
      'Tasks/Missing',
      '## Other\n\nPrivate content\n\n' + table(['Private', 'Data'], [['Keep', '**rich**']])
    )
  );
  const edited = sheet.editSheetRepeatCell(
    rowTemplate,
    original,
    rowGroup,
    0,
    descriptionCell,
    0,
    'Added'
  );
  const document = new DOMParser().parseFromString(sheet.renderSheetRow(rowTemplate, edited));
  assert.equal(document.querySelectorAll('table').length, 2);
  assert.match(document.body.innerHTML, /Private content/);
  assert.match(document.body.innerHTML, /<strong>rich<\/strong>/);
  assert.deepEqual(cellValues(rowTemplate, edited, rowGroup), [['Added', '']]);
});

test('partial and reordered source columns match by label and retain existing values', () => {
  const original = sheet.templateSheetRow(
    rowTemplate,
    rowNote(['ID', 'Owner'], [['REQ-000', '**Alice**']])
  );
  assert.equal(sheet.sheetRepeatItems(rowTemplate, original, rowGroup).length, 1);
  const edited = sheet.editSheetRepeatCell(
    rowTemplate,
    original,
    rowGroup,
    0,
    descriptionCell,
    0,
    'Restored field'
  );
  assert.equal(
    new DOMParser()
      .parseFromString(sheet.renderSheetRow(rowTemplate, edited))
      .querySelectorAll('table').length,
    1
  );
  assert.deepEqual(cellValues(rowTemplate, edited, rowGroup), [['Restored field', '**Alice**']]);
  const reordered = sheet.templateSheetRow(
    rowTemplate,
    rowNote(['ID', 'Owner', 'Description'], [['REQ-000', 'Alice', 'Old']])
  );
  const changed = sheet.editSheetRepeatCell(
    rowTemplate,
    reordered,
    rowGroup,
    0,
    descriptionCell,
    0,
    'New'
  );
  assert.deepEqual(cellValues(rowTemplate, changed, rowGroup), [['Alice', 'New']]);
});

test('a ragged source row receives its missing cell without duplicating its field', () => {
  const original = sheet.templateSheetRow(rowTemplate, {
    title: 'Tasks/One',
    description:
      '<h2>Tasks</h2><table><tr><th>ID</th><th>Description</th><th>Owner</th></tr><tr><td>REQ-000</td></tr></table>',
  });
  const edited = sheet.editSheetRepeatCell(
    rowTemplate,
    original,
    rowGroup,
    0,
    descriptionCell,
    0,
    'Restored'
  );
  const document = new DOMParser().parseFromString(sheet.renderSheetRow(rowTemplate, edited));
  assert.equal(document.querySelectorAll('th').length, 3);
  assert.equal(cellValues(rowTemplate, edited, rowGroup)[0][0], 'Restored');
});

test('column repeats restore missing fixed rows and missing note columns', () => {
  const template =
    '## Metrics\n\n' +
    table(
      ['Metric', 'Sprint 1', 'Sprint 2'],
      [
        ['Owner', '{{O1}}', '{{O2}}'],
        ['Result', '{{R1}}', '{{R2}}'],
      ]
    );
  const [group] = sheet.sheetRepeatGroups(template);
  const full = sheet.templateSheetRow(
    template,
    note(
      'Metrics/Full',
      '## Metrics\n\n' +
        table(
          ['Metric', 'Sprint 1', 'Sprint 2'],
          [
            ['Owner', 'Alice', 'Bob'],
            ['Result', 'Done', 'Ready'],
          ]
        )
    )
  );
  const exemplar = sheet
    .sheetRepeatItems(template, full, group)[0]
    .cells.find((cell) => cell.label === 'Result');
  const partial = sheet.templateSheetRow(
    template,
    note('Metrics/One', '## Metrics\n\n' + table(['Metric', 'Sprint 1'], [['Owner', '**Keep**']]))
  );
  let edited = sheet.editSheetRepeatCell(template, partial, group, 0, exemplar, 0, 'New result');
  assert.deepEqual(cellValues(template, edited, group)[0], ['Sprint 1', '**Keep**', 'New result']);
  edited = sheet.editSheetRepeatCell(template, edited, group, 1, exemplar, 0, 'Second result');
  assert.deepEqual(cellValues(template, edited, group)[1], ['Sprint 2', '', 'Second result']);
});

test('missing intersections of two repeat axes are created in the same table', () => {
  const template =
    '## Matrix\n\n' +
    table(
      ['ID', 'Sprint 1', 'Sprint 2'],
      [
        ['REQ-000', '{{A}}', '{{B}}'],
        ['REQ-001', '{{C}}', '{{D}}'],
      ]
    );
  const groups = sheet.sheetRepeatGroups(template);
  const rows = groups.find((group) => group.group.axis === 'row');
  const columns = groups.find((group) => group.group.axis === 'column');
  const full = sheet.blankSheetRow(template, 'new');
  const exemplar = sheet.sheetRepeatItems(template, full, rows)[0].cells[1];
  const partial = sheet.templateSheetRow(
    template,
    note('Matrix/One', '## Matrix\n\n' + table(['ID', 'Sprint 1'], [['REQ-000', '**Keep**']]))
  );
  const edited = sheet.editSheetRepeatCell(template, partial, rows, 1, exemplar, 0, 'Intersection');
  assert.equal(sheet.sheetRepeatItems(template, edited, rows).length, 2);
  assert.equal(sheet.sheetRepeatItems(template, edited, columns).length, 2);
  assert.deepEqual(cellValues(template, edited, rows), [
    ['**Keep**', ''],
    ['', 'Intersection'],
  ]);
});

function fixture(props, platform = 'web') {
  const slots = [];
  let updates = 0;
  let cursor = 0;
  let effects = [];
  let windowSize = 'landscape';
  const same = (a, b) =>
    a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value) => {
          const next = typeof value === 'function' ? value(slots[index]) : value;
          if (!Object.is(next, slots[index])) updates++;
          slots[index] = next;
        },
      ];
    },
    useMemo: (fn, deps) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useEffect: (fn, deps) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const old = slots[index];
        slots[index] = { deps };
        effects.push(() => {
          old?.cleanup?.();
          slots[index].cleanup = fn();
        });
      }
    },
  };
  react.useRef = (value) => react.useState({ current: value })[0];
  react.useLayoutEffect = react.useEffect;
  const native = Object.fromEntries(
    [
      'ActivityIndicator',
      'FlatList',
      'ScrollView',
      'Text',
      'TextInput',
      'TouchableOpacity',
      'View',
    ].map((name) => [name, name])
  );
  const Component = loadTs('screens/TemplateSheetSection.tsx', {
    ...dependencies,
    react,
    'react-native': {
      ...native,
      Platform: { OS: platform },
      StyleSheet: { create: (value) => value },
    },
    'react-native-paper': { Icon: 'Icon' },
    '@blacktokki/account': { useAuthContext: () => ({ auth: { isLocal: true, user: { id: 1 } } }) },
    '@blacktokki/core': {
      useLangContext: () => ({ lang: (value) => value }),
      useResizeContext: () => windowSize,
    },
    '../../hooks/useUsageMode': { useUsageMode: () => ({ notebook: { id: 7 } }) },
    '../../../hooks/useNotebookTheme': {
      useNotebookTheme: () => ({
        commonStyles: new Proxy(
          {
            container: { paddingHorizontal: 24 },
            input: { borderColor: '#ccc' },
            card: { backgroundColor: '#fff' },
          },
          { get: (object, key) => object[key] || {} }
        ),
      }),
    },
    './TemplateHeaderSection': { TemplateHeaderSection: 'TemplateHeaderSection' },
    'react-query': {
      useQueryClient: () => ({ invalidateQueries: async () => {} }),
      useMutation: (options) => ({ mutateAsync: options.mutationFn }),
    },
  }).TemplateSheetSection;
  const render = () => {
    cursor = 0;
    effects = [];
    const result = Component({
      templateName: 'Tasks',
      onCancel() {},
      onCatalog() {},
      onSaved() {},
      ...props,
    });
    effects.forEach((effect) => effect());
    return result;
  };
  const all = (node, predicate) =>
    !node || typeof node !== 'object'
      ? []
      : [
          ...(predicate(node) ? [node] : []),
          ...(node.props?.children || []).flat().flatMap((child) => all(child, predicate)),
        ];
  const style = (node) =>
    Object.assign(
      {},
      ...(Array.isArray(node.props.style) ? node.props.style : [node.props.style]).filter(Boolean)
    );
  return {
    render,
    all,
    style,
    updates: () => updates,
    resize: (size) => {
      windowSize = size;
    },
    dispose: () => slots.forEach((slot) => slot?.cleanup?.()),
  };
}

for (const platform of ['web', 'ios']) {
  test(`${platform} viewport changes within a virtual column preserve state and pending edits`, () => {
    const template = '## G\n\n' + table(['A'], [['{{A}}']]);
    const notes = Array.from({ length: 8 }, (_, index) =>
      note(`Tasks/${index}`, '## G\n\n' + table(['A'], [['Original']]))
    );
    const ui = fixture({ markdown: template, notes, allNotes: notes }, platform);
    const viewport = () =>
      ui.all(ui.render(), (node) => node.props.onLayout && node.props.onScroll)[0];
    const layout = (width) => {
      const node = viewport();
      const before = ui.updates();
      node.props.onLayout({ nativeEvent: { layout: { width, height: 400 } } });
      return ui.updates() - before;
    };
    try {
      assert.equal(layout(701), 1);
      for (const width of [701, 702, 750, 839.5, 840]) assert.equal(layout(width), 0);
      assert.equal(layout(841), 1);
      assert.equal(layout(842), 0);
      ui.resize('portrait');
      assert.equal(layout(601), 1);
      assert.equal(layout(799), 0);
      assert.equal(layout(801), 1);
      if (platform === 'web') {
        const findCell = () =>
          ui.all(
            ui.render(),
            (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Tasks/0: A'
          )[0];
        findCell().props.onChangeText('Pending edit');
        layout(1001);
        assert.equal(findCell().props.value, 'Pending edit');
        viewport().props.onScroll({ currentTarget: { scrollLeft: 600 } });
        const headers = ui.all(
          ui.render(),
          (node) => node.props.role === 'columnheader' && node.props.key
        );
        assert(headers.some((node) => node.props.key === 'Tasks/7'));
      }
    } finally {
      ui.dispose();
    }
  });
}

test('empty alignment cells render editable inputs and retain their identity after editing', () => {
  const notes = [
    complete.original,
    rowNote(['ID', 'Description', 'Owner'], [['REQ-000', 'Keep', 'Alice']]),
  ];
  notes[1] = { ...notes[1], title: 'Tasks/Two' };
  const ui = fixture({ markdown: rowTemplate, notes, allNotes: notes });
  try {
    const find = () =>
      ui.all(
        ui.render(),
        (node) =>
          node.type === 'TextInput' &&
          node.props.accessibilityLabel === 'Tasks/Two: Tasks · 3 · Description'
      )[0];
    const empty = find();
    assert.equal(empty.props.value, '');
    assert.equal(empty.props.editable, true);
    empty.props.onChangeText('Added from empty cell');
    const edited = find();
    assert.equal(edited.props.value, 'Added from empty cell');
    assert.equal(edited.props.key, empty.props.key);
  } finally {
    ui.dispose();
  }
});

test('orientation changes cell widths and header limits, including the first header label', () => {
  const template = '## G\n\n' + table(['A', 'B'], [['{{A}}', '{{B}}']]);
  const notes = [note('Tasks/One', '## G\n\n' + table(['A', 'B'], [['a', 'b']]))];
  const ui = fixture({ markdown: template, notes, allNotes: notes });
  try {
    const measure = (text, width) => {
      const label = ui.all(
        ui.render(),
        (node) =>
          node.type === 'Text' &&
          node.props.ref &&
          !node.props.role &&
          node.props.children[0] === text
      )[0];
      label.props.ref({ scrollWidth: width });
      label.props.onLayout();
    };
    measure('Note title:', 240);
    const headerWidth = () =>
      ui.style(
        ui.all(ui.render(), (node) => node.props.role === 'columnheader' && node.type === 'Text')[0]
      ).width;
    const cellWidths = () =>
      ui
        .all(ui.render(), (node) => node.props.role === 'cell' && node.type === 'TextInput')
        .map((node) => ui.style(node).width);
    assert(headerWidth() >= 258 && headerWidth() <= 280);
    assert(cellWidths().every((width) => width === 280));
    measure('B', 1000);
    const field = ui.all(
      ui.render(),
      (node) => node.props.role === 'rowheader' && node.props.children[0] === 'B'
    )[0];
    assert(ui.style(field).width > 160);
    ui.resize('portrait');
    assert(headerWidth() <= 200);
    assert(cellWidths().every((width) => width === 200));
    ui.resize('landscape');
    assert(headerWidth() <= 280);
    assert(cellWidths().every((width) => width === 280));
  } finally {
    ui.dispose();
  }
});
