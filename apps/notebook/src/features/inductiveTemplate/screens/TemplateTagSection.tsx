import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { NoteSectionProps } from '../../../hooks/useExtension';
import { useNotePages } from '../../../hooks/useNoteStorage';
import { isHiddenTitle } from '../../../hooks/usePrivate';
import { discoverTemplates } from '../discovery';
import { templateStyles as styles } from '../styles';
import { templateLinkParams } from '../template';
import { templateTagName, templatesForNote } from '../templateTags';
import { TemplateCandidate } from '../types';
import { useInductiveTemplates } from '../useInductiveTemplates';

/** Show the same whole-note template memberships as the default template catalog. */
export default function TemplateTagSection({ title, paragraphs }: NoteSectionProps) {
  const { lang } = useLangContext();
  const { data: notes } = useNotePages();
  const noteExists = notes
    ? notes.find((note) => note.title.normalize('NFC') === title.normalize('NFC'))?.id !== undefined
    : undefined;
  const { isPrivate, enabled, examples, notebookRoots, scope } = useInductiveTemplates(!!title);
  const { refetch } = examples;
  const opening = useRef(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
      opening.current = false;
    },
    [title, scope, notebookRoots]
  );
  const openTemplate = async (template: TemplateCandidate) => {
    if (opening.current) return;
    opening.current = true;
    const current = request.current;
    try {
      const params = await templateLinkParams(
        template,
        notebookRoots,
        noteExists === false ? title : undefined
      );
      if (current === request.current) push('TemplateItem', params);
    } catch {
      if (current === request.current)
        Alert.alert(lang('error'), lang('Could not discover templates.'));
    } finally {
      if (current === request.current) opening.current = false;
    }
  };
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
            onPress={() => openTemplate(template)}
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
