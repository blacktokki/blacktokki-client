import { useColorScheme, useResizeContext, Text, useLangContext } from '@blacktokki/core';
import { ConfigSection } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { Suspense, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { ScrollView, TouchableOpacity, View, TextInput, FlatList, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { getIconColor, pageStyles } from './NoteItemSections';
import { renderCardPage, useToCardPage } from './RecentPageSection';
import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import Kanban from '../../components/Kanban';
import { SearchBar, SearchList, toNoteParams } from '../../components/SearchBar';
import {
  useBoardPages,
  useCreateOrUpdateBoard,
  useDeleteBoard,
  useRecentBoard,
  useUpdateRecentBoard,
} from '../../hooks/useBoardStorage';
import { useCreateOrUpdatePage, useNotePages } from '../../hooks/useNoteStorage';
import { paragraphDescription } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { Content, NavigationParamList } from '../../types';
import { OptionButton } from './home/ConfigSection';
import UsageButton from '../../components/UsageButton';

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

const KanbanListSection = ({
  pages,
  boards,
  board,
  noteColumns,
  setIsList,
}: {
  pages: Content[];
  boards: Content[];
  board?: Content;
  noteColumns: Content[];
  setIsList: (v: boolean) => void;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();
  const mutation = useCreateOrUpdateBoard();
  const deleteMutation = useDeleteBoard();
  const recentMutation = useUpdateRecentBoard();
  const [searchText, setSearchText] = useState('');
  const searchBoard = boards?.find((v) => v.title === searchText);
  const option = board?.option;
  return (
    <View style={commonStyles.container}>
      {boards.length > 0 ? (
        <FlatList
          data={boards}
          renderItem={({ item, index }) => (
            <View style={[commonStyles.card, { zIndex: item.title === board?.title ? 5000 : 0 }]}>
              <TouchableOpacity
                onPress={() =>
                  item.title === board?.title
                    ? setIsList(false)
                    : recentMutation
                        .mutateAsync({ id: item.id })
                        .then(() => setSearchText(item.title))
                }
              >
                <Text
                  style={[
                    commonStyles.title,
                    { fontSize: 20, fontWeight: '600' },
                    { textDecorationLine: item.title === board?.title ? 'underline' : 'none' },
                  ]}
                >
                  {item.title}
                </Text>
              </TouchableOpacity>
              {board && item.title === board.title && (
                <>
                  <View style={{ height: 16 }} />
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
                                mutation.mutateAsync({
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
                  <View style={{ height: 16 }} />
                  <ConfigSection title={lang('* Columns')}>
                    <View style={{ paddingHorizontal: 16 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '600',
                          paddingVertical: 16,
                        }}
                      >
                        {lang('Add')}
                      </Text>
                      <SearchBar
                        onPress={(title) => {
                          const id = pages.find((v) => v.title === title)?.id;
                          if (
                            id &&
                            noteColumns.find((v) => v.id === id) === undefined &&
                            option?.BOARD_NOTE_IDS
                          ) {
                            mutation.mutateAsync({
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
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '600',
                          paddingVertical: 16,
                        }}
                      >
                        {lang('Delete')}
                      </Text>
                      <SearchList
                        filteredPages={noteColumns.map((v) => ({ ...v, title: '-  ' + v.title }))}
                        onPressKeyword={(item) => {
                          if (item.type === 'NOTE' && option?.BOARD_NOTE_IDS) {
                            mutation.mutateAsync({
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
                </>
              )}
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          CellRendererComponent={cellRendererComponent}
        />
      ) : (
        <View style={[commonStyles.card, commonStyles.centerContent]}>
          <Text selectable={false} style={commonStyles.text}>
            {lang('There are no boards.')}
          </Text>
        </View>
      )}
      <View style={[commonStyles.searchContainer, { paddingTop: 16 }]}>
        <TextInput
          style={commonStyles.searchInput}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
          }}
          placeholder={lang('Add & Rename & Delete')}
          placeholderTextColor={commonStyles.placeholder.color}
        />
        <TouchableOpacity
          style={[
            commonStyles.searchButton,
            !searchBoard && searchText !== '' ? {} : { backgroundColor: 'gray' },
          ]}
          disabled={!(!searchBoard && searchText !== '')}
          onPress={
            !searchBoard && searchText !== ''
              ? () =>
                  mutation.mutateAsync({
                    title: searchText,
                    description: '',
                    option: {
                      BOARD_NOTE_IDS: [],
                      BOARD_HEADER_LEVEL: 3,
                    },
                  })
              : undefined
          }
        >
          <Icon name={'plus'} size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.searchButton, searchText !== '' ? {} : { backgroundColor: 'gray' }]}
          disabled={searchText === ''}
          onPress={
            searchText !== ''
              ? () =>
                  option?.BOARD_NOTE_IDS &&
                  mutation.mutateAsync({
                    ...board,
                    option,
                    title: searchText,
                    description: '',
                  })
              : undefined
          }
        >
          <Icon name={'pencil'} size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.searchButton, searchBoard ? {} : { backgroundColor: 'gray' }]}
          disabled={!searchBoard}
          onPress={searchBoard ? () => deleteMutation.mutateAsync(searchBoard.id) : undefined}
        >
          <Icon name={'minus'} size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const cellRendererComponent = ({ children }: any) => children;

export const KanbanScreen: React.FC = () => {
  const _window = useResizeContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();
  const accessableRef = useRef(true);
  const { data: pages = [] } = useNotePages();
  const { data: boards } = useBoardPages();
  const { data: board, isFetched: boardFetched } = useRecentBoard();
  const mutation = useCreateOrUpdatePage();
  const recentMutation = useUpdateRecentBoard();
  const iconColor = getIconColor(theme);
  const [isList, setIsList] = useState(false);
  const horizontal = true;
  const option = board?.option;
  const toCardPage = useToCardPage(
    (v) => {
      if (accessableRef.current) {
        if (v.paragraph) {
          navigation.push('NotePage', {
            ...toNoteParams(v.paragraph.origin, v.paragraph.title, v.paragraph.autoSection),
            kanban: board?.id,
          });
        }
      } else {
        accessableRef.current = true;
      }
    },
    {
      landscape: {
        maxWidth: 190,
        padding: 4,
      },
      portrait: {
        maxWidth: 190,
        padding: 4,
      },
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
  }, [noteColumns]);
  const onEnd = useCallback(
    (data: any, key: number, nextKey: number) => {
      if (!columns) {
        return false;
      }
      const page = noteColumns.find((v) => v.title === columns[key].name);
      const newPage = noteColumns.find((v) => v.title === columns[nextKey].name);
      if (page && newPage) {
        const { sourceDescription, targetDescription } = move(page, newPage, data.paragraph.path);
        // console.log(sourceDescription);
        // console.log(targetDescription);
        // return false;
        mutation.mutate(
          { title: newPage.title, description: targetDescription, isLast: false },
          {
            onSuccess: (data) => {
              mutation.mutate({ title: page.title, description: sourceDescription });
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
      return false;
    },
    [noteColumns, columns]
  );
  useEffect(() => {
    if ((boardFetched && board === undefined) || (boards && boards.length === 0)) {
      setIsList(true);
    }
    if (board === undefined && boards && boards.length > 0) {
      recentMutation.mutateAsync({ id: boards[0].id });
    }
  }, [board, boards, isList]);

  const header = board && (
    <View
      style={[
        commonStyles.header,
        { zIndex: 1, alignItems: 'flex-start', marginHorizontal: 24, marginVertical: 16 },
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          maxWidth: '100%',
          flexBasis: 0,
          flexGrow: 1,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <TouchableOpacity onPress={() => setIsList(false)} style={{ maxWidth: '100%' }}>
          <Text style={[commonStyles.title, pageStyles.title]} numberOfLines={1}>
            {board.title}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={[pageStyles.actionButtons, { flexBasis: 39 }]}>
        <TouchableOpacity onPress={() => setIsList(!isList)} style={pageStyles.actionButton}>
          <Icon name="list" size={16} color={iconColor} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      {_window === 'portrait' && <SearchBar />}
      <UsageButton paragraph={'🗂 ' + lang('Kanban')} />
      {!isList && columns && (
        <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0 }]}>
          {header}
          {columns.length > 0 ? (
            <Kanban
              horizontal={_window === 'portrait' && horizontal}
              columns={columns}
              columnStyle={{ borderColor: commonStyles.text.color }}
              renderHeader={({ item }) => (
                <TouchableOpacity
                  onPress={() =>
                    navigation.push('NotePage', { title: item.name, kanban: board?.id })
                  }
                  style={{ backgroundColor: commonStyles.container.backgroundColor }}
                >
                  <Text selectable={false} style={commonStyles.title}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
              renderItem={({ item, index }) => {
                return <Suspense>{renderCardPage({ item: toCardPage(item), index })}</Suspense>;
              }}
              onStart={() => {
                accessableRef.current = false;
              }}
              onEnd={onEnd}
            />
          ) : (
            <View style={[commonStyles.card, commonStyles.centerContent, { marginHorizontal: 20 }]}>
              <Text selectable={false} style={commonStyles.text}>
                {lang('There are no columns.')}
              </Text>
            </View>
          )}
        </View>
      )}
      {isList && (
        <ScrollView
          style={[commonStyles.container, { paddingVertical: 0, paddingHorizontal: 0 }]}
          contentContainerStyle={pageStyles.contentContainer}
        >
          {header}
          {boards && (
            <KanbanListSection
              pages={pages}
              boards={boards}
              board={board}
              noteColumns={noteColumns}
              setIsList={setIsList}
            />
          )}
        </ScrollView>
      )}
    </>
  );
};
