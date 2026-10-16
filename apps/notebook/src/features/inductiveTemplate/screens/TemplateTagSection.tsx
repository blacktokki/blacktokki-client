import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { NoteSectionProps } from '../../../hooks/useExtension';
import { useNotePages } from '../../../hooks/useNoteStorage';
import { isHiddenTitle } from '../../../hooks/usePrivate';
import { discoverTemplates } from '../discovery';
import { templateStyles as styles } from '../styles';
import { templateTagName, templatesForNote } from '../templateTags';
import { useInductiveTemplates } from '../useInductiveTemplates';

/** Show the same whole-note template memberships as the default template catalog. */
export default function TemplateTagSection({ title, paragraphs }: NoteSectionProps) {
  const { lang } = useLangContext();
  const { data: notes } = useNotePages();
  const noteExists = notes
    ? notes.find((note) => note.title.normalize('NFC') === title.normalize('NFC'))?.id !== undefined
    : undefined;
  const { isPrivate, enabled, examples, notebookRoots } = useInductiveTemplates(!!title);
  const { refetch } = examples;
  const description = paragraphs
    .map((paragraph) => paragraph.header + paragraph.description)
    .join('');
  useEffect(() => {
    if (enabled && title) refetch();
  }, [enabled, title, description, refetch]);
  const dateLabel = lang('Date');
  const templates = useMemo(() => {
    if (!enabled || !examples.data || examples.isError || (!isPrivate && isHiddenTitle(title)))
      return [];
    return templatesForNote(
      discoverTemplates(examples.data, dateLabel, notebookRoots),
      title,
      noteExists,
      notebookRoots
    );
  }, [
    enabled,
    examples.data,
    examples.isError,
    isPrivate,
    dateLabel,
    notebookRoots,
    title,
    noteExists,
  ]);

  return (
    <View style={styles.noteTags}>
      <View style={styles.noteTagRow}>
        {templates.map((template) => (
          <TouchableOpacity
            key={template.name}
            accessibilityRole="button"
            accessibilityLabel={lang('Extracted Templates') + ': ' + templateTagName(template)}
            onPress={() =>
              push('TemplateItem', {
                template,
                noteTitle: noteExists === false ? title : undefined,
              })
            }
          >
            <View style={styles.noteTagSurface}>
              <View style={styles.noteTagLabelRow}>
                <View style={styles.noteTagLabel}>
                  <Text selectable={false}>
                    {Array.from(templateTagName(template).normalize('NFC')).slice(0, 10).join('')}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
