import { useLangContext, Text } from '@blacktokki/core';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import FaIcon from 'react-native-vector-icons/FontAwesome';
import MciIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import type { TopicDashboardBoard, TopicDashboardMetrics } from './types';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { BoardListItem } from '../../screens/main/BoardListScreen';

export function TopicOverviewSection({
  topicDashboards,
  metrics,
  onSelectBoard,
}: {
  topicDashboards: TopicDashboardBoard[];
  metrics: TopicDashboardMetrics;
  onSelectBoard: (title: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();

  // 개요에서 사용할 BoardListScreen과 동일한 BoardListItem 데이터 목록 생성
  const boardListItems = useMemo(() => {
    return topicDashboards.map((b) => {
      let latestUpdated = '';
      b.columnNotes.forEach((c) => {
        if (!latestUpdated || (c.updated && new Date(c.updated) > new Date(latestUpdated))) {
          latestUpdated = c.updated;
        }
      });
      return {
        title: b.title,
        stats: {
          noteCount: b.stats.columnCount,
          cardCount: b.stats.cardCount,
          updated: latestUpdated || undefined,
        },
      };
    });
  }, [topicDashboards]);

  return (
    <ScrollView contentContainerStyle={localStyles.overviewContainer}>
      {/* 대시보드 요약 KPI 지표 카드 바 (개요 뷰 상단) */}
      <View style={localStyles.metricsContainer}>
        <View
          style={[
            commonStyles.card,
            localStyles.metricCard,
            { borderColor: commonStyles.card.borderColor },
          ]}
        >
          <MciIcon name="view-dashboard-outline" size={18} color={commonStyles.activeTab.color} />
          <Text style={[localStyles.metricValue, { color: commonStyles.text.color }]}>
            {metrics.totalTopics}
          </Text>
          <Text style={[commonStyles.smallText, localStyles.metricLabel]}>
            {lang('Total Topics')}
          </Text>
        </View>

        <View
          style={[
            commonStyles.card,
            localStyles.metricCard,
            { borderColor: commonStyles.card.borderColor },
          ]}
        >
          <FaIcon name="columns" size={16} color="#3498DB" />
          <Text style={[localStyles.metricValue, { color: commonStyles.text.color }]}>
            {metrics.totalColumns}
          </Text>
          <Text style={[commonStyles.smallText, localStyles.metricLabel]}>
            {lang('Total Columns')}
          </Text>
        </View>

        <View
          style={[
            commonStyles.card,
            localStyles.metricCard,
            { borderColor: commonStyles.card.borderColor },
          ]}
        >
          <MciIcon name="card-text-outline" size={18} color="#27AE60" />
          <Text style={[localStyles.metricValue, { color: commonStyles.text.color }]}>
            {metrics.totalCards}
          </Text>
          <Text style={[commonStyles.smallText, localStyles.metricLabel]}>
            {lang('Total Cards')}
          </Text>
        </View>
      </View>

      {/* 보드 목록 (BoardListScreen과 동일한 BoardListItem 컴포넌트 렌더링) */}
      <View style={{ gap: 8 }}>
        {boardListItems.map((item) => (
          <BoardListItem key={item.title} item={item} onPress={() => onSelectBoard(item.title)} />
        ))}
      </View>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  metricsContainer: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  metricLabel: {
    fontSize: 10,
    marginTop: 1,
    textAlign: 'center',
  },
  overviewContainer: {
    padding: 12,
    gap: 12,
  },
});
