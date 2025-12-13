import { useColorScheme, useLangContext, useResizeContext, View } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useMemo, useRef } from 'react';
import { List, TouchableRipple, Badge } from 'react-native-paper';
import Icon2 from 'react-native-vector-icons/FontAwesome';

import { parseHtmlToParagraphs } from '../../../components/HeaderSelectBar';
import { useBoardPages, useLastBoard } from '../../../hooks/useBoardStorage';
import {
  useRecentPages,
  useNotePages,
  useDeleteRecentPage,
  useLastPage,
  useAddRecentPage,
  useCurrentPage,
  useSnapshotPages,
} from '../../../hooks/useNoteStorage';
import useProblem, { getSplitTitle } from '../../../hooks/useProblem';
import useTimeLine from '../../../hooks/useTimeLine';
import { createCommonStyles } from '../../../styles';
import { Content } from '../../../types';
import { updatedFormat } from '../RecentPageSection';

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
  const pages = useRecentPages();
  const { data: boards = [] } = useBoardPages();
  const { data: lastPage } = useLastPage();
  const { data: lastBoard } = useLastBoard();
  const currentPage = useCurrentPage(lastPage);
  const { data: snapshots } = useSnapshotPages(currentPage?.id);

  // Actions
  const addRecent = useAddRecentPage();
  const deleteRecent = useDeleteRecentPage();

  // Derived Data
  const currentSplitTitle = currentPage ? getSplitTitle(currentPage.title) : undefined;

  const listData = useMemo(() => {
    if (props.type === 'RECENT') return notes.data ? toRecentContents(notes.data) : [];
    if (props.type === 'SUBNOTE' && currentPage && notes.data) {
      return toRecentContents(
        notes.data.filter((v) => v.title.startsWith(currentPage.title + '/'))
      );
    }
    if (props.type === 'PAGE' || props.type === 'LAST') return pages.data || [];
    return [];
  }, [props.type, notes.data, pages.data, currentPage]);

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
  const onNotePress = (title: string) => {
    if (title === lastPage?.title) {
      if (tabRef.current) {
        clearTimeout(tabRef.current);
        tabRef.current = undefined;
        addRecent.mutate({ title });
      } else tabRef.current = setTimeout(() => (tabRef.current = undefined), 500);
    }
    navigate('NotePage', { title });
  };

  const onNoteLongPress = (title: string) => {
    if (tabRef.current) clearTimeout(tabRef.current);
    if (!pages.data?.some((v) => v.title === title)) addRecent.mutate({ title, direct: true });
    else deleteRecent.mutate(title);
  };

  const isLinked = (title: string) => pages.data?.some((v) => v.title === title);

  // --- Render Sections ---

  if (props.type === 'KANBAN') {
    return (
      <List.Section>
        {boards.slice(0, 10).map((b) => (
          <List.Item
            key={b.id}
            title={b.title}
            left={RenderIcon('view-dashboard')}
            onPress={() => navigate('KanbanPage', { title: b.title })}
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
    const lastPageExists = lastPage && !listData?.some((v) => v.id === lastPage.id);
    if (!lastPageExists && !lastBoard) return null;
    return (
      <List.Section>
        {lastBoard && (
          <List.Item
            title={lastBoard.title}
            titleStyle={{ fontStyle: 'italic' }}
            style={{ padding: itemPadding }}
            left={RenderIcon('view-dashboard')}
            onPress={() => navigate('KanbanPage', { title: lastBoard.title })}
          />
        )}
        {lastPageExists && lastPage && (
          <List.Item
            title={lastPage.title}
            titleStyle={{ fontStyle: 'italic' }}
            style={{ padding: itemPadding }}
            left={RenderIcon('file-document')}
            onPress={() => onNotePress(lastPage.title)}
            onLongPress={() => onNoteLongPress(lastPage.title)}
          />
        )}
      </List.Section>
    );
  }

  // Generic List Render (RECENT, SUBNOTE, PAGE)
  if (!listData) return null;
  const parentTitle =
    props.type === 'SUBNOTE' && currentSplitTitle?.length === 2 ? currentSplitTitle[0] : null;

  return (
    <List.Section>
      {parentTitle && (
        <>
          <List.Item
            title={parentTitle}
            titleStyle={{ color: '#888B' }}
            style={{ padding: itemPadding }}
            left={RenderIcon(!isLinked(parentTitle) ? 'notebook' : 'notebook-edit', '#888B')}
            onPress={() => onNotePress(parentTitle)}
            onLongPress={() => onNoteLongPress(parentTitle)}
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
              ? 'file-document-edit'
              : !isLinked(v.title)
              ? 'notebook'
              : 'notebook-edit'
          )}
          right={
            props.type === 'PAGE'
              ? () => (
                  <TouchableRipple
                    onPress={() => deleteRecent.mutate(v.title)}
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
          onPress={() =>
            props.type === 'PAGE' ? navigate('NotePage', { title: v.title }) : onNotePress(v.title)
          }
          onLongPress={props.type !== 'PAGE' ? () => onNoteLongPress(v.title) : undefined}
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
