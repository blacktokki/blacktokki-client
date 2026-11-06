import { CommonButton, useLangContext, useModalsContext } from '@blacktokki/core';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useQueryClient } from 'react-query';

import {
  MemoTab,
  MemoTabs,
  addMemoDraft,
  closeMemoTab,
  checksumMemoContent,
  memoDraftTitle,
  memoHasChanges,
  reorderMemoTabs,
  syncMemoTabs,
  visibleMemoTabs,
} from './memoTabs';
import { useTempMemoTabs } from './useTempMemoStorage';
import LoadingView from '../../components/LoadingView';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import {
  focusListener,
  getSplitTitle,
  useCreateOrUpdatePage,
  useNotePages,
} from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import {
  useAddRecentTab,
  useDeleteRecentTab,
  useRecentTabs,
  useReorderRecentTabs,
} from '../../hooks/useTabStorage';
import { useUsageMode } from '../../hooks/useUsageMode';
import AlertModal from '../../modals/AlertModal';
import { EditPageSection } from '../../screens/main/EditPageScreen';
import { Content } from '../../types';

const noteTabs = (tabs: Content[]) =>
  tabs.filter(
    (tab, index) => tab.type === 'NOTE' && tabs.findIndex((item) => item.id === tab.id) === index
  );
const TAB_MIN_WIDTH = 120;
const TAB_GAP = 2;
const ADD_TAB_WIDTH = 36;
const TAB_NAV_WIDTH = 28;
const SAVE_IDLE_DELAY_MS = 1000;
const SAVE_FEEDBACK_MS = 1200;
const SAVE_BUTTON_HEIGHT = 40;
const SAVE_BUTTON_INSET = 18;
const SAVE_BUTTON_CLEARANCE = SAVE_BUTTON_HEIGHT + SAVE_BUTTON_INSET * 2;
type MemoEditActivity = { id: string; composing: boolean };
type MemoEditListener = (id: string, composing?: boolean) => void;

function MemoWorkspace({
  state,
  update,
}: {
  state: MemoTabs;
  update: (updater: (state: MemoTabs) => MemoTabs) => void;
}) {
  const { lang } = useLangContext();
  const { setModal } = useModalsContext();
  const { commonStyles } = useNotebookTheme();
  const queryClient = useQueryClient();
  const { notebook } = useUsageMode();
  const notebookId = notebook?.id || 0;
  const pages = useNotePages();
  const recent = useRecentTabs();
  const { refetch: refetchTabs } = recent;
  const { mutateAsync: addRecentTab } = useAddRecentTab();
  const { mutateAsync: deleteRecentTab } = useDeleteRecentTab();
  const { mutateAsync: reorderRecentTabs } = useReorderRecentTabs();
  const mutation = useCreateOrUpdatePage();
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const editActivityListener = useRef<MemoEditListener | undefined>(undefined);
  const [visitedEditorIds, setVisitedEditorIds] = useState<string[]>([]);
  const [readyEditorIds, setReadyEditorIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string>();
  const [dropTargetId, setDropTargetId] = useState<string>();
  const [dragX] = useState(() => new Animated.Value(0));
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [tabOffset, setTabOffset] = useState(0);
  const [measuredTabWidths, setMeasuredTabWidths] = useState(() => new Map<string, number>());
  const tabScroll = useRef<ScrollView>(null);
  const busy = useRef(false);
  const latestState = useRef(state);
  latestState.current = state;
  const mounted = useRef(true);
  const notes = useMemo(
    () =>
      noteTabs(recent.data || []).flatMap((tab) => {
        const note = pages.data?.find((item) => item.id === tab.id);
        return note ? [note] : [];
      }),
    [recent.data, pages.data]
  );
  const tabs = useMemo(() => visibleMemoTabs(state, notes), [state, notes]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === state.activeId)
  );
  const active = tabs[activeIndex];
  const activeNote = notes.find((note) => note.id === active?.noteId);
  const selectedEditorId =
    active &&
    state.tabs.some((tab) => tab.id === active.id && tab.originalChecksum !== undefined) &&
    (active.noteId === undefined || recent.isSuccess)
      ? active?.id
      : undefined;
  const editorIds =
    selectedEditorId && !visitedEditorIds.includes(selectedEditorId)
      ? [...visitedEditorIds, selectedEditorId]
      : visitedEditorIds;
  const visibleEditorId =
    selectedEditorId && readyEditorIds.includes(selectedEditorId) ? selectedEditorId : undefined;
  const dragIndex = tabs.findIndex((tab) => tab.id === draggingId);
  const targetIndex = tabs.findIndex((tab) => tab.id === dropTargetId);
  const tabAreaWidth = Math.max(0, tabBarWidth - ADD_TAB_WIDTH);
  const minimumTabSpan = TAB_MIN_WIDTH + TAB_GAP;
  const minimumContentWidth = tabs.length * minimumTabSpan;
  const availableExtraWidth = Math.max(0, Math.floor(tabAreaWidth) - minimumContentWidth);
  const requestedExtraWidths = tabs.map(
    (tab) => (measuredTabWidths.get(tab.id) ?? TAB_MIN_WIDTH) - TAB_MIN_WIDTH
  );
  const requestedExtraWidth = requestedExtraWidths.reduce((sum, width) => sum + width, 0);
  const expansionRatio =
    requestedExtraWidth > availableExtraWidth ? availableExtraWidth / requestedExtraWidth : 1;
  let tabContentWidth = 0;
  const tabLayouts = requestedExtraWidths.map((extraWidth) => {
    const width = TAB_MIN_WIDTH + Math.floor(extraWidth * expansionRatio);
    const start = tabContentWidth;
    tabContentWidth += width + TAB_GAP;
    return { start, width };
  });
  const activeStart = tabLayouts[activeIndex]?.start ?? 0;
  const activeWidth = tabLayouts[activeIndex]?.width ?? TAB_MIN_WIDTH;
  const dragSpan = (tabLayouts[dragIndex]?.width ?? TAB_MIN_WIDTH) + TAB_GAP;
  const hasTabOverflow = tabBarWidth > 0 && minimumContentWidth > tabAreaWidth;
  const tabViewportWidth = Math.max(0, tabAreaWidth - (hasTabOverflow ? TAB_NAV_WIDTH * 2 : 0));
  const maxTabOffset = hasTabOverflow ? tabContentWidth - tabViewportWidth : 0;

  useLayoutEffect(() => {
    setTabOffset((current) => {
      if (!maxTabOffset) return 0;
      const offset = Math.min(current, maxTabOffset);
      const end = activeStart + activeWidth;
      if (activeStart < offset || tabViewportWidth < activeWidth) return activeStart;
      return Math.min(maxTabOffset, Math.max(offset, end - tabViewportWidth));
    });
  }, [activeStart, activeWidth, maxTabOffset, tabViewportWidth]);

  useLayoutEffect(() => {
    tabScroll.current?.scrollTo({ x: Math.min(tabOffset, maxTabOffset), animated: false });
  }, [maxTabOffset, tabOffset]);

  useFocusEffect(
    useCallback(() => {
      if (!activeNote) return;
      queryClient.setQueryData(['lastTab', notebookId, activeNote.id], activeNote);
      for (const onFocus of focusListener) onFocus(queryClient, activeNote.id);
    }, [activeNote, notebookId, queryClient])
  );

  useEffect(() => {
    const ids = new Set(tabs.map((tab) => tab.id));
    setVisitedEditorIds((current) => {
      const remaining = current.filter((id) => ids.has(id));
      if (selectedEditorId && !remaining.includes(selectedEditorId)) {
        return [...remaining, selectedEditorId];
      }
      return remaining.length === current.length ? current : remaining;
    });
    setReadyEditorIds((current) => {
      const remaining = current.filter((id) => ids.has(id));
      return remaining.length === current.length ? current : remaining;
    });
    setMeasuredTabWidths((current) => {
      const remaining = [...current].filter(([id]) => ids.has(id));
      return remaining.length === current.size ? current : new Map(remaining);
    });
  }, [tabs, selectedEditorId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pinNote = useCallback(
    async (id: number) => {
      await addRecentTab({ id });
      if (!mounted.current) return;
      const result = await refetchTabs({ throwOnError: true });
      if (!result.data?.some((tab) => tab.id === id)) {
        throw new Error('Could not update the tab list.');
      }
    },
    [addRecentTab, refetchTabs]
  );

  useEffect(() => {
    if (recent.isSuccess) {
      update((current) => syncMemoTabs(current, notes));
    }
  }, [state, notes, recent.isSuccess, update]);

  const handleSave = async (tab: MemoTab) => {
    const { content, noteId, createdNoteTitle } = tab;
    if (busy.current || content === undefined) return false;
    busy.current = true;
    setIsBusy(true);
    setError('');
    try {
      let title: string;
      if (noteId === undefined) {
        title = createdNoteTitle ?? tab.title;
        if (!title) throw new Error('Enter a note title to save.');
        if (createdNoteTitle === undefined) {
          const result = await pages.refetch({ throwOnError: true });
          const titleKey = (value: string) => value.normalize('NFC').toLowerCase();
          const existingTitles = new Set((result.data || []).map((note) => titleKey(note.title)));
          for (let suffix = 0; ; suffix++) {
            title = suffix === 0 ? tab.title : `${tab.title} (${suffix})`;
            if (existingTitles.has(titleKey(title))) continue;
            if (!mounted.current) return false;
            try {
              await mutation.mutateAsync({ title, description: content, createOnly: true });
              break;
            } catch (error) {
              if (
                !(error instanceof Error) ||
                error.message !== 'Page with new title already exists'
              ) {
                throw error;
              }
            }
          }
          update((current) => ({
            ...current,
            tabs: current.tabs.map((item) =>
              item.id === tab.id ? { ...item, createdNoteTitle: title } : item
            ),
          }));
        } else {
          await mutation.mutateAsync({ title, description: content });
        }
      } else {
        const result = await pages.refetch({ throwOnError: true });
        if (!mounted.current) return false;
        title = result.data?.find((item) => item.id === noteId)?.title || tab.title;
        await mutation.mutateAsync({ title, description: content });
      }
      if (!mounted.current) return false;
      const saved = await pages.refetch({ throwOnError: true });
      const note = saved.data?.find(
        (item) => item.title.normalize('NFC') === title.normalize('NFC')
      );
      if (!note) throw new Error('Failed to save');
      if (!mounted.current) return false;
      await pinNote(note.id);
      if (!mounted.current) return false;
      const originalChecksum = await checksumMemoContent(content);
      if (!mounted.current) return false;
      update((current) => ({
        ...current,
        tabs: current.tabs
          .filter((item) => item.id === tab.id || item.noteId !== note.id)
          .map((item) =>
            item.id === tab.id
              ? {
                  ...item,
                  title: note.title,
                  noteId: note.id,
                  originalChecksum,
                  contentChecksum:
                    item.content === content ? originalChecksum : item.contentChecksum,
                  createdNoteTitle: undefined,
                }
              : item
          ),
      }));
      return note.id;
    } catch (e) {
      if (mounted.current) setError((e as Error).message || 'Failed to save');
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setIsBusy(false);
    }
  };

  const handleClose = async (tab: MemoTab) => {
    if (busy.current || tab.originalChecksum === undefined) return;
    const index = tabs.findIndex((item) => item.id === tab.id);
    const nextActive = tabs[index > 0 ? index - 1 : 1]?.id;
    const wasActive = active?.id === tab.id;
    const close = async (noteId = tab.noteId) => {
      if (busy.current) return;
      busy.current = true;
      setIsBusy(true);
      setError('');
      try {
        if (noteId !== undefined) {
          await deleteRecentTab(noteId);
          if (!mounted.current) return;
          const result = await refetchTabs({ throwOnError: true });
          if (result.data?.some((item) => item.id === noteId)) {
            throw new Error('Could not update the tab list.');
          }
        }
        if (!mounted.current) return;
        update((current) => ({
          ...closeMemoTab(current, tab.id),
          activeId: wasActive ? nextActive : current.activeId,
        }));
      } catch (e) {
        if (mounted.current) setError((e as Error).message);
      } finally {
        busy.current = false;
        if (mounted.current) setIsBusy(false);
      }
    };
    let contentChecksum = tab.contentChecksum;
    if (contentChecksum === undefined) {
      try {
        contentChecksum = await checksumMemoContent(tab.content || '');
      } catch (e) {
        if (mounted.current) setError((e as Error).message);
        return;
      }
      if (!mounted.current) return;
      const latest = latestState.current.tabs.find((item) => item.id === tab.id);
      if (
        !latest ||
        latest.content !== tab.content ||
        latest.originalChecksum !== tab.originalChecksum
      )
        return;
    }
    if (contentChecksum === tab.originalChecksum) close();
    else {
      setModal(AlertModal, {
        type: 'UNSAVED',
        callbacks: [
          () => {
            handleSave(tab).then((saved) => {
              if (
                tab.noteId !== undefined &&
                saved !== false &&
                mounted.current &&
                latestState.current.tabs.find((item) => item.id === tab.id)?.content === tab.content
              )
                close(saved);
            });
          },
          close,
        ],
      });
    }
  };

  const getDropTarget = (id: string, distance: number) => {
    const fromIndex = tabs.findIndex((tab) => tab.id === id);
    if (fromIndex === -1 || distance === 0) return;
    const source = tabLayouts[fromIndex];
    const center = source.start + source.width / 2 + distance;
    const direction = Math.sign(distance);
    let targetId: string | undefined;
    for (let index = fromIndex + direction; index >= 0 && index < tabs.length; index += direction) {
      const target = tabLayouts[index];
      if ((center - target.start - target.width / 2) * direction < 0) break;
      targetId = tabs[index].id;
    }
    return targetId;
  };

  const handleReorder = async (id: string, targetId: string) => {
    if (busy.current || !recent.isSuccess) return;
    const from = tabs.findIndex((tab) => tab.id === id);
    const to = tabs.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const ordered = [...tabs];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    const noteIds = (items: MemoTab[]) => items.flatMap((tab) => tab.noteId ?? []);
    const nextNoteIds = noteIds(ordered);
    if (noteIds(tabs).every((noteId, index) => noteId === nextNoteIds[index])) {
      update((current) => reorderMemoTabs(current, ordered));
      return;
    }

    busy.current = true;
    setIsBusy(true);
    setError('');
    try {
      const latest = await refetchTabs({ throwOnError: true });
      if (!mounted.current) return;
      const ids = (latest.data || []).map((tab) => tab.id);
      const rank = new Map(nextNoteIds.map((noteId, index) => [noteId, index]));
      const orderedNotes = ids.filter((tabId) => rank.has(tabId));
      orderedNotes.sort((a, b) => rank.get(a)! - rank.get(b)!);
      let index = 0;
      await reorderRecentTabs(
        ids.map((tabId) => (rank.has(tabId) ? orderedNotes[index++] : tabId))
      );
      if (!mounted.current) return;
      const result = await refetchTabs({ throwOnError: true });
      if (!mounted.current) return;
      const savedNotes = noteTabs(result.data || [])
        .map((tab) => tab.id)
        .filter((tabId) => rank.has(tabId));
      const expected = [...new Set(orderedNotes)];
      if (savedNotes.length !== expected.length || savedNotes.some((id, i) => id !== expected[i])) {
        throw new Error('Could not update the tab list.');
      }
      update((current) => reorderMemoTabs(current, ordered));
    } catch {
      if (mounted.current) setError('Could not update the tab list.');
    } finally {
      busy.current = false;
      if (mounted.current) setIsBusy(false);
    }
  };

  const renderTabNavButton = (direction: -1 | 1) => {
    const disabled =
      draggingId !== undefined || (direction === -1 ? tabOffset <= 0 : tabOffset >= maxTabOffset);
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${lang('Tab List')} ${direction === -1 ? '←' : '→'}`}
        disabled={disabled}
        style={[styles.tabNavButton, disabled && styles.disabledTabNavButton]}
        onPress={() => {
          setTabOffset((offset) =>
            Math.max(0, Math.min(maxTabOffset, offset + direction * minimumTabSpan))
          );
        }}
      >
        <Icon
          name={direction === -1 ? 'chevron-left' : 'chevron-right'}
          size={12}
          color={commonStyles.icon.color}
        />
      </TouchableOpacity>
    );
  };

  const tabLabels = tabs.map((tab) => {
    const selected = tab.id === active?.id;
    const title = tab.title || lang('Untitled');
    const isDraft = tab.noteId === undefined;
    const displayTitle = isDraft ? title : getSplitTitle(title).at(-1) || title;
    const isDirty = memoHasChanges(tab);
    const contents = (
      <>
        {(!isDraft || isDirty) && (
          <View pointerEvents="none" style={!isDraft && styles.tabStatus}>
            {isDirty && <Icon name="circle" size={8} color={commonStyles.icon.color} />}
          </View>
        )}
        {!isDraft && <Icon name="file-text-o" size={14} color={commonStyles.icon.color} />}
        <Text
          numberOfLines={1}
          ellipsizeMode="clip"
          style={[
            commonStyles.text,
            styles.tabText,
            isDraft && styles.draftTabText,
            selected && styles.activeTabText,
          ]}
        >
          {displayTitle}
        </Text>
      </>
    );
    return { tab, title, selected, contents };
  });

  return (
    <>
      <View
        onLayout={({ nativeEvent: { layout } }) => setTabBarWidth(layout.width)}
        style={[
          commonStyles.row,
          styles.tabBar,
          { borderBottomColor: commonStyles.input.borderColor },
        ]}
      >
        {hasTabOverflow && renderTabNavButton(-1)}
        <ScrollView
          ref={tabScroll}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={({ nativeEvent: { contentOffset } }) =>
            setTabOffset(Math.max(0, Math.min(maxTabOffset, contentOffset.x)))
          }
          style={[
            styles.tabViewport,
            hasTabOverflow ? commonStyles.flex : { flexGrow: 0, width: tabContentWidth },
          ]}
          contentContainerStyle={[styles.tabs, { width: tabContentWidth }]}
        >
          {tabLabels.map(({ tab, title, selected, contents }, index) => {
            const shift =
              dragIndex < index && index <= targetIndex
                ? -dragSpan
                : targetIndex >= 0 && targetIndex <= index && index < dragIndex
                  ? dragSpan
                  : 0;
            return (
              <Animated.View
                key={tab.id}
                style={[
                  commonStyles.row,
                  selected ? commonStyles.activeTab : commonStyles.inactiveTab,
                  styles.tab,
                  {
                    width: tabLayouts[index].width,
                    borderTopColor: commonStyles.input.borderColor,
                    borderLeftColor: commonStyles.input.borderColor,
                    borderRightColor: commonStyles.input.borderColor,
                  },
                  draggingId === tab.id && [
                    styles.draggingTab,
                    { transform: [{ translateX: dragX }] },
                  ],
                  shift !== 0 && { transform: [{ translateX: shift }] },
                ]}
              >
                <MemoTabLabel
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={title}
                  disabled={isBusy}
                  canReorder={tabs.length > 1 && !isBusy && recent.isSuccess}
                  style={[commonStyles.row, styles.tabLabel]}
                  onSelect={() => {
                    update((current) =>
                      current.activeId === tab.id ? current : { ...current, activeId: tab.id }
                    );
                  }}
                  onDrag={(distance) => {
                    dragX.setValue(distance);
                    setDraggingId(tab.id);
                    setDropTargetId(getDropTarget(tab.id, distance));
                  }}
                  onDrop={(distance) => {
                    dragX.setValue(0);
                    setDraggingId(undefined);
                    setDropTargetId(undefined);
                    if (distance === undefined) return;
                    const target = getDropTarget(tab.id, distance);
                    if (target) handleReorder(tab.id, target);
                  }}
                >
                  {contents}
                </MemoTabLabel>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${lang('close')}: ${title}`}
                  disabled={isBusy}
                  style={styles.iconButton}
                  onPress={() => handleClose(tab)}
                >
                  <Icon name="times" size={12} color={commonStyles.icon.color} />
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>
        {hasTabOverflow && renderTabNavButton(1)}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${lang('Add')} (${lang('Temporary Memo')})`}
          disabled={isBusy}
          style={styles.addButton}
          onPress={() => {
            if (busy.current) return;
            setError('');
            update(addMemoDraft);
          }}
        >
          <Icon name="plus" size={14} color={commonStyles.icon.color} />
        </TouchableOpacity>
        {availableExtraWidth > 0 && tabs.length > 0 && (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.tabMeasurements, { width: tabAreaWidth }]}
          >
            {tabLabels.map(({ tab, contents }) => (
              <View
                key={tab.id}
                onLayout={({ nativeEvent: { layout } }) => {
                  const width = Math.max(TAB_MIN_WIDTH, Math.ceil(layout.width));
                  setMeasuredTabWidths((current) =>
                    (current.get(tab.id) ?? TAB_MIN_WIDTH) === width
                      ? current
                      : new Map(current).set(tab.id, width)
                  );
                }}
                style={[commonStyles.row, styles.tab, styles.tabMeasurement]}
              >
                <View style={[commonStyles.row, styles.tabLabel, styles.tabMeasurementLabel]}>
                  {contents}
                </View>
                <View style={styles.iconButton} />
              </View>
            ))}
          </View>
        )}
      </View>
      {!!error && (
        <View>
          <Text accessibilityRole="alert" style={[commonStyles.text, styles.message]}>
            {lang(error)}
          </Text>
        </View>
      )}
      {(pages.isError || recent.isError) && (
        <View style={commonStyles.row}>
          <Text style={commonStyles.text}>{lang('Could not load notes.')}</Text>
          <CommonButton
            title={lang('Retry')}
            onPress={() => {
              pages.refetch();
              refetchTabs();
            }}
          />
        </View>
      )}
      {((!recent.isSuccess && !selectedEditorId) || (active && !selectedEditorId)) && (
        <LoadingView />
      )}
      <View
        {...Platform.select({ web: { dataSet: { tempMemoEditor: true } } })}
        style={selectedEditorId ? [commonStyles.flex, styles.editorArea] : styles.hiddenEditor}
      >
        {Platform.OS === 'web' && (
          <style>{`
            [data-temp-memo-editor] .tox-tinymce {
              border-top-width: 0;
              border-top-left-radius: 0;
              border-top-right-radius: 0;
            }
          `}</style>
        )}
        {selectedEditorId && !visibleEditorId && <LoadingView />}
        {editorIds.map((id) => {
          const tab = tabs.find((item) => item.id === id);
          if (!tab) return null;
          const isVisible = id === visibleEditorId;
          return (
            <MemoEditorFrame
              key={id}
              onEditActivity={(composing) => {
                if (isVisible) editActivityListener.current?.(id, composing);
              }}
              onReady={() =>
                setReadyEditorIds((current) => (current.includes(id) ? current : [...current, id]))
              }
              pointerEvents={isVisible ? 'auto' : 'none'}
              accessibilityElementsHidden={!isVisible}
              importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
              style={
                isVisible
                  ? commonStyles.flex
                  : readyEditorIds.includes(id)
                    ? styles.hiddenEditor
                    : [StyleSheet.absoluteFill, styles.preparingEditor]
              }
            >
              <EditPageSection
                title={tab.noteId === undefined ? '' : tab.title}
                content={tab.content || ''}
                setContent={(content) => {
                  editActivityListener.current?.(id);
                  update((current) => {
                    const latest = current.tabs.find((item) => item.id === id);
                    if (!latest || latest.content === content) return current;
                    return {
                      ...current,
                      tabs: current.tabs.map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              content,
                              contentChecksum: undefined,
                              title:
                                item.noteId === undefined ? memoDraftTitle(content) : item.title,
                            }
                          : item
                      ),
                    };
                  });
                }}
                onCancel={() => handleClose(tab)}
              />
            </MemoEditorFrame>
          );
        })}
        {active && visibleEditorId === active.id && (
          <MemoSaveButton
            key={active.id}
            tab={active}
            activityListener={editActivityListener}
            busy={isBusy}
            onSave={handleSave}
          />
        )}
      </View>
    </>
  );
}

export const TempMemoScreen: React.FC = () => {
  useEffectExtensionScreen('tempMemo');
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const storage = useTempMemoTabs();
  return (
    <View style={[commonStyles.container, { padding: 0 }]}>
      {storage.writeError && (
        <Text accessibilityRole="alert" style={[commonStyles.text, styles.message]}>
          {lang('Could not keep the draft on this device. Save the memo before leaving.')}
        </Text>
      )}
      {storage.isError ? (
        <View>
          <Text style={commonStyles.text}>{lang('Could not restore temporary memos.')}</Text>
          <CommonButton title={lang('Retry')} onPress={() => storage.refetch()} />
        </View>
      ) : storage.data ? (
        <MemoWorkspace key={storage.scope} state={storage.data} update={storage.update} />
      ) : (
        <LoadingView />
      )}
    </View>
  );
};

function MemoSaveButton({
  tab,
  activityListener,
  busy,
  onSave,
}: {
  tab: MemoTab;
  activityListener: React.RefObject<MemoEditListener | undefined>;
  busy: boolean;
  onSave: (tab: MemoTab) => Promise<number | false>;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [activity, setActivity] = useState<MemoEditActivity>();
  const [settled, setSettled] = useState<{ content?: string; activity?: MemoEditActivity }>();
  const [saving, setSaving] = useState(false);
  const [savedContent, setSavedContent] = useState<string>();
  const mounted = useRef(true);

  useLayoutEffect(() => {
    // Input activity must not rerender the controlled editor before its value reaches the cache.
    const onActivity: MemoEditListener = (id, composing) => {
      if (id !== tab.id) return;
      setActivity((current) => ({ id, composing: composing ?? current?.composing ?? false }));
    };
    activityListener.current = onActivity;
    return () => {
      if (activityListener.current === onActivity) activityListener.current = undefined;
    };
  }, [activityListener, tab.id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (activity?.composing) return;
    const timer = setTimeout(
      () => setSettled({ content: tab.content, activity }),
      SAVE_IDLE_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [tab.content, activity]);

  useEffect(() => {
    if (savedContent === undefined) return;
    const timer = setTimeout(() => setSavedContent(undefined), SAVE_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [savedContent]);

  const dirty = memoHasChanges(tab);
  const saved = savedContent !== undefined && savedContent === tab.content && !dirty;
  const idle =
    settled &&
    settled.content === tab.content &&
    settled.activity === activity &&
    !activity?.composing;
  const canSave = tab.noteId !== undefined || !!(tab.createdNoteTitle || tab.title.trim());
  if (!idle || !(saving || saved || (!busy && dirty && canSave))) return null;
  const disabled = saving || saved || busy;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={lang(saved ? 'Saved' : 'save')}
      accessibilityState={{ disabled, busy: saving }}
      disabled={disabled}
      style={[
        styles.floatingSave,
        {
          backgroundColor: commonStyles.navButton.backgroundColor,
          borderColor: commonStyles.input.borderColor,
        },
      ]}
      onPress={async () => {
        setSaving(true);
        setSavedContent(undefined);
        try {
          const result = await onSave(tab);
          if (result !== false && mounted.current) setSavedContent(tab.content);
        } finally {
          if (mounted.current) setSaving(false);
        }
      }}
    >
      {saving ? (
        <ActivityIndicator size="small" color={commonStyles.text.color} />
      ) : (
        <Icon name={saved ? 'check' : 'floppy-o'} size={16} color={commonStyles.text.color} />
      )}
      <Text style={[commonStyles.text, styles.floatingSaveText]}>
        {lang(saved ? 'Saved' : 'save')}
      </Text>
    </TouchableOpacity>
  );
}

type EditorWindow = Window & {
  tinymce?: {
    get: (id: string) => { initialized: boolean; getContainer: () => HTMLElement } | null;
  };
  ace?: {
    edit: (element: HTMLElement) => {
      renderer: {
        setScrollMargin: (top: number, bottom: number, left: number, right: number) => void;
      };
    };
  };
};
const EDITOR_READY_CHECK_MS = 50;
const EDITOR_SWITCH_TIMEOUT_MS = 750;

function MemoEditorFrame({
  onReady,
  onEditActivity,
  ...props
}: ViewProps & {
  onReady: () => void;
  onEditActivity: (composing: boolean) => void;
}) {
  const host = useRef<React.ComponentRef<typeof View>>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  const activity = useRef(onEditActivity);
  activity.current = onEditActivity;

  useLayoutEffect(() => {
    if (Platform.OS === 'web' && host.current) {
      const element = host.current as unknown as HTMLElement;
      element.inert = props.pointerEvents === 'none';
      const editor = element.firstElementChild;
      const footer = editor?.nextElementSibling;
      // EditPageSection renders its standalone edit actions beside the editor.
      if (editor?.querySelector('textarea') && footer instanceof HTMLElement) {
        footer.style.display = 'none';
      }
    }
  }, [props.pointerEvents]);

  useEffect(() => {
    const element = host.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !element) {
      ready.current();
      return;
    }
    const browser = element.ownerDocument.defaultView as EditorWindow | null;
    const deadline = Date.now() + EDITOR_SWITCH_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let composing = false;
    let announcedReady = false;
    let contentDocument: Document | undefined;
    let originalPadding: string | undefined;
    const inputEvents = [
      'beforeinput',
      'input',
      'compositionstart',
      'compositionend',
      'paste',
      'cut',
      'drop',
    ];
    const onInput = (event: Event) => {
      if (event.type === 'compositionstart') composing = true;
      if (event.type === 'compositionend') composing = false;
      activity.current(composing);
    };
    for (const name of inputEvents) element.addEventListener(name, onInput, true);

    let paddedCode: HTMLElement | undefined;
    const padCodeEditor = () => {
      const code = element
        .querySelector('.supercode-body')
        ?.shadowRoot?.querySelector<HTMLElement>('.supercode-editor');
      if (!code || code === paddedCode || !browser?.ace) return;
      browser.ace.edit(code).renderer.setScrollMargin(0, SAVE_BUTTON_CLEARANCE, 0, 0);
      paddedCode = code;
    };
    const checkReady = () => {
      clearTimeout(timer);
      const input = element.querySelector('textarea[id]');
      const editor = input && browser?.tinymce?.get(input.id);
      const container = editor?.initialized ? editor.getContainer() : undefined;
      const doc = container?.querySelector('iframe')?.contentDocument;
      if (doc?.body && !contentDocument) {
        contentDocument = doc;
        originalPadding = doc.body.style.paddingBottom;
        doc.body.style.paddingBottom = `${SAVE_BUTTON_CLEARANCE}px`;
        for (const name of inputEvents) doc.addEventListener(name, onInput, true);
      }
      if (
        !announcedReady &&
        ((container && container.style.visibility !== 'hidden') || Date.now() >= deadline)
      ) {
        announcedReady = true;
        ready.current();
      }
      if (!announcedReady) timer = setTimeout(checkReady, EDITOR_READY_CHECK_MS);
    };
    const observer = new MutationObserver(() => {
      padCodeEditor();
      if (!contentDocument) checkReady();
    });
    observer.observe(element, { childList: true, subtree: true });
    padCodeEditor();
    checkReady();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      for (const name of inputEvents) {
        element.removeEventListener(name, onInput, true);
        contentDocument?.removeEventListener(name, onInput, true);
      }
      if (contentDocument?.body) contentDocument.body.style.paddingBottom = originalPadding || '';
    };
  }, []);

  return <View {...props} ref={host} />;
}

const webDragStyle: ViewStyle & { touchAction: string } = { touchAction: 'pan-y' };

function MemoTabLabel({
  canReorder,
  disabled,
  onSelect,
  onDrag,
  onDrop,
  ...props
}: Omit<TouchableOpacityProps, 'onPress'> & {
  canReorder: boolean;
  onSelect: () => void;
  onDrag: (distance: number) => void;
  onDrop: (distance?: number) => void;
}) {
  const callbacks = useRef({ canReorder, disabled, onSelect, onDrag, onDrop });
  callbacks.current = { canReorder, disabled, onSelect, onDrag, onDrop };
  const dragging = useRef(false);
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !callbacks.current.disabled,
      onPanResponderGrant: () => {
        dragging.current = false;
        callbacks.current.onSelect();
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (
          !dragging.current &&
          (!callbacks.current.canReorder || Math.abs(dx) < 5 || Math.abs(dx) <= Math.abs(dy))
        ) {
          return;
        }
        dragging.current = true;
        callbacks.current.onDrag(dx);
      },
      onPanResponderRelease: (_, { dx }) => {
        if (dragging.current) callbacks.current.onDrop(dx);
      },
      onPanResponderTerminationRequest: () => !dragging.current,
      onPanResponderTerminate: () => {
        if (dragging.current) callbacks.current.onDrop();
      },
    })
  );

  return (
    <View style={styles.tabLabelFrame} {...responder.panHandlers}>
      <TouchableOpacity
        {...props}
        disabled={disabled}
        style={[props.style, canReorder && Platform.OS === 'web' && webDragStyle]}
        onPress={(event) => {
          const detail = (event.nativeEvent as unknown as UIEvent | undefined)?.detail;
          if (Platform.OS === 'web' && detail) return;
          onSelect();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { borderBottomWidth: 1, marginHorizontal: 1, alignItems: 'stretch' },
  tabViewport: { minWidth: 0 },
  tabs: { alignItems: 'stretch' },
  tabMeasurements: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 0,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  tabMeasurement: { maxWidth: '100%' },
  tabMeasurementLabel: { flexShrink: 1, minWidth: 0 },
  tab: {
    flexShrink: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    marginRight: TAB_GAP,
  },
  draggingTab: { zIndex: 1, opacity: 0.9 },
  tabLabelFrame: { flex: 1, minWidth: 0 },
  tabLabel: { height: 38, paddingLeft: 6 },
  tabStatus: { width: 12 },
  tabText: {
    marginLeft: 7,
    marginRight: 7,
    minWidth: 0,
    flexShrink: 1,
    fontSize: 14,
    overflow: 'hidden',
    ...Platform.select({ web: { textOverflow: 'clip' } }),
  },
  draftTabText: { marginLeft: 3 },
  activeTabText: { fontWeight: '600' },
  iconButton: { width: 32, alignItems: 'center', justifyContent: 'center' },
  addButton: {
    width: ADD_TAB_WIDTH,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabNavButton: { width: TAB_NAV_WIDTH, alignItems: 'center', justifyContent: 'center' },
  disabledTabNavButton: { opacity: 0.35 },
  editorArea: { position: 'relative' },
  floatingSave: {
    position: 'absolute',
    right: SAVE_BUTTON_INSET,
    bottom: SAVE_BUTTON_INSET,
    zIndex: 2,
    minHeight: SAVE_BUTTON_HEIGHT,
    minWidth: 96,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: SAVE_BUTTON_HEIGHT / 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingSaveText: { marginLeft: 8, fontSize: 14, lineHeight: 20 },
  message: { marginBottom: 12 },
  hiddenEditor: { display: 'none' },
  preparingEditor: { opacity: 0 },
});
