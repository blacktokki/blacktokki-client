import { useLangContext } from '@blacktokki/core';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { AnalysisFilter } from '../components/AnalysisFilter';
import { AnalysisPagination, currentAnalysisPage } from '../components/AnalysisPagination';
import { EntityProvenanceSection } from '../components/EntityProvenanceSection';
import {
  EntityRelationshipGroup,
  EntityRelationshipRow,
} from '../components/EntityRelationshipGroup';
import {
  countRelationVerdicts,
  matchesRelationValidation,
  RelationVerdict,
  relationVerdictLabels,
} from '../relationFilters';
import type { RelationEntityDetail } from '../relationResults';
import { compareRelationConfidence } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';

export function EntityDetailSection({
  entity,
  validated,
  pending = false,
  entities,
  onSelectEntity,
}: {
  entity: RelationEntityDetail;
  validated: boolean;
  pending?: boolean;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (name: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const [verdicts, setVerdicts] = useState<RelationVerdict[]>([]);
  const allRows = useMemo(
    () =>
      [...entity.relationships.values()]
        .sort(compareRelationConfidence)
        .flatMap((relationship) =>
          relationship.sentences.map((sentence) => ({ relationship, sentence }))
        ),
    [entity]
  );
  const counts = useMemo(
    () => countRelationVerdicts(allRows.map(({ sentence }) => sentence.evidence.validation)),
    [allRows]
  );
  const rows = useMemo(
    () =>
      allRows.filter(({ sentence }) =>
        matchesRelationValidation(verdicts, sentence.evidence.validation)
      ),
    [allRows, verdicts]
  );
  const groups = useMemo(() => {
    const names = new Map<string, EntityRelationshipRow[]>();
    for (const row of rows) {
      const group = names.get(row.relationship.name) || [];
      group.push(row);
      names.set(row.relationship.name, group);
    }
    return [...names];
  }, [rows]);
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
        {!!entity.type && (
          <Text selectable style={commonStyles.smallText}>
            {lang('Category')}: {entity.type}
          </Text>
        )}
        <View style={styles.metrics}>
          {[
            ['Source Notes', entity.noteCount],
            ['Keyword occurrences', entity.mentionCount],
            ['Related relationships', validated ? entity.relationships.size : '—'],
            ['Related entities', validated ? entity.relatedEntities.size : '—'],
          ].map(([label, value]) => (
            <View key={label} style={[commonStyles.resultsContainer, styles.detailMetric]}>
              <Text style={commonStyles.smallText}>{lang(String(label))}</Text>
              <Text style={[commonStyles.text, styles.metricValue]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[commonStyles.card, styles.panel]}>
        <Text accessibilityRole="header" style={[commonStyles.title, styles.sectionTitle]}>
          {lang('Related relationships')}
          {validated ? ` · ${entity.relationships.size}` : ''}
        </Text>
        <Text style={commonStyles.smallText}>{lang('Validation evidence')}</Text>
        <AnalysisFilter
          labels={relationVerdictLabels}
          value={verdicts}
          counts={counts}
          onChange={(value) => {
            setVerdicts(value);
            setPage(0);
          }}
        />
        <Text style={commonStyles.smallText}>
          {lang('Results')}: {rows.length}
        </Text>
        {groups.slice(current * 10, current * 10 + 10).map(([name, rows]) => (
          <EntityRelationshipGroup
            key={JSON.stringify([name, verdicts])}
            name={name}
            rows={rows}
            entityKey={entity.key}
            entities={entities}
            onSelectEntity={onSelectEntity}
          />
        ))}
        {!rows.length && (
          <Text style={commonStyles.smallText}>
            {lang(
              allRows.length
                ? 'No matching analysis results.'
                : pending
                ? 'Results will appear as analysis progresses.'
                : validated
                ? 'No relationships found.'
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
