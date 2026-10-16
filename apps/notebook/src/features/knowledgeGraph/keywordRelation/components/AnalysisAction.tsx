import { useLangContext } from '@blacktokki/core';
import React from 'react';
import { AccessibilityState } from 'react-native';
import { Button, IconButton } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { relationAnalysisStyles as styles } from '../styles';

/** Offer visible captions where action icons alone do not explain their purpose. */
export function AnalysisAction({
  label,
  icon,
  onPress,
  disabled,
  loading,
  mode,
  accessibilityState,
  accessibilityHint,
  showLabel = false,
}: {
  label: string;
  icon: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  mode?: 'outlined' | 'contained';
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
  showLabel?: boolean;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const actionProps = {
    icon,
    accessibilityLabel: lang(label),
    accessibilityHint: accessibilityHint && lang(accessibilityHint),
    accessibilityState,
    onPress,
    disabled,
    loading,
    style: styles.detailToggle,
  };
  if (showLabel)
    return (
      <Button
        {...actionProps}
        mode={mode || 'text'}
        contentStyle={styles.buttons}
        buttonColor={mode === 'contained' ? commonStyles.button.backgroundColor : undefined}
        textColor={mode === 'contained' ? commonStyles.buttonText.color : commonStyles.text.color}
      >
        {lang(label)}
      </Button>
    );
  return (
    <IconButton
      {...actionProps}
      mode={mode}
      size={22}
      containerColor={mode === 'contained' ? commonStyles.button.backgroundColor : undefined}
      iconColor={mode === 'contained' ? commonStyles.buttonText.color : commonStyles.text.color}
    />
  );
}
