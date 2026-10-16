import { useLangContext } from '@blacktokki/core';
import React, { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { AnalysisFilter } from '../components/AnalysisFilter';
import { AnalysisNameLink } from '../components/AnalysisNameLink';
import { AnalysisPagination, currentAnalysisPage } from '../components/AnalysisPagination';
import {
  countRelationEntityTypes,
  relationEntityType,
  RelationEntityType,
  relationEntityTypeLabels,
  matchesRelationFilter,
  RelationFilterOperator,
  countRelationSourceTypes,
  RelationSourceType,
  relationSourceTypeLabels,
} from '../relationFilters';
import type { RelationEntityDetail } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';

export type EntityKeywordsState = {
  query: string;
  page: number;
  sourceTypes: RelationSourceType[];
  entityTypes: RelationEntityType[];
  sourceOperator: RelationFilterOperator;
  typeOperator: RelationFilterOperator;
};

export function EntityKeywordsSection({
  header,
  entities,
  state,
  onChange,
  extracted,
  validated,
  onSelectEntity,
}: {
  header: React.ReactNode;
  entities: Map<string, RelationEntityDetail>;
  state: EntityKeywordsState;
  onChange: React.Dispatch<React.SetStateAction<EntityKeywordsState>>;
  extracted: boolean;
  validated: boolean;
  onSelectEntity: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const {
    query,
    page,
    sourceTypes,
    entityTypes,
    sourceOperator = 'or',
    typeOperator = 'or',
  } = state;
  const sortedEntities = useMemo(
    () => [...entities.values()].sort((a, b) => a.text.localeCompare(b.text)),
    [entities]
  );
  const search = query.trim().toLocaleLowerCase();
  const nameMatches = useMemo(
    () => sortedEntities.filter((entity) => entity.text.toLocaleLowerCase().includes(search)),
    [sortedEntities, search]
  );
  const sourceCounts = useMemo(
    () =>
      countRelationSourceTypes(
        nameMatches
          .filter((item) =>
            matchesRelationFilter(entityTypes, relationEntityType(item.type), typeOperator)
          )
          .map((item) => item.sources.map((source) => source.kind))
      ),
    [nameMatches, entityTypes, typeOperator]
  );
  const typeCounts = useMemo(
    () =>
      countRelationEntityTypes(
        nameMatches
          .filter((item) =>
            matchesRelationFilter(
              sourceTypes,
              item.sources.map((source) => source.kind),
              sourceOperator
            )
          )
          .map((item) => item.type)
      ),
    [nameMatches, sourceTypes, sourceOperator]
  );
  const matches = useMemo(
    () =>
      nameMatches.filter(
        (item) =>
          matchesRelationFilter(
            sourceTypes,
            item.sources.map((source) => source.kind),
            sourceOperator
          ) && matchesRelationFilter(entityTypes, relationEntityType(item.type), typeOperator)
      ),
    [nameMatches, sourceTypes, entityTypes, sourceOperator, typeOperator]
  );
  const current = currentAnalysisPage(page, matches.length, 20);
  return (
    <>
      <View style={[commonStyles.card, styles.panel]}>
        {header}
        <TextInput
          accessibilityLabel={lang('Search')}
          placeholder={lang('Search')}
          placeholderTextColor={commonStyles.placeholder.color}
          value={query}
          onChangeText={(value) => {
            onChange((previous) => ({ ...previous, query: value, page: 0 }));
          }}
          style={[commonStyles.input, styles.search]}
        />
        <AnalysisFilter
          value={sourceTypes}
          counts={sourceCounts}
          label="Keyword source"
          labels={relationSourceTypeLabels}
          operator={sourceOperator}
          onOperatorChange={(sourceOperator) =>
            onChange((previous) => ({ ...previous, sourceOperator, page: 0 }))
          }
          onChange={(value) => {
            onChange((previous) => ({ ...previous, sourceTypes: value, page: 0 }));
          }}
        />
        <AnalysisFilter
          value={entityTypes}
          counts={typeCounts}
          label="Entity type"
          labels={relationEntityTypeLabels}
          operator={typeOperator}
          onOperatorChange={(typeOperator) =>
            onChange((previous) => ({ ...previous, typeOperator, page: 0 }))
          }
          onChange={(value) => {
            onChange((previous) => ({ ...previous, entityTypes: value, page: 0 }));
          }}
        />
        <Text style={commonStyles.smallText}>
          {lang('Results')}: {matches.length}
        </Text>
      </View>
      {matches.slice(current * 20, current * 20 + 20).map((item) => (
        <View key={item.key} style={[commonStyles.card, styles.panel]}>
          <AnalysisNameLink name={item.text} onPress={() => onSelectEntity(item.key)} />
          <Text style={commonStyles.smallText}>
            {lang('Source Notes')}: {item.noteCount} · {lang('Keyword occurrences')}:{' '}
            {item.mentionCount} · {lang('Related relationships')}:{' '}
            {validated ? item.relationships.size : '—'}
          </Text>
        </View>
      ))}
      {!matches.length && (
        <View style={[commonStyles.card, styles.panel, styles.empty]}>
          <Text style={[commonStyles.smallText, styles.emptyText]}>
            {lang(
              search || sourceTypes.length || entityTypes.length
                ? 'No matching analysis results.'
                : extracted
                ? 'No entity keywords found. Keywords must occur in at least three notes.'
                : 'Results will appear as analysis progresses.'
            )}
          </Text>
        </View>
      )}
      <AnalysisPagination
        page={current}
        count={matches.length}
        size={20}
        onChange={(page) => onChange((previous) => ({ ...previous, page }))}
      />
    </>
  );
}
