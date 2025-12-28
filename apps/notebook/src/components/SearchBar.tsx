import {
  useColorScheme,
  useLangContext,
  View,
  Text,
  Colors,
  useResizeContext,
} from '@blacktokki/core';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, TouchableOpacity, FlatList, StyleSheet, PanResponder } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { KeywordContent, useAddKeyowrd, useKeywords } from '../hooks/useKeywordStorage';
import { useNotePages } from '../hooks/useNoteStorage';
import { createCommonStyles } from '../styles';
import { Content, NavigationParamList, ParagraphKey } from '../types';
import { parseHtmlToParagraphs } from './HeaderSelectBar';

let _searchText = '';

type SearchContent = Content | KeywordContent;

const parser = new DOMParser();

function extractHtmlLinksWithQuery(text: string) {
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

export function toNoteParams(
  title: string,
  paragraph?: string,
  section?: string
): { title: string } & ParagraphKey {
  return paragraph ? (section ? { title, paragraph, section } : { title, paragraph }) : { title };
}

export function urlToNoteLink(url: string) {
  const newLocation = new URL(url);
  if (location.origin === newLocation.origin) {
    const params = new URLSearchParams(newLocation.search);
    const title = params.get('title');
    const paragraph = params.get('paragraph') || undefined;
    const section = params.get('section') || undefined;
    if (title) {
      return toNoteParams(title, paragraph, section);
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

const normalize = (text: string) => text.toLowerCase().replace(/ /g, '').normalize('NFKD');

export const getFilteredPages = (pages: Content[], searchText: string) => {
  const lowerCaseSearch = normalize(searchText);
  const links = getLinks(pages);
  return [
    ...pages.filter((page) => normalize(page.title).startsWith(lowerCaseSearch)),
    ...pages.filter((page) => {
      const _title = normalize(page.title);
      return !_title.startsWith(lowerCaseSearch) && _title.includes(lowerCaseSearch);
    }),
    ...links.filter((v) => v.type === '_NOTELINK' && normalize(v.name).startsWith(lowerCaseSearch)),
    ...links.filter((v) => v.type === '_LINK' && normalize(v.name).includes(lowerCaseSearch)),
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

type PressKeywordOption = {
  onPress?: (title: string) => void;
  addKeyword?: boolean;
};

const useOnPressKeyword = ({
  onPress,
  addKeyword,
  afterPress,
}: PressKeywordOption & { afterPress?: () => void }) => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { mutate: addKeywordMutate } = useAddKeyowrd();
  return useCallback(
    (item: SearchContent) => {
      if (onPress && (item.type === 'NOTE' || item.type === '_KEYWORD')) {
        onPress(item.title);
      } else if (item.type === '_LINK') {
        window.open(item.url, '_blank');
        addKeyword && addKeywordMutate(item);
      } else if (item.type === '_NOTELINK' && item.paragraph) {
        navigation.push('NotePage', { title: item.title, paragraph: item.paragraph });
        addKeyword && addKeywordMutate(item);
      } else {
        navigation.push('NotePage', { title: item.title });
        addKeyword && addKeywordMutate({ type: '_KEYWORD', title: item.title });
      }
      afterPress?.();
    },
    [onPress]
  );
};

export const SearchList = ({
  filteredPages,
  onPressKeyword,
  focus,
}: {
  filteredPages: SearchContent[];
  onPressKeyword?: (item: SearchContent) => void;
  focus?: number;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const onPressDefault = useOnPressKeyword({});

  const pagePressHandlers = useCallback(
    (item: SearchContent) => {
      return PanResponder.create({
        onPanResponderStart: () => (onPressKeyword ? onPressKeyword : onPressDefault)(item),
      }).panHandlers;
    },
    [onPressKeyword]
  );

  return (
    <FlatList
      data={filteredPages}
      keyExtractor={(item: any) =>
        JSON.stringify([item.title, item.name, item.paragraph, item.origin, item.type])
      }
      renderItem={({ item, index }) => (
        <TouchableOpacity
          style={[
            styles.resultItem,
            { borderWidth: 1, borderColor: focus === index ? Colors[theme].text : 'transparent' },
          ]}
          {...pagePressHandlers(item)}
        >
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

export const SearchBar: React.FC<
  {
    useRandom?: boolean;
    newContent?: boolean;
    icon?: string;
  } & PressKeywordOption
> = ({ onPress, addKeyword = true, useRandom = true, newContent = true, icon = 'search' }) => {
  const [searchText, setSearchText] = useState(_searchText);
  const [showResults, setShowResults] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const { lang } = useLangContext();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const inputRef = useRef<TextInput | null>();
  const { data: keywords = [] } = useKeywords();
  const { data: pages = [] } = useNotePages();
  const filteredPages: SearchContent[] = (
    searchText.length > 0 ? getFilteredPages(pages, searchText) : keywords
  )
    .filter((v) => onPress === undefined || v.type === 'NOTE')
    .slice(0, 10);

  const handleKeywordPress = useOnPressKeyword({
    onPress,
    addKeyword,
    afterPress: () => setSearchText(''),
  });

  const handleSearch = () => {
    const title = searchText.trim();
    if (title) {
      handleKeywordPress({ type: '_KEYWORD', title });
    }
  };

  const newNoteHandlers = useMemo(
    () =>
      PanResponder.create({
        onPanResponderStart: handleSearch,
      }).panHandlers,
    [searchText]
  );

  useEffect(() => {
    _searchText = searchText;
    setFocusIndex(-1);
  }, [searchText]);

  useFocusEffect(() => {
    if (searchText !== _searchText) {
      setSearchText(_searchText);
    }
  });

  return (
    <View
      style={styles.container}
      //@ts-ignore
      onKeyDownCapture={(e: KeyboardEvent) => {
        if (showResults) {
          if (e.key === 'ArrowUp' && focusIndex > -1) {
            e.preventDefault();
            setFocusIndex(focusIndex - 1);
          } else if (e.key === 'ArrowDown' && focusIndex < filteredPages.length - 1) {
            e.preventDefault();
            setFocusIndex(focusIndex + 1);
          }
        }
      }}
    >
      <View style={commonStyles.searchContainer}>
        <TextInput
          ref={(ref) => {
            inputRef.current = ref;
          }}
          style={commonStyles.searchInput}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
          }}
          placeholder={lang('Search')}
          placeholderTextColor={commonStyles.placeholder.color}
          onSubmitEditing={
            focusIndex > -1
              ? () => {
                  handleKeywordPress(filteredPages[focusIndex]);
                  setFocusIndex(-1);
                }
              : handleSearch
          }
          onFocus={() => setShowResults(true)}
          onBlur={() => setShowResults(false)}
        />
        <TouchableOpacity
          style={commonStyles.searchButton}
          onPress={handleSearch}
          disabled={!searchText.trim()}
        >
          <Icon name={icon} size={18} color="#FFFFFF" />
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
              onPressKeyword={handleKeywordPress}
              focus={focusIndex}
            />
          ) : searchText.trim() && newContent ? (
            <TouchableOpacity style={styles.resultItem} {...newNoteHandlers}>
              <Text style={[commonStyles.text, styles.resultText]}>
                "{searchText}"{lang(' : Create new note')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
};

export const ResponsiveSearchBar: React.FC = () => {
  const windowType = useResizeContext();
  if (windowType !== 'portrait') {
    return null;
  }
  return <SearchBar />;
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: 960,
    zIndex: 999,
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
