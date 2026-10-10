import { useLangContext, Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import { TopicBoardSection } from './TopicBoardSection';
import { TopicBoardSummarySection, useTopicBoardSummary } from './TopicBoardSummarySection';
import { TopicOverviewSection } from './TopicOverviewSection';
import { TopicLinksSection, TopicLinksTabButton } from './links/TopicLinksSection';
import { useTopicConnections } from './links/useTopicConnections';
import type { TopicDashboardNavigationProp } from './types';
import { useTopicDashboard } from './useTopicDashboard';
import { ResponsiveSearchBar } from '../../components/SearchBar';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export const TopicDashboardScreen: React.FC = () => {
  useEffectExtensionScreen('topicDashboard');

  const navigation = useNavigation<TopicDashboardNavigationProp>();
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { topicDashboards, currentBoard, selectBoard, metrics, totalBoardCount } =
    useTopicDashboard();
  const connections = useTopicConnections();
  const summary = useTopicBoardSummary(currentBoard);
  const [viewMode, setViewMode] = useState<'OVERVIEW' | 'SUMMARY' | 'BOARD' | 'LINKS'>('OVERVIEW');
  const isOverview = viewMode !== 'LINKS' && (viewMode === 'OVERVIEW' || !currentBoard);

  return (
    <View style={[commonStyles.container, { paddingHorizontal: 0, paddingVertical: 0, flex: 1 }]}>
      <ResponsiveSearchBar />

      {/* 상단 탭 버튼들과 사용방법 버튼을 같은 축에 배치 */}
      <View
        style={[localStyles.tabSwitcherBar, { borderBottomColor: commonStyles.card.borderColor }]}
      >
        <View style={localStyles.tabButtonsGroup}>
          <TouchableOpacity
            onPress={() => setViewMode('OVERVIEW')}
            style={[
              localStyles.tabButton,
              isOverview && [
                localStyles.activeTabButton,
                { borderBottomColor: commonStyles.activeTab.color },
              ],
            ]}
          >
            <MciIcon
              name="view-compact-outline"
              size={16}
              color={isOverview ? commonStyles.activeTab.color : commonStyles.smallText.color}
            />
            <Text
              style={[
                localStyles.tabButtonText,
                {
                  color: isOverview ? commonStyles.activeTab.color : commonStyles.smallText.color,
                },
              ]}
            >
              {lang('Overview')}
            </Text>
          </TouchableOpacity>

          <TopicLinksTabButton
            active={viewMode === 'LINKS'}
            onPress={() => setViewMode('LINKS')}
            connections={connections}
          />

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

      {isOverview && (
        <TopicOverviewSection
          topicDashboards={topicDashboards}
          metrics={metrics}
          totalBoardCount={totalBoardCount}
          connections={connections}
          onSelectBoard={(title) => {
            selectBoard(title);
            setViewMode('SUMMARY');
          }}
          onShowConnections={() => setViewMode('LINKS')}
        />
      )}
      {viewMode === 'LINKS' && <TopicLinksSection connections={connections} />}
      {viewMode === 'SUMMARY' && currentBoard && (
        <TopicBoardSummarySection board={currentBoard} summary={summary} />
      )}
      {viewMode === 'BOARD' && currentBoard && (
        <View style={{ flex: 1 }}>
          <TopicBoardSection topicBoard={currentBoard} />
        </View>
      )}
    </View>
  );
};

const localStyles = StyleSheet.create({
  tabSwitcherBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  tabButtonsGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
