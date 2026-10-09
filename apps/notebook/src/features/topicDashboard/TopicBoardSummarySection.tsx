import { useLangContext, Text, Spacer } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import React, { useState, useMemo, useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import FaIcon from 'react-native-vector-icons/FontAwesome';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import type {
  TopicDashboardBoard,
  TopicDashboardCardItem,
  TopicDashboardNavigationProp,
} from './types';
import { toNoteParams } from '../../components/SearchBar';
import { useCreateOrUpdateBoard } from '../../hooks/useBoardStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { useUsageMode } from '../../hooks/useUsageMode';
import type { Content } from '../../types';

/** 탭 전환에도 필터와 저장 완료 상태를 유지하도록 화면에서 항상 호출한다. */
export function useTopicBoardSummary(currentBoard?: TopicDashboardBoard) {
  const navigation = useNavigation<TopicDashboardNavigationProp>();
  const { lang } = useLangContext();
  const { isBoardEnabled } = useUsageMode();

  const createBoardMutation = useCreateOrUpdateBoard();
  const [savedBoards, setSavedBoards] = useState<Record<string, boolean>>({});
  const isSaved = currentBoard ? !!savedBoards[currentBoard.title] : false;

  const handleSaveAsBoard = useCallback(async () => {
    if (!currentBoard || !isBoardEnabled) return;
    try {
      await createBoardMutation.mutateAsync({
        title: currentBoard.title,
        description: '',
        option: currentBoard.option,
      });
      setSavedBoards((prev) => ({ ...prev, [currentBoard.title]: true }));
      Alert.alert(lang('Success'), lang('Board created successfully!'));
    } catch (e) {
      Alert.alert(lang('error'), String(e));
    }
  }, [createBoardMutation, currentBoard, isBoardEnabled, lang]);

  const [selectedColumnFilters, setSelectedColumnFilters] = useState<string[]>([]);
  const [selectedRowFilters, setSelectedRowFilters] = useState<string[]>([]);

  React.useEffect(() => {
    setSelectedColumnFilters([]);
    setSelectedRowFilters([]);
  }, [currentBoard?.title]);

  const handleCardPress = (card: TopicDashboardCardItem) => {
    navigation.push('NotePage', {
      ...toNoteParams(card.paragraph.origin, card.paragraph.title, card.paragraph.autoSection),
      board: card.boardTitle,
    });
  };

  const handleNavigateToNote = useCallback(
    (colNote: Content) => {
      navigation.push('NotePage', {
        ...toNoteParams(colNote.title),
        board: currentBoard?.title,
      });
    },
    [currentBoard?.title, navigation]
  );

  const handleColumnFilterToggle = useCallback((colNoteTitle: string) => {
    setSelectedColumnFilters((prev) =>
      prev.includes(colNoteTitle) ? prev.filter((t) => t !== colNoteTitle) : [...prev, colNoteTitle]
    );
  }, []);

  const handleRowFilterToggle = useCallback((rowName: string) => {
    setSelectedRowFilters((prev) =>
      prev.includes(rowName) ? prev.filter((r) => r !== rowName) : [...prev, rowName]
    );
  }, []);

  const handleClearColumnFilters = useCallback(() => {
    setSelectedColumnFilters([]);
  }, []);

  const handleClearRowFilters = useCallback(() => {
    setSelectedRowFilters([]);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedColumnFilters([]);
    setSelectedRowFilters([]);
  }, []);

  const filteredCards = useMemo(() => {
    if (!currentBoard) return [];
    return currentBoard.cards.filter((card) => {
      if (selectedColumnFilters.length > 0 && !selectedColumnFilters.includes(card.noteTitle)) {
        return false;
      }
      if (selectedRowFilters.length > 0 && !selectedRowFilters.includes(card.rowName)) {
        return false;
      }
      return true;
    });
  }, [currentBoard, selectedColumnFilters, selectedRowFilters]);

  const hasFilter = selectedColumnFilters.length > 0 || selectedRowFilters.length > 0;

  return {
    isSaved,
    createBoardMutation,
    selectedColumnFilters,
    selectedRowFilters,
    filteredCards,
    hasFilter,
    handleSaveAsBoard,
    handleCardPress,
    handleNavigateToNote,
    handleColumnFilterToggle,
    handleRowFilterToggle,
    handleClearColumnFilters,
    handleClearRowFilters,
    handleClearFilters,
  };
}

export function TopicBoardSummarySection({
  board: currentBoard,
  summary,
}: {
  board: TopicDashboardBoard;
  summary: ReturnType<typeof useTopicBoardSummary>;
}) {
  const navigation = useNavigation<TopicDashboardNavigationProp>();
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const { isBoardEnabled } = useUsageMode();
  const {
    isSaved,
    createBoardMutation,
    selectedColumnFilters,
    selectedRowFilters,
    filteredCards,
    hasFilter,
    handleSaveAsBoard,
    handleCardPress,
    handleNavigateToNote,
    handleColumnFilterToggle,
    handleRowFilterToggle,
    handleClearColumnFilters,
    handleClearRowFilters,
    handleClearFilters,
  } = summary;

  return (
    <ScrollView contentContainerStyle={localStyles.overviewContainer}>
      <View
        style={[
          commonStyles.card,
          localStyles.summaryCard,
          { borderColor: commonStyles.card.borderColor },
        ]}
      >
        {/* 카드 헤더: 상단에 제목, 배지 및 보드 뷰처럼 일관되게 배치된 '보드로 저장' 버튼 */}
        <View style={localStyles.cardHeader}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <Text style={[commonStyles.title, { fontSize: 18 }]} numberOfLines={1}>
              {currentBoard.title}
            </Text>
            {currentBoard.isTopLevel && (
              <View style={[localStyles.typeBadge, { backgroundColor: '#3498DB22' }]}>
                <Text style={{ fontSize: 10, color: '#3498DB', fontWeight: 'bold' }}>
                  {lang('Top-level Notes')}
                </Text>
              </View>
            )}
            <View
              style={[
                localStyles.typeBadge,
                {
                  backgroundColor:
                    currentBoard.option.BOARD_TYPE === 'SCRUM' ? '#E67E2222' : '#3498DB22',
                },
              ]}
            >
              <FaIcon
                name={currentBoard.option.BOARD_TYPE === 'SCRUM' ? 'trello' : 'columns'}
                size={11}
                color={currentBoard.option.BOARD_TYPE === 'SCRUM' ? '#E67E22' : '#3498DB'}
                style={{ marginRight: 4 }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: currentBoard.option.BOARD_TYPE === 'SCRUM' ? '#E67E22' : '#3498DB',
                }}
              >
                {currentBoard.option.BOARD_TYPE === 'SCRUM' ? lang('Scrum') : lang('Kanban')}
              </Text>
            </View>
          </View>

          {/* 보드 뷰처럼 상단 우측에 일관되게 배치된 '보드로 저장' 버튼 */}
          {isBoardEnabled && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {currentBoard.isTopLevel ? (
                <TouchableOpacity
                  onPress={() => {
                    navigation.push('TopicBatchMove', {
                      title: currentBoard.title,
                      batchTitles: currentBoard.columnNotes.map((c) => c.title),
                      boardOption: currentBoard.option,
                    });
                  }}
                  style={[
                    localStyles.actionButton,
                    {
                      backgroundColor: '#3498DB22',
                      marginLeft: 6,
                    },
                  ]}
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
                  style={[
                    localStyles.actionButton,
                    {
                      backgroundColor: isSaved ? '#27AE6022' : '#3498DB22',
                      marginLeft: 6,
                    },
                  ]}
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

        {/* 컬럼 목록 (별도 로우로 라벨 및 클릭 가능한 칩 배치 - 총 카드 다중 필터 제공) */}
        <View style={localStyles.sectionBlock}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MciIcon
                name="filter-variant"
                size={14}
                color={commonStyles.smallText.color}
                style={{ marginRight: 4 }}
              />
              <Text style={[commonStyles.smallText, localStyles.sectionTitle, { marginBottom: 0 }]}>
                {lang('Columns')} ({currentBoard.stats.columnCount}):
              </Text>
            </View>
            {selectedColumnFilters.length > 0 && (
              <TouchableOpacity onPress={handleClearColumnFilters} style={{ paddingHorizontal: 4 }}>
                <Text
                  style={[
                    commonStyles.smallText,
                    { color: '#3498DB', fontSize: 11, fontWeight: '600' },
                  ]}
                >
                  {lang('Clear')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={localStyles.chipRow}>
            {currentBoard.columnNotes.map((colNote) => {
              const colName = currentBoard.isTopLevel
                ? colNote.title
                : colNote.title.slice(currentBoard.title.length + 1);
              const isSelected = selectedColumnFilters.includes(colNote.title);
              const colCardCount = currentBoard.cards.filter(
                (c) => c.noteTitle === colNote.title
              ).length;
              return (
                <View
                  key={colNote.title}
                  style={[
                    localStyles.columnChip,
                    isSelected
                      ? {
                          backgroundColor: '#3498DB',
                          borderColor: '#3498DB',
                        }
                      : {
                          backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: isDark ? '#475569' : '#CBD5E1',
                        },
                  ]}
                >
                  {/* 1. 필터 토글 영역 (탭: 필터 토글, 롱프레스: 해당 노트로 이동) */}
                  <TouchableOpacity
                    onPress={() => handleColumnFilterToggle(colNote.title)}
                    onLongPress={() => handleNavigateToNote(colNote)}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <MciIcon
                      name={isSelected ? 'check' : 'notebook-outline'}
                      size={12}
                      color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        localStyles.chipText,
                        {
                          color: isSelected ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569',
                          fontWeight: isSelected ? 'bold' : '600',
                        },
                      ]}
                    >
                      {colName}
                    </Text>
                    <Text
                      style={[
                        localStyles.chipCountText,
                        {
                          color: isSelected
                            ? 'rgba(255, 255, 255, 0.85)'
                            : isDark
                            ? '#94A3B8'
                            : '#64748B',
                        },
                      ]}
                    >
                      ({colCardCount})
                    </Text>
                  </TouchableOpacity>

                  {/* 미세 세로 구분선 */}
                  <View
                    style={{
                      width: 1,
                      height: 10,
                      marginHorizontal: 5,
                      backgroundColor: isSelected
                        ? 'rgba(255, 255, 255, 0.35)'
                        : isDark
                        ? '#475569'
                        : '#CBD5E1',
                    }}
                  />

                  {/* 2. 해당 노트로 바로 이동 버튼 */}
                  <TouchableOpacity
                    onPress={() => handleNavigateToNote(colNote)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 6 }}
                    style={{ padding: 2 }}
                  >
                    <MciIcon
                      name="open-in-new"
                      size={11}
                      color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {/* 스크럼인 경우: 분류(Rows / 스프린트 / 에픽) 목록 (별도 로우로 배치 - 총 카드 다중 필터 제공) */}
        {currentBoard.option.BOARD_TYPE === 'SCRUM' && (
          <View style={localStyles.sectionBlock}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MciIcon
                  name="filter-variant"
                  size={14}
                  color={commonStyles.smallText.color}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[commonStyles.smallText, localStyles.sectionTitle, { marginBottom: 0 }]}
                >
                  {lang('Rows')} ({currentBoard.rows.filter((r) => r.name !== '').length}):
                </Text>
              </View>
              {selectedRowFilters.length > 0 && (
                <TouchableOpacity onPress={handleClearRowFilters} style={{ paddingHorizontal: 4 }}>
                  <Text
                    style={[
                      commonStyles.smallText,
                      { color: '#E67E22', fontSize: 11, fontWeight: '600' },
                    ]}
                  >
                    {lang('Clear')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={localStyles.chipRow}>
              {currentBoard.rows
                .filter((r) => r.name !== '')
                .map((row) => {
                  const isSelected = selectedRowFilters.includes(row.name);
                  const rowCardCount = currentBoard.cards.filter(
                    (c) => c.rowName === row.name
                  ).length;
                  return (
                    <TouchableOpacity
                      key={row.name}
                      onPress={() => handleRowFilterToggle(row.name)}
                      activeOpacity={0.7}
                      style={[
                        localStyles.rowChip,
                        isSelected
                          ? {
                              backgroundColor: '#E67E22',
                              borderColor: '#E67E22',
                            }
                          : {
                              backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                              borderColor: isDark ? '#475569' : '#CBD5E1',
                            },
                      ]}
                    >
                      <MciIcon
                        name={isSelected ? 'check' : 'view-headline'}
                        size={12}
                        color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          localStyles.chipText,
                          {
                            color: isSelected ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569',
                            fontWeight: isSelected ? 'bold' : '600',
                          },
                        ]}
                      >
                        {row.name}
                      </Text>
                      <Text
                        style={[
                          localStyles.chipCountText,
                          {
                            color: isSelected
                              ? 'rgba(255, 255, 255, 0.85)'
                              : isDark
                              ? '#94A3B8'
                              : '#64748B',
                          },
                        ]}
                      >
                        ({rowCardCount})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        )}

        <Spacer height={4} />

        {/* 카드 목록: 필터가 적용된 카드를 리스트하고 누를 시 해당 문단으로 이동 (카드 내용은 미노출) */}
        {currentBoard.cards.length > 0 && (
          <View style={localStyles.sectionBlock}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={[commonStyles.smallText, localStyles.sectionTitle]}>
                {lang('Total Cards')} ({filteredCards.length}
                {hasFilter ? ` / ${currentBoard.cards.length}` : ''}):
              </Text>
              {hasFilter && (
                <TouchableOpacity onPress={handleClearFilters} style={{ paddingHorizontal: 4 }}>
                  <Text
                    style={[
                      commonStyles.smallText,
                      { color: commonStyles.activeTab.color, fontSize: 11 },
                    ]}
                  >
                    {lang('Clear')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={localStyles.cardListContainer}>
              {filteredCards.length === 0 ? (
                <View
                  style={[
                    localStyles.cardItemRow,
                    {
                      backgroundColor: commonStyles.container.backgroundColor,
                      borderColor: commonStyles.card.borderColor,
                      justifyContent: 'center',
                    },
                  ]}
                >
                  <Text
                    style={[commonStyles.smallText, { fontStyle: 'italic', paddingVertical: 4 }]}
                  >
                    {lang('There are no cards.')}
                  </Text>
                </View>
              ) : (
                filteredCards.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => handleCardPress(c)}
                    activeOpacity={0.6}
                    style={[
                      localStyles.cardItemRow,
                      {
                        backgroundColor: commonStyles.container.backgroundColor,
                        borderColor: commonStyles.card.borderColor,
                      },
                    ]}
                  >
                    {/* 좌측에 컬럼, 로우 배지 배치 */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginRight: 8,
                      }}
                    >
                      <View
                        style={[
                          localStyles.cardMetaBadge,
                          {
                            backgroundColor: '#3498DB12',
                            borderColor: '#3498DB44',
                          },
                        ]}
                      >
                        <Text style={[commonStyles.smallText, { fontSize: 10, color: '#3498DB' }]}>
                          {c.columnName}
                        </Text>
                      </View>
                      {c.rowName !== '' && (
                        <View
                          style={[
                            localStyles.cardMetaBadge,
                            {
                              backgroundColor: '#E67E2218',
                              borderColor: '#E67E2244',
                              marginLeft: 4,
                            },
                          ]}
                        >
                          <Text
                            style={[commonStyles.smallText, { fontSize: 10, color: '#E67E22' }]}
                          >
                            {c.rowName}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* 가운데에 카드 제목 */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[commonStyles.text, { fontSize: 13, fontWeight: '600' }]}
                        numberOfLines={1}
                      >
                        {c.title}
                      </Text>
                    </View>

                    <MciIcon
                      name="chevron-right"
                      size={16}
                      color={commonStyles.smallText.color}
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  overviewContainer: {
    padding: 12,
    gap: 12,
  },
  summaryCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  sectionBlock: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  columnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 9,
    paddingRight: 7,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipCountText: {
    fontSize: 11,
    marginLeft: 3,
  },
  rowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardListContainer: {
    gap: 6,
  },
  cardItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardMetaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
});
