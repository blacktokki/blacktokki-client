import { useLangContext, useResizeContext } from '@blacktokki/core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Icon } from 'react-native-paper';

import { TemplateHeaderSection } from './TemplateHeaderSection';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { templateStyles as styles } from '../styles';
import { templateVariables } from '../template';
import { ExampleNote } from '../types';
import {
  blankSheetRow,
  editSheetRepeat,
  editSheetRepeatCell,
  editSheetValue,
  parseSheetPaste,
  RepeatCell,
  SheetRepeat,
  sheetChanges,
  sheetFieldKey,
  sheetRepeatGroups,
  sheetRepeatItems,
  TemplateSheetRow,
  templateSheetRow,
  useTemplateSheet,
  validateSheet,
} from '../useTemplateSheet';

const sheetStyles = StyleSheet.create({
  cell: {
    flexShrink: 0,
    height: 44,
    maxHeight: 218,
    padding: 8,
    marginBottom: 0,
    borderRadius: 0,
    fontSize: 14,
    lineHeight: 20,
  },
  titleInput: {
    height: '100%',
    width: 'auto',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    borderWidth: 0,
  },
  titleFocus: { outlineOffset: -2 },
  heading: {
    flexShrink: 0,
    height: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  itemLabel: {
    width: 220,
    textAlignVertical: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    lineHeight: 20,
  },
  fieldLabel: {
    width: 220,
    flexShrink: 0,
    padding: 8,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  columnNumber: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deleteAction: { padding: 8 },
  append: { width: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  viewport: { flexGrow: 1, alignItems: 'stretch' },
  save: { marginLeft: 8 },
  repeatGroupLabel: { flexShrink: 0, padding: 8, borderWidth: 1, fontSize: 14, lineHeight: 20 },
  repeatItemLabel: { borderWidth: 1 },
  repeatItemHeading: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 8 },
  repeatItemText: { flex: 1, paddingVertical: 8, fontSize: 14, lineHeight: 20 },
  repeatLabel: { flexShrink: 0, padding: 8, fontSize: 14, lineHeight: 20, borderWidth: 1 },
  repeatEmpty: { borderWidth: 1 },
  repeatAction: { height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  measurements: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
    alignItems: 'flex-start',
    pointerEvents: 'none',
  },
  measurementLabel: { fontSize: 14, lineHeight: 20, flexShrink: 0 },
  heightMeasurement: { padding: 0, borderWidth: 0 },
  measurementTitle: { fontWeight: '600' },
});

/** Stage edits with one note per column and one item per row. */
export const TemplateSheetSection = ({
  templateName,
  markdown,
  notes,
  allNotes,
  paddingHorizontal,
  onCancel,
  onCatalog,
  onSaved,
}: {
  templateName: string;
  markdown: string;
  notes: ExampleNote[];
  allNotes: ExampleNote[];
  paddingHorizontal?: ViewStyle['paddingHorizontal'];
  onCancel: () => void;
  onCatalog: () => void;
  onSaved: () => void;
}) => {
  const { lang } = useLangContext();
  const windowSize = useResizeContext();
  const noteColumnWidth = windowSize === 'portrait' ? 200 : 280;
  const headerWidthLimit = noteColumnWidth;
  const columnStyle = { width: noteColumnWidth };
  const { commonStyles } = useNotebookTheme();
  const repeats = useMemo(() => sheetRepeatGroups(markdown), [markdown]);
  const fields = useMemo(() => {
    const seen = new Set<string>();
    return templateVariables(markdown)
      .filter((name) => name !== 'title')
      .flatMap<string | SheetRepeat>((name) => {
        const groups = repeats.filter((repeat) => repeat.variables.includes(name));
        if (!groups.length) return [name];
        return groups.filter((repeat) => {
          if (seen.has(repeat.group.id)) return false;
          seen.add(repeat.group.id);
          return true;
        });
      });
  }, [markdown, repeats]);
  const initial = useRef({ notes, markdown, repeats });
  const [preparing, setPreparing] = useState(notes.length >= 40);
  const [rows, setRows] = useState(() =>
    notes.length >= 40 ? [] : notes.map((note) => templateSheetRow(markdown, note))
  );
  useEffect(() => {
    if (initial.current.notes.length < 40) return;
    let stopped = false;
    const prepared: TemplateSheetRow[] = [];
    const prepare = () => {
      if (stopped) return;
      const until = Date.now() + 8;
      try {
        do {
          const row = templateSheetRow(
            initial.current.markdown,
            initial.current.notes[prepared.length]
          );
          for (const repeat of initial.current.repeats)
            sheetRepeatItems(initial.current.markdown, row, repeat);
          prepared.push(row);
        } while (prepared.length < initial.current.notes.length && Date.now() < until);
        if (prepared.length < initial.current.notes.length) timer = setTimeout(prepare, 0);
        else {
          setRows(prepared);
          setPreparing(false);
        }
      } catch {
        setNotice(lang('Could not load notes.'));
        setPreparing(false);
      }
    };
    let timer = setTimeout(prepare, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  const [notice, setNotice] = useState('');
  const nextId = useRef(0);
  const running = useRef(false);
  const pendingScroll = useRef(false);
  const horizontal = useRef<ScrollView>(null);
  const [saving, setWorking] = useState(false);
  const working = saving || preparing;
  const [viewport, setViewport] = useState({ x: 0, width: 1200 });
  const updateViewportWidth = (width: number) => {
    /** Only virtual column visibility uses this width; round up to avoid per-pixel renders. */
    const visibleWidth = Math.ceil(width / noteColumnWidth) * noteColumnWidth;
    setViewport((current) =>
      current.width === visibleWidth ? current : { ...current, width: visibleWidth }
    );
  };
  const [labelSizes, setLabelSizes] = useState<Record<string, number>>({});
  const [heightRevision, setHeightRevision] = useState(0);
  const heightCache = useMemo(
    () => ({ current: new Map<number, Map<string, number>>() }),
    [commonStyles.input.fontFamily]
  );
  const textHeight = (text: string, width: number) => {
    const cached = heightCache.current.get(width)?.get(text);
    if (cached !== undefined) return cached;
    const available = Math.max(1, width - 18);
    if (
      !/[\r\n]/.test(text) &&
      typeof labelSizes[text] === 'number' &&
      labelSizes[text] <= available
    )
      return 44;
    let lines = 1;
    let lineWidth = 0;
    for (const char of text.replace(/\r\n?/g, '\n')) {
      if (char === '\n') {
        lines++;
        lineWidth = 0;
      } else {
        lineWidth += char === '\t' ? 28 : char.charCodeAt(0) > 255 ? 14 : 7;
        if (lineWidth > available) {
          lines++;
          lineWidth = char.charCodeAt(0) > 255 ? 14 : 7;
        }
      }
      if (lines >= 10) return 218;
    }
    return Math.max(44, lines * 20 + 18);
  };
  const rememberWidth = (text: string, width: number) => {
    if (!Number.isFinite(width)) return;
    const rounded = Math.ceil(width);
    setLabelSizes((current) =>
      current[text] === rounded ? current : { ...current, [text]: rounded }
    );
  };
  const repeatViews = useMemo(
    () =>
      Object.fromEntries(
        repeats.map((repeat) => [
          repeat.group.id,
          Object.fromEntries(rows.map((row) => [row.id, sheetRepeatItems(markdown, row, repeat)])),
        ])
      ),
    [markdown, repeats, rows]
  );
  const mutation = useTemplateSheet();
  const changes = useMemo(() => sheetChanges(markdown, rows), [markdown, rows]);
  const issue = useMemo(() => validateSheet(rows, allNotes), [rows, allNotes]);
  const inset = {
    paddingHorizontal: paddingHorizontal ?? commonStyles.container.paddingHorizontal,
  };
  const emptyRow = () => blankSheetRow(markdown, `new:${nextId.current++}`);
  const edit = (id: string, field: number, value: string) => {
    setNotice('');
    setRows((current) =>
      current.map((row) =>
        row.id === id && (field === 0 || typeof fields[field - 1] === 'string')
          ? editSheetValue(
              markdown,
              row,
              field === 0 ? undefined : (fields[field - 1] as string),
              value
            )
          : row
      )
    );
  };
  const paste = (id: string, field: number, text: string) => {
    const cells = parseSheetPaste(text);
    setNotice('');
    setRows((current) => {
      const next = [...current];
      const alive = next.filter((row) => !row.deleted);
      const start = alive.findIndex((row) => row.id === id);
      cells.forEach((values, offset) => {
        if (
          field + offset > fields.length ||
          (field + offset > 0 && typeof fields[field + offset - 1] !== 'string')
        )
          return;
        values.forEach((value, column) => {
          let row = alive[start + column];
          if (!row) {
            row = emptyRow();
            next.push(row);
            alive.push(row);
            pendingScroll.current = true;
          }
          const updated = editSheetValue(
            markdown,
            row,
            field + offset === 0 ? undefined : (fields[field + offset - 1] as string),
            value
          );
          next[next.findIndex((item) => item.id === row.id)] = updated;
          alive[start + column] = updated;
        });
      });
      return next;
    });
  };
  const save = async () => {
    if (running.current || issue || !changes.length) return;
    running.current = true;
    setWorking(true);
    setNotice('');
    let applied = 0;
    try {
      await mutation.mutateAsync({
        changes,
        onApplied: (change, note) => {
          applied++;
          setRows((current) =>
            current.flatMap((row) =>
              row.id !== change.id
                ? [row]
                : note
                  ? [
                      {
                        ...row,
                        original: note,
                        title: note.title,
                        initialValues: { ...row.values },
                      },
                    ]
                  : []
            )
          );
        },
      });
      onSaved();
    } catch (error) {
      const detail = lang(error instanceof Error ? error.message : 'Failed to save');
      setNotice(
        (applied ? lang('Some notes were saved. Unsaved changes remain in the table.') + ' ' : '') +
          detail
      );
    } finally {
      running.current = false;
      setWorking(false);
    }
  };
  const input = (row: TemplateSheetRow, field: number) => (
    <TextInput
      key={row.id}
      accessibilityLabel={`${row.title || row.id}: ${field === 0 ? lang('Note title:') : fields[field - 1]}`}
      value={field === 0 ? row.title : row.values[fields[field - 1] as string] || ''}
      placeholder={field === 0 ? lang('New note title') : undefined}
      placeholderTextColor={commonStyles.placeholder.color}
      editable={!working && !row.deleted}
      multiline={field !== 0}
      numberOfLines={1}
      scrollEnabled={field !== 0}
      autoCapitalize="none"
      style={[
        commonStyles.input,
        sheetStyles.cell,
        columnStyle,
        field !== 0 && { height: heights[field - 1] },
        field === 0 && sheetStyles.titleInput,
        field === 0 && sheetStyles.titleFocus,
        row.deleted && styles.disabled,
      ]}
      onChangeText={(value) => edit(row.id, field, value)}
      {...{
        onPaste: (event: React.ClipboardEvent) => {
          const text = event.clipboardData.getData('text/plain');
          if (!working && text.includes('\t')) {
            event.preventDefault();
            paste(row.id, field, text);
          }
        },
      }}
    />
  );
  const border = { borderColor: commonStyles.input.borderColor };
  const changeRepeat = (repeat: SheetRepeat, removeIndex?: number) => {
    setNotice('');
    setRows((current) => {
      const items = current.map((row) => sheetRepeatItems(markdown, row, repeat));
      if (
        removeIndex !== undefined &&
        items.some((list) => list[removeIndex] && !list[removeIndex].removable)
      )
        return current;
      const target = Math.max(0, ...items.map((list) => list.length)) + 1;
      return current.map((row, index) => {
        if (removeIndex !== undefined) {
          const item = items[index][removeIndex];
          return item ? editSheetRepeat(markdown, row, repeat, { remove: item.index }) : row;
        }
        let next = row;
        for (let count = items[index].length; count < target; count++)
          next = editSheetRepeat(markdown, next, repeat, { add: true });
        return next;
      });
    });
  };
  const repeatLayout = (repeat: SheetRepeat) => {
    const views = repeatViews[repeat.group.id];
    return Array.from(
      { length: Math.max(0, ...rows.map((row) => views[row.id].length)) },
      (_, index) => {
        const names = new Set(
          rows.flatMap((row) => (views[row.id][index] ? [views[row.id][index].label] : []))
        );
        const itemLabel =
          repeat.group.axis === 'row' && repeat.group.sequence && names.size === 1
            ? [...names][0]
            : `${lang(repeat.group.axis === 'row' ? 'Table row' : 'Table column')} ${index + 1}`;
        const cells = new Map<
          string,
          {
            id: string;
            label: string;
            exemplar: RepeatCell;
            occurrence: number;
            values: Record<string, RepeatCell>;
          }
        >();
        rows.forEach((row) => {
          const occurrences = new Map<string, number>();
          views[row.id][index]?.cells.forEach((cell) => {
            const name = cell.row === 0 ? 'header' : `field:${sheetFieldKey(cell.label)}`;
            const occurrence = occurrences.get(name) || 0;
            occurrences.set(name, occurrence + 1);
            const coordinate = `${name}:${occurrence}`;
            const shared = cells.get(coordinate) || {
              id: `repeat-label:${repeat.group.id}:${index}:${coordinate}`,
              label: cell.label || lang('Table column'),
              exemplar: cell,
              occurrence,
              values: {},
            };
            shared.values[row.id] = cell;
            cells.set(coordinate, shared);
          });
        });
        return {
          label: itemLabel,
          showIdentity: repeat.group.axis === 'row' && !!repeat.group.sequence && names.size > 1,
          cells: [...cells.values()].map((cell) => ({ ...cell, height: 44 })),
        };
      }
    );
  };
  const repeatLayouts = Object.fromEntries(
    repeats.map((repeat) => [repeat.group.id, repeatLayout(repeat)])
  );
  const groupLabels = repeats.map((repeat) => repeat.name);
  const itemLabels = Object.values(repeatLayouts).flatMap((layout) =>
    layout.map((item) => item.label)
  );
  const fieldLabels = Object.values(repeatLayouts).flatMap((layout) =>
    layout.flatMap((item) => [
      ...(item.showIdentity ? [lang('Number')] : []),
      ...item.cells.map((cell) => cell.label),
    ])
  );
  const plainLabels = [
    lang('Note title:'),
    ...fields.filter((field): field is string => typeof field === 'string'),
  ];
  const allLabels = [...new Set([...plainLabels, ...groupLabels, ...itemLabels, ...fieldLabels])];
  const columnWidth = (texts: string[], padding = 18) =>
    Math.max(
      44,
      ...texts.map(
        (text) =>
          (typeof labelSizes[text] === 'number'
            ? labelSizes[text]
            : [...text].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 14 : 7), 0)) +
          padding
      )
    );
  const preferredWidths = [
    columnWidth(groupLabels),
    columnWidth(itemLabels, 52),
    columnWidth(fieldLabels),
  ];
  const minimumWidths = [44, 52, 44];
  const mergedWidth = Math.min(headerWidthLimit, columnWidth(plainLabels));
  const targetWidth = Math.min(
    headerWidthLimit,
    Math.max(
      mergedWidth,
      preferredWidths.reduce((sum, width) => sum + width, 0)
    )
  );
  const remaining = Math.max(0, targetWidth - minimumWidths.reduce((sum, width) => sum + width, 0));
  const excess = preferredWidths.map((width, index) => Math.max(0, width - minimumWidths[index]));
  const totalExcess = excess.reduce((sum, width) => sum + width, 0);
  const headerWidths = minimumWidths.map(
    (width, index) =>
      width +
      (totalExcess > remaining
        ? Math.floor((remaining * excess[index]) / totalExcess)
        : excess[index] + (index === 0 ? remaining - totalExcess : 0))
  );
  headerWidths[0] += targetWidth - headerWidths.reduce((sum, width) => sum + width, 0);
  const [groupWidth, itemWidth, fieldWidth] = headerWidths;
  const labelWidth = repeats.length ? groupWidth + itemWidth + fieldWidth : mergedWidth;
  const heights = fields.map((name) =>
    typeof name !== 'string'
      ? 44
      : rows.reduce(
          (height, row) => Math.max(height, textHeight(row.values[name] || '', noteColumnWidth)),
          textHeight(name, labelWidth)
        )
  );
  for (const repeat of repeats)
    for (const item of repeatLayouts[repeat.group.id])
      for (const cell of item.cells)
        cell.height = rows.reduce(
          (height, row) => {
            const value = cell.values[row.id];
            return Math.max(height, value ? textHeight(value.value, noteColumnWidth) : 44);
          },
          textHeight(cell.label, fieldWidth)
        );
  const heightJobs = useMemo(() => {
    const jobs = new Map<number, Set<string>>();
    const add = (width: number, text: string) => {
      if (!jobs.has(width)) jobs.set(width, new Set());
      jobs.get(width)!.add(text);
    };
    for (const field of fields)
      if (typeof field === 'string') {
        add(labelWidth, field);
        for (const row of rows) add(noteColumnWidth, row.values[field] || '');
      }
    for (const repeat of repeats)
      for (const item of repeatLayouts[repeat.group.id])
        for (const cell of item.cells) {
          add(fieldWidth, cell.label);
          for (const value of Object.values(cell.values)) add(noteColumnWidth, value.value);
        }
    return [...jobs].flatMap(([width, values]) => [...values].map((value) => ({ width, value })));
  }, [rows, fields, repeats, repeatViews, labelWidth, fieldWidth, heightCache, noteColumnWidth]);
  const pendingHeightJobs = useMemo(
    () => heightJobs.filter(({ width, value }) => !heightCache.current.get(width)?.has(value)),
    [heightJobs, heightRevision]
  );
  const firstColumn = Math.min(
    Math.max(0, rows.length - 1),
    Math.max(0, Math.floor((viewport.x - labelWidth) / noteColumnWidth) - 1)
  );
  const lastColumn = Math.min(
    rows.length,
    Math.max(
      firstColumn + 1,
      Math.ceil((viewport.x + viewport.width - labelWidth) / noteColumnWidth) + 1
    )
  );
  const visibleRows = rows.slice(firstColumn, lastColumn);
  const noteColumns = (render: (row: TemplateSheetRow) => React.ReactNode) => (
    <>
      {firstColumn > 0 && <View style={{ width: firstColumn * noteColumnWidth }} />}
      {visibleRows.map(render)}
      {lastColumn < rows.length && (
        <View style={{ width: (rows.length - lastColumn) * noteColumnWidth }} />
      )}
    </>
  );
  const repeatValue = (
    repeat: SheetRepeat,
    index: number,
    shared: ReturnType<typeof repeatLayout>[number]['cells'][number],
    row: TemplateSheetRow
  ) => {
    const cell = shared.values[row.id];
    const value = cell?.value || '';
    return (
      <TextInput
        key={row.id}
        role="cell"
        accessibilityLabel={`${row.title}: ${repeat.name} · ${index + 1} · ${shared.label}`}
        value={value}
        editable={!working && !row.deleted}
        multiline={shared.exemplar.row !== 0}
        numberOfLines={1}
        scrollEnabled
        autoCapitalize="none"
        style={[
          commonStyles.input,
          sheetStyles.cell,
          columnStyle,
          { height: shared.height },
          row.deleted && styles.disabled,
        ]}
        onChangeText={(text) => {
          setNotice('');
          setRows((current) =>
            current.map((note) =>
              note.id === row.id
                ? editSheetRepeatCell(
                    markdown,
                    note,
                    repeat,
                    index,
                    shared.exemplar,
                    shared.occurrence,
                    text
                  )
                : note
            )
          );
        }}
      />
    );
  };
  const repeatGroup = (repeat: SheetRepeat) => {
    const layout = repeatLayouts[repeat.group.id];
    return (
      <View role="rowgroup" style={sheetStyles.row}>
        <Text
          role="rowheader"
          style={[commonStyles.text, sheetStyles.repeatGroupLabel, border, { width: groupWidth }]}
        >
          {repeat.name}
        </Text>
        <View>
          {layout.map((item, index) => (
            <View key={index} style={sheetStyles.row}>
              <View
                role="rowheader"
                style={[sheetStyles.repeatItemLabel, border, { width: itemWidth }]}
              >
                <View style={sheetStyles.repeatItemHeading}>
                  <Text style={[commonStyles.text, sheetStyles.repeatItemText]}>{item.label}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${lang(repeat.group.axis === 'row' ? 'Remove row' : 'Remove column')}: ${repeat.name} · ${item.label}`}
                    disabled={
                      working ||
                      rows.some(
                        (row) => repeatViews[repeat.group.id][row.id][index]?.removable === false
                      )
                    }
                    style={sheetStyles.deleteAction}
                    onPress={() => changeRepeat(repeat, index)}
                  >
                    <Icon source="trash-can-outline" size={18} color={commonStyles.icon.color} />
                  </TouchableOpacity>
                </View>
              </View>
              <View>
                {item.showIdentity && (
                  <View role="row" style={sheetStyles.row}>
                    <Text
                      role="rowheader"
                      style={[
                        commonStyles.text,
                        sheetStyles.repeatLabel,
                        border,
                        { width: fieldWidth, height: 36 },
                      ]}
                    >
                      {lang('Number')}
                    </Text>
                    {noteColumns((row) => (
                      <Text
                        key={row.id}
                        role="cell"
                        style={[
                          commonStyles.text,
                          sheetStyles.cell,
                          columnStyle,
                          border,
                          sheetStyles.repeatEmpty,
                          { height: 36 },
                        ]}
                      >
                        {repeatViews[repeat.group.id][row.id][index]?.label || ''}
                      </Text>
                    ))}
                    <View style={[sheetStyles.append, border]} />
                  </View>
                )}
                {item.cells.map((cell) => (
                  <View key={cell.id} role="row" style={sheetStyles.row}>
                    <Text
                      role="rowheader"
                      style={[
                        commonStyles.text,
                        sheetStyles.repeatLabel,
                        border,
                        { height: cell.height, width: fieldWidth },
                      ]}
                    >
                      {cell.label}
                    </Text>
                    {noteColumns((row) => repeatValue(repeat, index, cell, row))}
                    <View style={[sheetStyles.append, border]} />
                  </View>
                ))}
              </View>
            </View>
          ))}
          <View role="row" style={sheetStyles.row}>
            <View role="rowheader" style={[sheetStyles.repeatAction, border, { width: itemWidth }]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${lang(repeat.group.axis === 'row' ? 'Add row' : 'Add column')}: ${repeat.name}`}
                disabled={working || !rows.length}
                style={commonStyles.navButton}
                onPress={() => changeRepeat(repeat)}
              >
                <Icon source="plus" size={18} color={commonStyles.icon.color} />
              </TouchableOpacity>
            </View>
            <View style={[sheetStyles.repeatAction, border, { width: fieldWidth }]} />
            {noteColumns((row) => (
              <View
                key={row.id}
                role="cell"
                style={[sheetStyles.repeatAction, border, { width: noteColumnWidth }]}
              />
            ))}
            <View style={[sheetStyles.append, border]} />
          </View>
        </View>
      </View>
    );
  };
  const header = (
    <View
      role="row"
      style={[sheetStyles.row, { backgroundColor: commonStyles.card.backgroundColor }]}
    >
      <Text
        role="columnheader"
        style={[
          commonStyles.text,
          sheetStyles.heading,
          sheetStyles.itemLabel,
          border,
          { width: labelWidth },
        ]}
      >
        {lang('Note title:')}
      </Text>
      {noteColumns((row) => (
        <View
          key={row.id}
          role="columnheader"
          style={[sheetStyles.heading, columnStyle, sheetStyles.columnNumber, border]}
        >
          {input(row, 0)}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={lang(row.deleted ? 'cancel' : 'Delete') + ': ' + row.title}
            disabled={working}
            style={sheetStyles.deleteAction}
            onPress={() =>
              setRows((current) =>
                current.flatMap((item) =>
                  item.id !== row.id
                    ? [item]
                    : item.original
                      ? [{ ...item, deleted: !item.deleted }]
                      : []
                )
              )
            }
          >
            <Icon
              source={row.deleted ? 'undo' : 'trash-can-outline'}
              size={18}
              color={commonStyles.icon.color}
            />
          </TouchableOpacity>
        </View>
      ))}
      <View role="columnheader" style={[sheetStyles.append, border]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={lang('New note')}
          disabled={working}
          style={commonStyles.navButton}
          onPress={() => {
            pendingScroll.current = true;
            setRows((current) => [...current, emptyRow()]);
          }}
        >
          <Icon source="plus" size={18} color={commonStyles.icon.color} />
        </TouchableOpacity>
      </View>
    </View>
  );
  const renderField = (item: string | SheetRepeat, index: number) =>
    typeof item !== 'string' ? (
      repeatGroup(item)
    ) : (
      <View role="row" style={sheetStyles.row}>
        <Text
          role="rowheader"
          style={[
            commonStyles.text,
            sheetStyles.fieldLabel,
            border,
            { height: heights[index], width: labelWidth },
          ]}
        >
          {item}
        </Text>
        {noteColumns((row) => input(row, index + 1))}
        <View style={[sheetStyles.append, border]} />
      </View>
    );
  const message = notice || (issue && lang(issue));
  return (
    <View style={styles.sourceSection}>
      <View
        style={sheetStyles.measurements}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {/** Measure natural text sizes with the same layout events on every platform. */}
        {pendingHeightJobs.slice(0, 32).map(({ width, value }) => (
          <Text
            key={JSON.stringify([width, value])}
            numberOfLines={10}
            style={[
              commonStyles.input,
              sheetStyles.measurementLabel,
              sheetStyles.heightMeasurement,
              { width: Math.max(1, width - 18) },
            ]}
            onLayout={(event) => {
              const height = Math.max(
                44,
                Math.min(218, Math.ceil(event.nativeEvent.layout.height + 18))
              );
              if (heightCache.current.get(width)?.get(value) === height) return;
              if (!heightCache.current.has(width)) heightCache.current.set(width, new Map());
              heightCache.current.get(width)!.set(value, height);
              setHeightRevision((revision) => revision + 1);
            }}
          >
            {value || ' '}
          </Text>
        ))}
        <ScrollView horizontal>
          {allLabels.map((text) => (
            <Text
              key={text}
              numberOfLines={1}
              style={[
                commonStyles.text,
                sheetStyles.measurementLabel,
                text === lang('Note title:') && sheetStyles.measurementTitle,
              ]}
              onLayout={(event) => rememberWidth(text, event.nativeEvent.layout.width)}
            >
              {text}
            </Text>
          ))}
        </ScrollView>
      </View>
      <View style={inset}>
        <TemplateHeaderSection
          templateName={templateName}
          titleSuffix={lang('Edit')}
          onTitlePress={working ? undefined : onCancel}
          onCatalog={() => {
            if (!working) onCatalog();
          }}
        />
        {!!message && (
          <View accessibilityRole="alert" style={[styles.warning, styles.notice]}>
            <Icon source="alert-circle-outline" size={18} color={commonStyles.text.color} />
            <Text style={[commonStyles.text, styles.grow]}>{message}</Text>
          </View>
        )}
        {working && <ActivityIndicator color={commonStyles.icon.color} />}
      </View>
      <ScrollView
        ref={horizontal}
        horizontal
        style={styles.sourceSection}
        contentContainerStyle={sheetStyles.viewport}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        nestedScrollEnabled
        directionalLockEnabled={false}
        onLayout={(event) => updateViewportWidth(event.nativeEvent.layout.width)}
        onScroll={(event) => {
          const x =
            Math.floor(Math.max(0, event.nativeEvent.contentOffset.x) / noteColumnWidth) *
            noteColumnWidth;
          setViewport((current) => (current.x === x ? current : { ...current, x }));
        }}
        onContentSizeChange={() => {
          if (pendingScroll.current) {
            pendingScroll.current = false;
            horizontal.current?.scrollToEnd({ animated: true });
          }
        }}
      >
        <FlatList
          role="table"
          accessibilityLabel={lang('Similar notes')}
          style={{ width: labelWidth + rows.length * noteColumnWidth + 56 }}
          data={fields}
          keyExtractor={(item) => (typeof item === 'string' ? item : item.group.id)}
          ListHeaderComponent={header}
          stickyHeaderIndices={[0]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => renderField(item, index)}
        />
      </ScrollView>

      <View style={inset}>
        <View style={commonStyles.buttonContainer}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={lang('cancel')}
            disabled={working}
            style={[commonStyles.secondaryButton, styles.grow]}
            onPress={onCancel}
          >
            <Text style={commonStyles.secondaryButtonText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={lang('save')}
            disabled={working || !!issue || !changes.length}
            style={[
              working || issue || !changes.length
                ? commonStyles.secondaryButton
                : commonStyles.button,
              styles.grow,
              sheetStyles.save,
            ]}
            onPress={save}
          >
            <Text
              style={
                working || !!issue || !changes.length
                  ? commonStyles.secondaryButtonText
                  : commonStyles.buttonText
              }
            >
              {lang('save')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
