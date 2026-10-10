import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { List } from 'react-native-paper';

import { RenderIcon } from '../../screens/main/home/ContentGroupSection';

export default function InductiveTemplateButton() {
  const { lang } = useLangContext();
  return (
    <List.Item
      title={lang('Extracted Templates')}
      onPress={() => navigate('InductiveTemplates')}
      left={RenderIcon('file-document-multiple-outline')}
    />
  );
}
