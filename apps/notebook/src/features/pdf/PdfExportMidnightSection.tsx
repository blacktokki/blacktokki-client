import React from 'react';

import { NoteSectionProps } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { HeaderIconButton } from '../../screens/main/NoteItemSections';

export default (props: NoteSectionProps) => {
  const { commonStyles } = useNotebookTheme();

  const handlePress = async () => {
    const { exportPdf } = await import('./exportPdf');
    exportPdf(props, commonStyles, 'midnight');
  };

  return <HeaderIconButton name="file-pdf-o" onPress={handlePress} />;
};
