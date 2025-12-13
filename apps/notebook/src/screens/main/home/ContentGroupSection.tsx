import { useColorScheme, useLangContext, useResizeContext, View } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleProp, ViewStyle } from 'react-native';
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
  useReorderRecentTabs,
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
// --- Sortable Item Component (Updated) ---
const DraggableTabItem = ({
  index,
  totalCount,
  onReorder,
  children,
  style,
}: {
  index: number;
  totalCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const pan = useRef(new Animated.ValueXY()).current;
  const theme = useColorScheme();
  const [isDragging, setIsDragging] = useState(false);
  const itemHeight = useRef(0);

  // 1. 최신 props를 참조하기 위한 Ref 생성 (Stale Closure 문제 해결)
  const propsRef = useRef({ index, totalCount, onReorder });

  // 렌더링될 때마다 최신 값으로 업데이트
  propsRef.current = { index, totalCount, onReorder };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 수직 이동이 유의미할 때만 드래그 시작
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
        // 드래그 시작 시 오프셋 설정 (연속 드래그 보정)
        pan.setOffset({
          x: 0,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      // 2. 이동 범위 제한 (Clamping)
      onPanResponderMove: (_, gestureState) => {
        const { index: currentIndex, totalCount: currentCount } = propsRef.current;
        const h = itemHeight.current || 50; // 높이값이 없으면 기본값 사용

        // 위로 갈 수 있는 최대 거리 (음수) = 현재 인덱스 * 높이
        const minDy = -currentIndex * h;
        // 아래로 갈 수 있는 최대 거리 (양수) = (전체 개수 - 1 - 현재 인덱스) * 높이
        const maxDy = (currentCount - 1 - currentIndex) * h;

        // 이동 범위를 제한
        const clampedDy = Math.max(minDy, Math.min(maxDy, gestureState.dy));

        pan.y.setValue(clampedDy);
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        pan.flattenOffset();

        // Ref를 통해 최신 index와 함수 가져오기
        const {
          index: currentIndex,
          totalCount: currentCount,
          onReorder: currentOnReorder,
        } = propsRef.current;
        const h = itemHeight.current || 50;

        // 제한된 범위 내에서의 최종 dy 다시 계산 (안전장치)
        const minDy = -currentIndex * h;
        const maxDy = (currentCount - 1 - currentIndex) * h;
        const clampedDy = Math.max(minDy, Math.min(maxDy, gestureState.dy));

        // 이동 거리 기반 인덱스 변화량 계산
        const movedCount = Math.round(clampedDy / h);
        const newIndex = Math.max(0, Math.min(currentCount - 1, currentIndex + movedCount));

        if (newIndex !== currentIndex) {
          currentOnReorder(currentIndex, newIndex);
        }

        // 제자리로 애니메이션 복귀 (데이터가 변경되면서 리렌더링되어 위치가 잡힘)
        if (newIndex !== currentIndex) {
          pan.setValue({ x: 0, y: 0 });
          currentOnReorder(currentIndex, newIndex);
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 5,
            tension: 40,
          }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      onLayout={(e) => {
        itemHeight.current = e.nativeEvent.layout.height;
      }}
      style={[
        style,
        {
          transform: [{ translateY: pan.y }],
          zIndex: isDragging ? 999 : 1,
          opacity: isDragging ? 0.8 : 1,
          // 드래그 중일 때 위/아래 경계선 표시 등으로 시각적 피드백 강화
          backgroundColor: isDragging ? (theme === 'dark' ? '#333' : '#eee') : 'transparent',
          shadowOpacity: isDragging ? 0.2 : 0,
          elevation: isDragging ? 5 : 0,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
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
  const reorderRecent = useReorderRecentTabs();

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

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (!tabs.data) return;
    const currentList = [...tabs.data];
    const [movedItem] = currentList.splice(fromIndex, 1);
    currentList.splice(toIndex, 0, movedItem);
    // ID 배열로 변환하여 저장
    reorderRecent.mutate(currentList.map((item) => item.id));
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
        // ... (parentContent 렌더링 유지)
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
      {(props.type === 'RECENT' ? listData.slice(0, props.noteCount) : listData).map((v, index) => {
        // 공통 아이템 렌더링
        const itemContent = (
          <List.Item
            // PAGE 타입일 경우 DraggableWrapper에서 key를 처리하므로 여기서는 index를 key로 쓰거나 생략 가능하지만,
            // DraggableWrapper 내부가 아니면 key 필수.
            // Draggable 내부에서는 key를 Draggable에 부여.
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
        );

        if (props.type === 'PAGE') {
          return (
            <DraggableTabItem
              key={v.id || v.title}
              index={index}
              totalCount={listData.length}
              onReorder={handleReorder}
            >
              {itemContent}
            </DraggableTabItem>
          );
        }

        return <React.Fragment key={v.title}>{itemContent}</React.Fragment>;
      })}
      {/* ... (더보기 버튼 유지) */}
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
