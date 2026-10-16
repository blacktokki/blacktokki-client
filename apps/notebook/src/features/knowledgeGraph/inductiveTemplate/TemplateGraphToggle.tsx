import { useLangContext } from '@blacktokki/core';
import React from 'react';

import { getKnowledgeGraphPalette } from './palette';
import { TemplateGraphMode } from './types';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { KnowledgeGraphToggle } from '../components/KnowledgeGraphToggle';

export const TemplateGraphToggle = ({
  mode,
  count,
  working,
  error,
  onToggle,
}: {
  mode: TemplateGraphMode;
  count: number;
  working: boolean;
  error: boolean;
  onToggle: () => void;
}) => {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const palette = getKnowledgeGraphPalette(isDark);
  const active = mode !== 'off';
  const caption = lang('Discovered templates');
  return (
    <KnowledgeGraphToggle
      active={active}
      label={caption + (active ? ` (${error ? '!' : working ? '…' : count})` : '')}
      icon="file-code-o"
      activeBackgroundColor={palette.template.fill}
      activeBorderColor={palette.template.stroke}
      activeTextColor={
        isDark ? commonStyles.container.backgroundColor : commonStyles.buttonText.color
      }
      inactiveTextColor={commonStyles.text.color}
      accessibilityLabel={lang('Extracted Templates') + ': ' + (active ? caption : '×')}
      working={working}
      onToggle={onToggle}
    />
  );
};
