import { useLangContext, View, useColorScheme, Colors } from '@blacktokki/core';
import { navigate, push } from '@blacktokki/navigation';
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { List, TouchableRipple } from 'react-native-paper';
import Icon2 from 'react-native-vector-icons/FontAwesome';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { parseHtmlToParagraphs } from '../components/HeaderSelectBar';
import { useBoardPages } from '../hooks/useBoardStorage';
import { useCurrentPage, useLastPage, useSnapshotPages } from '../hooks/useNoteStorage';
import { updatedFormat } from '../screens/main/RecentPageSection';
import ContentGroupSection, {
  ProblemButton,
  TimeLineButton,
} from '../screens/main/home/ContentGroupSection';
import { createCommonStyles } from '../styles';

type ViewType = 'RECENT' | 'KANBAN' | 'SUB_NOTE' | 'TOC' | 'HISTORY';

export default () => {
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { data: boards = [] } = useBoardPages();
  const { data: lastPage } = useLastPage();
  const currentPage = useCurrentPage(lastPage);

  const { data: snapshots } = useSnapshotPages(currentPage?.id);

  const [viewType, setViewType] = useState<ViewType>('RECENT');
  const [expanded, setExpanded] = useState(false);

  // 노트 관련 뷰인지 확인하는 헬퍼
  const isNoteMode = ['SUB_NOTE', 'TOC', 'HISTORY'].includes(viewType);

  // 2. 문단 TOC 데이터 계산
  const paragraphs = useMemo(() => {
    if (!currentPage?.description) return [];
    return parseHtmlToParagraphs(currentPage.description).filter((p) => p.level > 0);
  }, [currentPage]);

  // 3. 편집 이력 데이터 계산
  const historyList = useMemo(() => {
    return snapshots?.pages.flat() || [];
  }, [snapshots]);

  // 드롭다운 헤더에 표시할 라벨 결정
  const getCurrentViewLabel = () => {
    if (isNoteMode && currentPage) {
      return currentPage.title; // 노트 모드일 때는 노트 제목 표시
    }
    switch (viewType) {
      case 'RECENT':
        return lang('Recent Changes');
      case 'KANBAN':
        return lang('Kanban');
      default:
        return lang('Select View');
    }
  };

  const renderContent = () => {
    switch (viewType) {
      case 'RECENT':
        return <ContentGroupSection type={'NOTE'} noteCount={10} />;

      case 'KANBAN':
        return (
          <List.Section>
            {boards.slice(0, 10).map((board) => (
              <List.Item
                key={board.id}
                title={board.title}
                left={(props) => <List.Icon {...props} icon="view-dashboard" />}
                onPress={() => navigate('KanbanPage', { title: board.title })}
              />
            ))}
            <List.Item
              left={(_props) => <List.Icon {..._props} icon={'view-dashboard-variant'} />}
              title={lang('more...')}
              onPress={() => push('KanbanList')}
            />
          </List.Section>
        );

      case 'SUB_NOTE':
        return <ContentGroupSection type={'SUBNOTE'} />;
      case 'TOC':
        return (
          <List.Section>
            <List.Item
              title={currentPage!.title}
              left={(_props) => (
                <Icon2
                  name="file-text-o"
                  size={18}
                  color={commonStyles.text.color}
                  style={{ paddingTop: 8, paddingLeft: 5 }}
                />
              )}
              titleStyle={{ fontWeight: 'bold', fontSize: 14 }}
              style={{ padding: 5, paddingLeft: 8 }}
              onPress={() => navigate('NotePage', { title: currentPage!.title })}
            />
            {paragraphs.map((p, i) => (
              <List.Item
                key={i}
                title={p.title}
                titleStyle={{ fontSize: 14 }}
                style={{ padding: 5, paddingLeft: 3 + p.level * 5 }}
                onPress={() =>
                  navigate('NotePage', {
                    title: currentPage!.title,
                    paragraph: p.title,
                    section: p.autoSection,
                  })
                }
              />
            ))}
          </List.Section>
        );

      case 'HISTORY':
        return (
          <List.Section>
            {historyList.slice(0, 20).map((hist, i) => (
              <List.Item
                key={hist.id || i}
                title={hist.title}
                description={updatedFormat(hist.updated)}
                left={(props) => <List.Icon {...props} icon="history" style={{ margin: 0 }} />}
                style={{ padding: 5 }}
                onPress={() =>
                  navigate('NotePage', {
                    title: currentPage!.title,
                    archiveId: hist.id,
                  })
                }
              />
            ))}
            <List.Item
              title={lang('more...')}
              left={(props) => <List.Icon {...props} icon="history" />}
              style={{ paddingLeft: 5 }}
              onPress={() => navigate('Archive', { title: currentPage!.title })}
            />
          </List.Section>
        );

      default:
        return null;
    }
  };

  const renderOption = (type: ViewType, icon: string, label: string) => (
    <TouchableRipple
      onPress={() => {
        setViewType(type);
        setExpanded(false);
      }}
    >
      <List.Subheader style={{ paddingLeft: 32 }} selectable={false}>
        <Icon name={icon} size={14} style={{ marginRight: 8 }} /> {label}
      </List.Subheader>
    </TouchableRipple>
  );

  // 배지(탭) 버튼 렌더링
  const renderBadge = (type: ViewType, label: string, icon: string) => {
    const isActive = viewType === type;
    const activeColor = Colors[theme].text;
    const inactiveColor = theme === 'dark' ? '#888888' : '#666666';
    const backgroundColor = isActive ? (theme === 'dark' ? '#333333' : '#e0e0e0') : 'transparent';

    return (
      <TouchableOpacity
        style={[styles.badge, { backgroundColor, borderColor: inactiveColor }]}
        onPress={() => setViewType(type)}
      >
        <Icon
          name={icon}
          size={14}
          color={isActive ? activeColor : inactiveColor}
          style={{ marginRight: 6 }}
        />
        <Text
          style={{
            fontSize: 12,
            color: isActive ? activeColor : inactiveColor,
            fontWeight: isActive ? 'bold' : 'normal',
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <List.Item
        left={(_props) => <List.Icon {..._props} icon={'home'} />}
        title={lang('Home')}
        onPress={() => push('Home')}
      />
      <TimeLineButton />
      <ProblemButton />
      <ScrollView style={Platform.OS === 'web' ? ({ scrollbarWidth: 'thin' } as any) : {}}>
        <List.Subheader style={{}} selectable={false}>
          {lang('Open Notes')}
        </List.Subheader>
        <ContentGroupSection type={'LAST'} />
        <ContentGroupSection type={'PAGE'} />

        {/* Selector Header */}
        <TouchableRipple onPress={() => setExpanded(!expanded)}>
          <List.Subheader style={{}} selectable={false}>
            {getCurrentViewLabel()}{' '}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
          </List.Subheader>
        </TouchableRipple>

        {/* Dropdown Options */}
        {expanded && (
          <View style={{ backgroundColor: theme === 'dark' ? '#333333' : '#f0f0f0' }}>
            {/* currentPage가 존재할 때 노트 그룹 옵션 하나로 표시 */}
            {currentPage && (
              <>
                {/* 노트 제목을 클릭하면 기본값(TOC)으로 이동 */}
                {renderOption('TOC', 'file-document', currentPage.title)}
                <View
                  style={{
                    height: 1,
                    backgroundColor: '#888888',
                    marginHorizontal: 16,
                    marginVertical: 4,
                    opacity: 0.3,
                  }}
                />
              </>
            )}
            {renderOption('RECENT', 'history', lang('Recent Changes'))}
            {renderOption('KANBAN', 'view-dashboard', lang('Kanban'))}
          </View>
        )}

        {/* Note View Mode Badges */}
        {isNoteMode && currentPage && (
          <View style={styles.badgeContainer}>
            {renderBadge('TOC', lang('Table of Contents'), 'format-list-bulleted')}
            {renderBadge('SUB_NOTE', lang('Sub Notes'), 'file-tree')}
            {renderBadge('HISTORY', lang('Changelog'), 'clock-outline')}
          </View>
        )}

        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: 'row',
    paddingLeft: 13,
    paddingTop: 16,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 4,
  },
});
