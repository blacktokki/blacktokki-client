import { useLangContext } from '@blacktokki/core';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { AnalysisAction } from '../components/AnalysisAction';
import { AnalysisDetailField } from '../components/AnalysisDetailField';
import { AnalysisFilter } from '../components/AnalysisFilter';
import { AnalysisPagination, currentAnalysisPage } from '../components/AnalysisPagination';
import { RelationEvidenceSection } from '../components/RelationEvidenceSection';
import {
  countRelationVerdicts,
  matchesRelationValidation,
  RelationVerdict,
  relationVerdictLabels,
} from '../relationFilters';
import { compareRelationConfidence, relationSupportRank } from '../relationResults';
import type {
  RelationDetail as RelationDetailData,
  RelationEntityDetail,
} from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';

export type RelationListState = { page: number; verdicts: RelationVerdict[]; expanded?: string };

export function RelationListSection({
  header,
  relations,
  state,
  onChange,
  validated,
  pending,
  entities,
  onSelectEntity,
}: {
  header: React.ReactNode;
  relations: Map<string, RelationDetailData>;
  state: RelationListState;
  onChange: React.Dispatch<React.SetStateAction<RelationListState>>;
  validated: boolean;
  pending: boolean;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { page: relationPage, verdicts: relationVerdicts } = state;
  const sortedRelations = useMemo(
    () => [...relations.values()].sort(compareRelationConfidence),
    [relations]
  );
  const relationVerdictCounts = useMemo(
    () =>
      countRelationVerdicts(
        sortedRelations.flatMap(({ evidence }) => evidence.map(({ validation }) => validation))
      ),
    [sortedRelations]
  );
  const relationMatches = useMemo(
    () =>
      sortedRelations.filter(
        ({ evidence }) =>
          !relationVerdicts.length ||
          evidence.some(({ validation }) => matchesRelationValidation(relationVerdicts, validation))
      ),
    [sortedRelations, relationVerdicts]
  );
  const currentRelationPage = currentAnalysisPage(relationPage, relationMatches.length, 20);
  return (
    <>
      <View style={[commonStyles.card, styles.panel]}>
        {header}
        <Text style={commonStyles.smallText}>{lang('Validation evidence')}</Text>
        <AnalysisFilter
          labels={relationVerdictLabels}
          value={relationVerdicts}
          counts={relationVerdictCounts}
          onChange={(verdicts) => onChange((previous) => ({ ...previous, verdicts, page: 0 }))}
        />
        <Text style={commonStyles.smallText}>
          {lang('Relationships')}: {relationMatches.length}
        </Text>
      </View>
      {relationMatches
        .slice(currentRelationPage * 20, currentRelationPage * 20 + 20)
        .map((relation) => {
          const { candidate, evidence } = relation;
          const expanded = state.expanded === candidate.id;
          const toggle = () =>
            onChange((previous) => ({
              ...previous,
              expanded: previous.expanded === candidate.id ? undefined : candidate.id,
            }));
          const visibleEvidence = evidence.filter(({ validation }) =>
            matchesRelationValidation(relationVerdicts, validation)
          );
          return (
            <View key={candidate.id} style={[commonStyles.card, styles.panel]}>
              <View style={styles.evidenceSummary}>
                <Text accessibilityRole="header" style={[commonStyles.text, styles.grow]}>
                  {candidate.label}
                </Text>
                <AnalysisAction
                  icon={expanded ? 'chevron-up' : 'chevron-down'}
                  label={expanded ? 'Collapse' : 'Expand'}
                  accessibilityState={{ expanded }}
                  onPress={toggle}
                />
              </View>
              <Text style={commonStyles.smallText}>
                {lang('Source Notes')}: {candidate.noteSupport} · {lang('Entity pairs')}:{' '}
                {candidate.pairSupport} · {lang('Validation evidence')}: {visibleEvidence.length}
              </Text>
              {expanded && (
                <RelationDetail
                  key={relationVerdicts.join(',')}
                  relation={{ ...relation, evidence: visibleEvidence }}
                  entities={entities}
                  onSelectEntity={onSelectEntity}
                />
              )}
            </View>
          );
        })}
      {!relationMatches.length && (
        <View style={[commonStyles.card, styles.panel, styles.empty]}>
          <Text style={[commonStyles.smallText, styles.emptyText]}>
            {lang(
              !validated
                ? pending
                  ? 'Results will appear as analysis progresses.'
                  : 'Start analysis'
                : relationVerdicts.length
                ? 'No matching analysis results.'
                : 'No relationships found.'
            )}
          </Text>
        </View>
      )}
      <AnalysisPagination
        page={currentRelationPage}
        count={relationMatches.length}
        size={20}
        onChange={(page) => onChange((previous) => ({ ...previous, page }))}
      />
    </>
  );
}

/** Render evidence already filtered by the relationship list. */
export function RelationDetail({
  relation,
  entities,
  onSelectEntity,
}: {
  relation: RelationDetailData;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (name: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const evidence = useMemo(
    () =>
      relation.evidence
        .map((item) => ({ ...item, ...relationSupportRank([item.validation]) }))
        .sort(compareRelationConfidence),
    [relation]
  );
  const current = currentAnalysisPage(page, evidence.length, 10);
  const { candidate } = relation;
  return (
    <View style={styles.section}>
      <View style={styles.detailFields}>
        <AnalysisDetailField label="Discovery basis">
          <Text style={commonStyles.text}>
            {lang(
              candidate.recurring
                ? 'Repeated across distinct notes and entity pairs'
                : 'Individual relationship candidate'
            )}
          </Text>
        </AnalysisDetailField>
        <AnalysisDetailField label="Relationship pattern">
          <Text selectable style={commonStyles.text}>
            {candidate.template.split(/(\{\{E[12]\}\})/g).map((part, index) => {
              const entity = /^\{\{E([12])\}\}$/.exec(part);
              return entity ? (
                <Text key={index} style={[commonStyles.activeTab, styles.inlineKeyword]}>
                  {`〈${lang('Entity')} ${entity[1]}〉`}
                </Text>
              ) : (
                part
              );
            })}
          </Text>
        </AnalysisDetailField>
      </View>
      <Text accessibilityRole="header" style={[commonStyles.title, styles.sectionTitle]}>
        {lang('Validation evidence')}
      </Text>
      <Text style={commonStyles.smallText}>
        {lang('Results')}: {evidence.length}
      </Text>
      {evidence.slice(current * 10, current * 10 + 10).map(({ observation, validation }, index) => (
        <RelationEvidenceSection
          key={`${current}:${index}`}
          template={candidate.template}
          observation={observation}
          entities={entities}
          onSelectEntity={onSelectEntity}
          validation={validation}
        />
      ))}
      {!evidence.length && (
        <Text style={commonStyles.smallText}>{lang('No matching analysis results.')}</Text>
      )}
      <AnalysisPagination page={current} count={evidence.length} size={10} onChange={setPage} />
    </View>
  );
}
