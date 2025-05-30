import { useColorScheme, useLangContext, useModalsContext } from '@blacktokki/core';
import { Editor } from '@blacktokki/editor';
import {
  RouteProp,
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';

import { getFilteredPages, titleFormat } from '../../components/SearchBar';
import { useNotePage, useCreateOrUpdatePage, useNotePages } from '../../hooks/useNoteStorage';
import AlertModal from '../../modals/AlertModal';
import { previewUrl } from '../../services/notebook';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type EditPageScreenRouteProp = RouteProp<NavigationParamList, 'EditPage'>;

export const EditPageScreen: React.FC = () => {
  const route = useRoute<EditPageScreenRouteProp>();
  const isFocused = useIsFocused();
  const { title } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();

  const { data: page, isLoading } = useNotePage(title);
  const { data: pages = [] } = useNotePages();
  const getChildrenPages = (keyword: string) =>
    pages
      .filter((v) => v.title.startsWith(title + '/'))
      .map((v) => ({
        type: '_CHILDNOTE' as '_CHILDNOTE',
        name: v.title.split(title + '/')[1],
        title: v.title,
      }))
      .filter((v) => v.name.toLowerCase().startsWith(keyword.toLowerCase()));
  const [content, setContent] = useState('');

  const mutation = useCreateOrUpdatePage();
  const { setModal } = useModalsContext();
  const handleSave = () => {
    mutation.mutate(
      { title, description: content },
      {
        onSuccess: () => {
          navigation.navigate('NotePage', { title });
        },
        onError: (error: any) => {
          Alert.alert('오류', error.message || '문서를 저장하는 중 오류가 발생했습니다.');
        },
      }
    );
  };
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('NotePage', { title });
    }
  };

  const handleCancel = () => {
    if (page?.description === content) {
      handleBack();
    } else {
      setModal(AlertModal, { type: 'UNSAVED', callbacks: [handleSave, handleBack] });
    }
  };

  useEffect(() => {
    if (!isLoading && page?.description) {
      setContent(page?.description);
    }
  }, [isLoading, page]);

  useFocusEffect(() => {
    const callback = (event: any) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', callback);
    return () => window.removeEventListener('beforeunload', callback);
  });
  return (
    isFocused && (
      <View style={commonStyles.container}>
        <View style={commonStyles.header}>
          <Text style={[commonStyles.title, { flex: 1 }]}>{title} - 편집</Text>
        </View>
        <Editor
          active
          value={content}
          setValue={setContent}
          theme={theme}
          autoComplete={[
            {
              trigger: '[',
              getMatchedChars: async (pattern) => {
                const childrenPages = getChildrenPages(pattern);
                return [
                  { type: '_NOTELINK', name: pattern, title, paragraph: pattern },
                  ...(childrenPages.length
                    ? childrenPages
                    : [{ type: '_CHILDNOTE', name: pattern, title: title + '/' + pattern }]),
                  ...getFilteredPages(pages, pattern),
                ].map((v) => {
                  const text =
                    v.type === '_NOTELINK'
                      ? v.name + `(${titleFormat(v)})`
                      : v.type === '_CHILDNOTE'
                      ? v.name
                      : v.title;
                  const url = encodeURI(
                    v.type === '_NOTELINK' && v.paragraph
                      ? `?title=${v.title}&paragraph=${v.paragraph}`
                      : `?title=${v.title}`
                  );
                  return {
                    text,
                    value: `<a href=${url}>${text}</a>`,
                  };
                });
              },
            },
            {
              trigger: 'http',
              getMatchedChars: async (pattern) => {
                const query = 'http' + pattern;
                const url = new URL(query);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                  return [];
                }
                const preview = await previewUrl({ query });
                if (!preview.title) {
                  return [];
                }
                return [
                  {
                    text: preview.title,
                    value: `<a href=${preview.url}>${preview.title}</a>`,
                  },
                  // {
                  //   text:preview.title + '...',
                  //   value:`<a href=${preview.url}>${preview.title}</a><p>${preview.description}...</p>`,
                  // }
                ];
              },
            },
          ]}
        />

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[commonStyles.button, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={commonStyles.buttonText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[commonStyles.button, styles.saveButton]} onPress={handleSave}>
            <Text style={commonStyles.buttonText}>{lang('save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#95A5A6',
  },
  saveButton: {
    flex: 1,
    marginLeft: 8,
  },
});
