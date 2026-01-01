import { useAuthContext } from '@blacktokki/account';
import { useColorScheme, useLangContext } from '@blacktokki/core';
import { toHtml, toRaw } from '@blacktokki/editor';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo } from 'react';
import { View, Text } from 'react-native';

import { NoteListSection } from './NoteListSection';
import { ResponsiveSearchBar } from '../../components/SearchBar';
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
  const { data, isLoading, fetchNextPage, isFetchingNextPage } = useAgentSearch(query);
  const formattedContents = useMemo(() => {
    return (
      data?.pages.flat().map((res) => ({
        title: res.title,
        paragraph: res.paragraph ? toRaw(toHtml(res.paragraph)).replace(/\n/g, '') : undefined,
        subtitles: [toRaw(toHtml(res.description))], // `Score: ${(1 - res.distance).toFixed(2)}`
        id: res.id,
      })) || []
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
        onPress={(title, paragraph) => navigation.push('NotePage', { title, paragraph })}
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
