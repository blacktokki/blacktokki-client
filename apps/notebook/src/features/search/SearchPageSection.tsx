import { toHtml, toRaw } from '@blacktokki/editor';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo } from 'react';

import { useSearch } from './useSearch';
import { onLink } from '../../components/SearchBar';
import type { SearchSectionProps } from '../../hooks/useExtension';
import { NoteListSection } from '../../screens/main/NoteListSection';
import { NavigationParamList } from '../../types';

export const SearchPageSection: React.FC<SearchSectionProps> = ({ query, registerScrollEnd }) => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data, isLoading, fetchNextPage, isFetchingNextPage, hasNextPage } = useSearch(
    query,
    false,
    true
  );
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  useEffect(() => {
    registerScrollEnd?.(loadMore);
    return () => registerScrollEnd?.();
  }, [loadMore, registerScrollEnd]);

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
      scrollEnabled={false}
    />
  );
};
