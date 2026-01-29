import { useColorScheme, useResizeContext, Text, useLangContext, Spacer } from '@blacktokki/core';
import { ConfigSection } from '@blacktokki/navigation';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { Suspense, useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, Alert, TextInput } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { HeaderIconButton, pageStyles } from './NoteItemSections';
import { renderCardPage, useToCardPage } from './RecentPageSection';
import { OptionButton } from './home/ConfigSection';
import Board from '../../components/Board';
import {
  Paragraph,
  paragraphDescription,
  parseHtmlToParagraphs,
} from '../../components/HeaderSelectBar';
import {
  ResponsiveSearchBar,
  SearchBar,
  SearchList,
  toNoteParams,
} from '../../components/SearchBar';
import StatusCard from '../../components/StatusCard';
import UsageButton from '../../components/UsageButton';
import { useBoardPage, useCreateOrUpdateBoard } from '../../hooks/useBoardStorage';
import { useCreateOrUpdatePage, useNotePages } from '../../hooks/useNoteStorage';
import { isHiddenTitle, usePrivate, useSetPrivate } from '../../hooks/usePrivate';
import { createCommonStyles } from '../../styles';
import { Content, NavigationParamList } from '../../types';

const _getSourceDescription = (paragraphs: Paragraph[], path: string, moveParent?: Paragraph) => {
  const sourceParagraph = paragraphs.filter((v) => !v.path.startsWith(path));
  const sourceDescription = sourceParagraph
    .map(
      (v) =>
        v.header +
        (moveParent?.path === v.path && v.description.trim().length === 0 ? '-' : v.description)
    )
    .join('');
  return sourceDescription;
};

const _getTargetDescription = (
  targetParagraph: Paragraph[],
  moveParagraph: Paragraph[],
  moveParent?: Paragraph
) => {
  const targetParentIndex = targetParagraph.findLastIndex(
    (v) => v.path === moveParent?.path && v.level === moveParent.level
  );
  const targetParent = targetParentIndex >= 0 ? targetParagraph[targetParentIndex] : undefined;
  const targetFirstParentIndex = targetParagraph.findIndex((v) => v.level === moveParent?.level);
  const targetSplit =
    targetParentIndex >= 0 ? targetParentIndex + 1 : moveParent ? targetFirstParentIndex : 0;
  const targetDescription = [
    ...targetParagraph.slice(0, targetSplit).map((v) => v.header + v.description),
    ...moveParagraph.map(
      (v, i) =>
        (moveParent && targetParent === undefined && i === 0 ? moveParent?.header + '\r\n' : '') +
        v.header +
        v.description +
        '\r\n'
    ),
    ...targetParagraph.slice(targetSplit).map((v) => v.header + v.description),
  ].join('');
  return targetDescription;
};

const move = (page: Content, newPage: Content, path: string, newParent?: Paragraph) => {
  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const moveParagraph = paragraphs.filter((v) => v.path.startsWith(path));
  const moveParent = paragraphs.findLast(
    (v) => path.startsWith(v.path) && v.level + 1 === moveParagraph[0].level
  );
  const sourceDescription = _getSourceDescription(paragraphs, path, moveParent);

  const targetParagraph = parseHtmlToParagraphs(
    newPage.title === page.title ? sourceDescription : newPage?.description || ''
  );
  const targetDescription = _getTargetDescription(
    targetParagraph,
    moveParagraph,
    newParent || moveParent
  );
  return { sourceDescription, targetDescription };
};

type BoardItemRouteProp = RouteProp<NavigationParamList, 'BoardPage'>;

export const BoardItemScreen: React.FC = () => {
  const _window = useResizeContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<BoardItemRouteProp>();
  const { title } = route.params;

  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();

  const { data: pages = [] } = useNotePages();
  const { data: board } = useBoardPage(title);

  const mutation = useCreateOrUpdatePage();
  const boardMutation = useCreateOrUpdateBoard();

  const accessableRef = useRef(true);
  const [showConfig, setShowConfig] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const { data: privateConfig } = usePrivate();
  const setPrivate = useSetPrivate();
  const horizontal = true;
  const _option = board?.option;
  const option = _option && 'BOARD_HEADER_LEVEL' in _option ? _option : undefined;

  useEffect(() => {
    if (board?.title) {
      setEditTitle(board.title);
    }
  }, [board?.title]);

  const toCardPage = useToCardPage(
    (v) => {
      if (accessableRef.current) {
        if (v.paragraph) {
          navigation.push('EditPage', {
            ...toNoteParams(v.paragraph.origin, v.paragraph.title, v.paragraph.autoSection),
            board: board?.title,
          });
        }
      } else {
        accessableRef.current = true;
      }
    },
    {
      landscape: { maxWidth: 190, padding: 4 },
      portrait: { maxWidth: 190, padding: 4 },
    },
    (v) => {
      const parentTitle = (v as { parentTitle?: string }).parentTitle;
      return parentTitle ? parentTitle + ' / ' + v.title : v.title;
    }
  );

  const noteColumns = useMemo(() => {
    return (
      option?.BOARD_NOTE_IDS.map((v) => pages.find((v2) => v === v2.id)).filter(
        (v) => v !== undefined
      ) || []
    );
  }, [pages, board]);

  const rows = useMemo(() => {
    if (!option) {
      return undefined;
    }
    const useScrum = option.BOARD_TYPE === 'SCRUM';
    const preDataAll = noteColumns.map((page) => {
      const paragraphs = parseHtmlToParagraphs(page?.description || '');
      return {
        page,
        paragraphs,
        rows: paragraphs.filter((v) => v.level + 1 === option.BOARD_HEADER_LEVEL),
      };
    });
    const commonRows = [{ title: '', path: '', header: '', level: 0 } as Paragraph];
    if (useScrum) {
      preDataAll.forEach((v) =>
        v.rows.forEach((r) => {
          if (commonRows.find((r2) => r2.title === r.title) === undefined) {
            commonRows.push(r);
          }
        })
      );
    }
    return commonRows.map((row) => {
      const columns = preDataAll.map((c) => {
        const { page, paragraphs, rows } = c;
        const parent = useScrum ? rows.find((v) => v.title === row.title) || row : undefined;
        const firstRowIndex = useScrum
          ? paragraphs.findIndex((v) => v.level + 1 === option.BOARD_HEADER_LEVEL)
          : paragraphs.length;
        return {
          name: page.title,
          parentParagraph: parent,
          items: paragraphs
            .filter(
              (v, i) =>
                v.level === option.BOARD_HEADER_LEVEL &&
                (row.title !== ''
                  ? parent?.path && v.path.startsWith(parent.path)
                  : i < firstRowIndex)
            )
            .map((v) => ({
              title: v.title,
              parentTitle: useScrum
                ? undefined
                : paragraphs.findLast((v2) => v.path.startsWith(v2.path) && v2.level < v.level)
                    ?.title,
              description: paragraphDescription(paragraphs, v.path, false).trim(),
              paragraph: { ...v, origin: page.title },
            })),
        };
      });
      return {
        name: row.title,
        columns,
      };
    });
  }, [noteColumns, option]);

  const onEnd = useCallback(
    (rowKey: number, nextRowKey: number, columnKey: number, nextColumnKey: number, key: number) => {
      if (!rows) return false;
      const column = rows[rowKey].columns[columnKey];
      const page = noteColumns.find((v) => v.title === column.name);
      const newColumn = rows[nextRowKey].columns[nextColumnKey];
      const newPage = noteColumns.find((v) => v.title === newColumn.name);
      if (page && newPage) {
        const { sourceDescription, targetDescription } = move(
          page,
          newPage,
          column.items[key].paragraph.path,
          newColumn.parentParagraph
        );
        (async () => {
          try {
            await mutation.mutateAsync({
              title: newPage.title,
              description: targetDescription,
              isLast: page.title === newPage.title,
            });
            if (page.title !== newPage.title) {
              await mutation.mutateAsync({
                title: page.title,
                description: sourceDescription,
                isLast: true,
              });
            }
          } catch (error) {
            Alert.alert(
              lang('error'),
              error ? `${error}` : lang('An error occurred while moving note.')
            );
          }
        })();
        return true;
      }
      return false;
    },
    [noteColumns, rows]
  );

  const saveBoardOption = (newOption: Partial<typeof option>) => {
    board &&
      boardMutation.mutateAsync({
        ...board,
        description: '',
        option: { ...option, ...(newOption as any) },
      });
  };

  const header = board && (
    <View style={[commonStyles.header, styles.header]}>
      <View style={styles.titleContainer}>
        <Text style={[commonStyles.title, pageStyles.title]} numberOfLines={1}>
          {board.title}
        </Text>
      </View>
      <View style={[pageStyles.actionButtons, { flexBasis: 39 }]}>
        <HeaderIconButton name="cog" onPress={() => setShowConfig(!showConfig)} />
      </View>
    </View>
  );

  if (!privateConfig.enabled && isHiddenTitle(title)) {
    return (
      <>
        <ResponsiveSearchBar />
        <View style={commonStyles.container}>
          <StatusCard
            message="This board is hidden by Private Mode."
            buttonTitle="Enable Private Mode"
            onButtonPress={() => setPrivate.mutate({ enabled: true })}
          />
        </View>
      </>
    );
  }

  if (!board) {
    return (
      <View style={[commonStyles.container, commonStyles.centerContent]}>
        <Text style={commonStyles.text}>{lang('Board not found.')}</Text>
      </View>
    );
  }

  return (
    <>
      <ResponsiveSearchBar />
      <UsageButton paragraph={'🗂 ' + lang('Board')} />
      {/* 설정 화면 (보드 옵션 수정) */}
      {showConfig ? (
        <ScrollView
          style={[commonStyles.container, { paddingVertical: 0, paddingHorizontal: 0 }]}
          contentContainerStyle={pageStyles.contentContainer}
        >
          {header}
          <View style={commonStyles.container}>
            <View style={commonStyles.card}>
              <ConfigSection title={lang('* Board Title')}>
                <View style={[commonStyles.searchContainer, { marginTop: 16 }]}>
                  <TextInput
                    style={[commonStyles.searchInput]}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder={lang('Enter board title')}
                    placeholderTextColor={commonStyles.placeholder.color}
                  />
                  <TouchableOpacity
                    style={[
                      commonStyles.searchButton,
                      editTitle === board?.title || !editTitle.trim()
                        ? { backgroundColor: 'gray' }
                        : {},
                    ]}
                    disabled={editTitle === board?.title || !editTitle.trim()}
                    onPress={() => {
                      if (board && option?.BOARD_NOTE_IDS) {
                        boardMutation.mutate(
                          {
                            ...board,
                            description: '',
                            title: editTitle.trim(),
                            option,
                          },
                          {
                            onSuccess: () => {
                              navigation.setParams({ title: editTitle.trim() });
                              Alert.alert(lang('Saved'));
                            },
                          }
                        );
                      }
                    }}
                  >
                    <Icon name="check" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </ConfigSection>
              <Spacer height={16} />
              <ConfigSection title={lang('* Board Type')}>
                {option?.BOARD_NOTE_IDS && (
                  <View style={{ flexDirection: 'row' }}>
                    <OptionButton
                      title={lang('Board')}
                      onPress={() => saveBoardOption({ BOARD_TYPE: 'KANBAN' })}
                      active={option.BOARD_TYPE !== 'SCRUM'}
                    />
                    <OptionButton
                      title={lang('Scrum')}
                      onPress={() => saveBoardOption({ BOARD_TYPE: 'SCRUM' })}
                      active={option.BOARD_TYPE === 'SCRUM'}
                    />
                  </View>
                )}
              </ConfigSection>
              <Spacer height={16} />
              <ConfigSection title={lang('* Header level')}>
                <View style={{ flexDirection: 'row' }}>
                  {Array.from(Array(5).keys()).map((v) => {
                    const level = v + 2;
                    return (
                      option && (
                        <OptionButton
                          key={v}
                          title={`H${level}`}
                          onPress={() => saveBoardOption({ BOARD_HEADER_LEVEL: level })}
                          active={option.BOARD_HEADER_LEVEL === level}
                        />
                      )
                    );
                  })}
                </View>
              </ConfigSection>
              <Spacer height={16} />
              <ConfigSection title={lang('* Columns')}>
                <View style={{ paddingHorizontal: 16 }}>
                  <Text style={styles.buttonText}>{lang('Add')}</Text>
                  <SearchBar
                    onPress={(title) => {
                      const id = pages.find((v) => v.title === title)?.id;
                      if (id && noteColumns.find((v) => v.id === id) === undefined && option) {
                        saveBoardOption({ BOARD_NOTE_IDS: [...option.BOARD_NOTE_IDS, id] });
                      }
                    }}
                    addKeyword={false}
                    useRandom={false}
                    useTextSearch={false}
                    newContent={false}
                    icon="plus"
                  />
                  <Text style={styles.buttonText}>{lang('Delete')}</Text>
                  <SearchList
                    filteredPages={noteColumns.map((v) => ({ ...v, title: '-  ' + v.title }))}
                    onPressKeyword={(item) => {
                      if (item.type === 'NOTE' && option?.BOARD_NOTE_IDS) {
                        boardMutation.mutateAsync({
                          ...board,
                          description: '',
                          option: {
                            ...option,
                            BOARD_NOTE_IDS: option.BOARD_NOTE_IDS.filter((v) => item.id !== v),
                          },
                        });
                      }
                    }}
                  />
                </View>
              </ConfigSection>
            </View>
          </View>
        </ScrollView>
      ) : (
        // 보드 화면
        <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0 }]}>
          {header}
          <View
            style={{
              width: '100%',
              height: 2,
              backgroundColor: commonStyles.card.borderColor,
              marginBottom: 8,
            }}
          />
          {rows && rows.length > 0 ? (
            <Board
              horizontal={_window === 'portrait' && horizontal}
              rows={rows}
              columnStyle={{
                borderColor: commonStyles.text.color,
              }}
              renderHeader={({ item }) => (
                <TouchableOpacity
                  onPress={() =>
                    navigation.push('NotePage', { title: item.name, board: board.title })
                  }
                  style={{ backgroundColor: commonStyles.container.backgroundColor }}
                >
                  <Text selectable={false} style={commonStyles.title}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
              renderItem={({ item, index }) => (
                <Suspense>{renderCardPage({ item: toCardPage(item), index })}</Suspense>
              )}
              onStart={() => {
                accessableRef.current = false;
              }}
              onEnd={onEnd}
            />
          ) : (
            <StatusCard message="There are no columns." />
          )}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  header: { zIndex: 1, alignItems: 'center', marginHorizontal: 24, marginTop: 8, marginBottom: 0 },
  titleContainer: {
    flexDirection: 'row',
    maxWidth: '100%',
    flexBasis: 0,
    flexGrow: 1,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600', paddingVertical: 16 },
});
