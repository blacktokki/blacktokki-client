import { useColorScheme, useResizeContext } from '@blacktokki/core';
import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';

import { SearchBar, titleFormat } from '../../components/SearchBar';
import { createCommonStyles } from '../../styles';

export const NoteListSection = ({
  contents,
  isLoading,
  onPress,
  emptyMessage,
}: {
  contents: { title: string; section?: string; subtitle?: string; id?: number }[];
  isLoading: boolean;
  onPress: (title: string, section?: string, id?: number) => void;
  emptyMessage: string;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const window = useResizeContext();
  return (
    <>
      {window === 'portrait' && <SearchBar />}
      <View style={commonStyles.container}>
        {isLoading ? (
          <View style={[commonStyles.card, commonStyles.centerContent]}>
            <Text style={commonStyles.text}>로딩 중...</Text>
          </View>
        ) : contents.length > 0 ? (
          <FlatList
            data={contents}
            keyExtractor={(item) => JSON.stringify([item.title, item.section, item.id])}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={commonStyles.card}
                onPress={() => onPress(item.title, item.section, item.id)}
              >
                <Text style={commonStyles.title}>{titleFormat(item)}</Text>
                {item.subtitle !== undefined && (
                  <Text style={commonStyles.smallText}>{item.subtitle}</Text>
                )}
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        ) : (
          <View style={[commonStyles.card, commonStyles.centerContent]}>
            <Text style={commonStyles.text}>{emptyMessage}</Text>
          </View>
        )}
      </View>
    </>
  );
};
