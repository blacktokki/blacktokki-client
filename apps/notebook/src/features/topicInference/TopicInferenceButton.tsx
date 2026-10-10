import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

/** The entry point deliberately performs no indexing or inference. */
export default function TopicInferenceButton() {
  const { lang } = useLangContext();
  return (
    <List.Item
      title={lang('Topic Explorer')}
      onPress={() => navigate('TopicInference')}
      left={(props) => <Icon name="text-box-search-outline" size={20} color={props.color} />}
    />
  );
}
