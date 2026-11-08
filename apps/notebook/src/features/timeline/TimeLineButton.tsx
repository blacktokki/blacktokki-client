import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';

import useTimeLine from './useTimeLine';
import {
  ContentListItem,
  CountBadge,
  RenderIcon,
} from '../../screens/main/home/ContentGroupSection';

export default () => {
  const { lang } = useLangContext();
  const { data } = useTimeLine();
  return (
    <ContentListItem
      title={lang('Timeline')}
      onPress={() => navigate('TimeLine')}
      left={RenderIcon('calendar')}
      right={() => <CountBadge count={data.length} />}
    />
  );
};
