import { useLangContext } from '@blacktokki/core';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { TemplateChoice } from './TemplateChoice';
import { templateStyles as styles } from './styles';
import { groupNotePaths, TitleFolder } from './titleGrouping';
import { ExampleNote } from './types';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export const SimilarNotesSection = ({
  templateName,
  notes,
  notebookRoots,
  height,
  selectedTitle,
  onPreviewTemplate,
  onSelect,
}: {
  templateName: string;
  notes: ExampleNote[];
  notebookRoots: string[];
  height: number;
  selectedTitle?: string;
  onPreviewTemplate: () => void;
  onSelect: (title: string) => void;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => groupNotePaths(notes, notebookRoots), [notes, notebookRoots]);
  const toggle = (current: Set<string>, id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const renderNote = (note: ExampleNote) => (
    <TemplateChoice
      key={note.title}
      label={note.title}
      selected={selectedTitle === note.title}
      style={styles.noteRow}
      onPress={() => onSelect(note.title)}
    >
      <View style={styles.row}>
        <Icon source="file-document-outline" size={16} color={commonStyles.smallText.color} />
        <Text style={[commonStyles.text, styles.noteText, styles.grow]} numberOfLines={2}>
          {note.title.split('/').at(-1)}
        </Text>
        {selectedTitle === note.title && (
          <Icon source="check" size={16} color={commonStyles.text.color} />
        )}
      </View>
    </TemplateChoice>
  );
  const renderFolder = (folder: TitleFolder, topLevel = false): React.JSX.Element => {
    const expanded = !collapsedFolders.has(folder.id);
    return (
      <View key={folder.id}>
        <TemplateChoice
          label={folder.path}
          style={topLevel ? styles.sourceRootRow : styles.noteRow}
          expanded={expanded}
          onPress={() => setCollapsedFolders((current) => toggle(current, folder.id))}
        >
          <View style={styles.row}>
            <Icon
              source="folder-outline"
              size={topLevel ? 20 : 16}
              color={commonStyles.text.color}
            />
            <Text
              style={[
                commonStyles.text,
                topLevel ? styles.sourceRootText : styles.noteText,
                styles.grow,
              ]}
              numberOfLines={2}
            >
              {folder.name}
            </Text>
            <Text style={[commonStyles.smallText, styles.label]}>{folder.count}</Text>
            <Icon
              source={expanded ? 'chevron-down' : 'chevron-right'}
              size={16}
              color={commonStyles.smallText.color}
            />
          </View>
        </TemplateChoice>
        {expanded && (
          <View style={[styles.children, { borderLeftColor: commonStyles.card.borderColor }]}>
            {folder.folders.map((child) => renderFolder(child))}
            {folder.groups.flatMap((group) => group.notes).map(renderNote)}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[commonStyles.card, styles.panel, { height }]}>
      <ScrollView
        style={styles.noteList}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <TemplateChoice
          label={lang('Template preview') + ': ' + templateName}
          selected={!selectedTitle}
          style={styles.sourceRootRow}
          onPress={onPreviewTemplate}
        >
          <View style={styles.row}>
            <Icon
              source="file-document-multiple-outline"
              size={20}
              color={commonStyles.text.color}
            />
            <Text style={[commonStyles.text, styles.sourceRootText, styles.grow]} numberOfLines={2}>
              {templateName}
            </Text>
            {!selectedTitle && <Icon source="check" size={16} color={commonStyles.text.color} />}
          </View>
        </TemplateChoice>
        {tree.folders.map((folder) => renderFolder(folder, true))}
        {tree.groups.flatMap((group) => group.notes).map(renderNote)}
        {!notes.length && (
          <View style={styles.empty}>
            <Icon source="file-document-outline" size={32} color={commonStyles.smallText.color} />
            <Text style={[commonStyles.smallText, styles.emptyText]}>
              {lang('No similar notes.')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};
