import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';

import { ContentListItem, RenderIcon } from '../../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  return (
    <ContentListItem
      title={lang('Temporary Memo')}
      onPress={() => navigate('TempMemo')}
      left={RenderIcon('note-plus-outline')}
    />
  );
};
