import { useResizeContext, Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import type { TopicDashboardBoard, TopicDashboardNavigationProp } from './types';
import Board from '../../components/Board';
import { Paragraph, parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { toNoteParams } from '../../components/SearchBar';
import StatusCard from '../../components/StatusCard';
import { useCreateOrUpdateBoard } from '../../hooks/useBoardStorage';
import { useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useTapDetector } from '../../hooks/useTapDetector';
import { useUsageMode } from '../../hooks/useUsageMode';
import { renderCardPage, useToCardPage } from '../../screens/main/CardPageSection';
import { Content } from '../../types';

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

const boardScale = {
  landscape: { maxWidth: 190, padding: 4 },
  portrait: { maxWidth: 190, padding: 4 },
};

const renderBoardTitle = (v: any) => {
  const parentTitle = (v as { parentTitle?: string }).parentTitle;
  return parentTitle ? parentTitle + ' / ' + v.title : v.title;
};

export const TopicBoardSection: React.FC<{
  topicBoard: TopicDashboardBoard;
}> = React.memo(({ topicBoard }) => {
  const _window = useResizeContext();
  const navigation = useNavigation<TopicDashboardNavigationProp>();
  const { commonStyles } = useNotebookTheme();
  const { isBoardEnabled } = useUsageMode();
  const { lang } = useLangContext();

  const createPageMutation = useCreateOrUpdatePage();
  const createBoardMutation = useCreateOrUpdateBoard();

  const accessableRef = useRef(true);
  const [isMoving, setIsMoving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const detectTap = useTapDetector();
  const horizontal = true;

  const { title, option, columnNotes, rows, isTopLevel } = topicBoard;

  const handlePress = useCallback(
    (v: any) => {
      if (accessableRef.current) {
        const paragraph = v.paragraph;
        if (paragraph) {
          detectTap(
            () => {
              navigation.push('NotePage', {
                ...toNoteParams(paragraph.origin, paragraph.title, paragraph.autoSection),
                board: title,
              });
            },
            () => {
              navigation.push('EditPage', {
                ...toNoteParams(paragraph.origin, paragraph.title, paragraph.autoSection),
                board: title,
              });
            },
            { delay: 200, preventSingleOnDouble: true }
          );
        }
      } else {
        accessableRef.current = true;
      }
    },
    [detectTap, navigation, title]
  );

  const toCardPage = useToCardPage(handlePress, boardScale, renderBoardTitle);

  const onEnd = useCallback(
    (rowKey: number, nextRowKey: number, columnKey: number, nextColumnKey: number, key: number) => {
      if (!rows || !rows[rowKey]) return false;
      const column = rows[rowKey].columns[columnKey];
      const page = columnNotes.find((v) => v.title === column.noteTitle);
      const newColumn = rows[nextRowKey]?.columns[nextColumnKey];
      const newPage = newColumn
        ? columnNotes.find((v) => v.title === newColumn.noteTitle)
        : undefined;

      if (page && newPage && column.items[key]) {
        const { sourceDescription, targetDescription } = move(
          page,
          newPage,
          column.items[key].paragraph.path,
          newColumn.parentParagraph
        );
        (async () => {
          setIsMoving(true);
          try {
            await createPageMutation.mutateAsync({
              title: newPage.title,
              description: targetDescription,
              isLast: page.title === newPage.title,
            });
            if (page.title !== newPage.title) {
              await createPageMutation.mutateAsync({
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
          } finally {
            setIsMoving(false);
          }
        })();
        return true;
      }
      return false;
    },
    [columnNotes, rows, createPageMutation, lang]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <Suspense fallback={null}>{renderCardPage({ item: toCardPage(item), index })}</Suspense>
    ),
    [toCardPage]
  );

  const renderHeader = useCallback(
    ({ item }: { item: { name: string }; index: number }) => {
      const colNote = columnNotes.find((c) =>
        isTopLevel ? c.title === item.name : c.title.slice(title.length + 1) === item.name
      );
      return (
        <TouchableOpacity
          onPress={() => {
            if (colNote) {
              navigation.push('NotePage', { title: colNote.title, board: title });
            }
          }}
          style={{ backgroundColor: commonStyles.container.backgroundColor }}
        >
          <Text selectable={false} style={commonStyles.title}>
            {item.name}
          </Text>
        </TouchableOpacity>
      );
    },
    [
      navigation,
      title,
      columnNotes,
      isTopLevel,
      commonStyles.container.backgroundColor,
      commonStyles.title,
    ]
  );

  const onStart = useCallback(() => {
    accessableRef.current = false;
  }, []);

  const columnStyle = useMemo(
    () => ({
      borderColor: commonStyles.text.color,
    }),
    [commonStyles.text.color]
  );

  const handleSaveAsBoard = useCallback(async () => {
    if (!isBoardEnabled) return;
    try {
      await createBoardMutation.mutateAsync({
        title,
        description: '',
        option,
      });
      setIsSaved(true);
      Alert.alert(lang('Success'), lang('Board created successfully!'));
    } catch (e) {
      Alert.alert(lang('error'), String(e));
    }
  }, [createBoardMutation, title, option, isBoardEnabled, lang]);

  return (
    <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0, flex: 1 }]}>
      {/* Board Controls Toolbar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderBottomWidth: 1,
          borderBottomColor: commonStyles.card.borderColor,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[commonStyles.title, { fontSize: 16 }]}>{title}</Text>
        </View>

        {isBoardEnabled && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isTopLevel ? (
              <TouchableOpacity
                onPress={() => {
                  navigation.push('TopicBatchMove', {
                    title,
                    batchTitles: columnNotes.map((c) => c.title),
                    boardOption: option,
                  });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4,
                  backgroundColor: '#3498DB22',
                  marginLeft: 4,
                }}
              >
                <MciIcon name="content-save-outline" size={14} color="#3498DB" />
                <Text
                  style={{
                    fontSize: 12,
                    color: '#3498DB',
                    marginLeft: 4,
                    fontWeight: '600',
                  }}
                >
                  {lang('Save as Board')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSaveAsBoard}
                disabled={isSaved || createBoardMutation.isLoading}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4,
                  backgroundColor: isSaved ? '#27AE6022' : '#3498DB22',
                  marginLeft: 4,
                }}
              >
                <MciIcon
                  name={isSaved ? 'check' : 'content-save-outline'}
                  size={14}
                  color={isSaved ? '#27AE60' : '#3498DB'}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: isSaved ? '#27AE60' : '#3498DB',
                    marginLeft: 4,
                    fontWeight: '600',
                  }}
                >
                  {isSaved ? lang('Saved') : lang('Save as Board')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Board Matrix */}
      {rows && rows.length > 0 && rows[0].columns.length > 0 ? (
        <Board
          horizontal={_window === 'portrait' && horizontal}
          rows={rows}
          columnStyle={columnStyle}
          renderHeader={renderHeader}
          renderItem={renderItem}
          onStart={onStart}
          onEnd={onEnd}
        />
      ) : (
        <StatusCard message="There are no columns." />
      )}

      {isMoving && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3498DB" />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(127,127,127,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
});

export default TopicBoardSection;
