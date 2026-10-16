import { useLangContext } from '@blacktokki/core';
import React from 'react';
import { Text, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
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
