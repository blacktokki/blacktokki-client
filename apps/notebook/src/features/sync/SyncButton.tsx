import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { List } from 'react-native-paper';

import { useNotebookSync } from './useNotebookSync';
import { CountBadge, RenderIcon } from '../../screens/main/home/ContentGroupSection';

export const SyncButton = () => {
  const { lang } = useLangContext();
  const { isSyncAvailable, diffCount } = useNotebookSync();

  if (!isSyncAvailable) return null;

  return (
    <List.Item
      title={lang('Sync Notebook')}
      onPress={() => navigate('SyncNotebook')}
      left={RenderIcon('sync')}
      right={() => <CountBadge count={diffCount} />}
    />
  );
};

export default SyncButton;
