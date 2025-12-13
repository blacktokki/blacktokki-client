import { useColorScheme, useLangContext, useResizeContext, View } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useMemo, useRef } from 'react';
import { List, TouchableRipple, Badge } from 'react-native-paper';
import Icon2 from 'react-native-vector-icons/FontAwesome';

import { parseHtmlToParagraphs } from '../../../components/HeaderSelectBar';
import { useBoardPages } from '../../../hooks/useBoardStorage';
import { useNotePages, useSnapshotPages } from '../../../hooks/useNoteStorage';
import useProblem, { getSplitTitle } from '../../../hooks/useProblem';
import {
  useAddRecentTab,
  useCurrentPage,
  useDeleteRecentTab,
  useLastTab,
  useRecentTabs,
} from '../../../hooks/useTabStorage';
import useTimeLine from '../../../hooks/useTimeLine';
import { createCommonStyles } from '../../../styles';
import { Content } from '../../../types';

// --- Helpers ---
const RenderIcon = (icon: string, color?: string) => (p: any) =>
  <List.Icon {...p} icon={icon} color={color || p.color} style={[p.style, { margin: 0 }]} />;

const CountBadge = ({ count }: { count: number }) => (
  <View style={{ alignSelf: 'center', backgroundColor: 'transparent' }}>
    {count > 0 && <Badge>{count}</Badge>}
  </View>
);

export const toRecentContents = (data: Content[]) =>
  data
    .filter((v) => v.description)
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

const updatedOffset = new Date().getTimezoneOffset();

export const updatedFormat = (_updated: string) => {
  const _date = new Date(_updated);
  _date.setMinutes(_date.getMinutes() - updatedOffset);
  const updated = _date.toISOString().slice(0, 16);
  const date = updated.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return date === today ? updated.slice(11) : date;
};

// --- Exported Buttons ---
export const TimeLineButton = () => {
  const { lang } = useLangContext();
  const { data } = useTimeLine();
  return (
    <List.Item
      title={lang('Timeline')}
      onPress={() => navigate('TimeLine')}
      left={RenderIcon('calendar')}
      right={() => <CountBadge count={data.length} />}
    />
  );
};

export const ProblemButton = () => {
  const { lang } = useLangContext();
  const { data } = useProblem();
  return (
    <List.Item
      title={lang('Edit Suggestions')}
      onPress={() => push('Problem')}
      left={RenderIcon('note-alert')}
      right={() => <CountBadge count={data.length} />}
    />
  );
};

// --- Main Component Types ---
type GroupType = 'SUBNOTE' | 'KANBAN' | 'TOC' | 'HISTORY';
export type ContentGroupType = GroupType | 'RECENT';
type Props = { type: GroupType | 'PAGE' | 'LAST' } | { type: 'RECENT'; noteCount: number };

const ContentGroupSection = (props: Props) => {
  const { lang } = useLangContext();
  const styles = createCommonStyles(useColorScheme());
  const itemPadding = useResizeContext() === 'landscape' ? 5 : 8;
  const tabRef = useRef<NodeJS.Timeout>();

  // Data Hooks
  const notes = useNotePages();
  const tabs = useRecentTabs();
  const { data: boards = [] } = useBoardPages();
  const { data: lastTab } = useLastTab();
  const currentPage = useCurrentPage(lastTab);
  const { data: snapshots } = useSnapshotPages(currentPage?.id);

  // Actions
  const addRecent = useAddRecentTab();
  const deleteRecent = useDeleteRecentTab();

  // Derived Data
  const currentSplitTitle = currentPage ? getSplitTitle(currentPage.title) : undefined;

  const listData = useMemo(() => {
    if (props.type === 'RECENT') return notes.data ? toRecentContents(notes.data) : [];
    if (props.type === 'SUBNOTE' && currentPage && notes.data) {
      return toRecentContents(
        notes.data.filter((v) => v.title.startsWith(currentPage.title + '/'))
      );
    }
    if (props.type === 'LAST') {
      return lastTab && tabs.data?.find((v) => v.id === lastTab.id) === undefined ? [lastTab] : [];
    }
    if (props.type === 'PAGE') return tabs.data || [];
    return [];
  }, [props.type, notes.data, tabs.data, currentPage, boards, lastTab]);
  const tocList = useMemo(
    () =>
      props.type === 'TOC' && currentPage?.description
        ? parseHtmlToParagraphs(currentPage.description).filter((p) => p.level > 0)
        : [],
    [props.type, currentPage]
  );

  const historyList = useMemo(
    () => (props.type === 'HISTORY' ? snapshots?.pages.flat() || [] : []),
    [props.type, snapshots]
  );

  // Interaction Handlers
  const toggleRecent = (id: number) => {
    if (!tabs.data?.some((v) => v.id === id)) addRecent.mutate({ id, direct: true });
    else deleteRecent.mutate(id);
  };

  const onNotePress = (content: Content) => {
    if (content.id === lastTab?.id) {
      if (tabRef.current) {
        clearTimeout(tabRef.current);
        tabRef.current = undefined;
        toggleRecent(content.id);
      } else tabRef.current = setTimeout(() => (tabRef.current = undefined), 500);
    }
    navigate(content.type === 'BOARD' ? 'KanbanPage' : 'NotePage', { title: content.title });
  };

  const onNoteLongPress = (content: Content) => {
    if (tabRef.current) clearTimeout(tabRef.current);
    toggleRecent(content.id);
  };

  const isLinked = (title: string) => tabs.data?.some((v) => v.title === title);

  // --- Render Sections ---

  if (props.type === 'KANBAN') {
    return (
      <List.Section>
        {boards.slice(0, 10).map((b) => (
          <List.Item
            key={b.id}
            title={b.title}
            left={RenderIcon('view-dashboard')}
            onPress={() => onNotePress(b)}
            onLongPress={() => onNoteLongPress(b)}
          />
        ))}
        <List.Item
          title={lang('more...')}
          left={RenderIcon('view-dashboard-variant')}
          onPress={() => push('KanbanList')}
        />
      </List.Section>
    );
  }

  if (props.type === 'TOC') {
    if (!currentPage) return null;
    return (
      <List.Section>
        <List.Item
          title={currentPage.title}
          style={{ padding: 5, paddingLeft: 8 }}
          titleStyle={{ fontWeight: 'bold', fontSize: 14 }}
          left={() => (
            <Icon2
              name="file-text-o"
              size={18}
              color={styles.text.color}
              style={{ paddingTop: 8, paddingLeft: 5 }}
            />
          )}
          onPress={() => navigate('NotePage', { title: currentPage.title })}
        />
        {tocList.map((p, i) => (
          <List.Item
            key={i}
            title={p.title}
            titleStyle={{ fontSize: 14 }}
            style={{ padding: 5, paddingLeft: 3 + p.level * 5 }}
            onPress={() =>
              navigate('NotePage', {
                title: currentPage.title,
                paragraph: p.title,
                section: p.autoSection,
              })
            }
          />
        ))}
      </List.Section>
    );
  }

  if (props.type === 'HISTORY') {
    if (!currentPage) return null;
    return (
      <List.Section>
        {historyList.slice(0, 20).map((h, i) => (
          <List.Item
            key={h.id || i}
            title={h.title}
            description={updatedFormat(h.updated)}
            left={RenderIcon('history')}
            style={{ padding: 5 }}
            onPress={() => navigate('NotePage', { title: currentPage.title, archiveId: h.id })}
          />
        ))}
        <List.Item
          title={lang('more...')}
          left={RenderIcon('history')}
          style={{ paddingLeft: 5 }}
          onPress={() => navigate('Archive', { title: currentPage.title })}
        />
      </List.Section>
    );
  }

  if (props.type === 'LAST') {
    if (!lastTab) return null;
    return (
      <List.Section>
        {listData.length > 0 && lastTab && (
          <List.Item
            title={lastTab.title}
            titleStyle={{ fontStyle: 'italic' }}
            style={{ padding: itemPadding }}
            left={RenderIcon(lastTab.type === 'BOARD' ? 'view-dashboard' : 'file-document')}
            onPress={() => onNotePress(lastTab)}
            onLongPress={() => onNoteLongPress(lastTab)}
          />
        )}
      </List.Section>
    );
  }

  // Generic List Render (RECENT, SUBNOTE, PAGE)
  if (!listData) return null;
  const parentContent =
    props.type === 'SUBNOTE' && currentSplitTitle?.length === 2
      ? notes.data?.find((v) => v.title === currentSplitTitle[0])
      : null;

  return (
    <List.Section>
      {parentContent && (
        <>
          <List.Item
            title={parentContent.title}
            titleStyle={{ color: '#888B' }}
            style={{ padding: itemPadding }}
            left={RenderIcon(
              !isLinked(parentContent.title) ? 'notebook' : 'notebook-edit',
              '#888B'
            )}
            onPress={() => onNotePress(parentContent)}
            onLongPress={() => onNoteLongPress(parentContent)}
          />
          <View
            style={{
              height: 1,
              backgroundColor: 'gray',
              marginHorizontal: 16,
              marginVertical: 4,
              opacity: 0.3,
            }}
          />
        </>
      )}
      {(props.type === 'RECENT' ? listData.slice(0, props.noteCount) : listData).map((v) => (
        <List.Item
          key={v.title}
          title={v.title}
          style={{ padding: itemPadding }}
          left={RenderIcon(
            props.type === 'PAGE'
              ? v.type === 'BOARD'
                ? 'view-dashboard'
                : 'file-document-edit'
              : !isLinked(v.title)
              ? 'notebook'
              : 'notebook-edit'
          )}
          right={
            props.type === 'PAGE'
              ? () => (
                  <TouchableRipple
                    onPress={() => deleteRecent.mutate(v.id)}
                    style={{
                      justifyContent: 'center',
                      borderRadius: itemPadding,
                      width: 40 + itemPadding * 2,
                      height: 40 + itemPadding * 2,
                      margin: -itemPadding,
                    }}
                  >
                    <List.Icon style={{ left: itemPadding - 7 }} icon={'close'} />
                  </TouchableRipple>
                )
              : undefined
          }
          onPress={() => onNotePress(v)}
          onLongPress={() => onNoteLongPress(v)}
        />
      ))}
      {(props.type === 'RECENT' || props.type === 'SUBNOTE') && (
        <List.Item
          title={lang('more...')}
          left={RenderIcon('notebook-multiple')}
          style={{ padding: itemPadding }}
          onPress={() =>
            push(
              'RecentPages',
              props.type === 'SUBNOTE' ? { title: currentPage?.title } : undefined
            )
          }
        />
      )}
    </List.Section>
  );
};

export const TabsSection = () => {
  const { lang } = useLangContext();
  return (
    <>
      <List.Subheader style={{}} selectable={false}>
        {lang('Current Tab')}
      </List.Subheader>
      <ContentGroupSection type={'LAST'} />
      <List.Subheader style={{}} selectable={false}>
        {lang('Tab List')}
      </List.Subheader>
      <ContentGroupSection type={'PAGE'} />
    </>
  );
};

export default ContentGroupSection;
