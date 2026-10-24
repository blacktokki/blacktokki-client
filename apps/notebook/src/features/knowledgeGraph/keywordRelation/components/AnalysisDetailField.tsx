/** Detail fields and navigable keyword, note and section values. */
import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { Icon } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { relationSectionParams } from '../relationPresentation';
import { relationAnalysisStyles as styles } from '../styles';

const fieldIcons: Record<string, string> = {
  Note: 'file-document-outline',
  Paragraph: 'format-paragraph',
  Entity: 'tag-outline',
};

/** Shared label/value alignment for relationship evidence and keyword provenance. */
export function AnalysisDetailField({
  label,
  showIcon = true,
  children,
}: {
  label: string;
  showIcon?: boolean;
  children: React.ReactNode;
}) {
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  return (
    <View style={styles.detailField}>
      {showIcon && fieldIcons[label] ? (
        <View
          accessible
          accessibilityLabel={lang(label)}
          style={[styles.iconLabel, styles.fieldIcon]}
        >
          <Icon source={fieldIcons[label]} size={20} color={commonStyles.text.color} />
        </View>
      ) : (
        <Text style={[commonStyles.smallText, styles.fieldLabel]}>{lang(label)}</Text>
      )}
      <View style={styles.fieldValue}>{children}</View>
    </View>
  );
}

/** Names navigate within the analysis workspace without leaving its model session. */
export function AnalysisNameLink({
  name,
  onPress,
  variant = 'text',
}: {
  name: string;
  onPress: () => void;
  variant?: 'text' | 'chip' | 'field';
}) {
  const { commonStyles } = useNotebookTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={onPress}
      style={[
        styles.nameLink,
        variant === 'chip' && [commonStyles.resultsContainer, styles.entityChip],
        variant === 'field' && styles.fieldLink,
      ]}
    >
      <Text style={[commonStyles.text, variant !== 'chip' && styles.linkText]}>{name}</Text>
    </Pressable>
  );
}

export function AnalysisSectionLink({
  noteTitle,
  section,
  sectionPath,
}: {
  noteTitle: string;
  section: string;
  sectionPath?: string[];
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  return section ? (
    <AnalysisNameLink
      name={section}
      onPress={() => push('NotePage', relationSectionParams(noteTitle, section, sectionPath))}
      variant="field"
    />
  ) : (
    <Text style={commonStyles.text}>{lang('None')}</Text>
  );
}
