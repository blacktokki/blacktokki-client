import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';

import { useSnapshotPages } from '../../hooks/useNoteStorage';
import { NavigationParamList } from '../../types';
import { NoteListSection } from './NoteListSection';
import { updatedFormat } from './RecentPageSection';

type ArchiveScreenRouteProp = RouteProp<NavigationParamList, 'Archive'>;

export const ArchiveScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<ArchiveScreenRouteProp>();
  const title = route.params?.title;
  const { data: recentPages = [], isLoading } = useSnapshotPages();
  return (
    <NoteListSection
      contents={recentPages
        .filter((v) => title === undefined || title === v.title)
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
        .map((v, i) => ({
          ...v,
          subtitle: `최근 수정: ${updatedFormat(v.updated as string)}`,
          id: v.id || i,
        }))}
      isLoading={isLoading}
      onPress={(title, _, id) =>
        (title === undefined ? navigation.push : navigation.navigate)('NotePage', {
          title,
          archiveId: id,
        })
      }
      emptyMessage="최근 수정한 노트가 없습니다."
    />
  );
};
