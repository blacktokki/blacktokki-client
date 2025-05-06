import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useNotePages } from '../../hooks/useNoteStorage';
import { NoteListSection } from './NoteListSection';
import { parseHtmlToSections } from '../../components/HeaderSelectBar';
import { sectionDescription } from './NotePageScreen';

function findEmptyLists(html: string): string[] {
  const regex = /<(ol|ul)\b[^>]*>([\s\n\r]*)<\/\1>/gi;
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    matches.push(match[0]); // 전체 태그를 반환
  }

  return matches;
}

export const EmptyContentsScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data: pages = [], isLoading } = useNotePages();
  const data = pages.flatMap(v=>{
    const paragraph = parseHtmlToSections(v.description || '')
    const emptyParagraph = paragraph.filter(v2=>v2.level!==0 && sectionDescription(paragraph, v2.title, false).trim() === "")
    const emptyList = paragraph.filter(v2=>findEmptyLists(v2.description).length > 0)
    return [
      ...emptyParagraph.map(v2=>({title:v.title, section:v2.level===0?undefined:v2.title, subtitle:'Empty section'})),
      ...emptyList.map(v2=>({title:v.title, section:v2.level===0?undefined:v2.title, subtitle:'Empty list'}))
    ]
  })
  return <NoteListSection 
    contents={data}
    onPress={(title)=>navigation.navigate('EditPage', { title })}
    isLoading={isLoading}
    emptyMessage='작성이 필요한 내용이 없습니다.'/>
};
