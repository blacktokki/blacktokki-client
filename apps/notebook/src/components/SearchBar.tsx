import React, { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, FlatList, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Content, NavigationParamList } from '../types';
import { useLastPage, useNotePages, useRecentPages } from '../hooks/useNoteStorage';
import { createCommonStyles } from '../styles';
import { useColorScheme } from '@blacktokki/core';
import { NodeData, parseHtmlToSections } from './HeaderSelectBar';

let _searchText = ''

type ContentAndSection = Content & {
  section?: NodeData
}

export const SearchBar: React.FC<{handlePress?:(title:string)=>void,renderExtra?:(input:string, isFind:boolean)=>React.ReactNode}> = ({handlePress, renderExtra}) => {
  const [searchText, setSearchText] = useState(_searchText);
  const [showResults, setShowResults] = useState(false);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const route = useRoute<any>()
  const currentTitle = route.params?.title

  const { data: pages = [] } = useNotePages();
  const { data:lastPage } = useLastPage();
  const { data:recentPages = [] } = useRecentPages()
  const defaultPages = ([...(lastPage?[lastPage ]:[]), ...recentPages ]);
  const lowerCaseSearch = searchText.toLowerCase()
  const filteredPages:ContentAndSection[] = searchText.length > 0
    ? [...pages.filter(page => 
        page.title.toLowerCase().startsWith(lowerCaseSearch)
      ), ...pages.flatMap(v=>parseHtmlToSections(v.description || '').filter(v2=>v2.title.toLowerCase().startsWith(lowerCaseSearch)).map(v2=>({...v, section:v2})))].slice(0, 10)
    : [...defaultPages, ...pages.filter(v=>defaultPages.find(v2=>v2.title===v.title)===undefined)].filter(v=>v.title !== currentTitle).slice(0, 10)

  const handleSearch = () => {
    if (searchText.trim()) {
      handlePagePress(searchText.trim())
    }
  };

  const handlePagePress = (title: string, section?:string) => {
    handlePress?handlePress(title):navigation.navigate('NotePage', { title, section });
    setSearchText('');
  };

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
          style={[commonStyles.input, styles.searchInput]}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
          }}
          placeholder="검색"
          placeholderTextColor={theme === 'dark' ? '#777777' : '#999999'}
          onSubmitEditing={handleSearch}
          onFocus={()=>setShowResults(true)}
          onBlur={()=>setTimeout(()=>setShowResults(false), 166)}
        />
        <TouchableOpacity
          style={commonStyles.searchButton}
          onPress={handleSearch}
          disabled={!searchText.trim()}
        >
          <Icon name={renderExtra?"search-plus":"search"} size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      
      {showResults && (
        <View style={[styles.resultsContainer, theme === 'dark' ? styles.darkResults : styles.lightResults]}>
          {filteredPages.length > 0 ? (
            <FlatList
              data={filteredPages}
              keyExtractor={(item) => JSON.stringify([item.title, item.section?.title])}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => handlePagePress(item.title, item.section?.title)}
                >
                  <Text style={[commonStyles.text, styles.resultText]}>{item.section?item.section.title:item.title}</Text>
                  {item.section && <Text style={[commonStyles.text, styles.resultText, {fontSize:12}]}>{item.title}</Text>}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={[commonStyles.resultSeparator]} />}
            />
          ) : searchText.trim() ? (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={handleSearch}
            >
              <Text style={[commonStyles.text, styles.resultText]}>
                "{searchText}" 새 노트 만들기
              </Text>
            </TouchableOpacity>
          ) : null}
          {renderExtra?.(searchText, filteredPages.length > 0)}
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
