import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import {
  getIconColor,
  NoteBottomSection,
  NotePageHeader,
  NotePageSection,
  pageStyles,
} from './NoteItemSections';
import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { SearchBar } from '../../components/SearchBar';
import { useNoteViewers } from '../../hooks/useNoteStorage';
import { paragraphDescription } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type NoteViewerScreenRouteProp = RouteProp<NavigationParamList, 'NoteViewer'>;

export const NoteViewerScreen: React.FC = () => {
  const isFocused = useIsFocused();
  const route = useRoute<NoteViewerScreenRouteProp>();
  const { key, paragraph } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const commonStyles = createCommonStyles(theme);
  const [toc, toggleToc] = useState(false);
  const [fullParagraph, toggleFullParagraph] = useState(false);
  const { data: viewers } = useNoteViewers();

  const page = viewers?.find((v) => v.key === key);

  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const paragraphItem = paragraphs.find((v) => v.title === paragraph);
  const [description, setDescription] = useState<string>();
  useEffect(() => {
    setDescription(
      paragraphItem
        ? fullParagraph
          ? paragraphDescription(paragraphs, paragraphItem.path, true)
          : paragraphItem.description
        : page?.description?.trim()
    );
  }, [page, paragraphItem?.path, fullParagraph]);
  useEffect(() => {
    toggleToc(false);
  }, [route]);
  const iconColor = getIconColor(theme);
  return (
    isFocused && (
      <>
        {_window === 'portrait' && <SearchBar />}
        <ScrollView
          //@ts-ignore
          style={[commonStyles.container, pageStyles.container]}
          contentContainerStyle={pageStyles.contentContainer}
        >
          <View style={[commonStyles.header, { zIndex: 1, alignItems: 'flex-start' }]}>
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
                <>
                  <TouchableOpacity
                    onPress={() => toggleFullParagraph(!fullParagraph)}
                    style={pageStyles.actionButton}
                  >
                    <Icon
                      name={fullParagraph ? 'compress' : 'expand'}
                      size={16}
                      color={iconColor}
                    />
                  </TouchableOpacity>
                </>
              )}
              {!!(paragraph || description) && (
                <>
                  <TouchableOpacity onPress={() => toggleToc(!toc)} style={pageStyles.actionButton}>
                    <Icon name="list" size={16} color={iconColor} />
                  </TouchableOpacity>
                </>
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
                onPress={(paragraph) =>
                  navigation.navigate(
                    'NoteViewer',
                    paragraph.level === 0 ? { key } : { key, paragraph: paragraph.title }
                  )
                }
              />
            }
          </View>
        </ScrollView>
      </>
    )
  );
};
