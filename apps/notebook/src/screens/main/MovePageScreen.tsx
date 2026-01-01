import { Spacer, useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import DiffMatchPatch from 'diff-match-patch';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { onLink, SearchBar, titleFormat } from '../../components/SearchBar';
import {
  useCreateOrUpdatePage,
  useMovePage,
  useNotePage,
  useNotePages,
} from '../../hooks/useNoteStorage';
import { paragraphByKey } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

const getHtmlSplitDiff = (text1: string, text2: string, theme: 'light' | 'dark'): string => {
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
  const cellStyle = `flex: 1; padding: 1rem; overflow: hidden; word-wrap: break-word; color: ${colors.text};`;

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
  return `<div class="diff-container" style="width: 100%; background-color: ${colors.containerBg};">${resultHtml}</div>`;
};

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

type ChangedItem = {
  title: string;
  newDescription: string;
} & (
  | {
      renderType: 'diff';
      fetchType: 'part';
      paragraph: string;
      description: string;
    }
  | {
      renderType: 'plain';
      fetchType: 'part';
    }
  | {
      renderType: 'override';
      fetchType: 'part';
      description: string;
    }
  | {
      renderType: 'plain';
      fetchType: 'move' | 'override';
      newTitle: string;
    }
  | {
      renderType: 'override';
      fetchType: 'override';
      description: string;
      newTitle: string;
    }
);

export const ChangedBlock = ({ item }: { item: ChangedItem }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme); // 공통 스타일 가져오기
  const { lang } = useLangContext();

  // 에러 발생 시(노트 중복 등) 강조 색상
  const errorColor = '#d9534f';

  return (
    <View
      style={[
        commonStyles.card, // 기본 카드 스타일 적용
        { padding: 0, overflow: 'hidden' }, // 내부 여백 제거 및 테두리 정제
        item.renderType === 'override' ? { borderColor: errorColor } : {},
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsExpanded(!isExpanded)}
        style={[
          commonStyles.row,
          {
            padding: 12,
            backgroundColor: theme === 'dark' ? '#1A1A1A' : '#F9F9F9',
            borderBottomWidth: isExpanded ? 1 : 0,
            borderBottomColor: commonStyles.card.borderColor,
          },
        ]}
      >
        <Icon
          name={isExpanded ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={commonStyles.text.color}
          style={{ width: 16 }}
        />
        <Icon
          name="file-text-o"
          size={14}
          color={commonStyles.text.color}
          style={{ marginLeft: 8 }}
        />
        <Text style={[commonStyles.smallText, { marginLeft: 8, flex: 1 }]} numberOfLines={1}>
          {item.title}
          {item.fetchType !== 'part' && ` ➜ ${item.newTitle}`}
        </Text>

        {item.renderType === 'override' && (
          <Text style={[commonStyles.smallText, { color: errorColor, marginLeft: 8 }]}>
            {lang('This note already exists.')}
          </Text>
        )}
      </TouchableOpacity>

      {isExpanded &&
        ('description' in item ? (
          <DiffPreview source={item.description} target={item.newDescription} theme={theme} />
        ) : (
          <EditorViewer
            active
            value={item.newDescription}
            theme={theme}
            onLink={(url) => onLink(url, navigation)}
            autoResize
          />
        ))}
    </View>
  );
};

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;

export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title, paragraph, section } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const { lang } = useLangContext();
  const commonStyles = createCommonStyles(theme);

  const [newTitle, setNewTitle] = useState(title);
  const [includeSubNotes, setIncludeSubNotes] = useState(true);

  const { data: page, isLoading } = useNotePage(title);
  const { data: pages = [] } = useNotePages();
  const mainNewTitle = newTitle.trim();

  const moveMutation = useMovePage();
  const mutation = useCreateOrUpdatePage();

  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const paragraphItem = paragraphs.find((v) =>
    paragraphByKey(v, paragraph ? { paragraph, section } : { paragraph })
  );
  const path = paragraphItem?.path || '';

  const subNotes = useMemo(
    () =>
      pages.filter(
        (p) => p.title.startsWith(title + '/') && p.description && p.description.length > 0
      ),
    [pages, title]
  );

  const previewData = useMemo(() => {
    const checkExisting = (t: string) => pages.find((p) => p.title === t.trim());
    const data: ChangedItem[] = [];
    const existingMain = checkExisting(mainNewTitle);

    if (paragraph && path.length > 0) {
      const moveParagraph = paragraphs.filter((v) => v.path.startsWith(path));
      const isSplit = existingMain?.title === page?.title + '/' + moveParagraph[0]?.title;
      const moveDescription = moveParagraph
        .map((v, i) => (isSplit && i === 0 ? '' : v.header) + v.description)
        .join('');
      const sourceParagraph = paragraphs.filter((v) => !v.path.startsWith(path));
      const sourceDescription = sourceParagraph.map((v) => v.header + v.description).join('');
      data.push({
        renderType: 'diff',
        fetchType: 'part',
        title,
        paragraph,
        description: page?.description || '',
        newDescription: sourceDescription,
      });

      if (existingMain) {
        data.push({
          renderType: 'override',
          fetchType: 'part',
          title: mainNewTitle,
          description: existingMain.description || '',
          newDescription: moveDescription,
        });
      } else {
        data.push({
          renderType: 'plain',
          fetchType: 'part',
          title: mainNewTitle,
          newDescription: moveDescription,
        });
      }
    } else {
      const existingMainDesciption = (existingMain?.description || '').length > 0;
      console.log(existingMain);
      if (existingMain && existingMainDesciption) {
        data.push({
          renderType: 'override',
          fetchType: 'override',
          title,
          newTitle: mainNewTitle,
          description: existingMain.description || '',
          newDescription: page?.description || '',
        });
      } else {
        data.push({
          renderType: 'plain',
          fetchType: existingMain ? 'override' : 'move',
          title,
          newTitle: mainNewTitle,
          newDescription: page?.description || '',
        });
      }

      // 하위 노트 포함 로직
      if (includeSubNotes) {
        subNotes.forEach((sn) => {
          const snNewTitle = mainNewTitle + sn.title.substring(title.length);
          const existingSub = checkExisting(snNewTitle);
          const existingSubDescription = (existingSub?.description || '').length > 0;
          if (existingSub && existingSubDescription) {
            data.push({
              renderType: 'override',
              fetchType: 'override',
              title: sn.title,
              newTitle: snNewTitle,
              description: existingSub.description || '',
              newDescription: sn.description || '',
            });
          } else {
            data.push({
              renderType: 'plain',
              fetchType: existingMain ? 'override' : 'move',
              title: sn.title,
              newTitle: snNewTitle,
              newDescription: sn.description || '',
            });
          }
        });
      }
    }
    return data;
  }, [pages, title, mainNewTitle, page, subNotes, includeSubNotes]);
  const anyExists = useMemo(
    () => previewData.some((item) => item.renderType === 'override'),
    [previewData]
  );

  const handleMove = async () => {
    try {
      for (const [i, item] of previewData.entries()) {
        const isLast = i === previewData.length - 1;

        switch (item.fetchType) {
          case 'move':
            await moveMutation.mutateAsync({
              oldTitle: item.title,
              newTitle: item.newTitle,
              isLast,
            });
            break;
          case 'override':
            await mutation.mutateAsync({
              title: item.newTitle,
              description: item.newDescription,
              isLast: false,
            });
            await mutation.mutateAsync({
              title: item.title,
              description: '',
              isLast,
            });
            break;

          case 'part':
            await mutation.mutateAsync({
              title: item.title,
              description: item.newDescription,
              isLast,
            });
            break;
        }
      }
      navigation.push('NotePage', { title: mainNewTitle });
    } catch (error: any) {
      Alert.alert(lang('error'), error.message || lang('An error occurred while moving note.'));
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
  }, [page, paragraph, isLoading]);
  const moveDisabled = !mainNewTitle || mainNewTitle === title;
  return (
    <ScrollView style={commonStyles.container}>
      <View style={commonStyles.card}>
        <View style={{ zIndex: 1 }}>
          <Text style={commonStyles.text}>
            {lang(paragraph ? 'Current note title and paragraph:' : 'Current note title:')}
          </Text>
          <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>
            {titleFormat({ title, paragraph })}
          </Text>
          <Text style={commonStyles.text}>{lang('New note title:')}</Text>
          {newTitle && title !== mainNewTitle && (
            <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>{newTitle}</Text>
          )}
          <SearchBar
            onPress={setNewTitle}
            addKeyword={false}
            useRandom={false}
            useTextSearch={false}
          />
          <Spacer height={12} />
          {path.length === 0 && subNotes.length > 0 && (
            <TouchableOpacity
              style={styles.optionContainer}
              onPress={() => setIncludeSubNotes(!includeSubNotes)}
            >
              <Icon
                name={includeSubNotes ? 'check-square-o' : 'square-o'}
                size={20}
                color={commonStyles.text.color}
              />
              <Text style={[commonStyles.text, { marginLeft: 8, fontSize: 14 }]}>
                {lang('Move sub-notes')} ({subNotes.length})
              </Text>
            </TouchableOpacity>
          )}

          {!moveDisabled && (
            <>
              <Text style={commonStyles.text}>
                {lang('Notes changed')} ({previewData.length})
              </Text>
              <View style={styles.prPreviewContainer}>
                {previewData.map((item, idx) => (
                  <ChangedBlock key={idx} item={item} />
                ))}
              </View>
            </>
          )}
        </View>

        <View style={commonStyles.buttonContainer}>
          <TouchableOpacity
            style={[commonStyles.secondaryButton, { flex: 1 }]}
            onPress={handleCancel}
          >
            <Text style={commonStyles.buttonText}>{lang('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              commonStyles.button,
              styles.moveButton,
              moveDisabled
                ? { backgroundColor: 'gray' }
                : anyExists
                ? { backgroundColor: '#d9534f' }
                : {},
            ]}
            onPress={handleMove}
            disabled={moveDisabled}
          >
            <Text style={commonStyles.buttonText}>
              {lang(!moveDisabled && anyExists ? 'overwrite' : 'move')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  optionContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  moveButton: { flex: 1, marginLeft: 8 },
  prPreviewContainer: { marginTop: 12 },
});
