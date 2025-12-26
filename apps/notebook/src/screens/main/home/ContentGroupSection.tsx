import { useColorScheme, useLangContext, useResizeContext, View } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleProp, ViewStyle } from 'react-native';
import { List, TouchableRipple, Badge } from 'react-native-paper';
import Icon2 from 'react-native-vector-icons/FontAwesome';

import { parseHtmlToParagraphs } from '../../../components/HeaderSelectBar';
import { useBoardPages } from '../../../hooks/useBoardStorage';
import { useNotePages, useSnapshotPages } from '../../../hooks/useNoteStorage';
import { usePrivacy } from '../../../hooks/usePrivacy';
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
export const RenderIcon = (icon: string, color?: string) => (p: any) =>
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
      onPress={() => navigate('Problem')}
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
  const theme = useColorScheme();
  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);
  const itemHeight = useRef(0);

  // 드래그 시작 시점의 인덱스와 현재 드래그 중인 가상 인덱스를 추적
  const dragContext = useRef({
    startIndex: index, // 드래그 시작 시점의 원래 인덱스
    currentIndex: index, // 현재 도달한 인덱스
  });

  // Props 최신화
  const propsRef = useRef({ index, totalCount, onReorder });
  propsRef.current = { index, totalCount, onReorder };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5; // 민감도
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
        // 드래그 시작 시점의 인덱스 저장
        dragContext.current = {
          startIndex: propsRef.current.index,
          currentIndex: propsRef.current.index,
        };
        pan.setOffset({ x: 0, y: 0 });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        const { totalCount, onReorder } = propsRef.current;
        const h = itemHeight.current || 50;
        const { startIndex, currentIndex } = dragContext.current;

        // 1. 현재 손가락 위치에 따른 '예상 인덱스' 계산
        // gestureState.dy: 터치 시작점 대비 이동 거리
        // (currentIndex - startIndex) * h: 데이터 변경으로 인해 뷰가 이동한 거리(보정값)
        // 이 보정값을 더해줘야 '원래 시작점' 기준으로 얼마나 이동했는지 계산 가능
        const rawDy = gestureState.dy;
        const relativeRowOffset = Math.round(rawDy / h);

        let targetIndex = startIndex + relativeRowOffset;
        targetIndex = Math.max(0, Math.min(totalCount - 1, targetIndex));

        // 2. 인덱스 변경 감지 (실시간 Reorder)
        if (targetIndex !== currentIndex) {
          onReorder(currentIndex, targetIndex);
          dragContext.current.currentIndex = targetIndex;
        }

        // 3. 이동 범위 제한 (Clamping) 및 좌표 보정
        // 리스트가 리렌더링되어 아이템의 Layout Y좌표가 바뀌었으므로,
        // 시각적 Offset(pan.y)에서 그만큼을 빼줘야 아이템이 손가락 밑에 유지됨.
        const layoutShift = (dragContext.current.currentIndex - startIndex) * h;
        const correctedDy = rawDy - layoutShift;

        // 화면 밖으로 나가지 않도록 Clamp (보정된 좌표 기준)
        // 현재 인덱스 기준 위/아래 한계 계산
        const minDy = -dragContext.current.currentIndex * h;
        const maxDy = (totalCount - 1 - dragContext.current.currentIndex) * h;

        // 이동 범위를 제한
        const clampedDy = Math.max(minDy, Math.min(maxDy, correctedDy));

        pan.y.setValue(clampedDy);
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        pan.flattenOffset();

        // 드래그 종료 시, 현재 보정된 위치(correctedDy)에 아이템이 있습니다.
        // 데이터는 이미 변경되었고(layoutShift 반영됨), 이제 offset을 0으로 만들면
        // 아이템이 '자기 자리'로 돌아갑니다.
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          friction: 5,
          tension: 40,
        }).start();
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
          opacity: isDragging ? 0.9 : 1,
          backgroundColor: isDragging ? (theme === 'dark' ? '#333' : '#fff') : 'transparent',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDragging ? 0.2 : 0,
          shadowRadius: 4,
          elevation: isDragging ? 5 : 0,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* [수정됨] 드래그 중일 때는 자식 요소(List.Item)의 포인터 이벤트를 비활성화('none')하여
        클릭(onPress)이나 리플 효과가 발생하지 않도록 차단합니다.
        평소에는 'auto'로 설정하여 정상적인 클릭이 가능하게 합니다.
      */}
      <View pointerEvents={isDragging ? 'none' : 'auto'}>{children}</View>
    </Animated.View>
  );
};

// --- Main Component Types ---
export type ContentGroupType = 'KANBAN' | 'RECENT' | 'CURRENT_NOTE';
export type ContentGroupSubType = 'TOC' | 'SUBNOTE' | 'HISTORY';
type Props =
  | { type: 'KANBAN' | ContentGroupSubType | 'PAGE' | 'LAST' }
  | { type: 'RECENT'; noteCount: number };

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
    // LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const currentList = [...tabs.data];
    const [movedItem] = currentList.splice(fromIndex, 1);
    currentList.splice(toIndex, 0, movedItem);
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
            style={{ padding: itemPadding }}
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

export const CurrentTabSection = () => {
  const { lang } = useLangContext();
  return (
    <View>
      <List.Subheader style={{}} selectable={false}>
        {lang('Current Tab')}
      </List.Subheader>
      <ContentGroupSection type={'LAST'} />
    </View>
  );
};

export const TabsSection = () => {
  const { lang } = useLangContext();
  const { isPrivacyMode } = usePrivacy();
  return (
    <>
      <List.Subheader style={{}} selectable={false}>
        {isPrivacyMode ? lang('Tab List - Privacy Mode') : lang('Tab List')}
      </List.Subheader>
      <ContentGroupSection type={'PAGE'} />
    </>
  );
};

export default ContentGroupSection;
