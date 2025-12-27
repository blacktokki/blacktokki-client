import { useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import DiffMatchPatch from 'diff-match-patch';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { parseHtmlToParagraphs } from '../../../components/HeaderSelectBar';
import { SearchBar, toNoteParams } from '../../../components/SearchBar';
import { useNotePage, useSnapshotAll } from '../../../hooks/useNoteStorage';
import { paragraphByKey, paragraphDescription } from '../../../hooks/useProblem';
import { createCommonStyles } from '../../../styles';
import { NavigationParamList } from '../../../types';
import {
  getIconColor,
  NoteBottomSection,
  NotePageHeader,
  NotePageSection,
  pageStyles,
} from '../NoteItemSections';
import TimerTagSection from './TimerTagSection';
import { isHiddenTitle, usePrivacy, useSetPrivacy } from '../../../hooks/usePrivacy';

type NotePageScreenRouteProp = RouteProp<NavigationParamList, 'NotePage'>;

const diffToSnapshot = (original: string, delta: string) => {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_fromDelta(original, delta);
  return dmp.diff_text2(diffs);
};

export const NotePageScreen: React.FC = () => {
  const isFocused = useIsFocused();
  const route = useRoute<NotePageScreenRouteProp>();
  const { title, paragraph, section, archiveId, kanban } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const { lang } = useLangContext();
  const commonStyles = createCommonStyles(theme);
  const [_toc, toggleToc] = useState(false);
  const toc = _window === 'portrait' ? _toc : false;
  const [fullParagraph, toggleFullParagraph] = useState(false);

  const { data: page, isFetching } = useNotePage(title);
  const { data: _archives } = useSnapshotAll(archiveId ? page?.id : undefined);
  const { isPrivacyMode } = usePrivacy();
  const setPrivacy = useSetPrivacy();
  const archiveIndex = _archives?.findIndex((v) => v.id === archiveId);
  const archive =
    _archives && archiveIndex && archiveIndex > 0
      ? {
          ..._archives[archiveIndex],
          previous: _archives[archiveIndex - 1]?.id,
          next: _archives[archiveIndex + 1]?.id,
        }
      : undefined;
  const snapshot =
    archive?.type === 'DELTA'
      ? _archives?.find((v) => archive.option.SNAPSHOT_ID === v.id)
      : undefined;
  const handleEdit = () => {
    navigation.navigate('EditPage', { ...toNoteParams(title, paragraph, section), kanban });
  };

  const handleMovePage = () => {
    navigation.navigate('MovePage', paragraph ? { title, paragraph, section } : { title });
  };

  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const paragraphItem = paragraphs.find((v) =>
    paragraphByKey(v, paragraph ? { paragraph, section } : { paragraph })
  );
  const [description, setDescription] = useState<string>();
  useEffect(() => {
    setDescription(
      archive
        ? snapshot?.description && archive.description
          ? diffToSnapshot(snapshot.description, archive.description)
          : archive.description
        : paragraphItem
        ? fullParagraph
          ? paragraphDescription(paragraphs, paragraphItem.path, true).trim()
          : paragraphItem?.description
        : page?.description?.trim()
    );
  }, [page, archive, paragraphItem?.path, fullParagraph]);
  useEffect(() => {
    toggleToc(false);
  }, [route]);
  useEffect(() => {
    if (page !== undefined && paragraph !== undefined && paragraphItem === undefined) {
      navigation.navigate('NotePage', { title, paragraph: undefined });
    }
  }, [page, paragraph, paragraphItem]);
  const iconColor = getIconColor(theme);
  if (!isPrivacyMode && isHiddenTitle(title)) {
    return (
      <>
        {_window === 'portrait' && <SearchBar />}
        <View style={commonStyles.container}>
          <View style={commonStyles.statusCard}>
            <Text style={commonStyles.text}>{lang('This note is hidden by Privacy Mode.')}</Text>
            <TouchableOpacity onPress={() => setPrivacy.mutate(true)} style={commonStyles.button}>
              <Text style={commonStyles.buttonText}>{lang('Enable Privacy Mode')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }
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
              title={title}
              paragraph={paragraph}
              archive={archive}
              kanban={kanban}
              onPress={(title, hasChild) =>
                (hasChild ? navigation.push : navigation.navigate)('NotePage', { title, kanban })
              }
            />
            <View style={pageStyles.actionButtons}>
              <TimerTagSection
                title={page?.title || ''}
                path={paragraphItem?.path}
                fullParagraph={fullParagraph}
                paragraphs={paragraphs}
              />
              {!paragraphItem && (
                <>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Archive', { title })}
                    style={pageStyles.actionButton}
                  >
                    <Icon name="history" size={16} color={iconColor} />
                  </TouchableOpacity>
                </>
              )}
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
              {!!(paragraph || description) && !archive && _window === 'portrait' && (
                <>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('RecentPages', { title })}
                    style={pageStyles.actionButton}
                  >
                    <Icon name="sitemap" size={16} color={iconColor} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleToc(!toc)} style={pageStyles.actionButton}>
                    <Icon name="list" size={16} color={iconColor} />
                  </TouchableOpacity>
                </>
              )}
              {!!(paragraph || description) && !archive && (
                <>
                  <TouchableOpacity onPress={handleMovePage} style={pageStyles.actionButton}>
                    <Icon name="exchange" size={16} color={iconColor} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleEdit} style={pageStyles.actionButton}>
                    <Icon name="pencil" size={16} color={iconColor} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          <View style={commonStyles.flex}>
            <NotePageSection active={!toc} description={description}>
              {!!paragraph && !fullParagraph && paragraphItem?.description?.trim().length === 0 && (
                <View style={{ position: 'absolute', width: '100%' }}>
                  <View style={[commonStyles.card, commonStyles.centerContent]}>
                    <Text style={commonStyles.text}>
                      {lang('There is no direct content in this paragraph.')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => toggleFullParagraph(true)}
                      style={commonStyles.button}
                    >
                      <Text style={commonStyles.buttonText}>{lang('View subparagraph')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </NotePageSection>
            {isFetching || description === undefined ? (
              <View style={[commonStyles.card, commonStyles.centerContent]}>
                <ActivityIndicator size="large" color="#3498DB" />
              </View>
            ) : page?.description ? (
              <NoteBottomSection
                toc={toc}
                fullParagraph={fullParagraph}
                root={title}
                path={paragraphItem?.path}
                paragraphs={paragraphs}
                onPress={(moveParagraph) =>
                  navigation.navigate('NotePage', {
                    ...toNoteParams(
                      title,
                      moveParagraph.level === 0 ? undefined : moveParagraph.title,
                      moveParagraph.autoSection
                    ),
                    kanban,
                  })
                }
              />
            ) : (
              !archive?.previous && (
                <View style={[commonStyles.card, commonStyles.centerContent]}>
                  <Text style={commonStyles.text}>
                    {lang('This note has no content yet. Press the ‘Edit’ button to add content.')}
                  </Text>
                  <TouchableOpacity onPress={handleEdit} style={commonStyles.button}>
                    <Text style={commonStyles.buttonText}>{lang('Edit')}</Text>
                  </TouchableOpacity>
                </View>
              )
            )}
          </View>
        </ScrollView>
      </>
    )
  );
};
