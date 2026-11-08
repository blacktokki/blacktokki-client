import { useLangContext, useResizeContext } from '@blacktokki/core';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, ViewStyle } from 'react-native';
import { Icon } from 'react-native-paper';

import { TemplateHeaderSection } from './TemplateHeaderSection';
import { TemplateSourceBoardSection } from './TemplateSourceBoardSection';
import { TemplateSourceGroupCard } from './TemplateSourceGroupCard';
import {
  useBoardPages,
  useCreateOrUpdateBoard,
  useDeleteBoard,
} from '../../../hooks/useBoardStorage';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { useUsageMode } from '../../../hooks/useUsageMode';
import { Item, renderCardPage, Scale, useToCardPage } from '../../../screens/main/CardPageSection';
import { HeaderIconButton } from '../../../screens/main/NoteItemSections';
import { OptionButton } from '../../../screens/main/home/ConfigSection';
import { BoardOption } from '../../../types';
import { templateStyles as styles } from '../styles';
import { groupNotePaths, TitleFolder } from '../titleGrouping';
import { ExampleNote } from '../types';

type SourceView = 'CARDS' | 'KANBAN' | 'SCRUM';
type SourceViewSettings = { view: SourceView; headerLevel: number };
type SourceGroupCard = Extract<Item, { title: string }> & { noteCount: number };
const defaultViewSettings: SourceViewSettings = { view: 'CARDS', headerLevel: 3 };

const scale: Scale = {
  landscape: { maxWidth: 250, padding: 20 },
  portrait: { maxWidth: 190, padding: 4 },
};

const byUpdated = (a: ExampleNote, b: ExampleNote) =>
  (Date.parse(b.updated || '') || 0) - (Date.parse(a.updated || '') || 0) ||
  a.title.localeCompare(b.title, undefined, { numeric: true });

const folderNotes = (folder: TitleFolder): ExampleNote[] => [
  ...folder.groups.flatMap((group) => group.notes),
  ...folder.folders.flatMap(folderNotes),
];

const noteName = (note: ExampleNote) => note.title.normalize('NFC').split('/').at(-1);

/** Browse template sources as cards, Kanban or Scrum using the recent-note views. */
export const TemplateSourcesSection = ({
  templateName,
  notes,
  notebookRoots,
  initialGroupPath = '',
  paddingHorizontal,
  canWrite,
  onPreviewTemplate,
  onWriting,
  onCatalog,
  onSelect,
  onNotesChange,
}: {
  templateName: string;
  notes: ExampleNote[];
  notebookRoots: string[];
  initialGroupPath?: string;
  paddingHorizontal?: ViewStyle['paddingHorizontal'];
  canWrite: boolean;
  onPreviewTemplate: () => void;
  onWriting: (notes: ExampleNote[], groupPath: string) => void;
  onCatalog?: () => void;
  onSelect: (title: string) => void;
  onNotesChange?: () => void | Promise<unknown>;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const headerInset = {
    paddingHorizontal: paddingHorizontal ?? commonStyles.container.paddingHorizontal,
  };
  const window = useResizeContext();
  const [localSettings, setLocalSettings] = useState<Record<string, SourceViewSettings>>({});
  const [showConfig, setShowConfig] = useState(false);
  const [folderPath, setFolderPath] = useState(initialGroupPath);
  const tree = useMemo(() => groupNotePaths(notes, notebookRoots), [notes, notebookRoots]);
  const { folder, source } = useMemo(() => {
    let folder = tree;
    let source: ExampleNote | undefined;
    for (const name of folderPath.split('/').filter(Boolean)) {
      const child = folder.folders.find((item) => item.name === name);
      if (!child) return { folder: tree };
      source = folder.groups
        .flatMap((group) => group.notes)
        .find((note) => noteName(note) === name);
      folder = child;
    }
    return { folder, source };
  }, [tree, folderPath]);
  const boardNotes = useMemo(() => folderNotes(folder), [folder]);
  const groupTitle = useMemo(() => {
    if (!folder.path) return '';
    if (source) return source.title;
    const parts = boardNotes[0]?.title.split('/') || [];
    const root = notebookRoots.some((name) => name.normalize('NFC') === parts[0]?.normalize('NFC'));
    return parts.slice(0, folder.path.split('/').length + (root ? 1 : 0)).join('/');
  }, [folder.path, source, boardNotes, notebookRoots]);
  const { isBoardEnabled } = useUsageMode();
  const boardPages = useBoardPages();
  const createBoard = useCreateOrUpdateBoard();
  const deleteBoard = useDeleteBoard();
  const shareSettings = !!groupTitle && !!isBoardEnabled;
  const board = shareSettings
    ? boardPages.data?.find((item) => item.title.normalize('NFC') === groupTitle.normalize('NFC'))
    : undefined;
  const savedOption =
    board?.option && 'BOARD_HEADER_LEVEL' in board.option ? board.option : undefined;
  const local = localSettings[groupTitle] || defaultViewSettings;
  const view: SourceView = shareSettings
    ? board
      ? savedOption?.BOARD_TYPE === 'SCRUM'
        ? 'SCRUM'
        : 'KANBAN'
      : 'CARDS'
    : local.view;
  const headerLevel = shareSettings ? savedOption?.BOARD_HEADER_LEVEL || 3 : local.headerLevel;
  useEffect(() => setShowConfig(false), [groupTitle]);
  const boardOption = useMemo<BoardOption>(
    () => ({
      BOARD_TYPE: view === 'SCRUM' ? 'SCRUM' : 'KANBAN',
      BOARD_HEADER_LEVEL: headerLevel,
    }),
    [view, headerLevel]
  );
  const updateSettings = (nextView: SourceView, nextLevel: number) => {
    if (nextView === view && nextLevel === headerLevel) return;
    if (shareSettings) {
      if (
        boardPages.isLoading ||
        boardPages.isError ||
        createBoard.isLoading ||
        deleteBoard.isLoading
      )
        return;
      if (nextView === 'CARDS') {
        if (board) deleteBoard.mutate(board.id);
      } else {
        createBoard.mutate({
          id: board?.id,
          title: board?.title || groupTitle,
          description: board?.description || '',
          option: {
            ...savedOption,
            BOARD_TYPE: nextView,
            BOARD_HEADER_LEVEL: nextLevel,
          },
        });
      }
    } else {
      setLocalSettings((current) => ({
        ...current,
        [groupTitle]: { view: nextView, headerLevel: nextLevel },
      }));
    }
  };
  const changeView = (view: SourceView) => {
    updateSettings(view, headerLevel);
    setShowConfig(false);
  };
  const toNoteCard = useToCardPage(
    (note) => onSelect(note.title),
    scale,
    (note) => (folder.path ? './' : '') + note.title.split('/').at(-1)
  );
  const toFolderCard = useToCardPage(
    (item) => setFolderPath(item.title),
    scale,
    (item) => (folder.path ? './' : '') + item.title.split('/').at(-1)
  );
  const contents = useMemo<(Item | SourceGroupCard)[]>(() => {
    const siblings = folder.groups.flatMap((group) => group.notes);
    const folders = folder.folders.map((child) => {
      const parent = siblings.find((note) => noteName(note) === child.name);
      const descendants = folderNotes(child);
      const latest = [...(parent ? [parent] : []), ...descendants].sort(byUpdated)[0];
      return {
        ...(parent || latest),
        title: child.path,
        updated: latest.updated,
        noteCount: child.count + (parent ? 1 : 0),
        folder: true,
      };
    });
    const childNames = new Set(folder.folders.map((child) => child.name));
    const sources = [
      ...(source ? [source] : []),
      ...siblings.filter((note) => !childNames.has(noteName(note) || '')),
    ];
    const cards: (ExampleNote | (typeof folders)[number])[] = [...folders, ...sources];
    return [
      ...cards
        .sort(byUpdated)
        .map((item) =>
          'folder' in item ? { ...toFolderCard(item), noteCount: item.noteCount } : toNoteCard(item)
        ),
      ...Array.from({ length: window === 'landscape' ? 4 : 2 }, () => ({ scale })),
    ];
  }, [folder, source, toFolderCard, toNoteCard, window]);
  const maxWidth = (scale[window].maxWidth + 5) * (window === 'landscape' ? 5 : 3);

  return (
    <View style={styles.sourceSection}>
      <View style={headerInset}>
        <TemplateHeaderSection
          templateName={templateName}
          canWrite={canWrite}
          onSources={onPreviewTemplate}
          onWriting={() =>
            onWriting(
              folder.path ? [...(source ? [source] : []), ...boardNotes] : notes,
              folder.path
            )
          }
          onCatalog={onCatalog}
          onTitlePress={onPreviewTemplate}
          groupPath={folder.path}
          onGroupPress={setFolderPath}
          actions={
            <>
              <HeaderIconButton
                name="th-large"
                color={view === 'CARDS' ? commonStyles.text.color : commonStyles.smallText.color}
                onPress={() => changeView('CARDS')}
              />
              <HeaderIconButton
                name="columns"
                color={view === 'KANBAN' ? commonStyles.text.color : commonStyles.smallText.color}
                onPress={() => changeView('KANBAN')}
              />
              <HeaderIconButton
                name="trello"
                color={view === 'SCRUM' ? commonStyles.text.color : commonStyles.smallText.color}
                onPress={() => changeView('SCRUM')}
              />
              {view !== 'CARDS' && (
                <HeaderIconButton
                  name="cog"
                  color={showConfig ? commonStyles.text.color : commonStyles.smallText.color}
                  onPress={() => setShowConfig(!showConfig)}
                />
              )}
            </>
          }
        />
        {view !== 'CARDS' && showConfig && (
          <View style={[styles.wrap, styles.formActions]}>
            <Text style={commonStyles.smallText}>{lang('* Header level')}:</Text>
            {[2, 3, 4, 5, 6].map((level) => (
              <OptionButton
                key={level}
                title={`H${level}`}
                active={headerLevel === level}
                onPress={() => updateSettings(view, level)}
              />
            ))}
          </View>
        )}
      </View>
      {view === 'CARDS' ? (
        <ScrollView
          style={styles.sourceSection}
          contentContainerStyle={[
            styles.sourceScrollContent,
            headerInset,
            { paddingBottom: commonStyles.container.paddingVertical },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.sourceGrid,
              {
                maxWidth,
                justifyContent: window === 'landscape' ? 'flex-start' : 'center',
                paddingRight: scale[window].padding,
                paddingBottom: scale[window].padding,
              },
            ]}
          >
            <Suspense fallback={null}>
              {contents.map((item, index) =>
                item.title !== undefined &&
                'noteCount' in item &&
                typeof item.noteCount === 'number' ? (
                  <TemplateSourceGroupCard key={index} item={item} count={item.noteCount} />
                ) : (
                  renderCardPage({ item, index })
                )
              )}
            </Suspense>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.sourceBoard}>
          <TemplateSourceBoardSection
            option={boardOption}
            title={groupTitle}
            notes={boardNotes}
            onChange={onNotesChange}
          />
        </View>
      )}
      {!notes.length && (
        <View style={styles.empty}>
          <Icon source="file-document-outline" size={32} color={commonStyles.smallText.color} />
          <Text style={[commonStyles.smallText, styles.emptyText]}>
            {lang('No similar notes.')}
          </Text>
        </View>
      )}
    </View>
  );
};
