import { useLangContext } from '@blacktokki/core';
import { toHtml, toRaw } from '@blacktokki/editor';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';

import { useSearch } from './useSearch';
import { onLink, ResponsiveSearchBar } from '../../components/SearchBar';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NoteListSection } from '../../screens/main/NoteListSection';
import { NavigationParamList } from '../../types';

type SearchPageRouteProp = RouteProp<{ SearchPage: { query: string } }, 'SearchPage'>;

export const SearchPageScreen: React.FC = () => {
  const route = useRoute<SearchPageRouteProp>();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { query } = route.params;
  const { commonStyles } = useNotebookTheme();
  const { lang } = useLangContext();
  const { data, isLoading, fetchNextPage, isFetchingNextPage } = useSearch(query, false, true);

  const formattedContents = useMemo(() => {
    return (
      data?.pages.flat().map((res) => {
        const description = toRaw(toHtml(res.description));
        return {
          title: res.title,
          paragraph: res.paragraph ? toRaw(toHtml(res.paragraph)).replace(/\n/g, '') : undefined,
          subtitles: [
            description
              .split('\n')
              .slice(0, 5)
              .map((v) => v.substring(0, 500))
              .join('\n'),
          ],
        };
      }) || []
    );
  }, [data]);

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
        onPress={(title, paragraph, _, item) => {
          if (item?.link) {
            onLink(item.link, navigation);
          } else {
            navigation.push('NotePage', { title, paragraph });
          }
        }}
        emptyMessage="No results found for your search."
        onScrollEnd={() => {
          if (!isFetchingNextPage) {
            fetchNextPage();
          }
        }}
      />
    </>
  );
};
