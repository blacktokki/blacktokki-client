import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useNotePages } from '../../hooks/useNoteStorage';
import { NoteListSection } from './NoteListSection';
import { getNoteLinks } from '../../components/SearchBar';
import { parseHtmlToSections } from '../../components/HeaderSelectBar';
import { getSplitTitle } from './NotePageScreen';

export const EmptyPagesScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data: pages = [], isLoading } = useNotePages();
  const unknownData = getNoteLinks(pages).filter((v)=>{
    const page = pages.find(v2=>v2.title===v.title)
    if (page?.description){
      if (v.section === undefined || parseHtmlToSections(page.description).find(v2=>v2.title === v.section)){
        return false;
      }
    }
    return true;
  }).map(v=>({...v, subtitle:(v.section===undefined?'Unknown note link':'Unknown section link') + `(${v.origin})`}))
  const emptyParentData = pages.map(v=>{
    const splitTitle = getSplitTitle(v.title)
    if (v.description && splitTitle.length === 2 && pages.find(v=>v.title===splitTitle[0]) === undefined){
      return { title:splitTitle[0], subtitle: `Empty parent note(${v.title})`}
    }
    return undefined
  }).filter(v=>v!==undefined)
  return <NoteListSection
    contents={[...unknownData, ...emptyParentData]}
    onPress={(title)=>navigation.navigate('EditPage', { title })}
    isLoading={isLoading}
    emptyMessage='작성이 필요한 노트가 없습니다.'/>
};
