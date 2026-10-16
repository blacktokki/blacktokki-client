import { useLangContext } from '@blacktokki/core';
import { RouteProp, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  const selected = sections.find((item) => item.key === selectedKey) || sections[0];
  return (
    <View style={[commonStyles.flex, commonStyles.backgroundView]}>
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
                style={[commonStyles.flex, key !== selected?.key && styles.hidden]}
                accessibilityElementsHidden={key !== selected?.key}
                importantForAccessibility={key === selected?.key ? 'auto' : 'no-hide-descendants'}
              >
                <Section query={query} />
              </View>
            );
          })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, gap: 8 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  hidden: { display: 'none' },
});
