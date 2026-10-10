import { Text } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { TopicConnectionDiagram } from './TopicConnectionDiagram';
import {
  filterTopicConnections,
  getTopicConnectionRatio,
  elementLabel,
  elementLabels,
  toggleTopicConnectionSelection,
  TopicConnectionSelection,
  TopicLinkElement,
  TopicLinkMatch,
} from './topicLinkDetails';
import type { useTopicConnections } from './useTopicConnections';
import { toNoteParams } from '../../../components/SearchBar';
import StatusCard from '../../../components/StatusCard';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import type { TopicDashboardNavigationProp } from '../types';

export function TopicLinksTabButton({
  active,
  onPress,
  connections,
}: {
  active: boolean;
  onPress: () => void;
  connections: ReturnType<typeof useTopicConnections>;
}) {
  const { commonStyles } = useNotebookTheme();
  const color = active ? commonStyles.activeTab.color : commonStyles.smallText.color;
  const { proposalCount } = connections;
  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, { borderBottomColor: active ? color : 'transparent' }]}
    >
      <Icon name="link" size={16} color={color} />
      <Text style={[styles.tabText, { color }]}>연결 규칙</Text>
      {!connections.isLoading && !connections.isError && proposalCount > 0 && (
        <Text
          accessibilityLabel={`추천 링크 편집 제안 ${proposalCount}개`}
          style={[
            styles.elementBadge,
            styles.tabBadge,
            { color, borderColor: color, backgroundColor: commonStyles.navButton.backgroundColor },
          ]}
        >
          {proposalCount}
        </Text>
      )}
    </TouchableOpacity>
  );
}

type SourceLocation = Pick<TopicLinkElement, 'noteTitle' | 'paragraph' | 'section'>;

function ElementBadge({
  kind,
  candidate = false,
  fromLink = false,
}: {
  kind: TopicLinkElement['kind'];
  candidate?: boolean;
  fromLink?: boolean;
}) {
  const { commonStyles } = useNotebookTheme();
  return (
    <Text
      style={[
        commonStyles.smallText,
        styles.elementBadge,
        {
          borderColor: commonStyles.card.borderColor,
          backgroundColor: commonStyles.navButton.backgroundColor,
        },
      ]}
    >
      {fromLink ? '링크 → ' : ''}
      {elementLabels[kind]}
      {candidate ? ' 후보' : ''}
    </Text>
  );
}

function ElementButton({
  element,
  candidate = false,
}: {
  element: TopicLinkElement;
  candidate?: boolean;
}) {
  const navigation = useNavigation<TopicDashboardNavigationProp>();
  const { commonStyles } = useNotebookTheme();
  return (
    <TouchableOpacity
      accessibilityRole="link"
      accessibilityLabel={`대상 보기: ${elementLabels[element.kind]}${
        candidate ? ' 후보' : ''
      } ${elementLabel(element)}`}
      onPress={() =>
        navigation.push(
          'NotePage',
          toNoteParams(element.noteTitle, element.paragraph, element.section)
        )
      }
      style={styles.element}
    >
      <Text style={[styles.value, { color: commonStyles.activeTab.color }]}>
        {elementLabel(element)}
      </Text>
      <Icon name="external-link" size={10} color={commonStyles.smallText.color} />
    </TouchableOpacity>
  );
}

/** 출발 요소는 제목, 실제·잠재 링크와 대상은 부제목으로 표시한다. 연결이 없는 요소는 제목만 표시한다. */
function ReferenceCard({
  source,
  location = source,
  linkText,
  target,
  targets,
  editable = true,
}: {
  source: TopicLinkElement;
  location?: SourceLocation;
  linkText?: string;
  target?: TopicLinkMatch['target'];
  targets?: TopicLinkElement[];
  editable?: boolean;
}) {
  const navigation = useNavigation<TopicDashboardNavigationProp>();
  const { commonStyles } = useNotebookTheme();
  const locationLabel = `${location.noteTitle}${
    location.paragraph ? ` > ${location.paragraph}` : ''
  }`;
  const noteParams = toNoteParams(location.noteTitle, location.paragraph, location.section);
  const elements =
    targets ?? (target ? ('id' in target ? [target] : target.candidateElements) : []);
  return (
    <View
      style={[
        styles.entry,
        {
          borderColor: commonStyles.card.borderColor,
          backgroundColor: commonStyles.container.backgroundColor,
        },
      ]}
    >
      <View style={styles.row}>
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel={`원문 보기: ${locationLabel}`}
          onPress={() => navigation.push('NotePage', noteParams)}
          style={styles.rowMain}
        >
          <ElementBadge kind={source.kind} />
          <Text
            numberOfLines={1}
            style={[commonStyles.text, styles.entryTitle, styles.headingText]}
          >
            {elementLabel(source)}
          </Text>
        </TouchableOpacity>
        {editable && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`원문 편집: ${locationLabel}`}
            onPress={() => navigation.push('EditPage', noteParams)}
            style={styles.iconButton}
          >
            <Icon name="pencil" size={14} color={commonStyles.activeTab.color} />
          </TouchableOpacity>
        )}
      </View>
      {target && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subtitleScroll}
          contentContainerStyle={styles.subtitleRow}
        >
          <ElementBadge kind={target.kind} candidate={!('id' in target)} fromLink />
          <Text style={[commonStyles.smallText, styles.value]}>
            {linkText || '텍스트 없는 링크'} →
          </Text>
          {elements.map((element, index) => (
            <React.Fragment key={element.id}>
              {index > 0 && <Text style={[commonStyles.smallText, styles.value]}>,</Text>}
              <ElementButton element={element} candidate={!('id' in target)} />
            </React.Fragment>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** 규칙 제목과 목록별 건수는 항상 표시하며, 세 목록은 기본적으로 접고 각각 독립적으로 펼친다. */
function ReferenceSection({
  title,
  count,
  ruleLabel,
  children,
}: {
  title: string;
  count: number;
  ruleLabel: string;
  children: React.ReactNode;
}) {
  const { commonStyles } = useNotebookTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <View style={styles.list}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${title} 접기/펼치기: ${ruleLabel}`}
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded((previous) => !previous)}
        style={styles.heading}
      >
        <Text style={[commonStyles.smallText, styles.sectionTitle, styles.headingText]}>
          {title} ({count})
        </Text>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={commonStyles.smallText.color}
        />
      </TouchableOpacity>
      {isExpanded && children}
    </View>
  );
}

/**
 * 반복 연결 규칙과 근거 링크, 미연결 제목의 편집 제안, 나머지 출발 요소를 표시한다.
 * 제안의 원문 편집은 실제 키워드가 발견된 문단으로 이동하며, 링크 생성과 저장은 노트 편집기에서 수행한다.
 * 실제 보드만 있는 노트북에서도 사용할 수 있도록 주제 보드 선택과 독립적으로 계산한다.
 */
export function TopicLinksSection({
  connections,
}: {
  connections: ReturnType<typeof useTopicConnections>;
}) {
  const { commonStyles } = useNotebookTheme();
  const { details, isLoading, isError } = connections;
  const [selections, setSelections] = useState<TopicConnectionSelection[]>([]);
  const filtered = useMemo(
    () => filterTopicConnections(details, selections),
    [details, selections]
  );
  const keyOf = (item: (typeof details)[number]) =>
    JSON.stringify([
      item.pattern.sourceBoard.title,
      item.pattern.targetBoard.title,
      item.pattern.pattern,
    ]);

  if (isLoading)
    return <ActivityIndicator style={styles.loading} color={commonStyles.activeTab.color} />;
  if (isError) return <StatusCard message="연결 규칙을 불러오지 못했습니다." />;

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={keyOf}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <TopicConnectionDiagram
            connections={connections}
            selections={selections}
            onToggle={(selection) =>
              setSelections((previous) => toggleTopicConnectionSelection(previous, selection))
            }
          />
        }
        ListEmptyComponent={
          <StatusCard
            message={
              selections.length
                ? '조건에 맞는 연결 규칙이 없습니다.'
                : '반복된 연결 규칙이 아직 없습니다.'
            }
          />
        }
        renderItem={({ item }) => {
          const { pattern, links, proposals, remainingSources } = item;
          const sourceKind = pattern.matches[0].source.kind;
          const targetKind = pattern.matches[0].target.kind;
          const ratio = getTopicConnectionRatio([item]);
          // 반올림으로 미완료 항목이 100%로 표시되는 것을 방지한다.
          const percentage = ratio === 1 ? 100 : Math.min(99.9, Math.round(ratio * 1000) / 10);
          return (
            <View style={[commonStyles.card, styles.card]}>
              <View style={styles.heading}>
                <View style={styles.headingText}>
                  <Text numberOfLines={1} style={[commonStyles.text, styles.entryTitle]}>
                    {pattern.sourceBoard.title} → {pattern.targetBoard.title}
                  </Text>
                  <View style={styles.row}>
                    <Text style={[commonStyles.smallText, styles.ruleSubtitleText]}>
                      {pattern.sourceBoard.origin === 'NOTE'
                        ? '노트'
                        : pattern.sourceBoard.origin === 'CANDIDATE'
                        ? '주제 보드'
                        : '보드'}
                      의 {elementLabels[sourceKind]} →{' '}
                      {pattern.targetBoard.origin === 'NOTE'
                        ? '노트'
                        : pattern.targetBoard.origin === 'CANDIDATE'
                        ? '주제 보드'
                        : '보드'}
                      의 {elementLabels[targetKind]} ({percentage}%)
                    </Text>
                    {ratio === 1 && (
                      <Icon
                        name="check-circle"
                        size={12}
                        color="#27AE60"
                        accessible
                        accessibilityLabel="연결 비율 100%"
                      />
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.sections}>
                <ReferenceSection
                  title="감지된 링크"
                  count={links.length}
                  ruleLabel={`${pattern.sourceBoard.title} → ${pattern.targetBoard.title} (${pattern.pattern})`}
                >
                  {links.map(({ match }, linkIndex) => (
                    <ReferenceCard
                      key={linkIndex}
                      source={match.source}
                      linkText={match.linkText}
                      target={match.target}
                      editable={false}
                    />
                  ))}
                </ReferenceSection>
                <ReferenceSection
                  title="추천 링크 편집 제안"
                  count={proposals.length}
                  ruleLabel={`${pattern.sourceBoard.title} → ${pattern.targetBoard.title} (${pattern.pattern})`}
                >
                  {proposals.length === 0 && (
                    <Text style={commonStyles.smallText}>새로 연결할 제목 언급이 없습니다.</Text>
                  )}
                  {proposals.map(({ match, occurrence, targets }, proposalIndex) => (
                    <ReferenceCard
                      key={proposalIndex}
                      source={match.source}
                      location={{
                        noteTitle: occurrence.sourceNoteTitle,
                        paragraph: occurrence.sourceParagraph?.paragraph,
                        section: occurrence.sourceParagraph?.section,
                      }}
                      linkText={match.linkText}
                      target={match.target}
                      targets={targets}
                    />
                  ))}
                </ReferenceSection>
                <ReferenceSection
                  title="추천 링크 없음"
                  count={remainingSources.length}
                  ruleLabel={`${pattern.sourceBoard.title} → ${pattern.targetBoard.title} (${pattern.pattern})`}
                >
                  {remainingSources.length === 0 && (
                    <Text style={commonStyles.smallText}>표시할 출발 요소가 없습니다.</Text>
                  )}
                  {remainingSources.map((source) => (
                    <ReferenceCard key={source.id} source={source} />
                  ))}
                </ReferenceSection>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { padding: 24 },
  content: { padding: 12 },
  card: { marginBottom: 12 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },
  tabBadge: { marginLeft: 6, borderRadius: 10, minWidth: 20, textAlign: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingText: { flex: 1 },
  ruleSubtitleText: { flexShrink: 1 },
  sections: { marginTop: 12, gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700' },
  list: { gap: 6 },
  entry: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryTitle: { marginBottom: 0, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  value: { fontSize: 12, lineHeight: 18 },
  elementBadge: {
    fontSize: 10,
    lineHeight: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  subtitleScroll: { flexGrow: 0, marginTop: 2 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { padding: 8 },
  element: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
