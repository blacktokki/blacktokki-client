import { useResizeContext } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';

import { NoteListSection } from './NoteListSection';
import { updatedFormat } from './RecentPageSection';
import { SearchBar } from '../../components/SearchBar';
import { useNotePage, useSnapshotPages } from '../../hooks/useNoteStorage';
import { NavigationParamList } from '../../types';

type ArchiveScreenRouteProp = RouteProp<NavigationParamList, 'Archive'>;

export const ArchiveScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<ArchiveScreenRouteProp>();
  const _window = useResizeContext();
  const title = route.params?.title;
  const { data: note } = useNotePage(title || '');
  const { data: archives = { pages: [] }, isLoading, fetchNextPage } = useSnapshotPages(note?.id);
  return (
    <>
      {_window === 'portrait' && <SearchBar />}
      <NoteListSection
        contents={archives.pages
          .flat()
          .filter((v) => title === undefined || title === v.title)
          .map((v, i) => ({
            ...v,
            subtitles: [`${updatedFormat(v.updated as string)}`],
            id: v.id || i,
          }))}
        isLoading={isLoading}
        onPress={(title, _, __, id) =>
          (title === undefined ? navigation.push : navigation.navigate)('NotePage', {
            title,
            archiveId: id,
          })
        }
        emptyMessage="There are no recently modified notes."
        onScrollEnd={fetchNextPage}
      />
    </>
  );
};
