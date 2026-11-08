import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';

import { ContentListItem, RenderIcon } from '../../../screens/main/home/ContentGroupSection';

export default function InductiveTemplateButton() {
  const { lang } = useLangContext();
  return (
    <ContentListItem
      title={lang('Extracted Templates')}
      onPress={() => navigate('TemplateList')}
      left={RenderIcon('file-document-multiple-outline')}
    />
  );
}
