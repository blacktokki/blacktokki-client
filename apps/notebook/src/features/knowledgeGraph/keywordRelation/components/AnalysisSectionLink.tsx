import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React from 'react';
import { Text } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { relationSectionParams } from '../relationPresentation';
import { AnalysisNameLink } from './AnalysisNameLink';

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
