import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { List } from 'react-native-paper';

import { useTopicConnections } from './links/useTopicConnections';
import { CountBadge, RenderIcon } from '../../screens/main/home/ContentGroupSection';

export const TopicDashboardButton: React.FC = () => {
  const { lang } = useLangContext();
  const { proposalCount, isLoading, isError } = useTopicConnections();
  return (
    <List.Item
      title={lang('Topic Dashboard')}
      onPress={() => navigate('TopicDashboard')}
      left={RenderIcon('view-dashboard-outline')}
      right={() => <CountBadge count={isLoading || isError ? 0 : proposalCount} />}
    />
  );
};

export default TopicDashboardButton;
