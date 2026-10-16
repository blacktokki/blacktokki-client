import React from 'react';
import { View } from 'react-native';

import { TemplateHeaderSection } from './TemplateHeaderSection';
import { NotePageSection } from '../../../screens/main/NoteItemSections';

/** Reuse the note page's header and auto-resizing body; source browsing stays a separate stage. */
export const TemplatePreviewSection = ({
  templateName,
  templateHtml,
  busy,
  onSources,
  onWriting,
}: {
  templateName: string;
  templateHtml: string;
  busy: boolean;
  onSources: () => void;
  onWriting: () => void;
}) => {
  const canWrite = !busy && !!templateHtml.trim();
  return (
    <View>
      <TemplateHeaderSection
        templateName={templateName}
        canWrite={canWrite}
        onSources={onSources}
        onWriting={onWriting}
      />
      <NotePageSection active description={templateHtml} />
    </View>
  );
};
