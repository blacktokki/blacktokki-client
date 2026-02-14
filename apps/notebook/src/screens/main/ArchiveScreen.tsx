import { useColorScheme } from '@blacktokki/core';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View } from 'react-native';

import { NoteListSection } from './NoteListSection';
import { TitleHeader } from './RecentPageSection';
import { updatedFormat } from './home/ContentGroupSection';
import { ResponsiveSearchBar } from '../../components/SearchBar';
import { useExtension } from '../../hooks/useExtension';
import { useNotePage, useSnapshotPages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

type ArchiveScreenRouteProp = RouteProp<NavigationParamList, 'Archive'>;

export const ArchiveScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<ArchiveScreenRouteProp>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const { data: extension } = useExtension();
  const title = route.params?.title;
  const { data: note } = useNotePage(title || '');
  const { data: archives = { pages: [] }, isLoading, fetchNextPage } = useSnapshotPages(note?.id);
  return (
    <>
      <ResponsiveSearchBar />
      <View
        style={{
          paddingTop: commonStyles.container.paddingVertical,
          paddingHorizontal: commonStyles.container.paddingHorizontal,
        }}
      >
        <TitleHeader title={title}>
          {title &&
            note?.id &&
            extension.feature.extraArchiveButtons.map((Button, i) => (
              <Button key={i} title={title} id={note.id} />
            ))}
        </TitleHeader>
      </View>
      <NoteListSection
        contents={archives.pages
          .flat()
          .filter((v) => title === undefined || title === v.title)
          .map((v, i) => ({
            ...v,
            subtitles: [
              `${updatedFormat(v.updated as string)}`,
              ...(v.option.PAT_DESCRIPTION ? [`PAT: ${v.option.PAT_DESCRIPTION}`] : []),
            ],
            id: v.id || i,
          }))}
        isLoading={isLoading}
        onPress={(title, _, __, item) =>
          (title === undefined ? navigation.push : navigation.navigate)('NotePage', {
            title,
            archiveId: item?.id,
          })
        }
        emptyMessage="There are no recently modified notes."
        onScrollEnd={fetchNextPage}
      />
    </>
  );
};
