import { useLangContext } from '@blacktokki/core';
import { push } from '@blacktokki/navigation';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import type { RelationObservation, RelationValidation } from '../relationDiscovery';
import { RelationVerdict, relationVerdictLabels } from '../relationFilters';
import { relationSentenceSegments } from '../relationPresentation';
import { relationEntityKey, relationStatement, RelationEntityDetail } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import { AnalysisAction } from './AnalysisAction';
import { AnalysisDetailField } from './AnalysisDetailField';
import { AnalysisNameLink } from './AnalysisNameLink';
import { AnalysisSectionLink } from './AnalysisSectionLink';

const pendingReasons = {
  pending: 'Waiting for validation',
  'model-error': 'Model execution failed',
  'context-too-long': 'Input exceeds the model context',
};
const directions = {
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
  template,
  observation,
  validation = {
    noteTitle: observation.noteTitle,
    evidence: observation.evidence,
    hypothesis: '',
    heldOut: false,
    verdict: 'unverified',
    skipReason: 'pending',
  },
  entities,
  onSelectEntity,
  entityContext,
}: {
  template: string;
  validation?: RelationValidation;
  observation: RelationObservation;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
  entityContext?: {
    entityKey: string;
    relatedEntityKey: string;
    sourceText: string;
  };
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [expanded, setExpanded] = useState(false);
  const { hypothesisSource } = validation;
  const title = relationStatement(template, observation.source, observation.target);
  const entityKey = entityContext?.entityKey ?? relationEntityKey(observation.source);
  const relatedEntityKey = entityContext?.relatedEntityKey ?? relationEntityKey(observation.target);
  const relatedEntity = entities.get(relatedEntityKey);
  return (
    <View
      style={[
        entityContext ? commonStyles.card : commonStyles.resultsContainer,
        styles.evidence,
        entityContext && styles.sourceEntry,
        styles.detailFields,
      ]}
    >
      <View style={styles.evidenceSummary}>
        <AnalysisVerdictBadge verdict={validation.verdict} />
        <View style={styles.grow}>
          <AnalysisSentenceText
            text={title}
            entityKey={entityKey}
            relatedEntityKey={relatedEntityKey}
            entities={entities}
            onSelectEntity={onSelectEntity}
            linkCurrentEntity={!entityContext}
          />
        </View>
        <AnalysisAction
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          label="Preview"
          accessibilityState={{ expanded }}
          accessibilityHint={expanded ? 'Collapse' : 'Expand'}
          onPress={() => setExpanded((value) => !value)}
        />
      </View>
      {expanded && (
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
          <AnalysisDetailField label="Source text">
            <AnalysisSentenceText
              text={entityContext?.sourceText ?? observation.evidence}
              entityKey={entityKey}
              relatedEntityKey={relatedEntityKey}
              entities={entities}
              onSelectEntity={onSelectEntity}
              linkCurrentEntity={!entityContext}
              variant="body"
            />
            {sourceFields({ ...observation, noteTitle: validation.noteTitle })}
          </AnalysisDetailField>
          {validation.skipReason && (
            <AnalysisDetailField label="Status">
              <Text style={commonStyles.text}>{lang(pendingReasons[validation.skipReason])}</Text>
            </AnalysisDetailField>
          )}
          {!!validation.hypothesis && (
            <AnalysisDetailField label="Validation statement">
              <Text selectable style={commonStyles.text}>
                {validation.hypothesis}
              </Text>
              {hypothesisSource && sourceFields(hypothesisSource)}
            </AnalysisDetailField>
          )}
          <ValidationMethod validation={validation} />
          <AnalysisDetailField label="Entity order">
            <Text style={commonStyles.text}>{lang(directions[observation.direction])}</Text>
          </AnalysisDetailField>
          {validation.scores && (
            <AnalysisDetailField label="Judgment">
              {(['entailment', 'neutral', 'contradiction'] as const).map((label) => (
                <Text key={label} style={commonStyles.text}>
                  {lang(
                    label === 'entailment'
                      ? 'Supported'
                      : label === 'neutral'
                      ? 'Neutral'
                      : 'Contradicted'
                  )}
                  : {(validation.scores![label] * 100).toFixed(1)}%
                </Text>
              ))}
            </AnalysisDetailField>
          )}
          {!!validation.error && (
            <AnalysisDetailField label="error">
              <Text selectable style={commonStyles.text}>
                {validation.error}
              </Text>
            </AnalysisDetailField>
          )}
        </View>
      )}
    </View>
  );
}

/** Inline Text keeps sentences readable and selectable while peer keywords navigate locally. */
export function AnalysisSentenceText({
  text,
  entityKey,
  relatedEntityKey,
  entities,
  onSelectEntity,
  linkCurrentEntity = false,
  variant = 'title',
}: {
  text: string;
  entityKey: string;
  relatedEntityKey: string;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
  linkCurrentEntity?: boolean;
  variant?: 'title' | 'body';
}) {
  const { commonStyles } = useNotebookTheme();
  const segments = useMemo(
    () => relationSentenceSegments(text, entities, new Set([entityKey, relatedEntityKey])),
    [text, entities, entityKey, relatedEntityKey]
  );
  return (
    <Text
      selectable
      accessibilityRole={variant === 'title' ? 'header' : undefined}
      style={[
        commonStyles.text,
        variant === 'title' && styles.resultTitle,
        variant === 'title' && styles.sentenceTitle,
      ]}
    >
      {segments.map((segment, index) => {
        if (!segment.entityKey) return segment.text;
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

const verdictIcons: Record<RelationVerdict, string> = {
  supported: 'check-circle-outline',
  contradicted: 'close-circle-outline',
  neutral: 'minus-circle-outline',
  uncertain: 'help-circle-outline',
  unverified: 'clock-outline',
};

export function AnalysisVerdictBadge({ verdict }: { verdict: RelationVerdict }) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  return (
    <Chip
      compact
      mode="outlined"
      icon={verdictIcons[verdict]}
      accessibilityLabel={`${lang('Judgment')}: ${lang(relationVerdictLabels[verdict])}`}
      style={[commonStyles.resultsContainer, styles.verdictBadge]}
      textStyle={[commonStyles.text, styles.verdictText]}
    >
      {lang(relationVerdictLabels[verdict])}
    </Chip>
  );
}

/** Explain reconstruction and alternative checks separately from the model's raw probabilities. */
export function ValidationMethod({ validation }: { validation: RelationValidation }) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  if (!validation.basis) return null;
  return (
    <>
      <AnalysisDetailField label="Validation method">
        <Text style={commonStyles.text}>
          {lang(
            validation.basis === 'reconstruction'
              ? 'Source reconstruction; no independent support vote'
              : validation.basis === 'cross-note'
              ? 'Pattern from a different source text'
              : 'Source assertion check'
          )}
        </Text>
      </AnalysisDetailField>
      {validation.control && (
        <AnalysisDetailField label="Alternative check">
          <Text selectable style={commonStyles.text}>
            {validation.control.hypothesis}
          </Text>
          <Text style={commonStyles.text}>
            {validation.control.scores
              ? `${lang('Supported')}: ${(validation.control.scores.entailment * 100).toFixed(1)}%`
              : lang('Waiting for validation')}
          </Text>
        </AnalysisDetailField>
      )}
    </>
  );
}
