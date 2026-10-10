import { useLangContext } from '@blacktokki/core';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Icon, List } from 'react-native-paper';

import { TemplateAction } from './TemplateAction';
import { TemplateChoice } from './TemplateChoice';
import { templateStyles as styles } from './styles';
import { TitleTemplate } from './titleTemplates';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export const TemplateFormSection = ({
  titleTemplates,
  titleTemplateId,
  noteTitle,
  resolvedTitle,
  variables,
  values,
  busy,
  onChooseTitle,
  onChangeTitle,
  onChangeValue,
  onPreview,
}: {
  titleTemplates: TitleTemplate[];
  titleTemplateId: string | null;
  noteTitle: string;
  resolvedTitle: string | null;
  variables: string[];
  values: Record<string, string>;
  busy: boolean;
  onChooseTitle: (id: string | null) => void;
  onChangeTitle: (title: string) => void;
  onChangeValue: (key: string, value: string) => void;
  onPreview: () => void;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [expanded, setExpanded] = useState(false);
  const selected = titleTemplates.find((template) => template.id === titleTemplateId);
  const titleFields = selected?.variables || [];
  const bodyFields = variables.filter((key) => !titleFields.includes(key));
  const field = (key: string) => (
    <View key={key} style={styles.field}>
      <Text style={[commonStyles.smallText, styles.label]}>{'{{ ' + key + ' }}'}</Text>
      <TextInput
        accessibilityLabel={key}
        placeholder={key}
        placeholderTextColor={commonStyles.placeholder.color}
        style={[commonStyles.input, styles.input]}
        value={values[key] || ''}
        editable={!busy}
        onChangeText={(value) => onChangeValue(key, value)}
      />
    </View>
  );
  const titleChoice = (id: string | null, pattern: string, count?: number) => (
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
        <Text style={[commonStyles.text, styles.noteText, styles.grow]}>{pattern || '✎'}</Text>
        {count !== undefined && (
          <Text style={[commonStyles.smallText, styles.label]}>{'▤ ' + count}</Text>
        )}
      </View>
    </TemplateChoice>
  );
  return (
    <View style={[commonStyles.card, styles.panel, styles.fields]}>
      <View style={[styles.row, styles.between]}>
        <Text style={[commonStyles.title, styles.title]}>{lang('New note title')}</Text>
        <TemplateAction
          icon="eye-outline"
          label="Preview new note"
          caption="Preview"
          primary
          disabled={busy || !resolvedTitle}
          onPress={onPreview}
        />
      </View>
      {!!titleTemplates.length && (
        <View style={styles.field}>
          <Text style={[commonStyles.smallText, styles.label]}>{lang('Title template')}</Text>
          <ScrollView
            style={styles.titleChoices}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {titleTemplates.map((template) =>
              titleChoice(template.id, template.pattern, template.sourceTitles.length)
            )}
            {titleChoice(null, '')}
          </ScrollView>
        </View>
      )}
      {titleFields.map(field)}
      <TextInput
        accessibilityLabel={lang('New note title')}
        placeholder={lang('New note title')}
        placeholderTextColor={commonStyles.placeholder.color}
        style={[commonStyles.input, styles.input]}
        value={titleTemplateId ? resolvedTitle || selected?.pattern || '' : noteTitle}
        editable={!busy && titleTemplateId === null}
        onChangeText={onChangeTitle}
      />
      {titleTemplateId && !resolvedTitle ? (
        <Text style={[commonStyles.smallText, styles.helper]}>
          {lang(
            'Fill all title fields with valid note-name values. The folder path is kept from the title template.'
          )}
        </Text>
      ) : (
        !!noteTitle &&
        !resolvedTitle && (
          <Text style={[commonStyles.smallText, styles.helper]}>
            {lang('Enter a valid note path without empty, dot, or parent segments.')}
          </Text>
        )
      )}
      {!!bodyFields.length && (
        <View>
          <View style={[commonStyles.separator, styles.divider]} />
          <List.Accordion
            title={'{{ }} · ' + bodyFields.length}
            accessibilityLabel={lang('Template preview') + ' · {{ }}: ' + bodyFields.length}
            titleStyle={commonStyles.smallText}
            style={styles.folder}
            expanded={expanded}
            onPress={() => setExpanded((current) => !current)}
          >
            <View style={styles.fields}>{bodyFields.map(field)}</View>
          </List.Accordion>
        </View>
      )}
      <View style={[styles.row, styles.formActions]}>
        <Text style={[commonStyles.smallText, styles.helper, styles.grow]}>
          {lang('Empty body fields remain as placeholders. Existing notes are never replaced.')}
        </Text>
      </View>
    </View>
  );
};
