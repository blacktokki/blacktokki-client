import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, FlatList, Text, StyleSheet, PanResponder } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Content, NavigationParamList } from '../types';
import { useNotePages } from '../hooks/useNoteStorage';
import { createCommonStyles } from '../styles';
import { useColorScheme } from '@blacktokki/core';
import { parseHtmlToSections } from './HeaderSelectBar';
import { KeywordContent, useAddKeyowrd, useKeywords } from '../hooks/useKeywordStorage';

let _searchText = ''

type SearchContent = Content | KeywordContent

function extractHtmlLinksWithQuery(text:string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  // 모든 a 태그 선택
  const links = doc.querySelectorAll('a');

  // 이름과 주소 추출
  const matches = Array.from(links).map(a => ({
    text: a.textContent?.trim() || a.href,
    url: a.href
  }));

  return matches;
}

export function urlToNoteLink(url:string){
  const newLocation = new URL(url);
  if (location.origin  === newLocation.origin){
    const params = new URLSearchParams(newLocation.search);
    const title = params.get("title")
    const section = params.get("section") || undefined
    if (title){
      return {title, section}
    }
  }
}

export function getNoteLinks(pages:Content[]){
  return pages.flatMap(v=>extractHtmlLinksWithQuery(v.description || '').map((v2)=>{
    const noteLink = urlToNoteLink(v2.url);
    if(noteLink && v2.text !== noteLink.title /*&& v2.text.startsWith(v.title)*/){
      return {type: "_NOTELINK" as "_NOTELINK", name:v2.text, ...noteLink, origin:v.title}
    }
  }).filter(v=>v !==undefined))
}

export const getFilteredPages = (pages:Content[], searchText:string) => {
  const lowerCaseSearch = searchText.toLowerCase()
  const noteLinks = getNoteLinks(pages)
  return [
    ...pages.filter(page =>page.title.toLowerCase().startsWith(lowerCaseSearch)),
    ...noteLinks.filter(v=>v.name.toLowerCase().startsWith(lowerCaseSearch))
  ]
}

export const RandomButton = () => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data: pages = [] } = useNotePages();
  const randomPages = pages.filter(v=>v.description);
  return randomPages && <TouchableOpacity
    style={commonStyles.searchButton}
    onPress={()=>{
      const page = randomPages[Math.floor(Math.random() * randomPages.length)];
      const sections = parseHtmlToSections(page.description || '')
      navigation.navigate('NotePage', { title:page.title, section: sections[Math.floor(Math.random() * sections.length)].title });
    }}
>
  <Icon name={"random"} size={18} color="#FFFFFF" />
</TouchableOpacity>
}

export const titleFormat = (item:{title:string, section?:string}) => `${item.title}${item.section?(" ▶ "+item.section):""}`

export const SearchList = ({filteredPages, handlePagePress, addKeyword}:{filteredPages:SearchContent[], handlePagePress:(title:string, section?:string)=>void, addKeyword?:(keyword:KeywordContent)=>void})=>{
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const pagePressHandlers = useCallback((item:SearchContent)=>{
    return PanResponder.create({
      onPanResponderStart:() => {
        if (item.type === "_NOTELINK" && item.section){
          handlePagePress(item.title, item.section)
          addKeyword?.(item)
        }
        else {
          handlePagePress(item.title)
          addKeyword?.({type:"_KEYWORD", title:item.title})
        }
      }
    }).panHandlers
  }, [])

  return <FlatList
  data={filteredPages}
  keyExtractor={(item:any) => JSON.stringify([item.title, item.name, item.section])}
  renderItem={({ item }) => (
    <TouchableOpacity
      style={styles.resultItem}
      {...pagePressHandlers(item)}
    >
      <Text style={[commonStyles.text, styles.resultText]}>{item.type==="_NOTELINK"?item.name:item.title}</Text>
      {item.type ==="_NOTELINK" && <Text style={[commonStyles.text, styles.resultText, {fontSize:12}]}>{titleFormat(item)}</Text>}
    </TouchableOpacity>
  )}
  ItemSeparatorComponent={() => <View style={[commonStyles.resultSeparator]} />}
/>
}

export const SearchBar: React.FC<{handlePress?:(title:string)=>void, useRandom?:boolean;}> = ({handlePress, useRandom=true}) => {
  const [searchText, setSearchText] = useState(_searchText);
  const [showResults, setShowResults] = useState(false);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const inputRef = useRef<TextInput|null>()
  const { data:keywords = []} = useKeywords()
  const addKeyword = useAddKeyowrd()
  const { data: pages = [] } = useNotePages();
  const filteredPages:SearchContent[] = searchText.length > 0
    ? getFilteredPages(pages, searchText).slice(0, 10)
    : keywords.slice(0, 10)

  const handleSearch = () => {
    if (searchText.trim()) {
      handlePagePress(searchText.trim())
      addKeyword.mutate({type:"_KEYWORD", title:searchText.trim()})
    }
  };

  const handlePagePress = (title: string, section?:string) => {
    handlePress?handlePress(title):navigation.navigate('NotePage', { title, section });
    setSearchText('');
  };

  const searchHandlers = useMemo(()=>PanResponder.create({
      onPanResponderStart: handleSearch,
    }).panHandlers
  ,[searchText])

  useEffect(()=>{
    _searchText = searchText;
  }, [searchText])

  useFocusEffect(()=>{
    if (searchText !== _searchText){
      setSearchText(_searchText)
    }
  })

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          ref={ref=>{inputRef.current = ref}}
          style={[commonStyles.input, styles.searchInput]}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
          }}
          placeholder="검색"
          placeholderTextColor={theme === 'dark' ? '#777777' : '#999999'}
          onSubmitEditing={handleSearch}
          onFocus={()=>setShowResults(true)}
          onBlur={()=>setShowResults(false)}
        />
        <TouchableOpacity
          style={commonStyles.searchButton}
          onPress={handleSearch}
          disabled={!searchText.trim()}
        >
          <Icon name={"search"} size={18} color="#FFFFFF" />
        </TouchableOpacity>
        {useRandom && <RandomButton/>}
      </View>
      
      {showResults && (
        <View style={[styles.resultsContainer, theme === 'dark' ? styles.darkResults : styles.lightResults]}>
          {filteredPages.length > 0 ? (
            <SearchList filteredPages={filteredPages} handlePagePress={handlePagePress} addKeyword={addKeyword.mutate}/> 
          ) : searchText.trim() ? (
            <TouchableOpacity
              style={styles.resultItem}
              {...searchHandlers}
            >
              <Text style={[commonStyles.text, styles.resultText]}>
                "{searchText}" 새 노트 만들기
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: 960,
    zIndex: 999,
  },
  searchContainer: {
    flexDirection: 'row',
  },
  searchInput: {
    flex: 1,
    height: 36,
    marginBottom: 0,
    paddingVertical: 4,
    fontSize: 14,
  },
  resultsContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    maxHeight: 500,
    borderWidth: 1,
    borderRadius: 4,
    zIndex: 999,
    elevation: 5,
  },
  lightResults: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCCCCC',
  },
  darkResults: {
    backgroundColor: '#222222',
    borderColor: '#444444',
  },
  resultItem: {
    flexDirection:'row',
    justifyContent:'space-between',
    padding: 10,
  },
  resultText: {
    fontSize: 14,
  },
});
