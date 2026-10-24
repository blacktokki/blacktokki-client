import { useLangContext } from '@blacktokki/core';
import React, { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import {
  AnalysisAction,
  AnalysisFilter,
  AnalysisPagination,
  currentAnalysisPage,
} from '../components/AnalysisControls';
import { AnalysisNameLink } from '../components/AnalysisDetailField';
import {
  countRelationEntityPatterns,
  relationEntityPattern,
  RelationEntityPattern,
  relationEntityPatternLabels,
  matchesRelationFilter,
  RelationFilterOperator,
  countRelationSourceTypes,
  RelationSourceType,
  relationSourceTypeLabels,
  RelationKeywordComposition,
  relationKeywordComposition,
  relationKeywordCompositionLabels,
  countRelationKeywordCompositions,
} from '../relationResults';
import type { RelationEntityDetail } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';

export type EntityKeywordsState = {
  query: string;
  page: number;
  sourceTypes: RelationSourceType[];
  entityPatterns: RelationEntityPattern[];
  entityTypes: string[];
  keywordCompositions: RelationKeywordComposition[];
  sourceOperator: RelationFilterOperator;
  patternOperator: RelationFilterOperator;
  typeOperator: RelationFilterOperator;
  compositionOperator: RelationFilterOperator;
  filtersExpanded?: boolean;
};

const entityFilterTypes = (entity: RelationEntityDetail) =>
  entity.entityTypeKeys?.length ? entity.entityTypeKeys : ['none'];

export function EntityKeywordsSection({
  header,
  entities,
  entityTypeLabels = {},
  state,
  onChange,
  extracted,
  analyzed,
  onSelectEntity,
}: {
  header: React.ReactNode;
  entities: Map<string, RelationEntityDetail>;
  entityTypeLabels?: Record<string, string>;
  state: EntityKeywordsState;
  onChange: React.Dispatch<React.SetStateAction<EntityKeywordsState>>;
  extracted: boolean;
  analyzed: boolean;
  onSelectEntity: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const entityTypeChoices = useMemo<Record<string, string>>(
    () => ({ ...entityTypeLabels, none: lang('None') }),
    [entityTypeLabels, lang]
  );
  const {
    query,
    page,
    sourceTypes,
    entityPatterns,
    entityTypes = [],
    keywordCompositions = [],
    sourceOperator = 'or',
    patternOperator = 'or',
    typeOperator = 'or',
    compositionOperator = 'or',
    filtersExpanded = true,
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
  const selectedTypes = useMemo(
    () => entityTypes.filter((key) => entityTypeChoices[key] !== undefined),
    [entityTypes, entityTypeChoices]
  );
  const typeMatches = useMemo(
    () =>
      nameMatches.filter((item) =>
        matchesRelationFilter(selectedTypes, entityFilterTypes(item), typeOperator)
      ),
    [nameMatches, selectedTypes, typeOperator]
  );
  const compositionMatches = useMemo(
    () =>
      typeMatches.filter((item) =>
        matchesRelationFilter(
          keywordCompositions,
          relationKeywordComposition(item),
          compositionOperator
        )
      ),
    [typeMatches, keywordCompositions, compositionOperator]
  );
  const sourceCounts = useMemo(
    () =>
      countRelationSourceTypes(
        compositionMatches
          .filter((item) =>
            matchesRelationFilter(entityPatterns, relationEntityPattern(item.type), patternOperator)
          )
          .map((item) => item.sources.map((source) => source.kind))
      ),
    [compositionMatches, entityPatterns, patternOperator]
  );
  const patternCounts = useMemo(
    () =>
      countRelationEntityPatterns(
        compositionMatches
          .filter((item) =>
            matchesRelationFilter(
              sourceTypes,
              item.sources.map((source) => source.kind),
              sourceOperator
            )
          )
          .map((item) => item.type)
      ),
    [compositionMatches, sourceTypes, sourceOperator]
  );
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0,
      ...Object.fromEntries(Object.keys(entityTypeChoices).map((key) => [key, 0])),
    };
    for (const item of nameMatches) {
      if (
        !matchesRelationFilter(
          sourceTypes,
          item.sources.map((source) => source.kind),
          sourceOperator
        ) ||
        !matchesRelationFilter(entityPatterns, relationEntityPattern(item.type), patternOperator) ||
        !matchesRelationFilter(
          keywordCompositions,
          relationKeywordComposition(item),
          compositionOperator
        )
      )
        continue;
      counts.all++;
      for (const key of new Set(entityFilterTypes(item)))
        if (counts[key] !== undefined) counts[key]++;
    }
    return counts;
  }, [
    nameMatches,
    sourceTypes,
    sourceOperator,
    entityPatterns,
    patternOperator,
    entityTypeChoices,
    keywordCompositions,
    compositionOperator,
  ]);
  const compositionCounts = useMemo(
    () =>
      countRelationKeywordCompositions(
        typeMatches
          .filter(
            (item) =>
              matchesRelationFilter(
                sourceTypes,
                item.sources.map((source) => source.kind),
                sourceOperator
              ) &&
              matchesRelationFilter(
                entityPatterns,
                relationEntityPattern(item.type),
                patternOperator
              )
          )
          .map(relationKeywordComposition)
      ),
    [typeMatches, sourceTypes, sourceOperator, entityPatterns, patternOperator]
  );
  const matches = useMemo(
    () =>
      compositionMatches.filter(
        (item) =>
          matchesRelationFilter(
            sourceTypes,
            item.sources.map((source) => source.kind),
            sourceOperator
          ) &&
          matchesRelationFilter(entityPatterns, relationEntityPattern(item.type), patternOperator)
      ),
    [compositionMatches, sourceTypes, entityPatterns, sourceOperator, patternOperator]
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
        <Text style={commonStyles.smallText}>
          {lang('Search Results')}: {matches.length}
        </Text>
      </View>
      <View style={[commonStyles.card, styles.panel]}>
        <View style={[styles.wrap, styles.between]}>
          <Text accessibilityRole="header" style={[commonStyles.title, styles.sectionTitle]}>
            {lang('Keyword filters')}
          </Text>
          <AnalysisAction
            icon={filtersExpanded ? 'chevron-up' : 'chevron-down'}
            label="Keyword filters"
            accessibilityState={{ expanded: filtersExpanded }}
            accessibilityHint={filtersExpanded ? 'Collapse' : 'Expand'}
            onPress={() =>
              onChange((previous) => ({
                ...previous,
                filtersExpanded: !(previous.filtersExpanded ?? true),
              }))
            }
          />
        </View>
        {filtersExpanded && (
          <>
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
              value={keywordCompositions}
              counts={compositionCounts}
              label="Keyword composition"
              labels={relationKeywordCompositionLabels}
              operator={compositionOperator}
              onOperatorChange={(compositionOperator) =>
                onChange((previous) => ({ ...previous, compositionOperator, page: 0 }))
              }
              onChange={(keywordCompositions) =>
                onChange((previous) => ({ ...previous, keywordCompositions, page: 0 }))
              }
            />
            <AnalysisFilter
              value={entityPatterns}
              counts={patternCounts}
              label="Entity pattern"
              labels={relationEntityPatternLabels}
              operator={patternOperator}
              onOperatorChange={(patternOperator) =>
                onChange((previous) => ({ ...previous, patternOperator, page: 0 }))
              }
              onChange={(value) => {
                onChange((previous) => ({ ...previous, entityPatterns: value, page: 0 }));
              }}
            />
            <AnalysisFilter
              value={selectedTypes}
              counts={typeCounts}
              label="Entity type"
              labels={entityTypeChoices}
              translateLabels={false}
              operator={typeOperator}
              onOperatorChange={(typeOperator) =>
                onChange((previous) => ({ ...previous, typeOperator, page: 0 }))
              }
              onChange={(entityTypes) =>
                onChange((previous) => ({ ...previous, entityTypes, page: 0 }))
              }
            />
          </>
        )}
      </View>
      {matches.slice(current * 20, current * 20 + 20).map((item) => (
        <View key={item.key} style={[commonStyles.card, styles.panel]}>
          <AnalysisNameLink name={item.text} onPress={() => onSelectEntity(item.key)} />
          <Text style={commonStyles.smallText}>
            {lang('Source Notes')}: {item.noteCount} · {lang('Keyword occurrences')}:{' '}
            {item.mentionCount} · {lang('Associations')}: {analyzed ? item.relationships.size : '—'}
          </Text>
        </View>
      ))}
      {!matches.length && extracted && (
        <View style={[commonStyles.card, styles.panel, styles.empty]}>
          <Text style={[commonStyles.smallText, styles.emptyText]}>
            {lang('No search results.')}
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
