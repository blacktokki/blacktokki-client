import { useLangContext } from '@blacktokki/core';
import React from 'react';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { KnowledgeGraphToggle } from '../../components/KnowledgeGraphToggle';
import { getKnowledgeGraphPalette } from '../../utils/palette';

export function KeywordGraphToggle({
  enabled,
  count,
  working,
  disabled,
  progress,
  statusLabel,
  onToggle,
}: {
  enabled: boolean;
  count: number;
  working: boolean;
  disabled: boolean;
  progress?: number;
  statusLabel: string;
  onToggle: () => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const palette = getKnowledgeGraphPalette(isDark);
  return (
    <KnowledgeGraphToggle
      active={enabled}
      label={lang('Keywords and Relationships') + (enabled ? ` (${count})` : '')}
      icon="tags"
      activeBackgroundColor={palette.keyword.fill}
      activeBorderColor={palette.keyword.stroke}
      activeTextColor={
        isDark ? commonStyles.container.backgroundColor : commonStyles.buttonText.color
      }
      inactiveTextColor={commonStyles.text.color}
      working={working}
      disabled={disabled}
      progress={progress}
      accessibilityLabel={
        lang('Keywords and Relationships') + (disabled ? `: ${lang(statusLabel)}` : '')
      }
      onToggle={onToggle}
    />
  );
}
