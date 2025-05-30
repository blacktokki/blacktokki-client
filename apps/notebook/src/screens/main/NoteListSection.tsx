import { useColorScheme, useLangContext } from '@blacktokki/core';
import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';

import { titleFormat } from '../../components/SearchBar';
import { createCommonStyles } from '../../styles';

export const NoteListSection = ({
  contents,
  isLoading,
  onPress,
  emptyMessage,
}: {
  contents: {
    title: string;
    paragraph?: string;
    subtitles?: string[];
    id?: number;
  }[];
  isLoading: boolean;
  onPress: (title: string, paragraph?: string, id?: number) => void;
  emptyMessage: string;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();
  return (
    <View style={commonStyles.container}>
      {isLoading ? (
        <View style={[commonStyles.card, commonStyles.centerContent]}>
          <Text style={commonStyles.text}>로딩 중...</Text>
        </View>
      ) : contents.length > 0 ? (
        <FlatList
          data={contents}
          keyExtractor={(item) => JSON.stringify([item.title, item.paragraph, item.id])}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={commonStyles.card}
              onPress={() => onPress(item.title, item.paragraph, item.id)}
            >
              <Text style={commonStyles.title}>{titleFormat(item)}</Text>
              {(item.subtitles || []).map((subtitle, index) => (
                <Text key={index} style={[commonStyles.smallText]}>
                  {subtitle}
                </Text>
              ))}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      ) : (
        <View style={[commonStyles.card, commonStyles.centerContent]}>
          <Text selectable={false} style={commonStyles.text}>
            {lang(emptyMessage)}
          </Text>
        </View>
      )}
    </View>
  );
};
