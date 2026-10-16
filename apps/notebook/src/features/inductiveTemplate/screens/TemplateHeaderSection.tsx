import React from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { HeaderIconButton, pageStyles } from '../../../screens/main/NoteItemSections';
import { templateStyles as styles } from '../styles';

/** Keep the source-list toggle and new-note actions in the same header in both views. */
export const TemplateHeaderSection = ({
  templateName,
  canWrite,
  onSources,
  onWriting,
}: {
  templateName: string;
  canWrite: boolean;
  onSources: () => void;
  onWriting: () => void;
}) => {
  const { commonStyles } = useNotebookTheme();
  return (
    <View style={[commonStyles.header, pageStyles.header, styles.wrap]}>
      <Text accessibilityRole="header" style={[commonStyles.title, pageStyles.title, styles.grow]}>
        {templateName}
      </Text>
      <View style={pageStyles.actionButtons}>
        <HeaderIconButton name="list" onPress={onSources} />
        <HeaderIconButton
          name="pencil"
          color={canWrite ? undefined : commonStyles.smallText.color}
          onPress={() => {
            if (canWrite) onWriting();
          }}
        />
      </View>
    </View>
  );
};
