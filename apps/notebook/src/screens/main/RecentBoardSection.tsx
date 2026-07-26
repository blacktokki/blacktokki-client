import { useResizeContext, Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import { renderCardPage, useToCardPage } from './CardPageSection';
import Board from '../../components/Board';
import {
  Paragraph,
  paragraphDescription,
  parseHtmlToParagraphs,
} from '../../components/HeaderSelectBar';
import { toNoteParams } from '../../components/SearchBar';
import StatusCard from '../../components/StatusCard';
import { useCreateOrUpdatePage, useNotePages } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useTapDetector } from '../../hooks/useTapDetector';
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

const boardScale = {
  landscape: { maxWidth: 190, padding: 4 },
  portrait: { maxWidth: 190, padding: 4 },
};

const renderBoardTitle = (v: any) => {
  const parentTitle = (v as { parentTitle?: string }).parentTitle;
  return parentTitle ? parentTitle + ' / ' + v.title : v.title;
};

export const RecentBoardSection: React.FC<{ board: Content; title: string }> = React.memo(
  ({ board, title }) => {
    const _window = useResizeContext();
    const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
    const { commonStyles } = useNotebookTheme();
    const { lang } = useLangContext();

    const { data: pages = [] } = useNotePages();
    const mutation = useCreateOrUpdatePage();

    const accessableRef = useRef(true);
    const [isMoving, setIsMoving] = useState(false);
    const detectTap = useTapDetector();
    const horizontal = true;
    const option = board?.option && 'BOARD_HEADER_LEVEL' in board.option ? board.option : undefined;

    const handlePress = useCallback(
      (v: any) => {
        if (accessableRef.current) {
          const paragraph = v.paragraph;
          if (paragraph) {
            detectTap(
              () => {
                navigation.push('NotePage', {
                  ...toNoteParams(paragraph.origin, paragraph.title, paragraph.autoSection),
                  board: board?.title,
                });
              },
              () => {
                navigation.push('EditPage', {
                  ...toNoteParams(paragraph.origin, paragraph.title, paragraph.autoSection),
                  board: board?.title,
                });
              },
              { delay: 200, preventSingleOnDouble: true }
            );
          }
        } else {
          accessableRef.current = true;
        }
      },
      [detectTap, navigation, board?.title]
    );

    const toCardPage = useToCardPage(handlePress, boardScale, renderBoardTitle);

    const noteColumns = useMemo(() => {
      return pages
        .filter(
          (p) =>
            p.title !== title &&
            p.title.startsWith(title + '/') &&
            p.title.slice(title.length + 1).split('/').length === 1
        )
        .sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        );
    }, [pages, title]);

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
          const relName = page.title.slice(title.length + 1);
          const parent = useScrum ? rows.find((v) => v.title === row.title) || row : undefined;
          const firstRowIndex = useScrum
            ? paragraphs.findIndex((v) => v.level + 1 === option.BOARD_HEADER_LEVEL)
            : paragraphs.length;
          return {
            name: relName,
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
    }, [noteColumns, option, title]);

    const onEnd = useCallback(
      (
        rowKey: number,
        nextRowKey: number,
        columnKey: number,
        nextColumnKey: number,
        key: number
      ) => {
        if (!rows) return false;
        const column = rows[rowKey].columns[columnKey];
        const page = noteColumns.find((v) => v.title.slice(title.length + 1) === column.name);
        const newColumn = rows[nextRowKey].columns[nextColumnKey];
        const newPage = noteColumns.find((v) => v.title.slice(title.length + 1) === newColumn.name);
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
            } finally {
              setIsMoving(false);
            }
          })();
          return true;
        }
        return false;
      },
      [noteColumns, rows, title, mutation, lang]
    );

    const renderItem = useCallback(
      ({ item, index }: { item: any; index: number }) => (
        <Suspense fallback={null}>{renderCardPage({ item: toCardPage(item), index })}</Suspense>
      ),
      [toCardPage]
    );

    const renderHeader = useCallback(
      ({ item }: { item: { name: string }; index: number }) => (
        <TouchableOpacity
          onPress={() =>
            navigation.push('NotePage', { title: title + '/' + item.name, board: board.title })
          }
          style={{ backgroundColor: commonStyles.container.backgroundColor }}
        >
          <Text selectable={false} style={commonStyles.title}>
            {item.name}
          </Text>
        </TouchableOpacity>
      ),
      [navigation, title, board?.title, commonStyles.container.backgroundColor, commonStyles.title]
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

    return (
      <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0, flex: 1 }]}>
        <View
          style={{
            width: '100%',
            height: 2,
            backgroundColor: commonStyles.card.borderColor,
            marginBottom: 8,
          }}
        />
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
  }
);

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(127,127,127,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
});
