import { useLangContext } from '@blacktokki/core';
import { RouteProp, useRoute } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import LoadingView from '../../components/LoadingView';
import { ResponsiveSearchBar } from '../../components/SearchBar';
import { useExtension } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import type { NavigationParamList } from '../../types';

/** Search extensions supply lazy sections; visited tabs remain mounted during source navigation. */
export function SearchScreen() {
  const { params } = useRoute<RouteProp<NavigationParamList, 'SearchPage'>>();
  const query = params?.query ?? '';
  const { data: extension, isLoading } = useExtension();
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  const sections = extension.info.filter(
    (item) => item.active && extension.feature.search[item.key]
  );
  const [selectedKey, setSelectedKey] = useState<string>();
  const [visited, setVisited] = useState<string[]>([]);
  const scrollEndHandlers = useRef(new Map<string, () => void>());
  const selected = sections.find((item) => item.key === selectedKey) || sections[0];
  return (
    <ScrollView
      style={[commonStyles.flex, commonStyles.backgroundView]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={({ nativeEvent: { contentSize, contentOffset, layoutMeasurement } }) => {
        if (contentSize.height - layoutMeasurement.height - contentOffset.y < 1 && selected)
          scrollEndHandlers.current.get(selected.key)?.();
      }}
    >
      <ResponsiveSearchBar />
      <View style={styles.header}>
        <Text style={commonStyles.title}>
          {query ? `"${query}" ${lang('Search Results')}` : lang('Search')}
        </Text>
        {!!query && (
          <View style={styles.tabs}>
            {sections.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityLabel={lang(item.title)}
                accessibilityState={{ selected: item.key === selected?.key }}
                style={[
                  item.key === selected?.key ? commonStyles.activeTab : commonStyles.inactiveTab,
                  styles.tab,
                ]}
                onPress={() => {
                  setVisited((keys) => [
                    ...new Set([...keys, ...(selected ? [selected.key] : []), item.key]),
                  ]);
                  setSelectedKey(item.key);
                }}
              >
                <Text style={commonStyles.text}>{lang(item.title)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {!query ? (
        <Text style={[commonStyles.smallText, styles.header]}>
          {lang('Enter a keyword to search.')}
        </Text>
      ) : isLoading ? (
        <LoadingView />
      ) : !sections.length ? (
        <Text style={[commonStyles.smallText, styles.header]}>
          {lang('No search extensions enabled.')}
        </Text>
      ) : (
        sections
          .filter((item) => item.key === selected?.key || visited.includes(item.key))
          .map(({ key }) => {
            const { Section } = extension.feature.search[key];
            return (
              <View
                key={key}
                style={key !== selected?.key && styles.hidden}
                accessibilityElementsHidden={key !== selected?.key}
                importantForAccessibility={key === selected?.key ? 'auto' : 'no-hide-descendants'}
              >
                <Section
                  query={query}
                  registerScrollEnd={(handler) => {
                    if (handler) scrollEndHandlers.current.set(key, handler);
                    else scrollEndHandlers.current.delete(key);
                  }}
                />
              </View>
            );
          })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  header: { padding: 16, gap: 8 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  hidden: { display: 'none' },
});
