import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useNotePages } from '../../hooks/useNoteStorage';
import { NoteListSection } from './NoteListSection';
import { getNoteLinks } from '../../components/SearchBar';
import { parseHtmlToSections } from '../../components/HeaderSelectBar';

export const EmptyPagesScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data: pages = [], isLoading } = useNotePages();
  const data = getNoteLinks(pages).filter((v)=>{
    const page = pages.find(v2=>v2.title===v.title)
    if (page?.description){
      if (v.section === undefined || parseHtmlToSections(page.description).find(v2=>v2.title === v.section)){
        return false;
      }
    }
    return true;
  })
  return <NoteListSection
    contents={data.map(v=>({...v, subtitle:v.section===undefined?'Empty note':'Empty section'}))}
    onPress={(title)=>navigation.navigate('EditPage', { title })}
    isLoading={isLoading}
    emptyMessage='작성이 필요한 노트가 없습니다.'/>
};
