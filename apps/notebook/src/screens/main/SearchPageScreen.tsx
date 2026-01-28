import { useAuthContext } from '@blacktokki/account';
import { useColorScheme, useLangContext } from '@blacktokki/core';
import { toHtml, toRaw } from '@blacktokki/editor';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo } from 'react';
import { View, Text } from 'react-native';

import { NoteListSection } from './NoteListSection';
import { onLink, ResponsiveSearchBar, titleFormat } from '../../components/SearchBar';
import { useAgentSearch } from '../../hooks/useAgentSearch';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type SearchPageRouteProp = RouteProp<NavigationParamList, 'SearchPage'>;

export const SearchPageScreen: React.FC = () => {
  const route = useRoute<SearchPageRouteProp>();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { query } = route.params;
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { lang } = useLangContext();
  const { auth } = useAuthContext();
  const { data, isLoading, fetchNextPage, isFetchingNextPage } = useAgentSearch(query, false, true);
  const formattedContents = useMemo(() => {
    return (
      data?.pages.flat().map((res) => {
        const description = toRaw(toHtml(res.description));
        return {
          title: res.link ? res.link.text : res.title,
          paragraph: res.paragraph ? toRaw(toHtml(res.paragraph)).replace(/\n/g, '') : undefined,
          subtitles: [
            ...(res.link
              ? [titleFormat({ title: res.link.origin, paragraph: res.link.url }), ' ']
              : []),
            res.link
              ? description
                  .split('\n')
                  .slice(0, 5)
                  .map((v) => v.substring(0, 500))
                  .join('\n')
              : description,
          ], // `Score: ${(1 - res.distance).toFixed(2)}`
          link: res.link?.url,
        };
      }) || []
    );
  }, [data]);

  useEffect(() => {
    if (auth.isLocal) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Home');
      }
    }
  }, [auth.isLocal, navigation]);

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
