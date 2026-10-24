import { useLangContext } from '@blacktokki/core';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import {
  AnalysisFilter,
  AnalysisPagination,
  currentAnalysisPage,
} from '../components/AnalysisControls';
import { RelationEvidenceList } from '../components/RelationEvidenceList';
import { RelationGroupEvaluation } from '../components/RelationEvidenceSection';
import {
  groupRelationEvidenceByRolePair,
  filterRelationEvidence,
  relationGroupEvidenceSatisfied,
  uniqueRelationEvidence,
} from '../relationPresentation';
import type { RelationTypeRole } from '../relationPresentation';
import {
  countRelationAssociationTypes,
  matchesRelationGroupingFilter,
  RelationFilterOperator,
  countRelationAggregationKinds,
  countRelationPairGroupingKinds,
  RelationAggregationKind,
  relationAggregationKindLabels,
  RelationPairGroupingKind,
  relationPairGroupingKind,
  relationPairGroupingKindLabels,
  RelationAssociationType,
  relationAssociationType,
  relationAssociationTypeLabels,
  compareRelationScore,
  relationAssociationRank,
} from '../relationResults';
import type {
  RelationDetail as RelationDetailData,
  RelationEntityDetail,
} from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';

export type RelationListState = {
  page: number;
  associationTypes: RelationAssociationType[];
  aggregationKinds?: RelationAggregationKind[];
  groupingKinds?: RelationPairGroupingKind[];
  associationOperator?: RelationFilterOperator;
  aggregationOperator?: RelationFilterOperator;
  groupingOperator?: RelationFilterOperator;
  evidenceSatisfiedOnly?: boolean;
  expanded?: string;
  pairPages?: Record<string, number>;
};

export function RelationListSection({
  header,
  relations,
  state,
  onChange,
  analyzed,
  pending,
  entities,
  onSelectEntity,
}: {
  header: React.ReactNode;
  relations: Map<string, RelationDetailData>;
  state: RelationListState;
  onChange: React.Dispatch<React.SetStateAction<RelationListState>>;
  analyzed: boolean;
  pending: boolean;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const {
    page: relationPage,
    associationTypes = [],
    aggregationKinds = [],
    groupingKinds = [],
    evidenceSatisfiedOnly = false,
    associationOperator = 'or',
    aggregationOperator = 'or',
    groupingOperator = 'or',
  } = state;
  const sortedRelations = useMemo(
    () => [...relations.values()].sort(compareRelationScore),
    [relations]
  );
  const allEvidence = useMemo(
    () =>
      sortedRelations.flatMap((relation) =>
        relation.evidence.map((item) => ({
          ...item,
          generalizationScore: relation.candidate.association?.generalizationScore,
        }))
      ),
    [sortedRelations]
  );
  const associationTypeCounts = useMemo(
    () =>
      countRelationAssociationTypes(
        uniqueRelationEvidence(allEvidence).map(relationAssociationType)
      ),
    [allEvidence]
  );
  const basisCounts = useMemo(
    () =>
      countRelationAggregationKinds(
        filterRelationEvidence(
          uniqueRelationEvidence(allEvidence),
          associationTypes,
          [],
          associationOperator
        )
      ),
    [allEvidence, associationTypes, associationOperator]
  );
  const allGroups = useMemo(() => {
    return groupRelationEvidenceByRolePair(allEvidence, {
      associationTypes,
      aggregationKinds,
      associationOperator,
      aggregationOperator,
    })
      .map((group) => {
        const rank = relationAssociationRank(
          uniqueRelationEvidence(group.items).map((item) => item.measurement)
        );
        return {
          ...group,
          ...rank,
          evidenceSatisfied: relationGroupEvidenceSatisfied(group.items, rank.score),
        };
      })
      .sort(compareRelationScore);
  }, [allEvidence, associationTypes, aggregationKinds, associationOperator, aggregationOperator]);
  const groupingCounts = useMemo(
    () =>
      countRelationPairGroupingKinds(
        allGroups.map((group) => relationPairGroupingKind(group.sourceRole, group.targetRole))
      ),
    [allGroups]
  );
  const evidenceSatisfiedCount = allGroups.filter((group) => group.evidenceSatisfied).length;
  const groups = useMemo(
    () =>
      allGroups.filter((group) =>
        matchesRelationGroupingFilter(
          groupingKinds,
          relationPairGroupingKind(group.sourceRole, group.targetRole),
          evidenceSatisfiedOnly,
          group.evidenceSatisfied,
          groupingOperator
        )
      ),
    [allGroups, groupingKinds, evidenceSatisfiedOnly, groupingOperator]
  );
  const currentRelationPage = currentAnalysisPage(relationPage, groups.length, 10);
  const roleName = (role: RelationTypeRole) =>
    role.kind === 'keyword' ? role.name : `{{${role.name}}}`;
  return (
    <>
      <View style={[commonStyles.card, styles.panel]}>
        {header}
        <AnalysisFilter
          label="Association type"
          labels={relationAssociationTypeLabels}
          value={associationTypes}
          counts={associationTypeCounts}
          operator={associationOperator}
          onOperatorChange={(associationOperator) =>
            onChange((previous) => ({ ...previous, associationOperator, page: 0, pairPages: {} }))
          }
          onChange={(associationTypes) =>
            onChange((previous) => ({ ...previous, associationTypes, page: 0, pairPages: {} }))
          }
        />
        <AnalysisFilter
          label="Aggregation basis"
          labels={relationAggregationKindLabels}
          counts={basisCounts}
          value={aggregationKinds}
          operator={aggregationOperator}
          onOperatorChange={(aggregationOperator) =>
            onChange((previous) => ({ ...previous, aggregationOperator, page: 0, pairPages: {} }))
          }
          onChange={(aggregationKinds) =>
            onChange((previous) => ({ ...previous, aggregationKinds, page: 0, pairPages: {} }))
          }
        />
        <AnalysisFilter
          label="Grouping type"
          labels={relationPairGroupingKindLabels(lang)}
          translateLabels={false}
          counts={groupingCounts}
          value={groupingKinds}
          operator={groupingOperator}
          onOperatorChange={(groupingOperator) =>
            onChange((previous) => ({ ...previous, groupingOperator, page: 0, pairPages: {} }))
          }
          toggle={{
            label: 'Evidence satisfied',
            value: evidenceSatisfiedOnly,
            count: evidenceSatisfiedCount,
            onChange: (evidenceSatisfiedOnly) =>
              onChange((previous) => ({
                ...previous,
                evidenceSatisfiedOnly,
                page: 0,
                pairPages: {},
              })),
          }}
          onChange={(groupingKinds) =>
            onChange((previous) => ({ ...previous, groupingKinds, page: 0, pairPages: {} }))
          }
        />
        <Text style={commonStyles.smallText}>
          {lang('Relationship groups')}: {groups.length}
        </Text>
      </View>
      {groups.slice(currentRelationPage * 10, currentRelationPage * 10 + 10).map((group) => (
        <View key={group.key} testID="relation-type-group" style={styles.section}>
          <Text
            selectable
            accessibilityRole="header"
            style={[commonStyles.title, styles.sectionTitle]}
          >
            {roleName(group.sourceRole)}
            {' ↔ '}
            {roleName(group.targetRole)}
          </Text>
          <RelationGroupEvaluation rank={group} />
          <RelationEvidenceList
            key={JSON.stringify([
              group.key,
              associationTypes,
              aggregationKinds,
              groupingKinds,
              evidenceSatisfiedOnly,
              associationOperator,
              aggregationOperator,
              groupingOperator,
            ])}
            items={group.items}
            entities={entities}
            onSelectEntity={onSelectEntity}
            evaluationLabel="Relationship evaluation"
            page={state.pairPages?.[group.key] ?? 0}
            onPageChange={(page) =>
              onChange((previous) => ({
                ...previous,
                pairPages: { ...previous.pairPages, [group.key]: page },
              }))
            }
            isPairExpanded={(pairKey) => state.expanded === JSON.stringify([group.key, pairKey])}
            onTogglePair={(pairKey) => {
              const key = JSON.stringify([group.key, pairKey]);
              onChange((previous) => ({
                ...previous,
                expanded: previous.expanded === key ? undefined : key,
              }));
            }}
          />
        </View>
      ))}
      {!groups.length && (
        <View style={[commonStyles.card, styles.panel, styles.empty]}>
          <Text style={[commonStyles.smallText, styles.emptyText]}>
            {lang(
              !analyzed
                ? pending
                  ? 'Analysis in progress'
                  : 'Start analysis'
                : 'No search results.'
            )}
          </Text>
        </View>
      )}
      <AnalysisPagination
        page={currentRelationPage}
        count={groups.length}
        size={10}
        onChange={(page) => onChange((previous) => ({ ...previous, page }))}
      />
    </>
  );
}
