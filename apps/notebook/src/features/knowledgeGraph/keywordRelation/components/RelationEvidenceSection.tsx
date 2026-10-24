/** Source evidence and group/individual association evaluations. */
import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { relationEvidenceTitleSegments, RelationSentenceSegment } from '../relationPresentation';
import { relationEntityKey, RelationEntityDetail, RelationEvidence } from '../relationResults';
import type { RelationAssociationRank } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import type { RelationObservation } from '../types';
import { AnalysisDetailField, AnalysisNameLink, AnalysisSectionLink } from './AnalysisDetailField';
import { RelationAccordion } from './RelationAccordion';

const directions = {
  undirected: 'Undirected association',
  'text-order': 'Entities follow the source text order; direction is not inferred.',
  'document-value': 'Property value',
  'column-order': 'Entities follow the source text order; direction is not inferred.',
};

function sourceFields({
  noteTitle,
  section,
  sectionPath,
}: Pick<RelationObservation, 'noteTitle' | 'section' | 'sectionPath'>) {
  return (
    <>
      <AnalysisDetailField label="Note">
        <AnalysisNameLink
          name={noteTitle}
          variant="field"
          onPress={() => push('NotePage', { title: noteTitle })}
        />
      </AnalysisDetailField>
      <AnalysisDetailField label="Paragraph">
        <AnalysisSectionLink noteTitle={noteTitle} section={section} sectionPath={sectionPath} />
      </AnalysisDetailField>
    </>
  );
}

export function RelationEvidenceSection({
  observation,
  entities,
  onSelectEntity,
  entityContext,
  expanded,
  onToggle,
}: {
  observation: RelationObservation;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
  expanded: boolean;
  onToggle: () => void;
  entityContext?: {
    entityKey: string;
    relatedEntityKey: string;
    sourceText: string;
  };
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const title = entityContext?.sourceText ?? observation.evidence;
  const titleSegments = useMemo(
    () => relationEvidenceTitleSegments(title, observation.source, observation.target),
    [title, observation.source, observation.target]
  );
  const entityKey = entityContext?.entityKey ?? relationEntityKey(observation.source);
  const relatedEntityKey = entityContext?.relatedEntityKey ?? relationEntityKey(observation.target);
  const relatedEntity = entities.get(relatedEntityKey);
  return (
    <RelationAccordion
      variant="evidence"
      toggleLabel="Preview"
      titleLabel={`${observation.noteTitle}: ${title}`}
      titleInteractive
      title={
        <AnalysisSentenceText
          segments={titleSegments}
          entityKey={entityKey}
          entities={entities}
          onSelectEntity={onSelectEntity}
          linkCurrentEntity={!entityContext}
        />
      }
      summary={
        <Text style={[commonStyles.smallText, styles.accordionMeta]}>
          {observation.noteTitle}
          {observation.section ? ` / ${observation.section}` : ''}
        </Text>
      }
      expanded={expanded}
      onToggle={onToggle}
      renderContent={() => (
        <View style={styles.detailFields}>
          {entityContext && (
            <AnalysisDetailField label="Entity">
              {relatedEntity ? (
                <AnalysisNameLink
                  name={relatedEntity.text}
                  onPress={() => onSelectEntity(relatedEntityKey)}
                  variant="field"
                />
              ) : (
                <Text style={commonStyles.text}>{lang('None')}</Text>
              )}
            </AnalysisDetailField>
          )}
          {sourceFields(observation)}
          {!entityContext && (
            <AnalysisDetailField label="Entity order">
              <Text style={commonStyles.text}>{lang(directions[observation.direction])}</Text>
            </AnalysisDetailField>
          )}
        </View>
      )}
    />
  );
}

/** Preserve distinct metric tuples and align entity counts with the current entity when present. */
export function RelationEvidenceEvaluation({
  evidence,
  entityKey,
  label = 'Evidence evaluation',
  generalizationScores = [],
}: {
  evidence: RelationEvidence[];
  entityKey?: string;
  label?: 'Evidence evaluation' | 'Relationship evaluation';
  generalizationScores?: number[];
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const evaluations = new Map<string, string[]>();
  for (const { observation, measurement } of evidence) {
    const metrics = measurement?.association;
    if (!metrics) continue;
    const reversed = entityKey && relationEntityKey(observation.source) !== entityKey;
    const sourceCount = reversed ? metrics.targetCount : metrics.sourceCount;
    const targetCount = reversed ? metrics.sourceCount : metrics.targetCount;
    const values = [
      `${(metrics.score * 100).toFixed(1)} / 100`,
      `${metrics.pairCount} / ${metrics.contextCount}`,
      `${sourceCount} / ${targetCount}`,
      `${metrics.lift.toFixed(2)} · NPMI: ${metrics.npmi.toFixed(3)}`,
    ];
    evaluations.set(JSON.stringify(values), values);
  }
  if (!evaluations.size && !generalizationScores.length) return null;
  return (
    <AnalysisDetailField label={label}>
      {[...evaluations].map(([key, values]) => (
        <View key={key} style={styles.evidenceMetrics}>
          <Text style={[commonStyles.text, styles.evidenceMetric, styles.evidenceMetricValue]}>
            {lang('Association score')}: {values[0]}
          </Text>
          <Text style={[commonStyles.text, styles.evidenceMetric, styles.evidenceMetricValue]}>
            {lang('Pair co-occurrences')}: {values[1]}
          </Text>
          <Text style={[commonStyles.text, styles.evidenceMetric, styles.evidenceMetricValue]}>
            {lang('Entity occurrence counts')}: {values[2]}
          </Text>
          <Text style={[commonStyles.text, styles.evidenceMetric, styles.evidenceMetricValue]}>
            {lang('Lift')}: {values[3]}
          </Text>
        </View>
      ))}
      {!!generalizationScores.length && (
        <Text style={commonStyles.text}>
          {lang('Generalization score')}:{' '}
          {[...new Set(generalizationScores.map((score) => (score * 100).toFixed(1)))].join(' · ')}{' '}
          / 100
        </Text>
      )}
      {label === 'Relationship evaluation' && (
        <Text style={commonStyles.smallText}>
          {lang('Association scores are heuristic ranks, not probabilities.')}
        </Text>
      )}
    </AnalysisDetailField>
  );
}

/** Inline Text keeps sentences readable and selectable while peer keywords navigate locally. */
function AnalysisSentenceText({
  entityKey,
  entities,
  onSelectEntity,
  linkCurrentEntity,
  segments,
}: {
  entityKey: string;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
  linkCurrentEntity: boolean;
  segments: RelationSentenceSegment[];
}) {
  const { commonStyles } = useNotebookTheme();
  return (
    <Text selectable accessibilityRole="header" style={[commonStyles.text, styles.accordionTitle]}>
      {segments.map((segment, index) => {
        if (!segment.entityKey || !entities.has(segment.entityKey)) return segment.text;
        const linked = linkCurrentEntity || segment.entityKey !== entityKey;
        return (
          <Text
            key={index}
            accessibilityRole={linked ? 'link' : undefined}
            accessibilityLabel={linked ? segment.text : undefined}
            onPress={linked ? () => onSelectEntity(segment.entityKey!) : undefined}
            style={[commonStyles.activeTab, styles.inlineKeyword, linked && styles.linkText]}
          >
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
}

/** Show the same whole-group rank used for sorting, independently of child pagination. */
export function RelationGroupEvaluation({ rank }: { rank: RelationAssociationRank }) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  return (
    <View testID="relation-group-evaluation" style={styles.detailFields}>
      <AnalysisDetailField label="Relationship evaluation">
        <Text style={commonStyles.text}>
          {rank.evidenceCount
            ? `${lang('Association score')}: ${(rank.score * 100).toFixed(1)} / 100`
            : lang('Not evaluated')}
        </Text>
      </AnalysisDetailField>
    </View>
  );
}
