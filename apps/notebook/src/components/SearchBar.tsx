import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, FlatList, Text, StyleSheet } from 'react-native';
//@ts-ignore
import Icon from 'react-native-vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../types';
import { useWikiPages } from '../hooks/useWikiStorage';
import { createCommonStyles } from '../styles';
import { useColorScheme } from '@blacktokki/core';

export const SearchBar: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [showResults, setShowResults] = useState(false);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  
  const { data: pages = [] } = useWikiPages();
  
  const filteredPages = searchText.length > 0
    ? pages.filter(page => 
        page.title.toLowerCase().includes(searchText.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSearch = () => {
    if (searchText.trim()) {
      navigation.navigate('WikiPage', { title: searchText.trim() });
      setSearchText('');
      setShowResults(false);
    }
  };

  const handlePagePress = (title: string) => {
    navigation.navigate('WikiPage', { title });
    setSearchText('');
    setShowResults(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={[commonStyles.input, styles.searchInput]}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
            setShowResults(text.length > 0);
          }}
          placeholder="문서 검색"
          placeholderTextColor={theme === 'dark' ? '#777777' : '#999999'}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={handleSearch}
          disabled={!searchText.trim()}
        >
          <Icon name="search" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      
      {showResults && (
        <View style={[styles.resultsContainer, theme === 'dark' ? styles.darkResults : styles.lightResults]}>
          {filteredPages.length > 0 ? (
            <FlatList
              data={filteredPages}
              keyExtractor={(item) => item.title}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => handlePagePress(item.title)}
                >
                  <Text style={[commonStyles.text, styles.resultText]}>{item.title}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          ) : searchText.trim() ? (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={handleSearch}
            >
              <Text style={[commonStyles.text, styles.resultText]}>
                "{searchText}" 새 문서 만들기
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
    minWidth: 250,
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
  searchButton: {
    backgroundColor: '#3498DB',
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  resultsContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    maxHeight: 200,
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
    padding: 10,
  },
  resultText: {
    fontSize: 14,
  },
  separator: {
    height: 1,
    backgroundColor: '#EEEEEE',
  },
});
