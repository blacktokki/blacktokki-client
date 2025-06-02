import { useColorScheme, useLangContext, View, Text } from '@blacktokki/core';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, TouchableOpacity, FlatList, StyleSheet, PanResponder } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { KeywordContent, useAddKeyowrd, useKeywords } from '../hooks/useKeywordStorage';
import { useNotePages } from '../hooks/useNoteStorage';
import { createCommonStyles } from '../styles';
import { Content, NavigationParamList } from '../types';
import { parseHtmlToParagraphs } from './HeaderSelectBar';

let _searchText = '';

type SearchContent = Content | KeywordContent;

function extractHtmlLinksWithQuery(text: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  // 모든 a 태그 선택
  const links = doc.querySelectorAll('a');

  // 이름과 주소 추출
  const matches = Array.from(links).map((a) => ({
    text: a.textContent?.trim() || a.href,
    url: a.href,
  }));

  return matches;
}

function urlToNoteLink(url: string) {
  const newLocation = new URL(url);
  if (location.origin === newLocation.origin) {
    const params = new URLSearchParams(newLocation.search);
    const title = params.get('title');
    const paragraph = params.get('paragraph') || params.get('section') || undefined;
    if (title) {
      return { title, paragraph };
    }
  }
}

export function onLink(url: string, navigation: StackNavigationProp<NavigationParamList>) {
  const noteLink = urlToNoteLink(url);
  if (noteLink) {
    navigation.push('NotePage', noteLink);
  } else {
    window.open(url, '_blank');
  }
}

export function getLinks(pages: Content[], sameTitle?: boolean) {
  return pages
    .flatMap((v) =>
      extractHtmlLinksWithQuery(v.description || '').map((v2) => {
        const noteLink = urlToNoteLink(v2.url);
        if (noteLink) {
          if (sameTitle || v2.text !== noteLink.title) {
            return {
              type: '_NOTELINK' as '_NOTELINK',
              name: v2.text,
              ...noteLink,
              origin: v.title,
            };
          }
          return undefined;
        }
        return { type: '_LINK' as '_LINK', url: v2.url, name: v2.text, origin: v.title };
      })
    )
    .filter((v) => v !== undefined);
}

export const getFilteredPages = (pages: Content[], searchText: string) => {
  const lowerCaseSearch = searchText.toLowerCase().normalize('NFKD');
  const links = getLinks(pages);
  return [
    ...pages.filter((page) =>
      page.title.toLowerCase().normalize('NFKD').startsWith(lowerCaseSearch)
    ),
    ...links.filter((v) => v.name.toLowerCase().normalize('NFKD').startsWith(lowerCaseSearch)),
  ];
};

const RandomButton = () => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data: pages = [] } = useNotePages();
  const randomPages = pages.filter((v) => v.description);
  return (
    randomPages && (
      <TouchableOpacity
        style={commonStyles.searchButton}
        onPress={() => {
          const page = randomPages[Math.floor(Math.random() * randomPages.length)];
          const paragraphs = parseHtmlToParagraphs(page.description || '');
          navigation.push('NotePage', {
            title: page.title,
            paragraph: paragraphs[Math.floor(Math.random() * paragraphs.length)].title,
          });
        }}
      >
        <Icon name={'random'} size={18} color="#FFFFFF" />
      </TouchableOpacity>
    )
  );
};

export const titleFormat = (item: { title: string; paragraph?: string }) =>
  `${item.title}${item.paragraph ? ' ▶ ' + item.paragraph : ''}`;

export const SearchList = ({
  filteredPages,
  handlePagePress,
  addKeyword,
}: {
  filteredPages: SearchContent[];
  handlePagePress: (title: string, paragraph?: string) => void;
  addKeyword?: (keyword: KeywordContent) => void;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const pagePressHandlers = useCallback((item: SearchContent) => {
    return PanResponder.create({
      onPanResponderStart: () => {
        if (item.type === '_NOTELINK' && item.paragraph) {
          handlePagePress(item.title, item.paragraph);
          addKeyword?.(item);
        } else if (item.type === '_LINK') {
          window.open(item.url, '_blank');
          addKeyword?.(item);
        } else {
          handlePagePress(item.title);
          addKeyword?.({ type: '_KEYWORD', title: item.title });
        }
      },
    }).panHandlers;
  }, []);

  return (
    <FlatList
      data={filteredPages}
      keyExtractor={(item: any) => JSON.stringify([item.title, item.name, item.paragraph])}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.resultItem} {...pagePressHandlers(item)}>
          <Text style={[commonStyles.text, styles.resultText, { flexShrink: 0 }]}>
            {item.type === '_NOTELINK' || item.type === '_LINK' ? item.name : item.title}
          </Text>
          {item.type === '_NOTELINK' && (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[commonStyles.text, styles.resultText, { fontSize: 12, paddingLeft: 24 }]}
            >
              {titleFormat(item)}
            </Text>
          )}
          {item.type === '_LINK' && (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[commonStyles.text, styles.resultText, { fontSize: 12, paddingLeft: 24 }]}
            >
              {titleFormat({ title: item.origin, paragraph: item.url })}
            </Text>
          )}
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={[commonStyles.resultSeparator]} />}
    />
  );
};

export const SearchBar: React.FC<{
  handlePress?: (title: string) => void;
  useRandom?: boolean;
}> = ({ handlePress, useRandom = true }) => {
  const [searchText, setSearchText] = useState(_searchText);
  const [showResults, setShowResults] = useState(false);
  const { lang } = useLangContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const inputRef = useRef<TextInput | null>();
  const { data: keywords = [] } = useKeywords();
  const addKeyword = useAddKeyowrd();
  const { data: pages = [] } = useNotePages();
  const filteredPages: SearchContent[] = (
    searchText.length > 0 ? getFilteredPages(pages, searchText) : keywords
  )
    .filter((v) => handlePress === undefined || v.type === 'NOTE')
    .slice(0, 10);

  const handleSearch = () => {
    if (searchText.trim()) {
      handlePagePress(searchText.trim());
      addKeyword.mutate({ type: '_KEYWORD', title: searchText.trim() });
    }
  };

  const handlePagePress = (title: string, paragraph?: string) => {
    if (handlePress) {
      handlePress(title);
    } else {
      navigation.push('NotePage', { title, paragraph });
    }
    setSearchText('');
  };

  const searchHandlers = useMemo(
    () =>
      PanResponder.create({
        onPanResponderStart: handleSearch,
      }).panHandlers,
    [searchText]
  );

  useEffect(() => {
    _searchText = searchText;
  }, [searchText]);

  useFocusEffect(() => {
    if (searchText !== _searchText) {
      setSearchText(_searchText);
    }
  });

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          ref={(ref) => {
            inputRef.current = ref;
          }}
          style={[commonStyles.input, styles.searchInput]}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
          }}
          placeholder={lang('Search')}
          placeholderTextColor={theme === 'dark' ? '#777777' : '#999999'}
          onSubmitEditing={handleSearch}
          onFocus={() => setShowResults(true)}
          onBlur={() => setShowResults(false)}
        />
        <TouchableOpacity
          style={commonStyles.searchButton}
          onPress={handleSearch}
          disabled={!searchText.trim()}
        >
          <Icon name={'search'} size={18} color="#FFFFFF" />
        </TouchableOpacity>
        {useRandom && <RandomButton />}
      </View>

      {showResults && (
        <View
          style={[
            styles.resultsContainer,
            theme === 'dark' ? styles.darkResults : styles.lightResults,
          ]}
        >
          {filteredPages.length > 0 ? (
            <SearchList
              filteredPages={filteredPages}
              handlePagePress={handlePagePress}
              addKeyword={addKeyword.mutate}
            />
          ) : searchText.trim() ? (
            <TouchableOpacity style={styles.resultItem} {...searchHandlers}>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
  },
  resultText: {
    fontSize: 14,
  },
});
