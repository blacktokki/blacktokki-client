/** Relationship evidence lists, concrete pairs and aggregation groups. */
import { useLangContext } from '@blacktokki/core';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import {
  groupRelationEvidenceByBasis,
  groupRelationEvidenceByPair,
  uniqueRelationEvidence,
} from '../relationPresentation';
import type { RelationEvidencePair } from '../relationPresentation';
import {
  relationAssociationType,
  relationAssociationTypeLabels,
  relationAggregationKind,
  relationAggregationKindLabels,
  compareRelationScore,
  relationAssociationRank,
} from '../relationResults';
import type { RelationEntityDetail, RelationEvidence } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import {
  AnalysisPagination,
  currentAnalysisPage,
  ANALYSIS_EVIDENCE_PAGE_SIZE,
} from './AnalysisControls';
import { AnalysisNameLink } from './AnalysisDetailField';
import { RelationAccordion, RelationEvidenceSummary } from './RelationAccordion';
import { RelationEvidenceEvaluation, RelationEvidenceSection } from './RelationEvidenceSection';

type RelationEvidenceItem = RelationEvidence & {
  generalizationScore?: number;
  entityContext?: React.ComponentProps<typeof RelationEvidenceSection>['entityContext'];
};

const uniqueEvidenceItems = (items: RelationEvidenceItem[]) =>
  uniqueRelationEvidence(items, (item) => item.entityContext?.sourceText);

/** Share concrete pairs, association types, aggregation bases and source evidence across tabs. */
export function RelationEvidenceList({
  items,
  entityKey,
  entities,
  onSelectEntity,
  page: controlledPage,
  onPageChange,
  isPairExpanded,
  onTogglePair,
  evaluationLabel = 'Evidence evaluation',
}: {
  items: RelationEvidenceItem[];
  entityKey?: string;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
  page?: number;
  onPageChange?: (page: number) => void;
  isPairExpanded?: (key: string) => boolean;
  onTogglePair?: (key: string) => void;
  evaluationLabel?: 'Evidence evaluation' | 'Relationship evaluation';
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const [evidencePages, setEvidencePages] = useState<Record<string, number>>({});
  const [expandedPairs, setExpandedPairs] = useState<Record<string, boolean>>({});
  const [expandedBases, setExpandedBases] = useState<Record<string, boolean>>({});
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const pairs = useMemo(
    () =>
      groupRelationEvidenceByPair(items, (item) => item.observation)
        .map((pair) => {
          const types = new Map<ReturnType<typeof relationAssociationType>, typeof items>();
          for (const item of pair.items) {
            const type = relationAssociationType(item);
            const group = types.get(type) ?? [];
            group.push(item);
            types.set(type, group);
          }
          return {
            ...pair,
            ...relationAssociationRank(
              uniqueRelationEvidence(pair.items).map((item) => item.measurement)
            ),
            types: [...types].map(([type, rows]) => ({
              type,
              items: uniqueEvidenceItems(rows)
                .map((item) => ({ ...item, ...relationAssociationRank([item.measurement]) }))
                .sort(compareRelationScore),
              generalizations: new Map(
                groupRelationEvidenceByBasis(rows).map((group) => [
                  group.key,
                  group.items.flatMap((item) =>
                    item.generalizationScore === undefined ? [] : [item.generalizationScore]
                  ),
                ])
              ),
            })),
          };
        })
        .sort(compareRelationScore),
    [items]
  );
  const current = currentAnalysisPage(controlledPage ?? page, pairs.length, 20);
  return (
    <View style={styles.section}>
      {pairs.slice(current * 20, current * 20 + 20).map((pair) => {
        return (
          <RelationEvidencePairGroup
            key={pair.key}
            pair={pair}
            entities={entities}
            onSelectEntity={onSelectEntity}
            currentEntityKey={entityKey}
            expanded={isPairExpanded?.(pair.key) ?? expandedPairs[pair.key] ?? false}
            onToggle={() =>
              onTogglePair
                ? onTogglePair(pair.key)
                : setExpandedPairs((previous) => ({ ...previous, [pair.key]: !previous[pair.key] }))
            }
            evidenceCount={uniqueEvidenceItems(pair.items).length}
            renderDetails={() => (
              <View style={styles.section}>
                {pair.types.map(({ type, items, generalizations }) => (
                  <View key={type} testID="relation-pair-type" style={styles.accordionType}>
                    <Text
                      accessibilityRole="header"
                      style={[commonStyles.smallText, styles.accordionTypeTitle]}
                    >
                      {lang(relationAssociationTypeLabels[type])}
                    </Text>
                    <RelationEvidenceGroups
                      key={JSON.stringify([pair.key, type])}
                      items={items}
                      entityKey={entityKey}
                      pages={evidencePages}
                      expandedGroups={expandedBases}
                      onToggleGroup={(key) =>
                        setExpandedBases((previous) => ({ ...previous, [key]: !previous[key] }))
                      }
                      pageKey={JSON.stringify([pair.key, type])}
                      onPageChange={(key, page) =>
                        setEvidencePages((previous) => ({ ...previous, [key]: page }))
                      }
                      renderEvaluation={(items, key, entityKey) => (
                        <RelationEvidenceEvaluation
                          evidence={items}
                          entityKey={entityKey}
                          label={evaluationLabel}
                          generalizationScores={
                            evaluationLabel === 'Relationship evaluation'
                              ? generalizations.get(key)
                              : undefined
                          }
                        />
                      )}
                      renderEvidence={(item, groupKey) => {
                        const key = JSON.stringify([
                          groupKey,
                          item.observation.noteTitle,
                          item.observation.sectionPath ?? item.observation.section,
                          item.observation.evidence,
                          item.entityContext?.sourceText,
                          item.observation.direction,
                          item.measurement?.association,
                        ]);
                        return (
                          <RelationEvidenceSection
                            key={key}
                            {...item}
                            expanded={expandedEvidence[key] ?? false}
                            onToggle={() =>
                              setExpandedEvidence((previous) => ({
                                ...previous,
                                [key]: !previous[key],
                              }))
                            }
                            entities={entities}
                            onSelectEntity={onSelectEntity}
                          />
                        );
                      }}
                    />
                  </View>
                ))}
              </View>
            )}
          />
        );
      })}
      <View testID="relation-group-pair-pagination">
        <AnalysisPagination
          page={current}
          count={pairs.length}
          size={20}
          onChange={onPageChange ?? setPage}
        />
      </View>
    </View>
  );
}

/** Each statistical basis owns its source pages, independently of sibling bases and pair pages. */
function RelationEvidenceGroups<T extends RelationEvidence>({
  items,
  renderEvidence,
  renderEvaluation,
  entityKey,
  pages,
  pageKey,
  onPageChange,
  expandedGroups,
  onToggleGroup,
}: {
  items: T[];
  renderEvidence: (item: T, groupKey: string) => React.ReactNode;
  renderEvaluation: (items: T[], key: string, entityKey: string) => React.ReactNode;
  entityKey?: string;
  pages: Record<string, number>;
  pageKey: string;
  onPageChange: (key: string, page: number) => void;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const groups = useMemo(() => groupRelationEvidenceByBasis(items), [items]);
  const current = currentAnalysisPage(pages[pageKey] ?? 0, groups.length, 20);
  return (
    <View style={styles.section}>
      {groups.slice(current * 20, (current + 1) * 20).map((group) => {
        const expanded = expandedGroups[group.key] ?? false;
        const evidencePage = currentAnalysisPage(
          pages[group.key] ?? 0,
          group.items.length,
          ANALYSIS_EVIDENCE_PAGE_SIZE
        );
        return (
          <RelationAccordion
            key={group.key}
            testID="relation-evidence-basis"
            titleLabel={`${lang(
              relationAggregationKindLabels[relationAggregationKind(group.items[0])]
            )}${group.roles.length ? `: ${group.roles.join(' ↔ ')}` : ''}`}
            title={
              <Text accessibilityRole="header" style={[commonStyles.text, styles.accordionTitle]}>
                {lang(relationAggregationKindLabels[relationAggregationKind(group.items[0])])}
                {group.roles.length ? `: ${group.roles.join(' ↔ ')}` : ''}
              </Text>
            }
            summary={<RelationEvidenceSummary items={group.items} />}
            expanded={expanded}
            onToggle={() => onToggleGroup(group.key)}
            renderContent={() => (
              <View style={styles.section}>
                {renderEvaluation(group.items, group.key, entityKey ?? group.sourceKey)}
                {group.items
                  .slice(
                    evidencePage * ANALYSIS_EVIDENCE_PAGE_SIZE,
                    (evidencePage + 1) * ANALYSIS_EVIDENCE_PAGE_SIZE
                  )
                  .map((item) => renderEvidence(item, group.key))}
                <AnalysisPagination
                  page={evidencePage}
                  count={group.items.length}
                  size={ANALYSIS_EVIDENCE_PAGE_SIZE}
                  onChange={(page) => onPageChange(group.key, page)}
                />
              </View>
            )}
          />
        );
      })}
      <View testID="relation-basis-pagination">
        <AnalysisPagination
          page={current}
          count={groups.length}
          size={20}
          onChange={(page) => onPageChange(pageKey, page)}
        />
      </View>
    </View>
  );
}

/** Share pair grouping across tabs; pagination never splits a pair into separate group cards. */
function RelationEvidencePairGroup({
  pair,
  entities,
  onSelectEntity,
  expanded,
  onToggle,
  renderDetails,
  currentEntityKey,
  evidenceCount,
}: {
  pair: RelationEvidencePair<RelationEvidence>;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
  expanded: boolean;
  onToggle: () => void;
  renderDetails: () => React.ReactNode;
  currentEntityKey?: string;
  evidenceCount: number;
}) {
  const { commonStyles } = useNotebookTheme();
  return (
    <RelationAccordion
      testID="relation-evidence-pair"
      variant="pair"
      titleLabel={
        currentEntityKey
          ? pair.sourceKey === currentEntityKey
            ? pair.target
            : pair.source
          : `${pair.source} ↔ ${pair.target}`
      }
      titleInteractive
      title={
        <View style={[styles.passThrough, styles.wrap, styles.grow]}>
          {pair.sourceKey !== currentEntityKey && (
            <AnalysisNameLink
              name={entities.get(pair.sourceKey)?.text || pair.source}
              onPress={() => onSelectEntity(pair.sourceKey)}
            />
          )}
          {!currentEntityKey && (
            <Text style={[styles.nonInteractive, commonStyles.smallText]}>↔</Text>
          )}
          {pair.targetKey !== currentEntityKey && (
            <AnalysisNameLink
              name={entities.get(pair.targetKey)?.text || pair.target}
              onPress={() => onSelectEntity(pair.targetKey)}
            />
          )}
        </View>
      }
      summary={<RelationEvidenceSummary items={pair.items} evidenceCount={evidenceCount} />}
      expanded={expanded}
      onToggle={onToggle}
      renderContent={renderDetails}
    />
  );
}
