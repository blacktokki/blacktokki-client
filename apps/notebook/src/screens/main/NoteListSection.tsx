import { Spacer, useColorScheme, useLangContext } from '@blacktokki/core';
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import LoadingView from '../../components/LoadingView';
import { titleFormat } from '../../components/SearchBar';
import { createCommonStyles } from '../../styles';
import { ParagraphKey } from '../../types';

type Item = {
  title: string;
  subtitles?: string[];
  id?: number;
  link?: string;
} & ParagraphKey;

export const NoteListSection = ({
  contents,
  isLoading,
  onPress,
  emptyMessage,
  onScrollEnd,
}: {
  contents: Item[];
  isLoading: boolean;
  onPress: (title: string, paragraph?: string, section?: string, item?: Item) => void;
  emptyMessage: string;
  onScrollEnd?: () => void;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();
  const height = useRef(0);
  return (
    <View style={{ flex: 1 }}>
      {isLoading ? (
        <View style={commonStyles.container}>
          <LoadingView />
        </View>
      ) : contents.length > 0 ? (
        <FlatList
          data={contents}
          contentContainerStyle={commonStyles.container}
          keyExtractor={(item, i) => `${i}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={commonStyles.card}
              onPress={() => onPress(item.title, item.paragraph, item.section, item)}
            >
              <View style={{ flexDirection: 'row' }}>
                <Icon
                  style={{ top: 6, paddingRight: 6 }}
                  name={item.link ? 'external-link' : 'file-text'}
                  size={12}
                  color={commonStyles.text.color}
                />
                <Text style={commonStyles.title}>{titleFormat(item)}</Text>
              </View>
              {(item.subtitles || []).map((subtitle, index) => (
                <Text key={index} style={[commonStyles.smallText]}>
                  {subtitle}
                </Text>
              ))}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <Spacer height={8} />}
          onScroll={(e) => {
            if (
              e.nativeEvent.contentSize.height - height.current - e.nativeEvent.contentOffset.y <
              1
            )
              onScrollEnd?.();
          }}
          onLayout={(p) => {
            height.current = p.nativeEvent.layout.height;
          }}
        />
      ) : (
        <View style={commonStyles.container}>
          <View style={[commonStyles.card, commonStyles.centerContent]}>
            <Text selectable={false} style={commonStyles.text}>
              {lang(emptyMessage)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};
