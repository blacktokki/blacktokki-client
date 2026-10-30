import { Spacer, useLangContext } from '@blacktokki/core';
import React, { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ListRenderItem } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import LoadingView from '../../components/LoadingView';
import { titleFormat } from '../../components/SearchBar';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { ParagraphKey } from '../../types';

type Item = {
  key?: string;
  title: string;
  subtitles?: string[];
  id?: number;
  link?: string;
} & ParagraphKey;

type NoteListProps = {
  contents: Item[];
  isLoading: boolean;
  onPress: (title: string, paragraph?: string, section?: string, item?: Item) => void;
  emptyMessage: string;
  onScrollEnd?: () => void;
};

const NoteRow = memo(function NoteRow({
  item,
  onPress,
  commonStyles,
}: {
  item: Item;
  onPress: NoteListProps['onPress'];
  commonStyles: ReturnType<typeof useNotebookTheme>['commonStyles'];
}) {
  return (
    <TouchableOpacity
      style={commonStyles.card}
      onPress={() => onPress(item.title, item.paragraph, item.section, item)}
    >
      <View style={commonStyles.searchContainer}>
        <Icon
          style={commonStyles.noteListIcon}
          name={item.link ? 'external-link' : 'file-text'}
          size={12}
          color={commonStyles.text.color}
        />
        <Text style={commonStyles.title}>{titleFormat(item)}</Text>
      </View>
      {(item.subtitles || []).map((subtitle, index) => (
        <Text key={index} style={commonStyles.smallText}>
          {subtitle}
        </Text>
      ))}
    </TouchableOpacity>
  );
});

const NoteSeparator = () => <Spacer height={8} />;
const itemKey = (item: Item, index: number) =>
  item.key ?? JSON.stringify([item.id, item.title, item.paragraph, item.section, item.link, index]);

export const NoteListSection = memo(function NoteListSection({
  contents,
  isLoading,
  onPress,
  emptyMessage,
  onScrollEnd,
}: NoteListProps) {
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) => <NoteRow item={item} onPress={onPress} commonStyles={commonStyles} />,
    [onPress, commonStyles]
  );
  return (
    <View style={commonStyles.flex}>
      {isLoading ? (
        <View style={commonStyles.container}>
          <LoadingView />
        </View>
      ) : contents.length > 0 ? (
        <FlatList
          data={contents}
          contentContainerStyle={commonStyles.container}
          keyExtractor={itemKey}
          renderItem={renderItem}
          ItemSeparatorComponent={NoteSeparator}
          onEndReached={onScrollEnd}
          onEndReachedThreshold={0.3}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
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
});
