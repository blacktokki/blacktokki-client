import { useLangContext, Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import { TopicBoardSection } from './TopicBoardSection';
import { TopicBoardSummarySection, useTopicBoardSummary } from './TopicBoardSummarySection';
import { TopicOverviewSection } from './TopicOverviewSection';
import type { TopicDashboardNavigationProp } from './types';
import { useTopicDashboard } from './useTopicDashboard';
import { ResponsiveSearchBar } from '../../components/SearchBar';
import StatusCard from '../../components/StatusCard';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export const TopicDashboardScreen: React.FC = () => {
  useEffectExtensionScreen('topicDashboard');

  const navigation = useNavigation<TopicDashboardNavigationProp>();
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { topicDashboards, currentBoard, selectBoard, metrics, totalBoardCount } =
    useTopicDashboard();
  const summary = useTopicBoardSummary(currentBoard);
  const [viewMode, setViewMode] = useState<'OVERVIEW' | 'SUMMARY' | 'BOARD'>('OVERVIEW');

  return (
    <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0, flex: 1 }]}>
      <ResponsiveSearchBar />

      {/* 상단 탭 버튼들과 사용방법 버튼을 같은 축에 배치 */}
      <View
        style={[localStyles.tabSwitcherBar, { borderBottomColor: commonStyles.card.borderColor }]}
      >
        {totalBoardCount > 0 ? (
          <View style={localStyles.tabButtonsGroup}>
            <TouchableOpacity
              onPress={() => setViewMode('OVERVIEW')}
              style={[
                localStyles.tabButton,
                (viewMode === 'OVERVIEW' || !currentBoard) && [
                  localStyles.activeTabButton,
                  { borderBottomColor: commonStyles.activeTab.color },
                ],
              ]}
            >
              <MciIcon
                name="view-compact-outline"
                size={16}
                color={
                  viewMode === 'OVERVIEW' || !currentBoard
                    ? commonStyles.activeTab.color
                    : commonStyles.smallText.color
                }
              />
              <Text
                style={[
                  localStyles.tabButtonText,
                  {
                    color:
                      viewMode === 'OVERVIEW' || !currentBoard
                        ? commonStyles.activeTab.color
                        : commonStyles.smallText.color,
                  },
                ]}
              >
                {lang('Overview')}
              </Text>
            </TouchableOpacity>

            {currentBoard && (
              <>
                <TouchableOpacity
                  onPress={() => setViewMode('SUMMARY')}
                  style={[
                    localStyles.tabButton,
                    viewMode === 'SUMMARY' && [
                      localStyles.activeTabButton,
                      { borderBottomColor: commonStyles.activeTab.color },
                    ],
                  ]}
                >
                  <MciIcon
                    name="clipboard-text-outline"
                    size={16}
                    color={
                      viewMode === 'SUMMARY'
                        ? commonStyles.activeTab.color
                        : commonStyles.smallText.color
                    }
                  />
                  <Text
                    style={[
                      localStyles.tabButtonText,
                      {
                        color:
                          viewMode === 'SUMMARY'
                            ? commonStyles.activeTab.color
                            : commonStyles.smallText.color,
                      },
                    ]}
                  >
                    {lang('Board Summary')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setViewMode('BOARD')}
                  style={[
                    localStyles.tabButton,
                    viewMode === 'BOARD' && [
                      localStyles.activeTabButton,
                      { borderBottomColor: commonStyles.activeTab.color },
                    ],
                  ]}
                >
                  <MciIcon
                    name="view-column-outline"
                    size={16}
                    color={
                      viewMode === 'BOARD'
                        ? commonStyles.activeTab.color
                        : commonStyles.smallText.color
                    }
                  />
                  <Text
                    style={[
                      localStyles.tabButtonText,
                      {
                        color:
                          viewMode === 'BOARD'
                            ? commonStyles.activeTab.color
                            : commonStyles.smallText.color,
                      },
                    ]}
                  >
                    {lang('Board View')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* 같은 축에 배치된 사용 방법 버튼 */}
        <TouchableOpacity
          onPress={() =>
            navigation.push('NoteViewer', {
              key: 'Usage',
              paragraph: '📊 ' + lang('Topic Dashboard'),
            })
          }
          style={localStyles.usageButton}
        >
          <Text style={[localStyles.usageText, { color: commonStyles.text.color }]}>
            {lang('Usage')}
          </Text>
          <MciIcon name="chevron-right" size={14} color={commonStyles.text.color} />
        </TouchableOpacity>
      </View>

      {totalBoardCount === 0 ? (
        <View style={{ padding: 16 }}>
          <StatusCard message={lang('There are no topic board candidates.')} />
        </View>
      ) : (
        <>
          {/* 1. 대시보드 종합 개요 뷰 (OVERVIEW): BoardListScreen과 동일한 BoardListItem 컴포넌트 사용 */}
          {(viewMode === 'OVERVIEW' || !currentBoard) && (
            <TopicOverviewSection
              topicDashboards={topicDashboards}
              metrics={metrics}
              onSelectBoard={(title) => {
                selectBoard(title);
                setViewMode('SUMMARY');
              }}
            />
          )}

          {/* 2. 보드 상세 요약 뷰 (SUMMARY): 선택한 보드의 상세 요약 표시 */}
          {viewMode === 'SUMMARY' && currentBoard && (
            <TopicBoardSummarySection board={currentBoard} summary={summary} />
          )}

          {/* 3. 보드 상세 뷰 (BOARD) */}
          {viewMode === 'BOARD' && currentBoard && (
            <View style={{ flex: 1 }}>
              <TopicBoardSection topicBoard={currentBoard} />
            </View>
          )}
        </>
      )}
    </View>
  );
};

const localStyles = StyleSheet.create({
  tabSwitcherBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  tabButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  usageText: {
    fontSize: 13,
    marginRight: 2,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomWidth: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default TopicDashboardScreen;
