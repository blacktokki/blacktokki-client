import { useLangContext } from '@blacktokki/core';
import { toHtml, toRaw } from '@blacktokki/editor';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text } from 'react-native';

import type { SearchResult } from './oramaEngine';
import { useSearch } from './useSearch';
import { onLink, ResponsiveSearchBar } from '../../components/SearchBar';
import { useEffectExtensionScreen } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NoteListSection } from '../../screens/main/NoteListSection';
import { NavigationParamList } from '../../types';

type SearchPageRouteProp = RouteProp<{ SearchPage: { query: string } }, 'SearchPage'>;

/** Reuse previews and row objects when another result page is appended. */
const createSearchResultFormatter = () => {
  const cache = new WeakMap<
    SearchResult,
    {
      key?: string;
      id: number;
      title: string;
      paragraph?: string;
      subtitles: string[];
    }
  >();
  return (result: SearchResult) => {
    const previous = cache.get(result);
    if (previous) return previous;
    const description = toRaw(toHtml(result.description));
    const formatted = {
      key: result.key,
      id: result.id,
      title: result.title,
      paragraph: result.paragraph ? toRaw(toHtml(result.paragraph)).replace(/\n/g, '') : undefined,
      subtitles: [
        description
          .split('\n')
          .slice(0, 5)
          .map((line) => line.substring(0, 500))
          .join('\n'),
      ],
    };
    cache.set(result, formatted);
    return formatted;
  };
};

export const SearchPageScreen: React.FC = () => {
  useEffectExtensionScreen('agent');
  const route = useRoute<SearchPageRouteProp>();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { query } = route.params;
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  const { data, isLoading, fetchNextPage, isFetchingNextPage, hasNextPage } = useSearch(
    query,
    false,
    true
  );
  const formatResult = useMemo(createSearchResultFormatter, []);
  const fetchingNextPage = useRef(false);

  const formattedContents = useMemo(() => {
    return data?.pages.flatMap((page) => page.map(formatResult)) || [];
  }, [data?.pages, formatResult]);
  const onPressResult = useCallback<React.ComponentProps<typeof NoteListSection>['onPress']>(
    (title, paragraph, _, item) => {
      if (item?.link) onLink(item.link, navigation);
      else navigation.push('NotePage', { title, paragraph });
    },
    [navigation]
  );
  const onScrollEnd = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || fetchingNextPage.current) return;
    fetchingNextPage.current = true;
    fetchNextPage().finally(() => {
      fetchingNextPage.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <>
      <ResponsiveSearchBar />
      <View style={{ padding: 16, backgroundColor: commonStyles.container.backgroundColor }}>
        <Text style={commonStyles.title}>
          "{query}" {lang('Search Results')}
        </Text>
      </View>
      <NoteListSection
        contents={formattedContents}
        isLoading={isLoading}
        onPress={onPressResult}
        emptyMessage="No results found for your search."
        onScrollEnd={onScrollEnd}
      />
    </>
  );
};
