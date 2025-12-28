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
import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import Kanban from '../../components/Kanban';
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
import { isHiddenTitle, usePrivacy, useSetPrivacy } from '../../hooks/usePrivacy';
import { paragraphDescription } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { Content, NavigationParamList } from '../../types';

const move = (page: Content, newPage: Content, path: string) => {
  const paragraphs = parseHtmlToParagraphs(page?.description || '');
  const targetParagraph = parseHtmlToParagraphs(newPage?.description || '');

  const moveParagraph = paragraphs.filter((v) => v.path.startsWith(path));
  const moveParent = paragraphs.findLast(
    (v) => path.startsWith(v.path) && v.level + 1 === moveParagraph[0].level
  );

  const sourceParagraph = paragraphs.filter((v) => !v.path.startsWith(path));
  const sourceDescription = sourceParagraph
    .map(
      (v) =>
        v.header +
        (moveParent?.path === v.path && v.description.trim().length === 0 ? '-' : v.description)
    )
    .join('');
  const targetParentIndex = targetParagraph.findLastIndex(
    (v) => v.path === moveParent?.path && v.level === moveParent?.level
  );
  const targetFirstParentIndex = targetParagraph.findIndex((v) => v.level === moveParent?.level);
  const targetParent = targetParentIndex >= 0 ? targetParagraph[targetParentIndex] : undefined;
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
  return { sourceDescription, targetDescription };
};

type KanbanItemRouteProp = RouteProp<NavigationParamList, 'KanbanPage'>;

export const KanbanItemScreen: React.FC = () => {
  const _window = useResizeContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<KanbanItemRouteProp>();
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
  const { isPrivacyMode } = usePrivacy();
  const setPrivacy = useSetPrivacy();
  const horizontal = true;
  const option = board?.option;

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
            kanban: board?.title,
          });
        }
      } else {
        accessableRef.current = true;
      }
    },
    {
      landscape: { maxWidth: 190, padding: 4 },
      portrait: { maxWidth: 190, padding: 4 },
    }
  );

  const noteColumns = useMemo(() => {
    return (
      (option?.BOARD_NOTE_IDS &&
        option.BOARD_NOTE_IDS.map((v) => pages.find((v2) => v === v2.id)).filter(
          (v) => v !== undefined
        )) ||
      []
    );
  }, [pages, board]);

  const columns = useMemo(() => {
    return (
      option?.BOARD_NOTE_IDS &&
      noteColumns.map((page) => {
        const paragraphs = parseHtmlToParagraphs(page?.description || '');
        return {
          name: page.title,
          data: paragraphs
            .filter((v) => v.level === option.BOARD_HEADER_LEVEL)
            .map((v) => {
              const parent = paragraphs.findLast(
                (v2) => v.path.startsWith(v2.path) && v2.level + 1 === v.level
              );
              return {
                title: (parent?.title ? parent.title + ' / ' : '') + v.title,
                description: paragraphDescription(paragraphs, v.path, false).trim(),
                paragraph: { ...v, origin: page.title },
              };
            }),
        };
      })
    );
  }, [noteColumns, option]);

  const onEnd = useCallback(
    (data: any, key: number, nextKey: number) => {
      if (!columns) return false;
      const page = noteColumns.find((v) => v.title === columns[key].name);
      const newPage = noteColumns.find((v) => v.title === columns[nextKey].name);
      if (page && newPage) {
        const { sourceDescription, targetDescription } = move(page, newPage, data.paragraph.path);
        (async () => {
          try {
            await mutation.mutateAsync({
              title: newPage.title,
              description: targetDescription,
              isLast: false,
            });
            await mutation.mutateAsync({
              title: page.title,
              description: sourceDescription,
              isLast: true,
            });
          } catch (error) {
            Alert.alert(
              lang('error'),
              error ? `${error}` : lang('An error occurred while moving note.')
            );
          }
        })();
      }
      return false;
    },
    [noteColumns, columns]
  );

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

  if (!isPrivacyMode && isHiddenTitle(title)) {
    return (
      <>
        <ResponsiveSearchBar />
        <View style={commonStyles.container}>
          <StatusCard
            message="This kanban is hidden by Privacy Mode."
            buttonTitle="Enable Privacy Mode"
            onButtonPress={() => setPrivacy.mutate(true)}
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
      <UsageButton paragraph={'🗂 ' + lang('Kanban')} />
      {/* 설정 화면 (보드 옵션 수정) */}
      {showConfig ? (
        <ScrollView
          style={[commonStyles.container, { paddingVertical: 0, paddingHorizontal: 0 }]}
          contentContainerStyle={pageStyles.contentContainer}
        >
          {header}
          <View style={commonStyles.container}>
            <View style={commonStyles.card}>
              <ConfigSection title={lang('* Kanban Title')}>
                <View style={commonStyles.searchContainer}>
                  <TextInput
                    style={[commonStyles.searchInput, { marginTop: 16 }]}
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
              <ConfigSection title={lang('* Header level')}>
                <View style={{ flexDirection: 'row' }}>
                  {Array.from(Array(5).keys()).map((v) => {
                    const level = v + 2;
                    return (
                      option?.BOARD_NOTE_IDS && (
                        <OptionButton
                          key={v}
                          title={`H${level}`}
                          onPress={() =>
                            boardMutation.mutateAsync({
                              ...board,
                              description: '',
                              option: { ...option, BOARD_HEADER_LEVEL: level },
                            })
                          }
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
                      if (
                        id &&
                        noteColumns.find((v) => v.id === id) === undefined &&
                        option?.BOARD_NOTE_IDS
                      ) {
                        boardMutation.mutateAsync({
                          ...board,
                          description: '',
                          option: {
                            ...option,
                            BOARD_NOTE_IDS: [...option.BOARD_NOTE_IDS, id],
                          },
                        });
                      }
                    }}
                    addKeyword={false}
                    useRandom={false}
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
        // 칸반 보드 화면
        <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0 }]}>
          {header}
          {columns && columns.length > 0 ? (
            <Kanban
              horizontal={_window === 'portrait' && horizontal}
              columns={columns}
              columnStyle={{ borderColor: commonStyles.text.color }}
              renderHeader={({ item }) => (
                <TouchableOpacity
                  onPress={() =>
                    navigation.push('NotePage', { title: item.name, kanban: board.title })
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
  header: { zIndex: 1, alignItems: 'flex-start', marginHorizontal: 24, marginVertical: 16 },
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
