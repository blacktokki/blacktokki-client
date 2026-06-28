import { Spacer, useLangContext } from '@blacktokki/core';
import { cleanId } from '@blacktokki/editor';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import ChangedBlock, { ChangedItem } from '../../components/ChangedBlock';
import { paragraphByKey, parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { SearchBar, titleFormat, urlToNoteLink } from '../../components/SearchBar';
import {
  useCreateOrUpdatePage,
  useMovePage,
  useNotePage,
  useNotePages,
} from '../../hooks/useNoteStorage';
import { useNotebooks } from '../../hooks/useNotebookStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import { NavigationParamList } from '../../types';

// --- 역링크(백링크) 내용 치환 로직 ---
const checkAndProcessBacklinks = <T extends { oldTitle: string }>(
  html: string,
  mappings: T[],
  targetParagraph?: string,
  onMatch?: (
    a: HTMLAnchorElement,
    mapping: T,
    noteLink: NonNullable<ReturnType<typeof urlToNoteLink>>
  ) => void
) => {
  if (!html) return { hasMatch: false, processedHtml: html };

  // 1차 필터링: 원본 문자열에 대상 이름이 아예 포함되지 않았다면 조기 종료
  const mightHaveLink = mappings.some(
    (m) => html.includes(m.oldTitle) || html.includes(encodeURIComponent(m.oldTitle))
  );
  if (!mightHaveLink) return { hasMatch: false, processedHtml: html };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const links = doc.querySelectorAll('a');
  let hasMatch = false;

  for (let i = 0; i < links.length; i++) {
    try {
      const a = links[i];
      const absoluteUrl = a.href;
      const noteLink = urlToNoteLink(absoluteUrl);

      if (!noteLink) continue;

      const urlTitle = noteLink.title;
      const urlPara = noteLink.paragraph;

      let matchedMapping: T | undefined;
      if (targetParagraph) {
        if (
          urlTitle === mappings[0].oldTitle &&
          urlPara &&
          cleanId(urlPara) === cleanId(targetParagraph)
        ) {
          matchedMapping = mappings[0];
        }
      } else {
        matchedMapping = mappings.find(
          (m) => urlTitle === m.oldTitle || urlTitle.startsWith(m.oldTitle + '/')
        );
      }

      if (matchedMapping) {
        hasMatch = true;
        if (onMatch) {
          onMatch(a, matchedMapping, noteLink);
        } else {
          // onMatch 콜백이 없으면 단순히 존재 여부만 판단 (backLinks 필터용)
          return { hasMatch: true, processedHtml: html };
        }
      }
    } catch (e) {
      // URL 파싱 오류 무시
    }
  }

  return { hasMatch, processedHtml: hasMatch && onMatch ? doc.body.innerHTML : html };
};

// --- 역링크(백링크) 내용 치환 로직 ---
const replaceBacklinks = (
  html: string,
  mappings: { oldTitle: string; newTitle: string }[],
  targetParagraph?: string
) => {
  const { hasMatch, processedHtml } = checkAndProcessBacklinks(
    html,
    mappings,
    targetParagraph,
    (a, mapping, noteLink) => {
      let newUrlTitle = noteLink.title;
      let newInnerText = a.textContent || '';

      const parsedUrl = new URL(a.href);

      if (targetParagraph) {
        newUrlTitle = mapping.newTitle;
        parsedUrl.searchParams.delete('paragraph');
        parsedUrl.hash = '';
      } else {
        newUrlTitle = mapping.newTitle + noteLink.title.substring(mapping.oldTitle.length);
        if (newInnerText === mapping.oldTitle) {
          newInnerText = mapping.newTitle;
        } else if (newInnerText === noteLink.title) {
          newInnerText = newUrlTitle;
        }
      }

      parsedUrl.searchParams.set('title', newUrlTitle);

      const origHref = a.getAttribute('href') || '';
      if (origHref.startsWith('http')) {
        a.setAttribute('href', parsedUrl.toString());
      } else {
        a.setAttribute('href', parsedUrl.search + parsedUrl.hash);
      }

      a.textContent = newInnerText;
    }
  );

  return hasMatch ? processedHtml : html;
};

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;

export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title, paragraph, section } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();

  const [newTitle, setNewTitle] = useState(title);
  const [includeSubNotes, setIncludeSubNotes] = useState(true);
  const [updateBacklinks, setUpdateBacklinks] = useState(true);

  const { usageMode, notebook } = useUsageMode();
  const currentNotebookId = notebook?.id || 0;
  const { data: notebooks = [] } = useNotebooks();

  const [selectedNotebookId, setSelectedNotebookId] = useState<number>(currentNotebookId || 0);

  const oldNotebookName =
    usageMode === 'SIMPLE'
      ? undefined
      : currentNotebookId
      ? notebooks.find((nb) => nb.id === currentNotebookId)?.title || lang('Note Mode')
      : lang('Note Mode');
  const newNotebookName =
    usageMode === 'SIMPLE'
      ? undefined
      : selectedNotebookId
      ? notebooks.find((nb) => nb.id === selectedNotebookId)?.title || lang('None')
      : lang('None');

  const { data: page, isLoading } = useNotePage(title);
  const { data: pages = [] } = useNotePages();
  const { data: targetPages = [], isFetching: isFetchingTargetPages } =
    useNotePages(selectedNotebookId);
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

  // 대상 노트를 참조하는 역링크 목록 추출
  const backLinks = useMemo(() => {
    const mappings = [{ oldTitle: title }];
    if (includeSubNotes && !paragraph) {
      subNotes.forEach((sn) => {
        mappings.push({ oldTitle: sn.title });
      });
    }

    return pages.filter((p) => {
      if (!p.description) return false;
      return checkAndProcessBacklinks(p.description, mappings, paragraph).hasMatch;
    });
  }, [pages, title, subNotes, includeSubNotes, paragraph]);

  // 역링크가 하나도 없게 되었다면 체크박스 상태도 같이 false 로 동기화
  useEffect(() => {
    if (backLinks.length === 0) {
      setUpdateBacklinks(false);
    }
  }, [backLinks.length]);

  const previewData = useMemo(() => {
    const checkExisting = (t: string) => targetPages.find((p) => p.title === t.trim());
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
        oldNotebookName,
        newNotebookName,
      });

      if (existingMain) {
        data.push({
          renderType: 'override',
          fetchType: 'part',
          title: mainNewTitle,
          description: existingMain.description || '',
          newDescription: moveDescription,
          oldNotebookName,
          newNotebookName,
        });
      } else {
        data.push({
          renderType: 'plain',
          fetchType: 'part',
          title: mainNewTitle,
          newDescription: moveDescription,
          oldNotebookName,
          newNotebookName,
        });
      }
    } else {
      const existingMainDesciption = (existingMain?.description || '').length > 0;
      if (existingMain && existingMainDesciption) {
        data.push({
          renderType: 'override',
          fetchType: 'override',
          title,
          newTitle: mainNewTitle,
          description: existingMain.description || '',
          newDescription: page?.description || '',
          oldNotebookName,
          newNotebookName,
        });
      } else {
        data.push({
          renderType: 'plain',
          fetchType: existingMain ? 'override' : 'move',
          title,
          newTitle: mainNewTitle,
          newDescription: page?.description || '',
          oldNotebookName,
          newNotebookName,
        });
      }

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
              oldNotebookName,
              newNotebookName,
            });
          } else {
            data.push({
              renderType: 'plain',
              fetchType: existingMain ? 'override' : 'move',
              title: sn.title,
              newTitle: snNewTitle,
              newDescription: sn.description || '',
              oldNotebookName,
              newNotebookName,
            });
          }
        });
      }
    }

    const isTitleChangedOrParagraph = title !== mainNewTitle || !!paragraph;
    // 역링크 업데이트 반영
    if (updateBacklinks && isTitleChangedOrParagraph) {
      const mappings = [{ oldTitle: title, newTitle: mainNewTitle }];
      if (includeSubNotes && !paragraph) {
        subNotes.forEach((sn) => {
          mappings.push({
            oldTitle: sn.title,
            newTitle: mainNewTitle + sn.title.substring(title.length),
          });
        });
      }

      // 이미 이동될 목록 내의 내용들도 치환 처리
      data.forEach((item) => {
        if ('newDescription' in item && item.newDescription) {
          item.newDescription = replaceBacklinks(item.newDescription, mappings, paragraph);
        }
      });

      // 그 외에 역링크를 포함하고 있는 다른 노트 탐색
      const handledTitles = new Set(data.map((d) => d.title));
      if (!paragraph) {
        handledTitles.add(title);
      }

      pages.forEach((p) => {
        if (handledTitles.has(p.title)) return;
        if (!p.description) return;

        const newDesc = replaceBacklinks(p.description, mappings, paragraph);
        if (newDesc !== p.description) {
          data.push({
            renderType: 'diff',
            fetchType: 'part',
            title: p.title,
            description: p.description,
            newDescription: newDesc,
          });
        }
      });
    }

    return data;
  }, [
    pages,
    targetPages,
    title,
    mainNewTitle,
    page,
    subNotes,
    includeSubNotes,
    updateBacklinks,
    paragraph,
    path,
  ]);

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
              newParentId: selectedNotebookId,
            });
            break;
          case 'override':
            await mutation.mutateAsync({
              title: item.newTitle,
              description: item.newDescription,
              isLast: false,
              newParentId: selectedNotebookId,
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
              newParentId: selectedNotebookId,
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

  const isNotebookChanged =
    usageMode !== 'SIMPLE' && (selectedNotebookId || 0) !== (currentNotebookId || 0);
  const isTitleChangedOrParagraph = title !== mainNewTitle || !!paragraph;
  const moveDisabled =
    !mainNewTitle || (mainNewTitle === title && !isNotebookChanged) || isFetchingTargetPages;

  return (
    <ScrollView style={commonStyles.container}>
      <View style={commonStyles.card}>
        <View style={{ zIndex: 1 }}>
          <Text style={commonStyles.text}>
            {usageMode !== 'SIMPLE'
              ? lang(paragraph ? 'Current Notebook, Note & Paragraph' : 'Current Notebook & Note')
              : lang(paragraph ? 'Current note title and paragraph:' : 'Current note title:')}
          </Text>
          <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>
            {oldNotebookName && (
              <Text style={{ fontSize: 14, color: 'gray' }}>[{oldNotebookName}] </Text>
            )}
            {titleFormat({ title, paragraph })}
          </Text>

          <Text style={commonStyles.text}>
            {usageMode !== 'SIMPLE' ? lang('New Notebook & Note') : lang('New note title:')}
          </Text>

          {usageMode !== 'SIMPLE' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 8, marginBottom: 16 }}
            >
              <TouchableOpacity
                onPress={() => setSelectedNotebookId(0)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  backgroundColor: selectedNotebookId === 0 ? '#3498DB' : 'transparent',
                  borderWidth: selectedNotebookId === 0 ? 0 : 1,
                  borderColor: commonStyles.text.color as string,
                  marginRight: 8,
                }}
              >
                <Text
                  style={{
                    color: selectedNotebookId === 0 ? 'white' : (commonStyles.text.color as string),
                  }}
                >
                  {lang('Note Mode')}
                </Text>
              </TouchableOpacity>
              {notebooks.map((nb) => (
                <TouchableOpacity
                  key={nb.id}
                  onPress={() => setSelectedNotebookId(nb.id)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    backgroundColor: selectedNotebookId === nb.id ? '#3498DB' : 'transparent',
                    borderWidth: selectedNotebookId === nb.id ? 0 : 1,
                    borderColor: commonStyles.text.color as string,
                    marginRight: 8,
                  }}
                >
                  <Text
                    style={{
                      color:
                        selectedNotebookId === nb.id
                          ? 'white'
                          : (commonStyles.text.color as string),
                    }}
                  >
                    {nb.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {newTitle && title !== mainNewTitle && (
            <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>{newTitle}</Text>
          )}
          <SearchBar
            onPress={setNewTitle}
            addKeyword={false}
            useExtraSearch={false}
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

          {backLinks.length > 0 && isTitleChangedOrParagraph && (
            <TouchableOpacity
              style={styles.optionContainer}
              onPress={() => setUpdateBacklinks(!updateBacklinks)}
            >
              <Icon
                name={updateBacklinks ? 'check-square-o' : 'square-o'}
                size={20}
                color={commonStyles.text.color}
              />
              <Text style={[commonStyles.text, { marginLeft: 8, fontSize: 14 }]}>
                {lang('Update backlinks')} ({backLinks.length})
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
