import React from 'react';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { useNotePages } from '../../hooks/useNoteStorage';
import { NoteListSection } from './NoteListSection';
import { NavigationParamList } from '../../types';

const updatedOffset = new Date().getTimezoneOffset()

const updatedFormat = (_updated:string) => {
  const _date = new Date(_updated)
  _date.setMinutes(_date.getMinutes() - updatedOffset)
  const updated = _date.toISOString().slice(0, 16)
    const date = updated.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return date==today?updated.slice(11):date;
}

export const RecentPagesScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data: recentPages = [], isLoading } = useNotePages();
  return <NoteListSection 
    contents={recentPages.sort((a, b)=>new Date(b.updated).getTime() - new Date(a.updated).getTime()).map(v=>({...v, subtitle:`최근 수정: ${updatedFormat(v.updated as string)}`}))} 
    isLoading={isLoading}
    onPress={(title)=>navigation.navigate('NotePage', { title })}
    emptyMessage='최근 수정한 노트가 없습니다.'/>
};
