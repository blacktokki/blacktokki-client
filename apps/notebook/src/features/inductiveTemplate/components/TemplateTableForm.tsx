import { useLangContext } from '@blacktokki/core';
import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { templateStyles as styles } from '../styles';
import { TemplateTableView } from '../tableLayout';

/** Keep table controls beside their fields on touch screens, including a way back from zero rows. */
export const TemplateTableForm = ({
  table,
  values,
  busy,
  onChangeValue,
  onChangeTable,
  onChangeTableColumn,
}: {
  table: TemplateTableView;
  values: Record<string, string>;
  busy: boolean;
  onChangeValue: (key: string, value: string) => void;
  onChangeTable: (groupId: string, removeId?: number) => void;
  onChangeTableColumn: (groupId: string, ordinal: number, label: string) => void;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const action = (
    icon: string,
    label: string,
    onPress: () => void,
    disabled = false,
    caption?: string
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.tableAction, (busy || disabled) && styles.disabled]}
    >
      <Icon name={icon} size={18} color={commonStyles.text.color} />
      {!!caption && <Text style={[commonStyles.text, styles.label]}>{caption}</Text>}
    </TouchableOpacity>
  );
  return (
    <View style={[commonStyles.resultsContainer, styles.tableForm]}>
      <Text accessibilityRole="header" style={[commonStyles.text, styles.tableHeading]}>
        {table.name}
      </Text>
      {table.groups
        .filter((group) => group.axis === 'column')
        .map((group) => (
          <View key={group.id} style={styles.wrap}>
            {table.columns
              .filter((column) => column.groupId === group.id)
              .map((column) => (
                <View key={column.id} style={[commonStyles.card, styles.tableColumn]}>
                  <TextInput
                    accessibilityLabel={`${lang('Table column')}: ${column.label}`}
                    placeholder={lang('Table column')}
                    placeholderTextColor={commonStyles.placeholder.color}
                    style={[commonStyles.input, styles.tableColumnInput]}
                    value={column.label}
                    editable={!busy}
                    maxLength={96}
                    onChangeText={(value) => onChangeTableColumn(group.id, column.ordinal, value)}
                  />
                  {action(
                    'close',
                    `${lang('Remove column')}: ${column.label}`,
                    () => onChangeTable(group.id, column.ordinal),
                    table.columns.length <= 1
                  )}
                </View>
              ))}
            {action(
              'plus',
              lang('Add column'),
              () => onChangeTable(group.id),
              false,
              lang('Table column')
            )}
          </View>
        ))}
      {table.rows.map((row) => (
        <View key={row.id} style={[commonStyles.card, styles.tableRow, styles.field]}>
          <View style={[styles.row, styles.between]}>
            <Text style={[commonStyles.text, styles.label, styles.grow]}>{row.label}</Text>
            {row.groupId &&
              action('close', `${lang('Remove row')}: ${row.label}`, () =>
                onChangeTable(row.groupId!, row.ordinal)
              )}
          </View>
          <View style={styles.fieldGrid}>
            {row.cells.flatMap((cell) =>
              cell.variables
                .filter((key) => key !== 'title')
                .map((key) => {
                  const column = table.columns.find((item) => item.id === cell.columnId)!;
                  return (
                    <View key={cell.columnId + key} style={[styles.field, styles.formField]}>
                      <Text style={[commonStyles.text, styles.label]}>{column.label}</Text>
                      <TextInput
                        accessibilityLabel={`${table.name} · ${row.label} · ${column.label}`}
                        placeholder={column.label}
                        placeholderTextColor={commonStyles.placeholder.color}
                        style={[commonStyles.input, styles.input, busy && styles.disabled]}
                        value={values[key] || ''}
                        editable={!busy}
                        autoCapitalize="none"
                        onChangeText={(value) => onChangeValue(key, value)}
                      />
                    </View>
                  );
                })
            )}
          </View>
        </View>
      ))}
      <View style={styles.wrap}>
        {table.groups
          .filter((group) => group.axis === 'row')
          .map((group) => (
            <View key={group.id}>
              {action(
                'plus',
                lang('Add row'),
                () => onChangeTable(group.id),
                false,
                lang('Table row') +
                  (group.sequence ? ` · ${group.sequence.prefix}…${group.sequence.suffix}` : '')
              )}
            </View>
          ))}
      </View>
    </View>
  );
};
