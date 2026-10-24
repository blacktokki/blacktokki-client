import { Spacer, useLangContext } from '@blacktokki/core';
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import LoadingView from '../../components/LoadingView';
import { titleFormat } from '../../components/SearchBar';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
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
  scrollEnabled = true,
}: {
  contents: Item[];
  isLoading: boolean;
  onPress: (title: string, paragraph?: string, section?: string, item?: Item) => void;
  emptyMessage: string;
  onScrollEnd?: () => void;
  /** Render ordinary rows when a parent screen owns scrolling. */
  scrollEnabled?: boolean;
}) => {
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  const height = useRef(0);
  const renderItem = ({ item }: { item: Item }) => (
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
  );
  const containerStyle = [commonStyles.container, !scrollEnabled && styles.content];
  return (
    <View style={scrollEnabled && commonStyles.flex}>
      {isLoading ? (
        <View style={containerStyle}>
          <LoadingView />
        </View>
      ) : contents.length > 0 && !scrollEnabled ? (
        <View style={containerStyle}>
          {contents.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <Spacer height={8} />}
              {renderItem({ item })}
            </React.Fragment>
          ))}
        </View>
      ) : contents.length > 0 ? (
        <FlatList
          data={contents}
          contentContainerStyle={commonStyles.container}
          keyExtractor={(item, i) => `${i}`}
          renderItem={renderItem}
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
        <View style={containerStyle}>
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

const styles = StyleSheet.create({
  content: { flex: 0 },
});
