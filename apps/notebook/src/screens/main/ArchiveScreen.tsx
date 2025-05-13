import React from 'react';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSnapshotPages } from '../../hooks/useNoteStorage';
import { NoteListSection } from './NoteListSection';
import { NavigationParamList } from '../../types';
import { updatedFormat } from './RecentPageSection';

type ArchiveScreenRouteProp = RouteProp<NavigationParamList, 'Archive'>;

export const ArchiveScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const route = useRoute<ArchiveScreenRouteProp>()
  const { title } = route.params
  const { data: recentPages = [], isLoading } = useSnapshotPages();
  return <NoteListSection 
    contents={recentPages.filter(v=>title===undefined || title===v.title).sort((a, b)=>new Date(b.updated).getTime() - new Date(a.updated).getTime()).map(v=>({...v, subtitle:`최근 수정: ${updatedFormat(v.updated as string)}`}))} 
    isLoading={isLoading}
    onPress={(title, _, id)=>navigation.navigate('NotePage', { title, archiveId:id })}
    emptyMessage='최근 수정한 노트가 없습니다.'/>
};
