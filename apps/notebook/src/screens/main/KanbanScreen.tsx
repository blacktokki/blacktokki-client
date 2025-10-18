import { useColorScheme, useLangContext, useResizeContext, Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { Suspense, useMemo, useRef } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { getIconColor, pageStyles } from './NoteItemSections';
import { renderCardPage, useToCardPage } from './RecentPageSection';
import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import Kanban from '../../components/Kanban';
import { SearchBar, toNoteParams } from '../../components/SearchBar';
import { useNotePages } from '../../hooks/useNoteStorage';
import { paragraphDescription } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

const board = {
  title: 'My Kanban',
  option: {
    BOARD_NOTE_IDS: [18, 26504],
    BOARD_HEADER_LEVEL: 4,
  },
};

export const KanbanScreen: React.FC = () => {
  const _window = useResizeContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();
  const accessableRef = useRef(true);
  const { data: pages = [] } = useNotePages();
  const iconColor = getIconColor(theme);
  const horizontal = true;
  const toCardPage = useToCardPage((v) => {
    if (accessableRef.current) {
      if (v.paragraph) {
        navigation.push(
          'NotePage',
          toNoteParams(v.paragraph.origin, v.paragraph.title, v.paragraph.autoSection)
        );
      }
    } else {
      accessableRef.current = true;
    }
  });
  const columns = useMemo(
    () =>
      board.option.BOARD_NOTE_IDS.map((v) => pages.find((v2) => v === v2.id))
        .filter((v) => v !== undefined)
        .map((page) => {
          const paragraphs = parseHtmlToParagraphs(page?.description || '');
          return {
            name: page.title,
            data: paragraphs
              .filter((v) => v.level === board.option.BOARD_HEADER_LEVEL)
              .map((v) => {
                const parent = paragraphs.findLast(
                  (v2) => v.path.startsWith(v2.path) && v2.level + 1 === v.level
                );
                return {
                  title: (parent?.title ? parent.title + ' / ' : '') + v.title,
                  description: paragraphDescription(paragraphs, v.path, false).trim(),
                  paragraph: { ...v, origin: page.title },
                };
              }),
          };
        }),
    [pages, board]
  );
  return (
    <>
      {_window === 'portrait' && <SearchBar />}
      <ScrollView
        //@ts-ignore
        style={[commonStyles.container, pageStyles.container]}
        contentContainerStyle={pageStyles.contentContainer}
      >
        <View style={[commonStyles.header, { zIndex: 1, alignItems: 'flex-start' }]}>
          <View
            style={{
              flexDirection: 'row',
              maxWidth: '100%',
              flexBasis: 0,
              flexGrow: 1,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <TouchableOpacity onPress={() => {}} style={{ maxWidth: '100%' }}>
              <Text style={[commonStyles.title, pageStyles.title]} numberOfLines={1}>
                {board.title}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={pageStyles.actionButtons}>
            <TouchableOpacity onPress={() => {}} style={pageStyles.actionButton}>
              <Icon name="pencil" size={16} color={iconColor} />
            </TouchableOpacity>
          </View>
        </View>
        <Kanban
          horizontal={horizontal}
          columns={columns}
          columnStyle={{ borderColor: commonStyles.text.color }}
          renderHeader={({ item }) => (
            <TouchableOpacity onPress={() => navigation.push('NotePage', { title: item.name })}>
              <Text selectable={false} style={commonStyles.title}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
          renderItem={({ item, index }) => {
            return <Suspense>{renderCardPage({ item: toCardPage(item), index })}</Suspense>;
          }}
          onStart={() => {
            accessableRef.current = false;
          }}
          onEnd={(data, key, nextKey) => {
            console.log(data, key, nextKey);
            return false;
          }}
        />
      </ScrollView>
    </>
  );
};
