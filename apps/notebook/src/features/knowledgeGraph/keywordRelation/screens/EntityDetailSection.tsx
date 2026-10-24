/** Entity details, source provenance and general relationships. */
import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import {
  AnalysisFilter,
  AnalysisPagination,
  currentAnalysisPage,
  AnalysisAction,
  ANALYSIS_EVIDENCE_PAGE_SIZE,
} from '../components/AnalysisControls';
import {
  AnalysisNameLink,
  AnalysisDetailField,
  AnalysisSectionLink,
} from '../components/AnalysisDetailField';
import { RelationEvidenceList } from '../components/RelationEvidenceList';
import { RelationGroupEvaluation } from '../components/RelationEvidenceSection';
import {
  groupRelationEvidenceByPeerRole,
  filterRelationEvidence,
  relationGroupEvidenceSatisfied,
  uniqueRelationEvidence,
} from '../relationPresentation';
import {
  countRelationAssociationTypes,
  matchesRelationGroupingFilter,
  RelationFilterOperator,
  countRelationAggregationKinds,
  countRelationGroupingKinds,
  RelationAggregationKind,
  relationAggregationKindLabels,
  RelationGroupingKind,
  relationGroupingKindLabels,
  RelationAssociationType,
  relationAssociationType,
  relationAssociationTypeLabels,
  matchesRelationFilter,
  countRelationSourceTypes,
  RelationSourceType,
  relationSourceTypeLabels,
  compareRelationScore,
  relationAssociationRank,
  RelationEntityDetail,
} from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import type { RelationKeywordSource } from '../types';

export function EntityDetailSection({
  entity,
  analyzed,
  pending = false,
  entities,
  onSelectEntity,
}: {
  entity: RelationEntityDetail;
  analyzed: boolean;
  pending?: boolean;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (name: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const [associationTypes, setAssociationTypes] = useState<RelationAssociationType[]>([]);
  const [aggregationKinds, setAggregationKinds] = useState<RelationAggregationKind[]>([]);
  const [groupingKinds, setGroupingKinds] = useState<RelationGroupingKind[]>([]);
  const [evidenceSatisfiedOnly, setEvidenceSatisfiedOnly] = useState(false);
  const [associationOperator, setAssociationOperator] = useState<RelationFilterOperator>('or');
  const [aggregationOperator, setAggregationOperator] = useState<RelationFilterOperator>('or');
  const [groupingOperator, setGroupingOperator] = useState<RelationFilterOperator>('or');
  const allRows = useMemo(
    () =>
      [...entity.relationships.values()]
        .sort(compareRelationScore)
        .flatMap((relationship) => relationship.sentences),
    [entity]
  );
  const associationTypeCounts = useMemo(
    () =>
      countRelationAssociationTypes(
        allRows.map((sentence) => relationAssociationType(sentence.evidence))
      ),
    [allRows]
  );
  const rows = useMemo(
    () =>
      filterRelationEvidence(
        allRows.map((sentence) => ({ ...sentence.evidence, sentence })),
        associationTypes,
        aggregationKinds,
        associationOperator,
        aggregationOperator
      ).map(({ sentence }) => sentence),
    [allRows, associationTypes, aggregationKinds, associationOperator, aggregationOperator]
  );
  const basisCounts = useMemo(
    () =>
      countRelationAggregationKinds(
        filterRelationEvidence(
          uniqueRelationEvidence(allRows.map((sentence) => sentence.evidence)),
          associationTypes,
          [],
          associationOperator
        )
      ),
    [allRows, associationTypes, associationOperator]
  );
  const allGroups = useMemo(
    () =>
      groupRelationEvidenceByPeerRole(
        rows.map((sentence) => ({ ...sentence.evidence, sentence })),
        entity.key
      )
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
        .sort(compareRelationScore),
    [rows, entity.key]
  );
  const groupingCounts = useMemo(
    () => countRelationGroupingKinds(allGroups.map((group) => group.role.kind)),
    [allGroups]
  );
  const evidenceSatisfiedCount = allGroups.filter((group) => group.evidenceSatisfied).length;
  const groups = useMemo(
    () =>
      allGroups.filter((group) =>
        matchesRelationGroupingFilter(
          groupingKinds,
          group.role.kind,
          evidenceSatisfiedOnly,
          group.evidenceSatisfied,
          groupingOperator
        )
      ),
    [allGroups, groupingKinds, evidenceSatisfiedOnly, groupingOperator]
  );
  const current = currentAnalysisPage(page, groups.length, 10);
  return (
    <View style={styles.section}>
      <View style={[commonStyles.card, styles.panel]}>
        <Text
          selectable
          accessibilityRole="header"
          style={[commonStyles.title, styles.detailTitle]}
        >
          {entity.text}
        </Text>
        <View style={styles.metrics}>
          {[
            ['Source Notes', entity.noteCount],
            ['Keyword occurrences', entity.mentionCount],
            ['Associations', analyzed ? entity.relationships.size : '—'],
            ['Related entities', analyzed ? entity.relatedEntities.size : '—'],
          ].map(([label, value]) => (
            <View key={label} style={[commonStyles.resultsContainer, styles.detailMetric]}>
              <Text style={commonStyles.smallText}>{lang(String(label))}</Text>
              <Text style={[commonStyles.text, styles.metricValue]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
      <EntityGeneralRelationsSection
        entity={entity}
        entities={entities}
        onSelectEntity={onSelectEntity}
      />
      <View style={[commonStyles.card, styles.panel]}>
        <Text accessibilityRole="header" style={[commonStyles.title, styles.sectionTitle]}>
          {lang('Associations')}
          {analyzed ? ` · ${entity.relationships.size}` : ''}
        </Text>
        <AnalysisFilter
          label="Association type"
          labels={relationAssociationTypeLabels}
          value={associationTypes}
          counts={associationTypeCounts}
          operator={associationOperator}
          onOperatorChange={(value) => {
            setAssociationOperator(value);
            setPage(0);
          }}
          onChange={(value) => {
            setAssociationTypes(value);
            setPage(0);
          }}
        />
        <AnalysisFilter
          label="Aggregation basis"
          labels={relationAggregationKindLabels}
          counts={basisCounts}
          value={aggregationKinds}
          operator={aggregationOperator}
          onOperatorChange={(value) => {
            setAggregationOperator(value);
            setPage(0);
          }}
          onChange={(value) => {
            setAggregationKinds(value);
            setPage(0);
          }}
        />
        <AnalysisFilter
          label="Grouping type"
          labels={relationGroupingKindLabels}
          counts={groupingCounts}
          value={groupingKinds}
          operator={groupingOperator}
          onOperatorChange={(value) => {
            setGroupingOperator(value);
            setPage(0);
          }}
          toggle={{
            label: 'Evidence satisfied',
            value: evidenceSatisfiedOnly,
            count: evidenceSatisfiedCount,
            onChange: (value) => {
              setEvidenceSatisfiedOnly(value);
              setPage(0);
            },
          }}
          onChange={(value) => {
            setGroupingKinds(value);
            setPage(0);
          }}
        />
        <Text style={commonStyles.smallText}>
          {lang('Search Results')}: {groups.reduce((count, group) => count + group.items.length, 0)}
        </Text>
        {groups.slice(current * 10, current * 10 + 10).map((group) => (
          <View key={group.key} testID="entity-peer-type-group" style={styles.section}>
            <Text
              selectable
              accessibilityRole="header"
              style={[commonStyles.title, styles.sectionTitle]}
            >
              {lang(
                group.role.kind === 'type'
                  ? 'Entity type'
                  : group.role.kind === 'pattern'
                  ? 'Entity pattern'
                  : 'Keyword'
              )}
              {': '}
              {group.role.kind === 'keyword' ? group.role.name : `{{${group.role.name}}}`}
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
              items={group.items.map(({ sentence }) => ({
                ...sentence.evidence,
                entityContext: {
                  entityKey: entity.key,
                  relatedEntityKey: sentence.relatedEntityKey,
                  sourceText: sentence.context.text,
                },
              }))}
              entityKey={entity.key}
              entities={entities}
              onSelectEntity={onSelectEntity}
            />
          </View>
        ))}
        {!groups.length && (
          <Text style={commonStyles.smallText}>
            {lang(
              allRows.length
                ? 'No search results.'
                : pending
                ? 'Analysis in progress'
                : analyzed
                ? 'No search results.'
                : 'Start analysis'
            )}
          </Text>
        )}
        <AnalysisPagination page={current} count={groups.length} size={10} onChange={setPage} />
      </View>
      <EntityProvenanceSection entity={entity} />
    </View>
  );
}

/** Structural memberships and composition links are available as soon as keywords are extracted. */
function EntityGeneralRelationsSection({
  entity,
  entities,
  onSelectEntity,
}: {
  entity: RelationEntityDetail;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const relations = entity.generalRelations;
  const categories = [
    {
      label: 'Entity type / pattern relationships',
      groups: [
        ...(relations?.entityTypes || []).map((membership) => ({
          ...membership,
          label: 'Entity type',
        })),
        ...(relations?.pattern ? [{ ...relations.pattern, label: 'Entity pattern' }] : []),
      ],
    },
    {
      label: 'Compound / contained keyword relationships',
      groups: [
        { label: 'Compound keyword', keywordKeys: relations?.compoundKeys || [] },
        { label: 'Contained keyword', keywordKeys: relations?.containedKeys || [] },
      ],
    },
    {
      label: 'Synthetic / constituent keyword relationships',
      groups: [
        { label: 'Synthetic keyword', keywordKeys: relations?.syntheticKeys || [] },
        { label: 'Constituent keyword', keywordKeys: relations?.constituentKeys || [] },
      ],
    },
  ].map((category) => ({
    ...category,
    groups: category.groups.filter((group) => 'name' in group || group.keywordKeys.length),
  }));
  return (
    <View testID="entity-general-relations" style={[commonStyles.card, styles.panel]}>
      <Text accessibilityRole="header" style={[commonStyles.title, styles.sectionTitle]}>
        {lang('General relationships')}
      </Text>
      {categories
        .filter((category) => category.groups.length)
        .map((category) => (
          <View key={category.label} style={styles.section}>
            <Text accessibilityRole="header" style={[commonStyles.text, styles.resultTitle]}>
              {lang(category.label)}
            </Text>
            {category.groups.map((group, index) => (
              <GeneralRelationGroup
                key={`${entity.key}:${group.label}:${index}`}
                label={group.label}
                name={'name' in group ? String(group.name) : undefined}
                keywordKeys={group.keywordKeys.filter((key) => key !== entity.key)}
                entities={entities}
                onSelectEntity={onSelectEntity}
              />
            ))}
          </View>
        ))}
      {!categories.some((category) => category.groups.length) && (
        <Text style={commonStyles.smallText}>{lang('No search results.')}</Text>
      )}
    </View>
  );
}

function GeneralRelationGroup({
  label,
  name,
  keywordKeys,
  entities,
  onSelectEntity,
}: {
  label: string;
  name?: string;
  keywordKeys: string[];
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const current = currentAnalysisPage(page, keywordKeys.length, 20);
  return (
    <View style={styles.section}>
      <Text selectable style={commonStyles.smallText}>
        {lang(label)}
        {name ? `: {{${name}}}` : ''}
      </Text>
      {!!keywordKeys.length && (
        <View style={styles.wrap}>
          {keywordKeys.slice(current * 20, current * 20 + 20).map((key) => (
            <AnalysisNameLink
              key={key}
              name={entities.get(key)?.text || key}
              variant="chip"
              onPress={() => onSelectEntity(key)}
            />
          ))}
        </View>
      )}
      <AnalysisPagination page={current} count={keywordKeys.length} size={20} onChange={setPage} />
    </View>
  );
}

/** Structural provenance is available before NLI, including keywords with no two-entity relation. */
function EntityProvenanceSection({ entity }: { entity: RelationEntityDetail }) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [sourcePage, setSourcePage] = useState(0);
  const [expanded, setExpanded] = useState(entity.relationships.size === 0);
  const [sourceTypes, setSourceTypes] = useState<RelationSourceType[]>([]);
  const [sourceOperator, setSourceOperator] = useState<RelationFilterOperator>('or');
  const groups = useMemo(() => {
    const notes = new Map<string, RelationKeywordSource[]>();
    for (const source of entity.sources) {
      const rows = notes.get(source.noteTitle) || [];
      rows.push(source);
      notes.set(source.noteTitle, rows);
    }
    return [...notes]
      .filter(([, sources]) =>
        matchesRelationFilter(
          sourceTypes,
          sources.map((source) => source.kind),
          sourceOperator
        )
      )
      .map(
        ([title, sources]) =>
          [
            title,
            sources.filter((source) => matchesRelationFilter(sourceTypes, source.kind)),
          ] as const
      )
      .sort(([left], [right]) => left.localeCompare(right));
  }, [entity.sources, sourceTypes, sourceOperator]);
  const counts = useMemo(
    () => countRelationSourceTypes(entity.sources.map((source) => [source.kind])),
    [entity.sources]
  );
  const sourceCount = groups.reduce((sum, [, sources]) => sum + sources.length, 0);
  const currentSources = currentAnalysisPage(sourcePage, groups.length, 10);
  return (
    <View style={styles.section}>
      <View style={[commonStyles.card, styles.panel]}>
        <View style={[styles.wrap, styles.between]}>
          <Text accessibilityRole="header" style={[commonStyles.title, styles.sectionTitle]}>
            {lang('Source Notes')} · {sourceCount}
          </Text>
          <AnalysisAction
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            label="Source Notes"
            accessibilityState={{ expanded }}
            accessibilityHint={expanded ? 'Collapse' : 'Expand'}
            onPress={() => setExpanded((value) => !value)}
          />
        </View>
        {expanded && (
          <>
            <AnalysisFilter
              value={sourceTypes}
              counts={counts}
              label="Keyword source"
              labels={relationSourceTypeLabels}
              operator={sourceOperator}
              onOperatorChange={(value) => {
                setSourceOperator(value);
                setSourcePage(0);
              }}
              onChange={(value) => {
                setSourceTypes(value);
                setSourcePage(0);
              }}
            />
            <Text style={commonStyles.smallText}>
              {lang('Source Notes')}: {groups.length} · {lang('Reference')}: {sourceCount}
            </Text>
            {groups
              .slice(currentSources * 10, currentSources * 10 + 10)
              .map(([noteTitle, sources]) => (
                <KeywordSourceNoteCard
                  key={`${sourceOperator}:${sourceTypes.join(',')}:${noteTitle}`}
                  noteTitle={noteTitle}
                  sources={sources}
                />
              ))}
            {!groups.length && (
              <Text style={commonStyles.smallText}>{lang('No search results.')}</Text>
            )}
            <AnalysisPagination
              page={currentSources}
              count={groups.length}
              size={10}
              onChange={setSourcePage}
            />
          </>
        )}
      </View>
    </View>
  );
}

/** Keep every note in one outer card and paginate its nested source entries independently. */
function KeywordSourceNoteCard({
  noteTitle,
  sources,
}: {
  noteTitle: string;
  sources: RelationKeywordSource[];
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const current = currentAnalysisPage(page, sources.length, ANALYSIS_EVIDENCE_PAGE_SIZE);
  return (
    <View style={[commonStyles.resultsContainer, styles.evidence]}>
      <AnalysisDetailField label="Note">
        <AnalysisNameLink
          name={noteTitle}
          onPress={() => push('NotePage', { title: noteTitle })}
          variant="field"
        />
      </AnalysisDetailField>
      <Text style={commonStyles.smallText}>
        {lang('Reference')}: {sources.length}
      </Text>
      {sources
        .slice(current * ANALYSIS_EVIDENCE_PAGE_SIZE, (current + 1) * ANALYSIS_EVIDENCE_PAGE_SIZE)
        .map((source, index) => (
          <View
            key={`${current}:${index}`}
            style={[commonStyles.card, styles.sourceEntry, styles.detailFields]}
          >
            <AnalysisDetailField label="Paragraph" showIcon={false}>
              <AnalysisSectionLink
                noteTitle={noteTitle}
                section={source.section}
                sectionPath={source.sectionPath}
              />
            </AnalysisDetailField>
            <AnalysisDetailField label="Category">
              <Text style={commonStyles.text}>{lang(relationSourceTypeLabels[source.kind])}</Text>
            </AnalysisDetailField>
            <AnalysisDetailField label="Source text">
              <Text selectable style={commonStyles.text}>
                {source.text}
              </Text>
            </AnalysisDetailField>
          </View>
        ))}
      <AnalysisPagination
        page={current}
        count={sources.length}
        size={ANALYSIS_EVIDENCE_PAGE_SIZE}
        onChange={setPage}
      />
    </View>
  );
}
