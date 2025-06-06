import { useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';

import HeaderSelectBar, { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { onLink, SearchBar, titleFormat } from '../../components/SearchBar';
import { useCreateOrUpdatePage, useMovePage, useNotePage } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;

export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title, paragraph } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const { lang } = useLangContext();
  const [newTitle, setNewTitle] = useState(title);
  const { data: page, isLoading } = useNotePage(title);
  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const path = paragraphs.find((v) => v.title === paragraph)?.path || '';
  const { data: newPage } = useNotePage(newTitle);
  const newParagraph = parseHtmlToParagraphs(newPage?.description || '').filter(
    (v) => title !== newTitle || path === v.path || !v.path.startsWith(path)
  );
  const [newPath, setNewPath] = useState('');
  const [preview, setPreview] = useState<boolean>();
  const commonStyles = createCommonStyles(theme);

  const mutation = useCreateOrUpdatePage();
  const moveMutation = useMovePage();
  const { sourceDescription, targetDescription } = useMemo(() => {
    const moveParagraph = paragraphs.filter((v) => v.path.startsWith(path));
    const isSplit = newPage?.title === page?.title + '/' + moveParagraph[0]?.title;
    const moveDescription = moveParagraph
      .map((v, i) => (isSplit && i === 0 ? '' : v.header) + v.description)
      .join('');
    const sourceParagraph = paragraphs.filter((v) => !v.path.startsWith(path));
    const sourceDescription = sourceParagraph.map((v) => v.header + v.description).join('');
    const targetParagraph = page?.title === newPage?.title ? sourceParagraph : newParagraph;
    const targetIndex = targetParagraph.findLastIndex((v) => v.path.startsWith(newPath));
    const targetDescription =
      newPage?.id === undefined
        ? moveDescription
        : [
            ...targetParagraph.slice(0, targetIndex + 1).map((v) => v.header + v.description),
            ...moveParagraph.map(
              (v, i) =>
                ((v.path === path && v.description === '') || (isSplit && i === 0)
                  ? ''
                  : v.header) + v.description
            ),
            ...targetParagraph.slice(targetIndex + 1).map((v) => v.header + v.description),
          ].join('');
    return { sourceDescription, targetDescription };
  }, [paragraphs, newParagraph, path, newPath]);

  const handleMove = () => {
    if (newPage?.id === undefined) {
      moveMutation.mutate(
        {
          oldTitle: title,
          newTitle: newTitle.trim(),
          description: path === '' ? undefined : targetDescription,
        },
        {
          onSuccess: (data) => {
            navigation.navigate({ name: 'NotePage', params: { title: data.newTitle } });
          },
          onError: (error: any) => {
            Alert.alert(
              lang('error'),
              error.message || lang('An error occurred while moving note.')
            );
          },
        }
      );
    } else {
      if (page?.title === newPage.title && path === newPath) {
        handleCancel();
      }
      mutation.mutate(
        { title: newPage.title, description: targetDescription },
        {
          onSuccess: (data) => {
            if (page?.title !== newPage.title) {
              mutation.mutate({ title, description: sourceDescription });
            }
            navigation.navigate({ name: 'NotePage', params: { title: data.title } });
          },
          onError: (error: any) => {
            Alert.alert(
              lang('error'),
              error.message || lang('An error occurred while moving note.')
            );
          },
        }
      );
    }
  };
  const handleCancel = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('NotePage', { title });
    }
  };

  useEffect(() => {
    if (!isLoading && !page) {
      handleCancel();
    }
    page && setNewTitle(page.title + (paragraph ? `/${paragraph}` : ''));
  }, [page, isLoading]);
  useEffect(() => {
    if (!isLoading) {
      setNewPath(paragraph ? '' : path);
    }
  }, [paragraph, isLoading]);
  const paragraphItem = paragraphs.find((v) => v.path === path);
  const newParagraphItem = newParagraph.find((v) => v.path === newPath);
  const moveDisabled = !newTitle.trim() || newParagraphItem === undefined;
  return (
    <ScrollView style={commonStyles.container}>
      <View style={commonStyles.card}>
        <View style={{ flexDirection: _window === 'landscape' ? 'row' : 'column', zIndex: 1 }}>
          <View style={{ zIndex: 1 }}>
            <Text style={commonStyles.text}>
              {lang(paragraph ? 'Current note title and paragraph:' : 'Current note title:')}
            </Text>
            <Text style={[commonStyles.title, styles.columns]}>
              {titleFormat({ title, paragraph })}
            </Text>
            <Text style={commonStyles.text}>{lang('New note title and paragraph:')}</Text>
            <SearchBar handlePress={setNewTitle} useRandom={false} />
            <View style={styles.columns}>
              <HeaderSelectBar
                path={newPath}
                onPress={(item) => setNewPath(item.path)}
                root={newPage?.title || ''}
                data={newParagraph}
              />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={commonStyles.text}> {lang('Preview:')}</Text>
            <TouchableOpacity
              style={[
                commonStyles.button,
                styles.moveButton,
                {
                  flex: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: 24,
                  paddingBottom: 16,
                },
              ]}
              onPress={() => setPreview(!preview)}
            >
              <Text style={commonStyles.title}>
                {titleFormat({ title, paragraph: paragraphItem?.title })}
              </Text>
              <Text style={[commonStyles.text, { marginBottom: 8, fontSize: 14 }]}> ➜ </Text>
              <Text style={commonStyles.title}>
                {titleFormat({ title: newTitle, paragraph: newParagraphItem?.title })}
              </Text>
            </TouchableOpacity>
            {preview !== undefined && (
              <View style={{ display: preview ? 'flex' : 'none' }}>
                <EditorViewer
                  active
                  value={targetDescription}
                  theme={theme}
                  onLink={(url) => onLink(url, navigation)}
                  autoResize
                />
              </View>
            )}
          </View>
        </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[commonStyles.button, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={commonStyles.buttonText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[commonStyles.button, moveDisabled ? styles.cancelButton : styles.moveButton]}
            onPress={handleMove}
            disabled={moveDisabled}
          >
            <Text style={commonStyles.buttonText}>{lang('move')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  columns: {
    marginTop: 8,
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#95A5A6',
  },
  moveButton: {
    flex: 1,
    marginLeft: 8,
  },
});
