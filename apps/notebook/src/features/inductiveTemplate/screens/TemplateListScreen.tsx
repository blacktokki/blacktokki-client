import { useLangContext } from '@blacktokki/core';
import { toHtml } from '@blacktokki/editor';
import { push } from '@blacktokki/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Icon } from 'react-native-paper';

import LoadingView from '../../../components/LoadingView';
import { ResponsiveSearchBar } from '../../../components/SearchBar';
import UsageButton from '../../../components/UsageButton';
import { useEffectExtensionScreen } from '../../../hooks/useExtension';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { TemplateChoice } from '../components/TemplateChoice';
import { discoverTemplates } from '../discovery';
import { extractStructure } from '../inference';
import { templateStyles as styles } from '../styles';
import { groupSimilarTemplates } from '../templateSimilarity';
import { TemplateCandidate } from '../types';
import { useInductiveTemplates } from '../useInductiveTemplates';

const TemplateList = ({ data }: { data: ReturnType<typeof useInductiveTemplates> }) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { examples, notebookRoots } = data;
  const [candidates, setCandidates] = useState<TemplateCandidate[]>();
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewportWidth, setViewportWidth] = useState(0);
  const contentStyle = useMemo(() => {
    const style: ViewStyle = { ...StyleSheet.flatten(commonStyles.container) };
    delete style.flex;
    return style;
  }, [commonStyles]);
  useEffect(() => {
    if (!examples.data) return;
    setWorking(true);
    const timer = setTimeout(() => {
      try {
        setCandidates(discoverTemplates(examples.data!, lang('Date'), notebookRoots));
      } catch {
        setCandidates([]);
        setNotice(lang('Could not discover templates.'));
      } finally {
        setWorking(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [examples.data, examples.dataUpdatedAt, lang, notebookRoots]);
  const discovering =
    working || examples.isFetching || (!examples.isError && candidates === undefined);
  const busy = discovering;
  const groups = useMemo(() => groupSimilarTemplates(candidates || [], toHtml), [candidates]);
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
      disabled={busy}
      highlightBorder={false}
      style={standalone ? [commonStyles.card, styles.panel] : undefined}
      onPress={() => push('TemplateItem', { template })}
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
    <ScrollView
      style={[
        commonStyles.backgroundView,
        { backgroundColor: commonStyles.container.backgroundColor },
      ]}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      contentContainerStyle={[
        contentStyle,
        styles.content,
        viewportWidth < 600 && styles.compactContent,
      ]}
    >
      <View style={styles.workspace}>
        <UsageButton compact paragraph={'🧩 ' + lang('Extracted Templates')} />
        {!!notice && (
          <Text accessibilityRole="alert" style={[commonStyles.text, styles.notice]}>
            {notice}
          </Text>
        )}
        <View style={styles.section} accessibilityState={{ busy: discovering }}>
          {examples.isError && (
            <Text accessibilityRole="alert" style={commonStyles.text}>
              {lang('Could not load notes.')}
            </Text>
          )}
          <View style={styles.row}>
            <Text style={[commonStyles.title, styles.title]}>{lang('Discovered templates')}</Text>
            <Text style={[commonStyles.smallText, commonStyles.resultsContainer, styles.badge]}>
              {discovering ? '…' : count}
            </Text>
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
                    accessibilityLabel={
                      lang('Discovered templates') + ': ' + group.templates.length
                    }
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
          {!discovering && !examples.isLoading && !examples.isError && !groups.length && (
            <View style={[commonStyles.card, styles.panel, styles.empty]}>
              <Icon source="file-document-outline" size={40} color={commonStyles.smallText.color} />
              <Text style={[commonStyles.smallText, styles.emptyText]}>
                {lang(
                  'No templates found. Templates appear when at least two notes share similar headings, fields or tables.'
                )}
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

/** The template catalog owns discovery and opens each selected template in its own screen. */
export const TemplateListScreen = () => {
  const { isActive, isReady } = useEffectExtensionScreen('inductiveTemplate');
  const data = useInductiveTemplates();
  const { commonStyles } = useNotebookTheme();
  return (
    <View style={commonStyles.flex}>
      <ResponsiveSearchBar />
      {!isReady || !data.enabled ? (
        <LoadingView />
      ) : isActive ? (
        <TemplateList key={data.scope} data={data} />
      ) : null}
    </View>
  );
};
