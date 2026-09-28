import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { List } from 'react-native-paper';

import { useNotebookSync } from './useNotebookSync';
import { useUsageMode } from '../../hooks/useUsageMode';
import { CountBadge, RenderIcon } from '../../screens/main/home/ContentGroupSection';

export const SyncButton = () => {
  const { lang } = useLangContext();
  const { usageMode, notebook } = useUsageMode();
  const { isSyncAvailable, diffCount } = useNotebookSync();

  if (usageMode !== 'NOTEBOOK' || !notebook?.title) return null;

  return (
    <List.Item
      title={lang('Sync Notebook')}
      onPress={() => navigate('SyncNotebook')}
      left={RenderIcon('sync')}
      right={() => (isSyncAvailable ? <CountBadge count={diffCount} /> : null)}
    />
  );
};

export default SyncButton;
