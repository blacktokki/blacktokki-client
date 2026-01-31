import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import { List } from 'react-native-paper';

import useProblem from './useProblem';
import { CountBadge, RenderIcon } from '../../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const { data } = useProblem();
  return (
    <List.Item
      title={lang('Edit Suggestions')}
      onPress={() => navigate('Problem')}
      left={RenderIcon('note-alert')}
      right={() => <CountBadge count={data.length} />}
    />
  );
};
