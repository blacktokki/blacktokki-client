import { useAuthContext } from '@blacktokki/account';
import { useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import DiffMatchPatch from 'diff-match-patch';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

import {
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
import LoadingView from '../../components/LoadingView';
import { ResponsiveSearchBar, toNoteParams } from '../../components/SearchBar';
import StatusCard from '../../components/StatusCard';
import { useExtension } from '../../hooks/useExtension';
import { useNotePage, useSnapshotAll } from '../../hooks/useNoteStorage';
import { isHiddenTitle, usePrivate, useSetPrivate } from '../../hooks/usePrivate';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type NotePageScreenRouteProp = RouteProp<NavigationParamList, 'NotePage'>;

const diffToSnapshot = (original: string, delta: string) => {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_fromDelta(original, delta);
  return dmp.diff_text2(diffs);
};

export const NotePageScreen: React.FC = () => {
  const isFocused = useIsFocused();
  const route = useRoute<NotePageScreenRouteProp>();
  const { title, paragraph, section, archiveId, board } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const { auth } = useAuthContext();
  const { lang } = useLangContext();
  const commonStyles = createCommonStyles(theme);
  const [_toc, toggleToc] = useState(false);
  const toc = _window === 'portrait' ? _toc : false;
  const [fullParagraph, toggleFullParagraph] = useState(!!(paragraph && board));

  const { data: page, isFetching } = useNotePage(title);
  const { data: _archives } = useSnapshotAll(archiveId ? page?.id : undefined);
  const { data: privateConfig } = usePrivate();
  const { data: extension } = useExtension();
  const setPrivate = useSetPrivate();
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
    navigation.navigate('EditPage', { ...toNoteParams(title, paragraph, section), board });
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
      navigation.navigate('NotePage', { title, paragraph: undefined, board });
    }
  }, [page, paragraph, paragraphItem]);

  if (!privateConfig.enabled && isHiddenTitle(title)) {
    return (
      <>
        <ResponsiveSearchBar />
        <View style={commonStyles.container}>
          <StatusCard
            message="This note is hidden by Private Mode."
            buttonTitle="Enable Private Mode"
            onButtonPress={() => setPrivate.mutate({ enabled: true })}
          />
        </View>
      </>
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
              title={title}
              paragraph={paragraph}
              archive={archive}
              board={board}
              onPress={(title, hasChild) =>
                (hasChild ? navigation.push : navigation.navigate)('NotePage', { title, board })
              }
            />
            <View style={pageStyles.actionButtons}>
              {extension.feature.NoteSections.map((NoteSection, i) => (
                <NoteSection
                  key={i}
                  title={page?.title || ''}
                  path={paragraphItem?.path}
                  fullParagraph={fullParagraph}
                  paragraphs={paragraphs}
                />
              ))}
              {!paragraphItem && !auth.isLocal && (_window === 'landscape' || toc || archive) && (
                <HeaderIconButton
                  name="history"
                  onPress={() => navigation.navigate('Archive', { title })}
                />
              )}
              {!!paragraph && (_window === 'landscape' || !toc) && (
                <HeaderIconButton
                  name={fullParagraph ? 'compress' : 'expand'}
                  onPress={() => toggleFullParagraph(!fullParagraph)}
                />
              )}
              {!paragraph && !archive && (_window === 'landscape' || !toc) && (
                <HeaderIconButton
                  name="folder"
                  onPress={() => navigation.navigate('RecentPages', { title })}
                />
              )}
              {!!(paragraph || description) && !archive && (_window === 'landscape' || toc) && (
                <HeaderIconButton name="exchange" onPress={handleMovePage} />
              )}
              {!!(paragraph || description) && !archive && (_window === 'landscape' || !toc) && (
                <HeaderIconButton name="pencil" onPress={handleEdit} />
              )}
              {!!(paragraph || description) && !archive && _window === 'portrait' && (
                <HeaderIconButton name="list" onPress={() => toggleToc(!toc)} />
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
              <LoadingView />
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
                    board,
                  })
                }
              />
            ) : (
              !archive?.previous && (
                <StatusCard
                  style={{ marginTop: 0 }}
                  message="This note has no content yet. Press the ‘Edit’ button to add content."
                  buttonTitle="Edit"
                  onButtonPress={handleEdit}
                />
              )
            )}
          </View>
        </ScrollView>
      </>
    )
  );
};
