import { useResizeContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';

import {
  FullNoteSection,
  HeaderIconButton,
  NoteBottomSection,
  NotePageHeader,
  NotePageSection,
  pageStyles,
} from './NoteItemSections';
import {
  paragraphByKey,
  paragraphDescription,
  parseHtmlToParagraphs,
} from '../../components/HeaderSelectBar';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import { useNoteViewers } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NavigationParamList, ParagraphKey } from '../../types';

type NoteViewerScreenRouteProp = RouteProp<NavigationParamList, 'NoteViewer'>;

export const NoteViewerScreen: React.FC = () => {
  const isFocused = useIsFocused();
  const route = useRoute<NoteViewerScreenRouteProp>();
  const { key, paragraph, section } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const _window = useResizeContext();
  const { commonStyles } = useNotebookTheme();
  const [toc, toggleToc] = useState(false);
  const [fullParagraph, toggleFullParagraph] = useState(false);
  const [onlyPageSection, setOnlyPageSection] = useState(false);
  const { data: viewers } = useNoteViewers();

  const page = viewers?.find((v) => v.key === key);

  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const paragraphItem = paragraphs.find((v) =>
    paragraphByKey(v, paragraph ? { paragraph, section } : { paragraph })
  );
  const [description, setDescription] = useState<string>();
  useEffect(() => {
    setDescription(
      paragraphItem
        ? fullParagraph
          ? paragraphDescription(paragraphs, paragraphItem?.path, true)
          : paragraphItem?.description
        : page?.description?.trim()
    );
  }, [page, paragraphItem?.path, fullParagraph]);
  useEffect(() => {
    toggleToc(false);
  }, [route]);
  useEffect(() => {
    setOnlyPageSection(false);
  }, [key]);

  if (onlyPageSection) {
    return (
      isFocused && (
        <FullNoteSection
          description={description}
          onClose={() => setOnlyPageSection(false)}
          toc={toc}
          fullParagraph={fullParagraph}
          root={key}
          path={paragraphItem?.path}
          paragraphs={paragraphs}
          onPress={(moveParagraph) => {
            toggleFullParagraph(true);
            const params: ParagraphKey = toNoteParams(
              key,
              moveParagraph.level === 0 ? undefined : moveParagraph.title,
              moveParagraph.autoSection
            );
            delete (params as { title?: string }).title;
            navigation.navigate('NoteViewer', { key, ...params });
          }}
        />
      )
    );
  }

  return (
    isFocused && (
      <>
        <ResponsiveSearchBar />
        <ScrollView
          //@ts-ignore
          style={[commonStyles.container, pageStyles.container]}
          contentContainerStyle={pageStyles.contentContainer}
        >
          <View style={[commonStyles.header, pageStyles.header]}>
            <NotePageHeader
              title={key}
              paragraph={paragraph}
              pressable={false}
              onPress={(key, hasChild) =>
                (hasChild ? navigation.push : navigation.navigate)('NoteViewer', { key })
              }
            />
            <View style={pageStyles.actionButtons}>
              {!!paragraph && (
                <HeaderIconButton
                  name={fullParagraph ? 'compress' : 'expand'}
                  onPress={() => toggleFullParagraph(!fullParagraph)}
                />
              )}
              {(_window === 'landscape' || !toc) && (
                <HeaderIconButton
                  name="window-maximize"
                  onPress={() => {
                    toggleFullParagraph(true);
                    setOnlyPageSection(true);
                  }}
                />
              )}
              {!!(paragraph || description || _window === 'portrait') && (
                <HeaderIconButton name="list" onPress={() => toggleToc(!toc)} />
              )}
            </View>
          </View>
          <View style={commonStyles.flex}>
            <NotePageSection active={!toc} description={description} />
            <NoteBottomSection
              toc={toc}
              fullParagraph={fullParagraph}
              root={key}
              path={paragraphItem?.path}
              paragraphs={paragraphs}
              onPress={(moveParagraph) => {
                const params: ParagraphKey = toNoteParams(
                  key,
                  moveParagraph.level === 0 ? undefined : moveParagraph.title,
                  moveParagraph.autoSection
                );
                delete (params as { title?: string }).title;
                navigation.navigate('NoteViewer', { key, ...params });
              }}
            />
          </View>
        </ScrollView>
      </>
    )
  );
};
