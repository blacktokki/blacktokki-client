import { useLangContext } from '@blacktokki/core';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import type { EntityRelationship, RelationEntityDetail } from '../relationResults';
import { relationAnalysisStyles as styles } from '../styles';
import { AnalysisPagination, currentAnalysisPage } from './AnalysisPagination';
import { RelationEvidenceSection } from './RelationEvidenceSection';

export type EntityRelationshipRow = {
  relationship: EntityRelationship;
  sentence: EntityRelationship['sentences'][number];
};

/** Group relationship evidence under a plain title, independently of evidence pagination. */
export function EntityRelationshipGroup({
  name,
  rows,
  entityKey,
  entities,
  onSelectEntity,
}: {
  name: string;
  rows: EntityRelationshipRow[];
  entityKey: string;
  entities: Map<string, RelationEntityDetail>;
  onSelectEntity: (key: string) => void;
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [page, setPage] = useState(0);
  const current = currentAnalysisPage(page, rows.length, 20);
  return (
    <View style={[commonStyles.resultsContainer, styles.evidence]}>
      <Text accessibilityRole="header" style={[commonStyles.title, styles.sectionTitle]}>
        {name}
      </Text>
      <Text style={commonStyles.smallText}>
        {lang('Validation evidence')}: {rows.length}
      </Text>
      {rows.slice(current * 20, current * 20 + 20).map(({ relationship, sentence }) => (
        <RelationEvidenceSection
          key={JSON.stringify([
            relationship.id,
            sentence.observationIndex,
            sentence.context.noteTitle,
            sentence.context.section,
            sentence.context.sectionPath,
            sentence.context.text,
          ])}
          template={relationship.template}
          {...sentence.evidence}
          entityContext={{
            entityKey,
            relatedEntityKey: sentence.relatedEntityKey,
            sourceText: sentence.context.text,
          }}
          entities={entities}
          onSelectEntity={onSelectEntity}
        />
      ))}
      <AnalysisPagination page={current} count={rows.length} size={20} onChange={setPage} />
    </View>
  );
}
