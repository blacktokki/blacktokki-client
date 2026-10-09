import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { List } from 'react-native-paper';

import { RenderIcon } from '../../screens/main/home/ContentGroupSection';

export const TopicDashboardButton: React.FC = () => {
  const { lang } = useLangContext();
  return (
    <List.Item
      title={lang('Topic Dashboard')}
      onPress={() => navigate('TopicDashboard')}
      left={RenderIcon('view-dashboard-outline')}
    />
  );
};

export default TopicDashboardButton;
