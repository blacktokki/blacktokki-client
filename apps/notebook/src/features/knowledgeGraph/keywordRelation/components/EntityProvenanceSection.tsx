import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import type { RelationKeywordSource } from '../relationDiscovery';
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
import { RelationEntityDetail } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import { AnalysisAction } from './AnalysisAction';
import { AnalysisDetailField } from './AnalysisDetailField';
import { AnalysisFilter } from './AnalysisFilter';
import { AnalysisNameLink } from './AnalysisNameLink';
import { AnalysisPagination, currentAnalysisPage } from './AnalysisPagination';
import { AnalysisSectionLink } from './AnalysisSectionLink';

/** Structural provenance is available before NLI, including keywords with no two-entity relation. */
export function EntityProvenanceSection({ entity }: { entity: RelationEntityDetail }) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [sourcePage, setSourcePage] = useState(0);
  const [expanded, setExpanded] = useState(entity.relationships.size === 0);
  const [sourceTypes, setSourceTypes] = useState<RelationSourceType[]>([]);
  const [entityTypes, setEntityTypes] = useState<RelationEntityType[]>([]);
  const [sourceOperator, setSourceOperator] = useState<RelationFilterOperator>('or');
  const [typeOperator, setTypeOperator] = useState<RelationFilterOperator>('or');
  const type = relationEntityType(entity.type);
  const sourceGroups = useMemo(() => {
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
  const typeCounts = useMemo(
    () =>
      countRelationEntityTypes(
        sourceGroups.flatMap(([, sources]) => sources.map(() => entity.type))
      ),
    [sourceGroups, entity.type]
  );
  const typeMatches = matchesRelationFilter(entityTypes, type, typeOperator);
  const counts = useMemo(
    () =>
      countRelationSourceTypes(typeMatches ? entity.sources.map((source) => [source.kind]) : []),
    [entity.sources, typeMatches]
  );
  const groups = typeMatches ? sourceGroups : [];
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
            <AnalysisFilter
              value={entityTypes}
              counts={typeCounts}
              label="Entity type"
              labels={relationEntityTypeLabels}
              operator={typeOperator}
              onOperatorChange={(value) => {
                setTypeOperator(value);
                setSourcePage(0);
              }}
              onChange={(value) => {
                setEntityTypes(value);
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
                  key={`${sourceOperator}:${typeOperator}:${sourceTypes.join(
                    ','
                  )}:${entityTypes.join(',')}:${noteTitle}`}
                  noteTitle={noteTitle}
                  sources={sources}
                />
              ))}
            {!groups.length && (
              <Text style={commonStyles.smallText}>{lang('No matching analysis results.')}</Text>
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
export function KeywordSourceNoteCard({
  noteTitle,
  sources,
}: {
  noteTitle: string;
  sources: RelationKeywordSource[];
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const current = currentAnalysisPage(page, sources.length, 10);
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
      {sources.slice(current * 10, current * 10 + 10).map((source, index) => (
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
      <AnalysisPagination page={current} count={sources.length} size={10} onChange={setPage} />
    </View>
  );
}
