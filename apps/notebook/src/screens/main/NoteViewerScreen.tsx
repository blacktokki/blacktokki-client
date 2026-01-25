import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';

import {
  HeaderIconButton,
  NoteBottomSection,
  NotePageHeader,
  NotePageSection,
  pageStyles,
} from './NoteItemSections';
import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import { useNoteViewers } from '../../hooks/useNoteStorage';
import { paragraphByKey, paragraphDescription } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { NavigationParamList, ParagraphKey } from '../../types';

type NoteViewerScreenRouteProp = RouteProp<NavigationParamList, 'NoteViewer'>;

export const NoteViewerScreen: React.FC = () => {
  const isFocused = useIsFocused();
  const route = useRoute<NoteViewerScreenRouteProp>();
  const { key, paragraph, section } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const commonStyles = createCommonStyles(theme);
  const [toc, toggleToc] = useState(false);
  const [fullParagraph, toggleFullParagraph] = useState(false);
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
              {!!(paragraph || description || _window === 'portrait') && (
                <HeaderIconButton name="list" onPress={() => toggleToc(!toc)} />
              )}
            </View>
          </View>
          <View style={commonStyles.flex}>
            <NotePageSection active={!toc} description={description} />
            {
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
            }
          </View>
        </ScrollView>
      </>
    )
  );
};
