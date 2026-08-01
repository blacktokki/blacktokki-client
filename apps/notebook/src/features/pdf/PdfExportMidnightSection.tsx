import React from 'react';

import { exportPdf } from './exportPdf';
import { NoteSectionProps } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { HeaderIconButton } from '../../screens/main/NoteItemSections';

export default (props: NoteSectionProps) => {
  const { commonStyles } = useNotebookTheme();

  const handlePress = () => {
    exportPdf(props, commonStyles, 'midnight');
  };

  return <HeaderIconButton name="file-pdf-o" onPress={handlePress} />;
};
