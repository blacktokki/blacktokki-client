import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';

import useProblem from './useProblem';
import {
  ContentListItem,
  CountBadge,
  RenderIcon,
} from '../../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const { data } = useProblem();
  return (
    <ContentListItem
      title={lang('Edit Suggestions')}
      onPress={() => navigate('Problem')}
      left={RenderIcon('note-alert')}
      right={() => <CountBadge count={data.length} />}
    />
  );
};
