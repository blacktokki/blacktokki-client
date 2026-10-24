import { useLangContext } from '@blacktokki/core';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { groupRelationCandidatesByRolePair } from '../relationPresentation';
import { createRelationResultsIndex } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import type { useRelationAnalysis } from '../useRelationAnalysis';
import { EntityDetailSection } from './EntityDetailSection';
import { EntityKeywordsSection, EntityKeywordsState } from './EntityKeywordsSection';
import { RelationListSection, RelationListState } from './RelationListSection';

type Tab = 'entities' | 'entity' | 'relations';
const tabs = [
  ['entities', 'Keyword'],
  ['entity', 'Entity'],
  ['relations', 'Associations'],
] as const;

/** Keep each selection independent of list search so linked names can always open their details. */
export function RelationResultsSection({
  analysis,
  onNavigate,
}: {
  analysis: ReturnType<typeof useRelationAnalysis>;
  onNavigate?: () => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [tab, setTab] = useState<Tab>('entities');
  const [entityList, setEntityList] = useState<EntityKeywordsState>({
    query: '',
    page: 0,
    sourceTypes: [],
    entityPatterns: [],
    entityTypes: [],
    keywordCompositions: [],
    sourceOperator: 'or',
    patternOperator: 'or',
    typeOperator: 'or',
    compositionOperator: 'or',
  });
  const [relationList, setRelationList] = useState<RelationListState>({
    page: 0,
    associationTypes: [],
    aggregationKinds: [],
    groupingKinds: [],
    evidenceSatisfiedOnly: false,
    associationOperator: 'or',
    aggregationOperator: 'or',
    groupingOperator: 'or',
  });
  const [selectedEntity, setSelectedEntity] = useState<string | undefined>(undefined);
  const index = useMemo(
    () =>
      createRelationResultsIndex(
        analysis.entities?.entities || analysis.result?.entityExtraction?.entities || [],
        analysis.result?.candidates || [],
        analysis.entities?.details || analysis.result?.entityExtraction?.details,
        analysis.entities?.entityTypes || analysis.result?.entityExtraction?.entityTypes
      ),
    [analysis.entities, analysis.result]
  );
  const entity = selectedEntity ? index.entities.get(selectedEntity) : undefined;
  const { associationTypes, aggregationKinds, associationOperator, aggregationOperator } =
    relationList;
  const candidates = analysis.result?.candidates;
  const groupCount = useMemo(
    () =>
      groupRelationCandidatesByRolePair(candidates ?? [], {
        associationTypes,
        aggregationKinds,
        associationOperator,
        aggregationOperator,
      }).length,
    [candidates, associationTypes, aggregationKinds, associationOperator, aggregationOperator]
  );
  const openEntity = (key: string) => {
    setSelectedEntity(key);
    setTab('entity');
    onNavigate?.();
  };
  const header = (
    <View style={styles.wrap}>
      {tabs.map(([name, label]) => (
        <Pressable
          key={name}
          accessibilityRole="tab"
          accessibilityLabel={lang(label)}
          accessibilityState={{ selected: tab === name }}
          onPress={() => setTab(name)}
          style={[tab === name ? commonStyles.activeTab : commonStyles.inactiveTab, styles.tab]}
        >
          <Text style={commonStyles.text}>
            {lang(label)}
            {name === 'entities' ? ` · ${index.entities.size}` : ''}
            {name === 'relations' ? ` · ${groupCount}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={styles.section}>
      {tab === 'entities' && (
        <EntityKeywordsSection
          header={header}
          entities={index.entities}
          entityTypeLabels={index.entityTypeLabels}
          state={entityList}
          onChange={setEntityList}
          extracted={!!analysis.entities}
          analyzed={!!analysis.result}
          onSelectEntity={openEntity}
        />
      )}
      {tab === 'relations' && (
        <RelationListSection
          header={header}
          relations={index.relations}
          state={relationList}
          onChange={setRelationList}
          analyzed={!!analysis.result}
          pending={analysis.status === 'running'}
          entities={index.entities}
          onSelectEntity={openEntity}
        />
      )}
      {tab === 'entity' && <View style={[commonStyles.card, styles.panel]}>{header}</View>}
      {tab === 'entity' &&
        (entity ? (
          <EntityDetailSection
            key={entity.key}
            entity={entity}
            entities={index.entities}
            onSelectEntity={openEntity}
            analyzed={!!analysis.result}
            pending={analysis.status === 'running'}
          />
        ) : (
          <View style={[commonStyles.card, styles.panel, styles.empty]}>
            <Text style={[commonStyles.smallText, styles.emptyText]}>
              {lang(
                analysis.status === 'running' && !analysis.entities
                  ? 'Analysis in progress'
                  : selectedEntity
                  ? 'No search results.'
                  : 'Select an entity from the keyword list.'
              )}
            </Text>
          </View>
        ))}
    </View>
  );
}
