import { useLangContext } from '@blacktokki/core';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
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
  ['relations', 'Relationship list'],
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
    entityTypes: [],
    sourceOperator: 'or',
    typeOperator: 'or',
  });
  const [relationList, setRelationList] = useState<RelationListState>({
    page: 0,
    verdicts: [],
  });
  const [selectedEntity, setSelectedEntity] = useState<string | undefined>(undefined);
  const index = useMemo(
    () =>
      createRelationResultsIndex(
        analysis.entities?.entities || analysis.result?.entityExtraction?.entities || [],
        analysis.result?.candidates || [],
        analysis.entities?.details || analysis.result?.entityExtraction?.details
      ),
    [analysis.entities, analysis.result]
  );
  const entity = selectedEntity ? index.entities.get(selectedEntity) : undefined;
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
            {name === 'relations' ? ` · ${index.relations.size}` : ''}
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
          state={entityList}
          onChange={setEntityList}
          extracted={!!analysis.entities}
          validated={!!analysis.result}
          onSelectEntity={openEntity}
        />
      )}
      {tab === 'relations' && (
        <RelationListSection
          header={header}
          relations={index.relations}
          state={relationList}
          onChange={setRelationList}
          validated={!!analysis.result}
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
            validated={!!analysis.result}
            pending={analysis.status === 'running'}
          />
        ) : (
          <View style={[commonStyles.card, styles.panel, styles.empty]}>
            <Text style={[commonStyles.smallText, styles.emptyText]}>
              {lang(
                analysis.status === 'running' && !analysis.entities
                  ? 'Results will appear as analysis progresses.'
                  : selectedEntity
                  ? 'No matching analysis results.'
                  : 'Select an entity from the keyword list.'
              )}
            </Text>
          </View>
        ))}
    </View>
  );
}
