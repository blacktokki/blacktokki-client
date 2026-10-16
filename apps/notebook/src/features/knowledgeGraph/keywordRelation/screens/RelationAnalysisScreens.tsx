import { useLangContext } from '@blacktokki/core';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { AnalysisProgressSection } from './AnalysisProgressSection';
import { RelationResultsSection } from './RelationResultsSection';
import LoadingView from '../../../../components/LoadingView';
import { ResponsiveSearchBar } from '../../../../components/SearchBar';
import { useEffectExtensionScreen } from '../../../../hooks/useExtension';
import { useNotebookTheme } from '../../../../hooks/useNotebookTheme';
import { KnowledgeGraphNavToolbar } from '../../components/KnowledgeGraphNavToolbar';
import { AnalysisAction } from '../components/AnalysisAction';
import { relationAnalysisStyles as styles } from '../styles';
import { useRelationAnalysisSession } from '../useRelationAnalysisSession';

/** Display the shared session while preserving tab selections during source-note visits. */
function RelationAnalysisWorkspace({
  data,
  analysis,
}: {
  data: ReturnType<typeof useRelationAnalysisSession>['data'];
  analysis: ReturnType<typeof useRelationAnalysisSession>['analysis'];
}) {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollView | null>(null);
  const workspaceOffset = useRef(0);
  const resultsOffset = useRef(0);
  const contentStyle = useMemo(() => {
    const style: ViewStyle = { ...StyleSheet.flatten(commonStyles.container) };
    delete style.flex;
    return style;
  }, [commonStyles]);
  return (
    <ScrollView
      ref={scroll}
      style={commonStyles.backgroundView}
      contentContainerStyle={[contentStyle, styles.content, width < 600 && styles.compact]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={styles.workspace}
        onLayout={(event) => {
          workspaceOffset.current = event.nativeEvent.layout.y;
        }}
      >
        {data.notes.isError && (
          <View style={[commonStyles.card, styles.panel]}>
            <Text accessibilityRole="alert" style={commonStyles.text}>
              {lang('Could not load notes.')}
            </Text>
            <AnalysisAction
              label="Retry"
              icon="refresh"
              onPress={() => {
                data.notes.refetch();
              }}
            />
          </View>
        )}
        <AnalysisProgressSection
          analysis={analysis}
          scope={data.scope}
          noteCount={data.notes.data?.length || 0}
          loading={data.notes.isFetching}
          ready={data.available && !data.notes.isError}
          refresh={() => {
            data.notes.refetch();
          }}
        />
        {data.notes.data?.length === 0 && (
          <Text style={commonStyles.smallText}>{lang('There are no notes.')}</Text>
        )}
        <View
          onLayout={(event) => {
            resultsOffset.current = event.nativeEvent.layout.y;
          }}
        >
          <RelationResultsSection
            analysis={analysis}
            onNavigate={() => {
              requestAnimationFrame(() =>
                scroll.current?.scrollTo({
                  y: workspaceOffset.current + resultsOffset.current,
                  animated: true,
                })
              );
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

/** Observe the background job without interrupting it when navigating between screens. */
export function RelationAnalysisScreen() {
  const { isActive, isReady } = useEffectExtensionScreen('knowledgeGraph');
  const focused = useIsFocused();
  const { data, analysis } = useRelationAnalysisSession(isActive && isReady);
  const { refetch } = data.notes;
  useEffect(() => {
    if (focused && isActive && isReady && data.available) refetch();
  }, [focused, isActive, isReady, data.available, data.scope, refetch]);
  const { commonStyles } = useNotebookTheme();
  return (
    <View style={commonStyles.flex}>
      <ResponsiveSearchBar />
      <KnowledgeGraphNavToolbar view="relations" />
      {!isReady ? (
        <LoadingView />
      ) : isActive ? (
        <RelationAnalysisWorkspace key={data.scope} data={data} analysis={analysis} />
      ) : null}
    </View>
  );
}
