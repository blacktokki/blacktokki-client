import { useColorScheme } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useBoardPages } from '../../hooks/useBoardStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

const BoardTag = ({ title }: { title: string }) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();

  return (
    <TouchableOpacity
      onPress={() => navigation.push('BoardPage', { title })}
      style={styles.tagWrapper}
    >
      <View
        style={[styles.tagContainer, { backgroundColor: commonStyles.navButton.backgroundColor }]}
      >
        <Icon name="columns" size={12} color={commonStyles.text.color} style={{ marginRight: 6 }} />
        <Text style={[commonStyles.smallText, { fontWeight: 'bold' }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default function BoardTagSection({ noteId }: { noteId?: number }) {
  const { data: boards = [] } = useBoardPages();

  const connectedBoards = boards.filter((board) =>
    board.option.BOARD_NOTE_IDS?.includes(noteId || -1)
  );

  if (connectedBoards.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.row}>
        {connectedBoards.map((board) => (
          <BoardTag key={board.id} title={board.title} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    height: 0,
  },
  row: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  tagWrapper: {
    overflow: 'hidden',
  },
  tagContainer: {
    margin: 4,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
});
