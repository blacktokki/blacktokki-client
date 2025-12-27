import { useColorScheme, useLangContext, useModalsContext } from '@blacktokki/core';
import { Editor } from '@blacktokki/editor';
import { push } from '@blacktokki/navigation';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import Icon2 from 'react-native-vector-icons/MaterialCommunityIcons';

import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import {
  getFilteredPages,
  titleFormat,
  toNoteParams,
  urlToNoteLink,
} from '../../components/SearchBar';
import { useNotePage, useCreateOrUpdatePage, useNotePages } from '../../hooks/useNoteStorage';
import { paragraphByKey, paragraphDescription } from '../../hooks/useProblem';
import AlertModal from '../../modals/AlertModal';
import { previewUrl } from '../../services/notebook';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type EditPageScreenRouteProp = RouteProp<NavigationParamList, 'EditPage'>;

const useUnsaveEffect = (
  isPrevent: () => boolean,
  handleUnsaved: () => void,
  currentNoteParams: () => ReturnType<typeof toNoteParams> | undefined
) => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<EditPageScreenRouteProp>();
  const { title, paragraph, section } = route.params;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!isPrevent()) {
          return;
        }
        e.preventDefault();
        if (e.data.action.type === 'NAVIGATE') {
          const payload = e.data.action.payload as any;
          navigation.push(payload.name, payload.params);
          return;
        }
        handleUnsaved();
      }),
    [navigation]
  );

  useEffect(() => {
    if (
      isPrevent() &&
      JSON.stringify(currentNoteParams()) !==
        JSON.stringify(toNoteParams(title, paragraph, section))
    ) {
      navigation.setParams(currentNoteParams());
      handleUnsaved();
    }
  }, [navigation, title]);

  useEffect(() => {
    const callback = (event: any) => {
      if (isPrevent()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', callback);
    return () => window.removeEventListener('beforeunload', callback);
  }, []);
};

export const EditPageScreen: React.FC = () => {
  const route = useRoute<EditPageScreenRouteProp>();
  const isFocused = useIsFocused();
  const { title, paragraph, section, kanban } = route.params;
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
  const checkedRef = useRef<{
    title: string;
    paragraph?: string;
    section?: string;
    initialContent: string;
    unsaved: boolean;
  }>();

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('NotePage', toNoteParams(title, paragraph, section));
    }
  };

  const handleSave = () => {
    if (checkedRef.current === undefined) return;
    const currentTitle = checkedRef.current.title;

    let finalDescription = content;

    // 문단 편집 모드라면 전체 HTML에 병합하는 과정 필요
    if (paragraph && page?.description) {
      const paragraphs = parseHtmlToParagraphs(page.description);
      const targetItem = paragraphs.find((v) => paragraphByKey(v, { paragraph, section }));

      if (targetItem) {
        const targetPath = targetItem.path;
        finalDescription = paragraphs
          .map((p) => {
            if (p.path === targetPath) {
              return content;
            }
            if (p.path.startsWith(targetPath + ',')) {
              return '';
            }
            return p.header + p.description;
          })
          .join('');
      }
    }
    mutation.mutate(
      { title: currentTitle, description: finalDescription },
      {
        onSuccess: () => {
          checkedRef.current = undefined;
          navigation.navigate('NotePage', { ...toNoteParams(title, paragraph, section), kanban });
        },
        onError: (error: any) => {
          Alert.alert('오류', error.message || '문서를 저장하는 중 오류가 발생했습니다.');
        },
      }
    );
  };

  const handleUnsaved = () => {
    setModal(AlertModal, {
      type: 'UNSAVED',
      callbacks: [
        handleSave,
        () => {
          if (title === checkedRef.current?.title && page?.description !== undefined) {
            setContent(page?.description);
          }
          checkedRef.current = undefined;
          handleBack();
        },
      ],
    });
  };

  if (
    checkedRef.current &&
    title === checkedRef.current.title &&
    paragraph === checkedRef.current.paragraph &&
    section === checkedRef.current.section
  ) {
    checkedRef.current.unsaved = checkedRef.current.initialContent !== content;
  }

  const isPrevent = () => checkedRef.current !== undefined && checkedRef.current.unsaved;
  const pressableTextColor = theme === 'dark' ? '#FFFFFF88' : '#00000088';

  useEffect(() => {
    if (!isLoading && page?.description !== undefined && !isPrevent()) {
      let initialContent = page.description;

      if (paragraph) {
        const paragraphs = parseHtmlToParagraphs(page.description);
        const targetItem = paragraphs.find((v) => paragraphByKey(v, { paragraph, section }));

        if (targetItem) {
          const extractedContent = paragraphDescription(paragraphs, targetItem.path, true);

          initialContent = extractedContent;
        }
      }
      initialContent = initialContent.trim();
      setContent(initialContent);
      checkedRef.current = {
        title,
        paragraph,
        section,
        initialContent,
        unsaved: false,
      };
    }
  }, [isLoading, page, title, paragraph, section]);

  useUnsaveEffect(
    isPrevent,
    handleUnsaved,
    () =>
      checkedRef.current &&
      toNoteParams(
        checkedRef.current.title,
        checkedRef.current?.paragraph,
        checkedRef.current?.section
      )
  );
  return (
    isFocused && (
      <View style={commonStyles.container}>
        <View style={commonStyles.header}>
          {kanban && (
            <TouchableOpacity
              onPress={isPrevent() ? handleUnsaved : () => push('KanbanPage', { title: kanban })}
              style={[commonStyles.title, { marginRight: 5 }]}
            >
              <Icon2 name="view-dashboard" size={20} color={pressableTextColor} />
            </TouchableOpacity>
          )}
          <Text style={[commonStyles.title, { flex: 1 }]}>
            {title} {paragraph ? `> ${paragraph}` : ''} - {lang('Edit')}
          </Text>
        </View>
        <Editor
          active
          value={content}
          setValue={setContent}
          theme={theme}
          pasteAutocomplete={(text) => {
            try {
              const noteLink = urlToNoteLink(text);
              if (noteLink) {
                return `<a href=${text}>${
                  noteLink.title + (noteLink.paragraph ? ` > ${noteLink.paragraph}` : '')
                }</a>`;
              }
            } catch {}
          }}
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
                  ...getFilteredPages(pages, pattern).filter((v) => v.type !== '_LINK'),
                ].map((v) => {
                  const name = v.type === '_NOTELINK' || v.type === '_CHILDNOTE' ? v.name : v.title;
                  const description =
                    v.type === '_NOTELINK'
                      ? `(${titleFormat(v)})`
                      : v.type === '_CHILDNOTE'
                      ? `(${v.title})`
                      : '';
                  const params = new URLSearchParams();
                  params.append('title', v.title);
                  if (v.type === '_NOTELINK' && v.paragraph) {
                    params.append('paragraph', v.paragraph);
                  }
                  const url = `?${params.toString()}`;
                  return {
                    text: name + description,
                    value: `<a href=${url}>${name}</a>`,
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

        <View style={commonStyles.buttonContainer}>
          <TouchableOpacity
            style={[commonStyles.secondaryButton]}
            onPress={isPrevent() ? handleUnsaved : handleBack}
          >
            <Text style={commonStyles.buttonText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[commonStyles.button, { flex: 1, marginLeft: 8 }]}
            onPress={handleSave}
          >
            <Text style={commonStyles.buttonText}>{lang('save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  );
};
