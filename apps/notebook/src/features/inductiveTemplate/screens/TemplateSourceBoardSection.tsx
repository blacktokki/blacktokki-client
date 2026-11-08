import { useResizeContext, Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';

import Board from '../../../components/Board';
import {
  Paragraph,
  paragraphDescription,
  parseHtmlToParagraphs,
} from '../../../components/HeaderSelectBar';
import { toNoteParams } from '../../../components/SearchBar';
import StatusCard from '../../../components/StatusCard';
import { useCreateOrUpdatePage } from '../../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { useTapDetector } from '../../../hooks/useTapDetector';
import { BaseItem, renderCardPage, useToCardPage } from '../../../screens/main/CardPageSection';
import { BoardOption, NavigationParamList } from '../../../types';
import { templateStyles as styles } from '../styles';
import { ExampleNote } from '../types';

type TemplateSourceBoardProps = {
  notes: ExampleNote[];
  title: string;
  option: BoardOption;
  onChange?: () => void | Promise<unknown>;
};

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

const move = (page: ExampleNote, newPage: ExampleNote, path: string, newParent?: Paragraph) => {
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

const renderBoardTitle = (v: BaseItem & { parentTitle?: string }) => {
  const parentTitle = v.parentTitle;
  return parentTitle ? parentTitle + ' / ' + v.title : v.title;
};

const updatedAt = (note: ExampleNote) => Date.parse(note.updated || '') || 0;

/** Render only the supplied template sources; column and card actions retain their original paths. */
export const TemplateSourceBoardSection: React.FC<TemplateSourceBoardProps> = React.memo(
  ({ title, notes, option, onChange }) => {
    const _window = useResizeContext();
    const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
    const { commonStyles } = useNotebookTheme();
    const { lang } = useLangContext();

    const mutation = useCreateOrUpdatePage();

    const canOpen = useRef(true);
    const moving = useRef(false);
    const [isMoving, setIsMoving] = useState(false);
    const detectTap = useTapDetector();

    const handlePress = useCallback(
      (v: BaseItem) => {
        if (canOpen.current) {
          const paragraph = v.paragraph;
          if (paragraph) {
            detectTap(
              () => {
                navigation.push('NotePage', {
                  ...toNoteParams(paragraph.origin, paragraph.title, paragraph.autoSection),
                });
              },
              () => {
                navigation.push('EditPage', {
                  ...toNoteParams(paragraph.origin, paragraph.title, paragraph.autoSection),
                });
              },
              { delay: 200, preventSingleOnDouble: true }
            );
          }
        } else {
          canOpen.current = true;
        }
      },
      [detectTap, navigation]
    );

    const toCardPage = useToCardPage(handlePress, boardScale, renderBoardTitle);

    const noteColumns = useMemo(
      () =>
        [...notes].sort(
          (a, b) =>
            (!title ? updatedAt(b) - updatedAt(a) : 0) ||
            a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        ),
      [notes, title]
    );

    const rows = useMemo(() => {
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
      return commonRows
        .map((row) => {
          const columns = preDataAll.map((c) => {
            const { page, paragraphs, rows } = c;
            const relName =
              title && page.title.normalize('NFC').startsWith(title.normalize('NFC') + '/')
                ? page.title.split('/').slice(title.split('/').length).join('/')
                : page.title;
            const parent = useScrum ? rows.find((v) => v.title === row.title) || row : undefined;
            const rowIndex = useScrum
              ? paragraphs.findIndex((v) => v.level + 1 === option.BOARD_HEADER_LEVEL)
              : -1;
            const firstRowIndex = rowIndex < 0 ? paragraphs.length : rowIndex;
            return {
              name: relName,
              noteTitle: page.title,
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
            updatedAt: columns.reduce(
              (latest, column, index) =>
                column.items.length ? Math.max(latest, updatedAt(noteColumns[index])) : latest,
              0
            ),
          };
        })
        .sort(
          (a, b) =>
            b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, undefined, { numeric: true })
        );
    }, [noteColumns, option, title]);

    const onEnd = useCallback(
      (
        rowKey: number,
        nextRowKey: number,
        columnKey: number,
        nextColumnKey: number,
        key: number
      ) => {
        if (moving.current) return false;
        const column = rows[rowKey].columns[columnKey];
        const page = noteColumns.find((v) => v.title === column.noteTitle);
        const newColumn = rows[nextRowKey].columns[nextColumnKey];
        const newPage = noteColumns.find((v) => v.title === newColumn.noteTitle);
        if (page && newPage && column.items[key]) {
          const { sourceDescription, targetDescription } = move(
            page,
            newPage,
            column.items[key].paragraph.path,
            newColumn.parentParagraph
          );
          moving.current = true;
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
              await onChange?.();
            } catch (error) {
              Alert.alert(
                lang('error'),
                error ? `${error}` : lang('An error occurred while moving note.')
              );
            } finally {
              moving.current = false;
              setIsMoving(false);
            }
          })();
          return true;
        }
        return false;
      },
      [noteColumns, rows, mutation, lang, onChange]
    );

    const renderItem = useCallback(
      ({ item, index }: { item: BaseItem; index: number }) => (
        <Suspense fallback={null}>{renderCardPage({ item: toCardPage(item), index })}</Suspense>
      ),
      [toCardPage]
    );

    const renderHeader = useCallback(
      ({ item }: { item: { name: string; noteTitle?: string }; index: number }) => (
        <TouchableOpacity
          onPress={() =>
            navigation.push('NotePage', {
              title: item.noteTitle || item.name,
            })
          }
          style={{ backgroundColor: commonStyles.container.backgroundColor }}
        >
          <Text selectable={false} style={commonStyles.title}>
            {item.name}
          </Text>
        </TouchableOpacity>
      ),
      [navigation, commonStyles.container.backgroundColor, commonStyles.title]
    );

    const onStart = useCallback(() => {
      canOpen.current = false;
    }, []);

    const columnStyle = useMemo(
      () => ({
        borderColor: commonStyles.text.color,
      }),
      [commonStyles.text.color]
    );

    return (
      <View style={[commonStyles.container, styles.sourceBoard]}>
        <View style={[styles.boardDivider, { backgroundColor: commonStyles.card.borderColor }]} />
        {rows.length > 0 && rows[0].columns.length > 0 ? (
          <Board
            horizontal={_window === 'portrait'}
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
          <View
            style={[
              commonStyles.backgroundContainer,
              commonStyles.centerContent,
              styles.boardOverlay,
            ]}
          >
            <ActivityIndicator size="large" color={commonStyles.icon.color} />
          </View>
        )}
      </View>
    );
  }
);
