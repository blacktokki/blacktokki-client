import { useLangContext } from '@blacktokki/core';
import React from 'react';

import { TemplateGraphBadge } from './TemplateGraphBadge';
import { getKnowledgeGraphPalette } from './palette';
import { TemplateGraphMode, templateGraphModeLabel } from './types';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';

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
  const caption = active ? lang(templateGraphModeLabel(mode)) : lang('Discovered templates');
  return (
    <TemplateGraphBadge
      active={active}
      label={caption + (active ? ` (${error ? '!' : working ? '…' : count})` : '')}
      icon="file-code-o"
      isDark={isDark}
      activeBackgroundColor={palette.template.fill}
      activeBorderColor={palette.template.stroke}
      activeTextColor={isDark ? commonStyles.container.backgroundColor : commonStyles.text.color}
      inactiveTextColor={commonStyles.text.color}
      accessibilityLabel={lang('Extracted Templates') + ': ' + (active ? caption : '×')}
      working={working}
      onToggle={onToggle}
    />
  );
};
