import { useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import DiffMatchPatch from 'diff-match-patch';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';

import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { onLink, SearchBar, titleFormat } from '../../components/SearchBar';
import { useCreateOrUpdatePage, useMovePage, useNotePage } from '../../hooks/useNoteStorage';
import { paragraphByKey } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export const getHtmlSplitDiff = (text1: string, text2: string, theme: 'light' | 'dark'): string => {
  const dmp = new DiffMatchPatch();

  // 1. Tokenizer: HTML 태그와 텍스트 분리
  const tokenizer = /(<[^>]+>|[^<]+)/g;

  const lineArray: string[] = [];
  const lineHash: { [key: string]: number } = {};

  // 토큰 -> 유니코드 매핑
  const tokensToChars = (text: string): string => {
    const tokens = text.match(tokenizer) || [];
    let chars = '';
    for (const token of tokens) {
      if (Object.prototype.hasOwnProperty.call(lineHash, token)) {
        chars += String.fromCharCode(lineHash[token]);
      } else {
        const code = lineArray.length;
        lineArray[code] = token;
        lineHash[token] = code;
        chars += String.fromCharCode(code);
      }
    }
    return chars;
  };

  const chars1 = tokensToChars(text1);
  const chars2 = tokensToChars(text2);

  const diffs = dmp.diff_main(chars1, chars2);
  dmp.diff_cleanupSemantic(diffs);

  // 2. 블록 병합 (연속된 연산자 묶기)
  interface DiffBlock {
    op: number; // 0: Equal, -1: Del, 1: Ins
    text: string;
  }

  const blocks: DiffBlock[] = [];

  for (const [op, data] of diffs) {
    let text = '';
    for (let i = 0; i < data.length; i++) {
      text += lineArray[data.charCodeAt(i)];
    }

    if (blocks.length > 0 && blocks[blocks.length - 1].op === op) {
      blocks[blocks.length - 1].text += text;
    } else {
      blocks.push({ op, text });
    }
  }

  // 3. 테마별 색상 정의
  // 다크모드: 눈이 편안한 어두운 회색 배경 + 채도가 낮은 적색/녹색 사용
  const colors =
    theme === 'dark'
      ? {
          containerBg: '#1e1e1e', // VS Code 스타일 어두운 배경
          text: '#d4d4d4', // 밝은 회색 텍스트
          border: '#333333', // 어두운 테두리
          delBg: '#451818', // 어두운 붉은색 (가독성 확보)
          insBg: '#183818', // 어두운 초록색 (가독성 확보)
          emptyBg: '#252526', // 빈 공간 (패턴용)
        }
      : {
          containerBg: '#ffffff',
          text: '#333333',
          border: '#eeeeee',
          delBg: '#ffe6e6', // 밝은 붉은색
          insBg: '#e6ffe6', // 밝은 초록색
          emptyBg: '#f9f9f9',
        };

  // 4. HTML 스타일 및 생성 로직
  // inline style을 사용하여 별도의 CSS 파일 없이 동작하도록 함
  const rowStyle = `display: flex; flex-direction: row; align-items: stretch; border-bottom: 1px solid ${colors.border}; background-color: ${colors.containerBg};`;
  const cellStyle = `flex: 1; padding: 4px; overflow: hidden; word-wrap: break-word; color: ${colors.text};`;

  const createRow = (
    leftContent: string,
    rightContent: string,
    leftBg: string = '',
    rightBg: string = ''
  ) => {
    // 배경색이 지정되지 않은 경우(Equal 등)는 투명하게 처리하거나 기본 배경색 사용
    const lStyle = `${cellStyle} background-color: ${leftBg || 'transparent'};`;
    const rStyle = `${cellStyle} background-color: ${rightBg || 'transparent'};`;

    return `
      <div class="diff-row" style="${rowStyle}">
        <div class="diff-cell left" style="${lStyle}">${leftContent}</div>
        <div class="diff-cell right" style="${rStyle}">${rightContent}</div>
      </div>`;
  };

  let resultHtml = '';
  let i = 0;

  while (i < blocks.length) {
    const current = blocks[i];
    const next = i + 1 < blocks.length ? blocks[i + 1] : null;

    // CASE 1: Equal (양쪽 동일)
    if (current.op === 0) {
      resultHtml += createRow(current.text, current.text);
      i++;
    }
    // CASE 2: Modification (Delete 후 바로 Insert -> 같은 줄에 배치하여 동기화)
    else if (current.op === -1 && next && next.op === 1) {
      resultHtml += createRow(current.text, next.text, colors.delBg, colors.insBg);
      i += 2; // Delete와 Insert 두 블록을 소모했으므로 2칸 전진
    }
    // CASE 3: Only Delete (우측은 비어있음 - Empty Style 적용)
    else if (current.op === -1) {
      resultHtml += createRow(current.text, '', colors.delBg, colors.emptyBg);
      i++;
    }
    // CASE 4: Only Insert (좌측은 비어있음 - Empty Style 적용)
    else if (current.op === 1) {
      resultHtml += createRow('', current.text, colors.emptyBg, colors.insBg);
      i++;
    }
  }

  // 최종 컨테이너 반환
  return `<div class="diff-container" style="width: 100%; border: 1px solid ${colors.border}; background-color: ${colors.containerBg};">${resultHtml}</div>`;
};

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;

const DiffPreview = React.memo(
  ({ source, target, theme }: { source?: string; target: string; theme: 'light' | 'dark' }) => {
    const RenderHtml = React.lazy(() => import('react-native-render-html'));
    const _window = useResizeContext();

    const diffRows = useMemo(() => {
      if (!source) return { html: '' };
      return { html: getHtmlSplitDiff(source, target, theme) };
    }, [source, target, theme]);
    return (
      <Suspense>
        <RenderHtml source={diffRows} contentWidth={_window === 'landscape' ? 360 : 260} />
      </Suspense>
    );
  }
);

export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title, paragraph, section } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const { lang } = useLangContext();
  const [newTitle, setNewTitle] = useState(title);
  const { data: page, isLoading } = useNotePage(title);
  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const path =
    paragraphs.find((v) => paragraphByKey(v, paragraph ? { paragraph, section } : { paragraph }))
      ?.path || '';
  const { data: newPage } = useNotePage(newTitle);
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
    return { sourceDescription, targetDescription: moveDescription };
  }, [paragraphs, path]);

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
      mutation.mutate(
        { title: newPage.title, description: targetDescription, isLast: false },
        {
          onSuccess: (data) => {
            mutation.mutate({ title, description: sourceDescription });
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
  const paragraphItem = paragraphs.find((v) => v.path === path);
  const moveDisabled = !newTitle.trim() || newTitle.trim() === title.trim();
  const exists = !moveDisabled && newPage?.id !== undefined;
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
            <Text style={commonStyles.text}>{lang('New note title:')}</Text>
            <SearchBar onPress={setNewTitle} addKeyword={false} useRandom={false} />
          </View>
          {!moveDisabled && (
            <View style={{ flex: 1 }}>
              <Text style={commonStyles.text}>
                {' '}
                {lang('Preview:')} {exists ? lang('This note already exists.') : ''}
              </Text>
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
                <Text style={commonStyles.title}>{newTitle}</Text>
              </TouchableOpacity>
              {preview !== undefined && (
                <View style={{ display: preview ? 'flex' : 'none' }}>
                  {exists ? (
                    <DiffPreview
                      source={newPage.description}
                      target={targetDescription}
                      theme={theme}
                    />
                  ) : (
                    <EditorViewer
                      active
                      value={targetDescription}
                      theme={theme}
                      onLink={(url) => onLink(url, navigation)}
                      autoResize
                    />
                  )}
                </View>
              )}
            </View>
          )}
        </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[commonStyles.button, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={commonStyles.buttonText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              commonStyles.button,
              styles.moveButton,
              moveDisabled
                ? { backgroundColor: styles.cancelButton.backgroundColor }
                : exists
                ? { backgroundColor: '#d9534f' }
                : {},
            ]}
            onPress={handleMove}
            disabled={moveDisabled}
          >
            <Text style={commonStyles.buttonText}>{lang(exists ? 'overwrite' : 'move')}</Text>
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
