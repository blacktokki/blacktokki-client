import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { List } from 'react-native-paper';

import { RenderIcon } from '../../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  return (
    <List.Item
      title={lang('Quick Memo')}
      onPress={() => navigate('QuickMemo')}
      left={RenderIcon('note-plus-outline')}
    />
  );
};
