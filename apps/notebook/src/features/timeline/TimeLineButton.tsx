import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import { List } from 'react-native-paper';

import useTimeLine from './useTimeLine';
import { CountBadge, RenderIcon } from '../../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const { data } = useTimeLine();
  return (
    <List.Item
      title={lang('Timeline')}
      onPress={() => navigate('TimeLine')}
      left={RenderIcon('calendar')}
      right={() => <CountBadge count={data.length} />}
    />
  );
};
