import { useResizeContext, Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { Suspense, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon2 from 'react-native-vector-icons/MaterialCommunityIcons';

import { renderCardPage, Scale, useToCardPage } from './CardPageSection';
import { NotePageHeader, HeaderIconButton, pageStyles } from './NoteItemSections';
import { RecentBoardSection } from './RecentBoardSection';
import { OptionButton } from './home/ConfigSection';
import LoadingView from '../../components/LoadingView';
import StatusCard from '../../components/StatusCard';
import {
  useBoardPage,
  useBoardPages,
  useCreateOrUpdateBoard,
  useDeleteBoard,
} from '../../hooks/useBoardStorage';
import { useNotePages } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import { NavigationParamList } from '../../types';

const defaultScale: Scale = {
  landscape: {
    maxWidth: 250,
    padding: 20,
  },
  portrait: {
    maxWidth: 190,
    padding: 4,
  },
};

export const TitleHeader = ({
  title,
  setTitle,
  children,
}: {
  title?: string;
  setTitle?: (title?: string) => void;
  children?: React.ReactNode;
}) => {
  const { commonStyles } = useNotebookTheme();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  return (
    title && (
      <View style={[commonStyles.header, pageStyles.header]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          {setTitle && (
            <TouchableOpacity
              onPress={() => setTitle()}
              style={[commonStyles.title, { marginRight: 5 }]}
            >
              <Icon2
                name="notebook-multiple"
                size={pageStyles.title.fontSize}
                color={commonStyles.pressibleText.color}
              />
            </TouchableOpacity>
          )}
          <NotePageHeader
            title={title}
            onPress={(nextTitle, hasChild) =>
              hasChild && setTitle
                ? setTitle(nextTitle)
                : navigation.navigate('NotePage', { title })
            }
          />
        </View>
        <View style={pageStyles.actionButtons}>{children}</View>
      </View>
    )
  );
};

export const RecentPagesSection = React.memo(
  ({ title, setTitle }: { title?: string; setTitle: (title?: string) => void }) => {
    const { commonStyles } = useNotebookTheme();
    const { lang } = useLangContext();
    const window = useResizeContext();
    const { data: recentPages = [], isLoading } = useNotePages();
    const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
    const dummyCards = window === 'landscape' ? 4 : 2;

    const { usageMode } = useUsageMode();
    const isNotebookMode = usageMode === 'NOTEBOOK';

    const { data: board } = useBoardPage(title || '');
    const { data: boards = [] } = useBoardPages();
    const createBoard = useCreateOrUpdateBoard();
    const deleteBoard = useDeleteBoard();
    const [showConfig, setShowConfig] = useState(false);

    const boardOption =
      board?.option && 'BOARD_HEADER_LEVEL' in board.option ? board.option : undefined;

    const validPages = useMemo(() => {
      const pageMap = new Map(recentPages.map((v) => [v.title, v]));
      if (isNotebookMode) {
        boards.forEach((b) => {
          if (!pageMap.has(b.title)) {
            pageMap.set(b.title, { ...b, description: '' });
          }
        });
      }
      return Array.from(pageMap.values()).filter(
        (v) => v.description || (isNotebookMode && boards.some((b) => b.title === v.title))
      );
    }, [recentPages, boards, isNotebookMode]);

    const toCardPage = useToCardPage(
      (v) =>
        (isNotebookMode && boards.some((b) => b.title === v.title)) || (v.subNoteCount || 0) > 0
          ? setTitle(v.title)
          : navigation.push('NotePage', { title: v.title }),
      defaultScale,
      (v) => (title === undefined ? v.title : v.title.replace(title + '/', './'))
    );
    const contents = useMemo(() => {
      const processed = [...validPages]
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
        .filter((v) =>
          title === undefined
            ? v.title.split('/').length === 1
            : v.title.split('/').length <= 1 + title.split('/').length &&
              (v.title === title || v.title.startsWith(title + '/'))
        )
        .map((v) => {
          const children = validPages.filter(
            (child) => v.title !== title && child.title.startsWith(v.title + '/')
          );
          const latestTime = [v.updated, ...children.map((c) => c.updated)].reduce((a, b) =>
            new Date(a) > new Date(b) ? a : b
          );

          return {
            ...v,
            subNoteCount: children.length,
            updated: latestTime,
          };
        })
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

      return [
        ...processed.map(toCardPage),
        ...Array.from(Array(dummyCards).keys()).map((v) => ({ scale: defaultScale })),
      ];
    }, [validPages, title, window, toCardPage]);
    const maxWidth = (defaultScale[window].maxWidth + 5) * (window === 'landscape' ? 5 : 3);
    const renderHeader = () => {
      return (
        <>
          <TitleHeader title={title} setTitle={setTitle}>
            {title && isNotebookMode && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <HeaderIconButton
                  name="th-large"
                  onPress={() => {
                    if (board) deleteBoard.mutate(board.id);
                  }}
                  color={!board ? commonStyles.text.color : commonStyles.smallText.color}
                />
                <HeaderIconButton
                  name="columns"
                  onPress={() => {
                    if (!board) {
                      createBoard.mutate({
                        title,
                        description: '',
                        option: { BOARD_TYPE: 'KANBAN', BOARD_HEADER_LEVEL: 3 },
                      });
                    } else if (boardOption?.BOARD_TYPE === 'SCRUM') {
                      createBoard.mutate({
                        ...board,
                        description: '',
                        option: {
                          BOARD_TYPE: 'KANBAN',
                          BOARD_HEADER_LEVEL: boardOption.BOARD_HEADER_LEVEL || 3,
                        },
                      });
                    }
                  }}
                  color={
                    boardOption?.BOARD_TYPE !== 'SCRUM' && !!board
                      ? commonStyles.text.color
                      : commonStyles.smallText.color
                  }
                />
                <HeaderIconButton
                  name="trello"
                  onPress={() => {
                    if (!board) {
                      createBoard.mutate({
                        title,
                        description: '',
                        option: { BOARD_TYPE: 'SCRUM', BOARD_HEADER_LEVEL: 3 },
                      });
                    } else if (boardOption?.BOARD_TYPE !== 'SCRUM') {
                      createBoard.mutate({
                        ...board,
                        description: '',
                        option: {
                          BOARD_TYPE: 'SCRUM',
                          BOARD_HEADER_LEVEL: boardOption?.BOARD_HEADER_LEVEL || 3,
                        },
                      });
                    }
                  }}
                  color={
                    boardOption?.BOARD_TYPE === 'SCRUM' && !!board
                      ? commonStyles.text.color
                      : commonStyles.smallText.color
                  }
                />
                {board && (
                  <HeaderIconButton
                    name="cog"
                    onPress={() => setShowConfig(!showConfig)}
                    color={showConfig ? commonStyles.text.color : commonStyles.smallText.color}
                  />
                )}
              </View>
            )}
          </TitleHeader>
          {showConfig && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingVertical: 8,
                zIndex: 10,
              }}
            >
              <Text style={[commonStyles.smallText, { marginRight: 8 }]}>
                {lang('* Header level')}:
              </Text>
              {Array.from(Array(5).keys()).map((v) => {
                const level = v + 2;
                const currentLevel = boardOption?.BOARD_HEADER_LEVEL || 3;
                return (
                  <OptionButton
                    key={v}
                    title={`H${level}`}
                    onPress={() => {
                      if (currentLevel !== level && board) {
                        createBoard.mutate({
                          ...board,
                          description: '',
                          option: {
                            BOARD_TYPE: boardOption?.BOARD_TYPE || 'KANBAN',
                            BOARD_HEADER_LEVEL: level,
                          },
                        });
                      }
                    }}
                    active={currentLevel === level}
                  />
                );
              })}
            </View>
          )}
        </>
      );
    };

    return isLoading ? (
      <View style={commonStyles.container}>
        <LoadingView />
      </View>
    ) : title && board ? (
      <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0 }]}>
        <View
          style={{
            paddingTop: commonStyles.container.paddingVertical,
            paddingHorizontal: commonStyles.container.paddingHorizontal,
          }}
        >
          {renderHeader()}
        </View>
        <RecentBoardSection board={board} title={title} />
      </View>
    ) : contents.length > dummyCards ? (
      <ScrollView
        key={window}
        contentContainerStyle={[
          styles.contentContainer,
          {
            backgroundColor: commonStyles.container.backgroundColor,
            paddingRight: defaultScale[window].padding,
            paddingBottom: defaultScale[window].padding,
          },
        ]}
      >
        <View
          style={{
            paddingTop: commonStyles.container.paddingVertical,
            paddingHorizontal: commonStyles.container.paddingHorizontal,
          }}
        >
          {renderHeader()}
        </View>
        <View
          style={[
            styles.suspenseContainer,
            {
              justifyContent: window === 'landscape' ? 'flex-start' : 'center',
              maxWidth,
            },
          ]}
        >
          <Suspense fallback={null}>
            {contents.map((item, index) => renderCardPage({ item, index }))}
          </Suspense>
        </View>
      </ScrollView>
    ) : (
      <View style={commonStyles.container}>
        {renderHeader()}
        <StatusCard
          style={{ marginTop: 18 }}
          message={
            title ? 'There are no subnotes for this note.' : 'There are no recently modified notes.'
          }
          buttonTitle={title === undefined ? 'Usage' : undefined}
          onButtonPress={
            title === undefined ? () => navigation.push('NoteViewer', { key: 'Usage' }) : undefined
          }
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  contentContainer: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    flexGrow: 1,
    width: '100%',
  },
  suspenseContainer: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
