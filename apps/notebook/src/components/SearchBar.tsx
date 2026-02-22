import { useAuthContext } from '@blacktokki/account';
import { useColorScheme, useLangContext, Text, Colors, useResizeContext } from '@blacktokki/core';
import { extractHtmlLinks } from '@blacktokki/editor';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  PanResponder,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useBoardPages } from '../hooks/useBoardStorage';
import { SearchFeature, useExtension } from '../hooks/useExtension';
import { KeywordContent, useAddKeyowrd, useKeywords } from '../hooks/useKeywordStorage';
import { useNotePages } from '../hooks/useNoteStorage';
import { createCommonStyles } from '../styles';
import { Content, NavigationParamList, ParagraphKey } from '../types';

let _searchText = '';

type SearchContent = Content | KeywordContent;

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
      extractHtmlLinks(v.description || '').map((v2) => {
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
  searchFeature,
}: PressKeywordOption & {
  searchFeature?: SearchFeature;
  afterPress?: () => void;
}) => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { mutate: addKeywordMutate } = useAddKeyowrd();
  return useCallback(
    (item: SearchContent) => {
      if (
        onPress &&
        (item.type === 'NOTE' ||
          item.type === '_KEYWORD' ||
          item.type === 'BOARD' ||
          item.type === '_BOARD')
      ) {
        onPress(item.title);
      } else if (item.type === '_LINK') {
        window.open(item.url, '_blank');
        addKeyword && addKeywordMutate(item);
      } else if (item.type === '_NOTELINK' && item.paragraph) {
        navigation.push('NotePage', { title: item.title, paragraph: item.paragraph });
        addKeyword && addKeywordMutate(item);
      } else if (item.type === '_QUERY') {
        const search = searchFeature?.(item);
        if (search) {
          navigation.push(search.screen as keyof NavigationParamList, search.params);
          addKeyword && addKeywordMutate(item);
        }
      } else if (item.type === 'BOARD' || item.type === '_BOARD') {
        navigation.push('BoardPage', { title: item.title });
        addKeyword && addKeywordMutate({ type: '_BOARD', title: item.title });
      } else {
        navigation.push('NotePage', { title: item.title });
        addKeyword && addKeywordMutate({ type: '_KEYWORD', title: item.title });
      }
      afterPress?.();
    },
    [onPress, searchFeature]
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
        JSON.stringify([item.title, item.name, item.query, item.paragraph, item.origin, item.type])
      }
      renderItem={({ item, index }) => (
        <TouchableOpacity
          style={[
            styles.resultItem,
            { borderWidth: 1, borderColor: focus === index ? Colors[theme].text : 'transparent' },
          ]}
          {...pagePressHandlers(item)}
        >
          <View style={{ flexDirection: 'row', backgroundColor: 'transparent' }}>
            {item.type === '_LINK' && (
              <Icon
                style={{ top: 6, paddingRight: 6 }}
                name={'external-link'}
                size={12}
                color={commonStyles.text.color}
              />
            )}
            {item.type === '_QUERY' && (
              <Icon
                style={{ top: 6, paddingRight: 6 }}
                name={'search'}
                size={12}
                color={commonStyles.text.color}
              />
            )}
            {(item.type === 'BOARD' || item.type === '_BOARD') && (
              <Icon
                style={{ top: 6, paddingRight: 6 }}
                name={'columns'}
                size={12}
                color={commonStyles.text.color}
              />
            )}
            <Text style={[commonStyles.text, styles.resultText, { flexShrink: 0 }]}>
              {item.type === '_NOTELINK' || item.type === '_LINK'
                ? item.name
                : item.type === '_QUERY'
                ? item.query
                : item.title}
            </Text>
          </View>
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
    useExtraSearch?: boolean;
    useTextSearch?: boolean;
    newContent?: boolean;
    icon?: string;
  } & PressKeywordOption
> = ({
  onPress,
  addKeyword = true,
  useExtraSearch = true,
  useTextSearch = true,
  newContent = true,
  icon = 'arrow-right',
}) => {
  const [searchText, setSearchText] = useState(_searchText);
  const [showResults, setShowResults] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const { lang } = useLangContext();
  const { auth } = useAuthContext();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const inputRef = useRef<TextInput | null>();
  const { data: keywords = [] } = useKeywords();
  const { data: pages = [] } = useNotePages();
  const { data: boards = [] } = useBoardPages();
  const { data: extension } = useExtension();
  const useTextSearchExact = !auth.isLocal && useTextSearch && !!extension.feature.search;

  const filteredPages: SearchContent[] = (
    searchText.length > 0
      ? getFilteredPages([...boards, ...pages], searchText)
      : keywords.filter((v) => v.type !== '_QUERY' || useTextSearchExact)
  )
    .filter((v) => onPress === undefined || v.type === 'NOTE')
    .slice(0, 10);
  const handleKeywordPress = useOnPressKeyword({
    onPress,
    addKeyword,
    searchFeature: extension.feature.search,
    afterPress: () => setSearchText(''),
  });

  const handleTextSearch = () => {
    const query = searchText.trim();
    if (query) {
      handleKeywordPress({ type: '_QUERY', query });
    }
  };

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

  const textSearchHandlers = useMemo(
    () =>
      PanResponder.create({
        onPanResponderStart: handleTextSearch,
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
              : useTextSearchExact
              ? handleTextSearch
              : handleSearch
          }
          onFocus={() => setShowResults(true)}
          onBlur={() => setShowResults(false)}
        />
        {useTextSearchExact && (
          <TouchableOpacity
            style={commonStyles.searchButton}
            onPress={handleTextSearch}
            disabled={!searchText.trim()}
          >
            <Icon name={'search'} size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[commonStyles.searchButton]}
          onPress={handleSearch}
          disabled={!searchText.trim()}
        >
          <Icon name={icon} size={18} color="#FFFFFF" />
        </TouchableOpacity>
        {useExtraSearch && extension.feature.elements('extraSearchButton')}
      </View>

      {showResults && (
        <View style={[commonStyles.resultsContainer, styles.resultsContainer]}>
          {filteredPages.length > 0 ? (
            <SearchList
              filteredPages={filteredPages}
              onPressKeyword={handleKeywordPress}
              focus={focusIndex}
            />
          ) : searchText.trim() && newContent ? (
            <>
              {useTextSearchExact && (
                <TouchableOpacity style={styles.resultItem} {...textSearchHandlers}>
                  <Text style={[commonStyles.text, styles.resultText]}>
                    "{searchText}"{lang(' : Search')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.resultItem} {...newNoteHandlers}>
                <Text style={[commonStyles.text, styles.resultText]}>
                  "{searchText}"{lang(' : Create new note')}
                </Text>
              </TouchableOpacity>
            </>
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
