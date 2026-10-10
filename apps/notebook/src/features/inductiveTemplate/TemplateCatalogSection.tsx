import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { TemplateChoice } from './TemplateChoice';
import { extractStructure } from './inference';
import { templateStyles as styles } from './styles';
import { SimilarTemplateGroup } from './templateSimilarity';
import { TemplateCandidate } from './types';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

export const TemplateCatalogSection = ({
  groups,
  disabled,
  loading,
  criteria,
  onSelect,
}: {
  groups: SimilarTemplateGroup[];
  disabled: boolean;
  loading: boolean;
  criteria: React.ReactNode;
  onSelect: (template: TemplateCandidate) => void;
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const outlines = useMemo(
    () =>
      new Map(
        groups.flatMap((group) =>
          group.templates.map((template) => [
            template.markdown,
            extractStructure({ title: '{{ title }}', description: toHtml(template.markdown) })
              .filter((block) => block.label && !block.label.includes('{{'))
              .slice(0, 3),
          ])
        )
      ),
    [groups]
  );
  const count = groups.reduce((total, group) => total + group.templates.length, 0);
  const renderTemplate = (template: TemplateCandidate, standalone = false) => (
    <TemplateChoice
      key={JSON.stringify([template.markdown, template.sourceTitles])}
      label={lang('Preview template') + ': ' + template.name}
      disabled={disabled}
      style={standalone ? [commonStyles.card, styles.panel] : undefined}
      onPress={() => onSelect(template)}
    >
      <View style={styles.row}>
        <View style={[commonStyles.backgroundContainer, styles.iconTile]}>
          <Icon source="file-document-outline" color={commonStyles.text.color} size={20} />
        </View>
        <View style={styles.grow}>
          <Text style={[commonStyles.text, styles.choiceTitle]} numberOfLines={2}>
            {template.name}
          </Text>
          <Text
            style={[commonStyles.smallText, styles.label]}
            accessibilityLabel={lang('Similar notes') + ': ' + template.sourceTitles.length}
          >
            {'▤ ' + template.sourceTitles.length}
          </Text>
        </View>
        <Icon source="chevron-right" color={commonStyles.smallText.color} size={18} />
      </View>
      <View style={styles.outline}>
        {outlines.get(template.markdown)?.map((block) => (
          <Text
            key={block.id}
            style={[commonStyles.smallText, styles.outlineText]}
            numberOfLines={1}
          >
            {block.kind === 'date'
              ? '◷  ' + lang('Date')
              : (block.kind === 'heading' ? '#  ' : block.kind === 'table' ? '▦  ' : '·  ') +
                block.label}
          </Text>
        ))}
      </View>
    </TemplateChoice>
  );
  return (
    <View style={styles.section} accessibilityState={{ busy: loading }}>
      <View style={[styles.wrap, styles.between]}>
        <View style={styles.row}>
          <Text style={[commonStyles.title, styles.title]}>{lang('Discovered templates')}</Text>
          <Text style={[commonStyles.smallText, commonStyles.resultsContainer, styles.badge]}>
            {loading ? '…' : count}
          </Text>
        </View>
        {criteria}
      </View>
      {groups.map((group) =>
        group.templates.length === 1 ? (
          renderTemplate(group.templates[0], true)
        ) : (
          <View
            key={JSON.stringify([group.templates[0].markdown, group.templates[0].sourceTitles])}
            style={[commonStyles.card, styles.panel, styles.catalogGroup]}
          >
            <View style={[styles.row, styles.between]}>
              <Text
                accessibilityLabel={lang('Discovered templates') + ': ' + group.templates.length}
                style={[commonStyles.smallText, styles.label]}
              >
                {'▦ ' + group.templates.length}
              </Text>
              {group.similarity !== null && (
                <Text
                  style={[commonStyles.smallText, commonStyles.resultsContainer, styles.badge]}
                  accessibilityLabel={
                    lang('Similarity') + ': ' + Math.round(group.similarity * 100) + '%'
                  }
                >
                  {'≈ ' + Math.round(group.similarity * 100) + '%'}
                </Text>
              )}
            </View>
            {group.templates.map((template) => renderTemplate(template))}
          </View>
        )
      )}
    </View>
  );
};
