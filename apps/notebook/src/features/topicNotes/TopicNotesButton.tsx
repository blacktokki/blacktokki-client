import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const TopicNotesButton: React.FC = () => {
  const { lang } = useLangContext();

  return (
    <List.Item
      title={lang('Topic Notes') || '주제 노트'}
      onPress={() => navigate('TopicNotes')}
      left={(p) => (
        <View style={[p.style, styles.iconContainer]}>
          <Icon name="format-list-bulleted" size={18} color={p.color} />
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 0,
    marginRight: 4,
    alignSelf: 'center',
  },
});

export default TopicNotesButton;
