import { CommonButton, useLangContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import React, { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { HeaderIconButton } from '../../../screens/main/NoteItemSections';
import { TemplateChoice } from '../components/TemplateChoice';
import { TemplateTableForm } from '../components/TemplateTableForm';
import { templateStyles as styles } from '../styles';
import { TemplateTableView } from '../tableLayout';
import { fillTemplate, noteTitleIssue } from '../template';
import { titleFieldIssues, TitleTemplate } from '../titleTemplates';

type TemplateFormProps = {
  titleTemplates: TitleTemplate[];
  titleTemplateId: string | null;
  noteTitle: string;
  resolvedTitle: string | null;
  variables: string[];
  singleLineFields: string[];
  values: Record<string, string>;
  tables: TemplateTableView[];
  busy: boolean;
  onChooseTitle: (id: string | null) => void;
  onChangeTitle: (title: string) => void;
  onChangeValue: (key: string, value: string) => void;
  onChangeTable: (groupId: string, removeId?: number) => void;
  onChangeTableColumn: (groupId: string, ordinal: number, label: string) => void;
};
type BodyView = 'form' | 'preview';

/** Fill the title and body, inspect their live preview, then save the same content directly. */
export const TemplateWriteSection = ({
  templateName,
  templateHtml,
  form,
  error,
  onSave,
  onPreview,
}: {
  templateName: string;
  templateHtml: string;
  form: TemplateFormProps;
  error?: unknown;
  onSave: () => void;
  onPreview: () => void;
}) => {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const [bodyView, setBodyView] = useState<BodyView>('form');
  const [previewOpened, setPreviewOpened] = useState(false);
  const [focusedTab, setFocusedTab] = useState<BodyView | null>(null);
  const tabRefs = useRef<Partial<Record<BodyView, React.ElementRef<typeof View>>>>({});
  const selectBodyView = (view: BodyView) => {
    setBodyView(view);
    if (view === 'preview') setPreviewOpened(true);
  };
  // Web tabs use one Tab stop; arrow keys move selection and focus together.
  const tabKeyboard =
    Platform.OS === 'web'
      ? {
          onKeyDown: (event: React.KeyboardEvent) => {
            let next: BodyView;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
              next = bodyView === 'form' ? 'preview' : 'form';
            else if (event.key === 'Home') next = 'form';
            else if (event.key === 'End') next = 'preview';
            else return;
            event.preventDefault();
            selectBodyView(next);
            tabRefs.current[next]?.focus();
          },
        }
      : {};
  // Keep the same embedded viewer mounted after its first visit. Visibility is handled by its
  // parent so tab changes cannot recreate it; only content or theme changes update this element.
  const contentPreview = useMemo(
    () => <EditorViewer active value={templateHtml} theme={colorScheme} autoResize />,
    [templateHtml, colorScheme]
  );
  const {
    titleTemplates,
    titleTemplateId,
    noteTitle,
    resolvedTitle,
    variables,
    singleLineFields,
    values,
    tables,
    busy,
    onChooseTitle,
    onChangeTitle,
    onChangeValue,
    onChangeTable,
    onChangeTableColumn,
  } = form;
  const selected = titleTemplates.find((template) => template.id === titleTemplateId);
  const previewTitle = selected
    ? resolvedTitle || fillTemplate(selected.pattern, values)
    : noteTitle;
  const titleFields = selected?.variables || [];
  const issues = selected ? titleFieldIssues(selected, values) : { missing: [], invalid: [] };
  const titleIssue = resolvedTitle
    ? ''
    : issues.missing.length
    ? lang('Complete the required title fields.') + ' ' + issues.missing.join(', ')
    : issues.invalid.length
    ? lang('Correct the title fields containing invalid characters or placeholders.') +
      ' ' +
      issues.invalid.join(', ')
    : lang(noteTitleIssue(previewTitle) || 'Enter a note title to save.');
  const saveIssue = busy
    ? lang('Please wait until the current operation finishes.')
    : titleIssue || (!templateHtml.trim() ? lang('This template has no content to save.') : '');
  const tableFields = new Set(
    tables.flatMap((table) =>
      table.rows.flatMap((row) => row.cells.flatMap((cell) => cell.variables))
    )
  );
  const bodyFields = variables.filter((key) => !titleFields.includes(key) && !tableFields.has(key));
  const field = (key: string, required = false) => (
    <View key={key} style={[styles.field, required && styles.formField]}>
      <Text style={[commonStyles.text, styles.label]}>{key + (required ? ' *' : '')}</Text>
      <TextInput
        accessibilityLabel={key}
        placeholder={key}
        placeholderTextColor={commonStyles.placeholder.color}
        style={[
          commonStyles.input,
          styles.input,
          !required && !singleLineFields.includes(key) && styles.multilineInput,
          busy && styles.disabled,
        ]}
        value={values[key] || ''}
        editable={!busy}
        multiline={!required && !singleLineFields.includes(key)}
        autoCapitalize="none"
        onChangeText={(value) => onChangeValue(key, value)}
      />
    </View>
  );
  const titleChoice = (id: string | null, pattern: string) => (
    <TemplateChoice
      key={id || 'direct'}
      label={lang('Title template') + ': ' + (pattern || lang('Enter title directly'))}
      radio
      selected={titleTemplateId === id}
      disabled={busy}
      style={styles.titleChoice}
      onPress={() => onChooseTitle(id)}
    >
      <View style={styles.row}>
        <Icon
          source={titleTemplateId === id ? 'radiobox-marked' : 'radiobox-blank'}
          size={18}
          color={commonStyles.text.color}
        />
        <Text style={[commonStyles.text, styles.noteText, styles.grow]}>
          {pattern || lang('Enter title directly')}
        </Text>
      </View>
    </TemplateChoice>
  );
  return (
    <>
      <View style={[styles.wrap, styles.between]}>
        <Text accessibilityRole="header" style={[commonStyles.title, styles.title]}>
          {lang('Write a note from the template')}
        </Text>
        <View style={styles.row}>
          <Text style={commonStyles.smallText}>{templateName}</Text>
          <HeaderIconButton name="file-text-o" onPress={onPreview} />
        </View>
      </View>
      <View style={styles.stack}>
        <View style={[commonStyles.card, styles.panel, styles.fields]}>
          <Text accessibilityRole="header" style={[commonStyles.title, styles.title]}>
            {lang('Title template')}
          </Text>
          {!!titleTemplates.length && (
            <View style={styles.field}>
              <ScrollView
                style={styles.titleChoices}
                contentContainerStyle={styles.scrollContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {titleTemplates.map((template) => titleChoice(template.id, template.pattern))}
                {titleChoice(null, '')}
              </ScrollView>
            </View>
          )}
          {!!titleFields.length && (
            <View style={styles.fieldGrid}>{titleFields.map((key) => field(key, true))}</View>
          )}
          {selected ? (
            <View style={[commonStyles.resultsContainer, styles.resolvedTitle]}>
              <Icon
                source={resolvedTitle ? 'file-check-outline' : 'file-document-outline'}
                size={20}
                color={commonStyles.text.color}
              />
              <Text
                accessibilityLabel={lang('New note title') + ': ' + previewTitle}
                style={[commonStyles.text, styles.noteText, styles.grow]}
              >
                {previewTitle}
              </Text>
            </View>
          ) : (
            <TextInput
              accessibilityLabel={lang('New note title')}
              placeholder={lang('New note title')}
              placeholderTextColor={commonStyles.placeholder.color}
              style={[commonStyles.input, styles.input, busy && styles.disabled]}
              value={noteTitle}
              editable={!busy}
              autoCapitalize="none"
              onChangeText={onChangeTitle}
            />
          )}
          {!!titleIssue && (
            <Text style={[commonStyles.smallText, styles.helper]}>{titleIssue}</Text>
          )}
        </View>
        <View style={[commonStyles.card, styles.panel, styles.fields]}>
          <View
            accessibilityRole="tablist"
            style={[styles.writeTabs, { borderColor: commonStyles.card.borderColor }]}
            {...tabKeyboard}
          >
            {(
              [
                { value: 'form', label: 'Content template', icon: 'form-textbox' },
                { value: 'preview', label: 'Content preview', icon: 'eye-outline' },
              ] as const
            ).map((tab) => (
              <Pressable
                key={tab.value}
                ref={(node) => {
                  tabRefs.current[tab.value] = node || undefined;
                }}
                accessibilityRole="tab"
                accessibilityLabel={lang(tab.label)}
                accessibilityState={{ selected: bodyView === tab.value }}
                tabIndex={bodyView === tab.value ? 0 : -1}
                onFocus={() => setFocusedTab(tab.value)}
                onBlur={() => setFocusedTab(null)}
                style={({ pressed }) => [
                  styles.writeTab,
                  focusedTab === tab.value && commonStyles.focusedBorder,
                  {
                    borderBottomColor:
                      bodyView === tab.value
                        ? commonStyles.activeTab.borderBottomColor
                        : 'transparent',
                  },
                  pressed && styles.pressed,
                ]}
                onPress={() => selectBodyView(tab.value)}
              >
                <Icon
                  source={tab.icon}
                  size={20}
                  color={
                    bodyView === tab.value
                      ? commonStyles.button.backgroundColor
                      : commonStyles.smallText.color
                  }
                />
                <Text
                  style={[
                    commonStyles.text,
                    styles.writeTabText,
                    {
                      color:
                        bodyView === tab.value
                          ? commonStyles.activeTab.color
                          : commonStyles.smallText.color,
                    },
                  ]}
                >
                  {lang(tab.label)}
                </Text>
              </Pressable>
            ))}
          </View>
          {bodyView === 'form' && (
            <View
              role="tabpanel"
              accessibilityLabel={lang('Content template')}
              style={styles.fields}
            >
              {bodyFields.map((key) => field(key))}
              {tables.map((table) => (
                <TemplateTableForm
                  key={table.id}
                  table={table}
                  values={values}
                  busy={busy}
                  onChangeValue={onChangeValue}
                  onChangeTable={onChangeTable}
                  onChangeTableColumn={onChangeTableColumn}
                />
              ))}
              <Text style={[commonStyles.smallText, styles.helper]}>
                {lang(
                  'Values appear in the preview as you type. Empty fields remain as placeholders.'
                )}
              </Text>
            </View>
          )}
          {previewOpened && (
            <View
              style={[
                commonStyles.resultsContainer,
                styles.viewerFrame,
                bodyView !== 'preview' && styles.hiddenPreview,
              ]}
              accessibilityElementsHidden={bodyView !== 'preview'}
              role="tabpanel"
              accessibilityLabel={lang('Content preview')}
              importantForAccessibility={bodyView === 'preview' ? 'auto' : 'no-hide-descendants'}
            >
              {contentPreview}
            </View>
          )}
          {error !== undefined && (
            <Text accessibilityRole="alert" style={[commonStyles.text, styles.notice]}>
              {lang(error instanceof Error ? error.message : 'Could not create note.')}
            </Text>
          )}
          <View style={[styles.wrap, styles.formActions]}>
            {saveIssue ? (
              <View style={styles.saveStatus}>
                <Icon source="information-outline" size={18} color={commonStyles.smallText.color} />
                <Text
                  accessibilityLiveRegion="polite"
                  style={[commonStyles.smallText, styles.helper, styles.saveMessage]}
                >
                  {saveIssue}
                </Text>
              </View>
            ) : (
              <CommonButton title={lang('save')} onPress={onSave} />
            )}
          </View>
        </View>
      </View>
    </>
  );
};
