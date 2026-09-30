import { useLangContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { setDrawerVisible } from '@blacktokki/navigation';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from 'react-query';

import { setFocusMode } from './useFocusStore';
import { Paragraph } from '../../components/HeaderSelectBar';
import { onLink, toNoteParams } from '../../components/SearchBar';
import { NotePageSectionProps } from '../../hooks/useExtension';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { HeaderIconButton, NoteBottomSection } from '../../screens/main/NoteItemSections';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export const focusStyles = StyleSheet.create({
  contentContainer: { flexGrow: 1 },
  presentationContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingRight: 16,
  },
  presentationContent: {
    flexGrow: 1,
    width: '100%',
  },
  presentationWrapper: {
    flex: 1,
    width: '100%',
  },
  presentationBottom: {
    flex: 0,
    marginTop: 0,
    marginBottom: 4,
  },
  presentationCard: {
    flex: 1,
    width: '100%',
    minHeight: 500,
    borderRadius: 12,
    padding: 24,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});

export const FocusPageSection = ({
  title,
  path,
  fullParagraph,
  paragraphs,
  description,
  board,
  toc,
  toggleFullParagraph,
}: NotePageSectionProps): React.JSX.Element | undefined => {
  const isFocused = useIsFocused();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { lang } = useLangContext();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const prevTitleRef = useRef(title);

  const idx = paragraphs ? paragraphs.findIndex((v) => v.path === (path || '')) : -1;
  const isRoot = !path || idx === 0;
  const firstParagraph = paragraphs?.find((v, i) => i > 0 && v.level > 0) || paragraphs?.[1];
  const prevParagraph =
    paragraphs && idx > 0
      ? paragraphs.findLast(
          (v, i) => i < idx && i > 0 && (fullParagraph ? paragraphs[idx]?.level >= v.level : true)
        )
      : undefined;
  const nextParagraph =
    paragraphs && isRoot
      ? firstParagraph
      : paragraphs && idx > 0
      ? paragraphs.find(
          (v, i) => i > idx && (fullParagraph ? paragraphs[idx]?.level >= v.level : true)
        )
      : undefined;

  const handlePress = useCallback(
    (targetParagraph: Paragraph) => {
      if (targetParagraph.level === 0) {
        return;
      }
      toggleFullParagraph?.(true);
      navigation.navigate('NotePage', {
        ...toNoteParams(
          title,
          targetParagraph.level === 0 ? undefined : targetParagraph.title,
          targetParagraph.autoSection
        ),
        board,
      });
    },
    [navigation, title, board, toggleFullParagraph]
  );

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
    setDrawerVisible(false);
    return () => {
      navigation.setOptions({ headerShown: true });
      setDrawerVisible(true);
    };
  }, [navigation]);

  useEffect(() => {
    setIsScrollable(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [path]);

  useEffect(() => {
    if (!isScrollable) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [isScrollable]);

  useEffect(() => {
    toggleFullParagraph?.(true);
  }, [toggleFullParagraph]);

  useEffect(() => {
    if (prevTitleRef.current !== title) {
      prevTitleRef.current = title;
      setFocusMode(false, queryClient);
    }
  }, [title, queryClient]);

  useEffect(() => {
    return () => {
      setFocusMode(false, queryClient);
    };
  }, [queryClient]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (
        e.key === 'Escape' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === ' ' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp'
      ) {
        e.preventDefault();
        if (typeof window !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }

      if (e.key === 'Escape') {
        setFocusMode(false, queryClient);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        if (nextParagraph) {
          handlePress(nextParagraph);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (prevParagraph) {
          handlePress(prevParagraph);
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [queryClient, nextParagraph, prevParagraph, handlePress]);

  if (!isFocused) {
    return undefined;
  }

  const paragraphItem = path ? paragraphs.find((v) => v.path === path) : undefined;
  const isEmptyParagraph =
    !!paragraphItem && !fullParagraph && paragraphItem.description?.trim().length === 0;

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={isScrollable}
        //@ts-ignore
        style={[
          commonStyles.container,
          focusStyles.presentationContainer,
          !isScrollable && { overflow: 'hidden' },
        ]}
        contentContainerStyle={[
          focusStyles.contentContainer,
          focusStyles.presentationContent,
          !isScrollable && { height: '100%', overflow: 'hidden' },
        ]}
      >
        <View
          style={[
            focusStyles.presentationWrapper,
            !isScrollable && { height: '100%', overflow: 'hidden' },
          ]}
        >
          {isEmptyParagraph ? (
            <View
              style={[
                commonStyles.card,
                commonStyles.centerContent,
                focusStyles.presentationCard,
                { minHeight: 0 },
              ]}
            >
              <Text style={commonStyles.text}>
                {lang('There is no direct content in this paragraph.')}
              </Text>
              <TouchableOpacity
                onPress={() => toggleFullParagraph?.(true)}
                style={commonStyles.button}
              >
                <Text style={commonStyles.buttonText}>{lang('View subparagraph')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={
                description
                  ? [
                      commonStyles.card,
                      {
                        backgroundColor: createCommonStyles(colorScheme).card.backgroundColor,
                      },
                      focusStyles.presentationCard,
                      !isScrollable && { flex: 1, minHeight: 0, overflow: 'hidden' },
                    ]
                  : { flex: 1, position: 'absolute' }
              }
            >
              <View
                style={
                  {
                    flex: 1,
                    zoom: 1.5,
                  } as any
                }
              >
                <EditorViewer
                  active
                  value={description || ''}
                  theme={colorScheme}
                  onLink={(url) => onLink(url, navigation)}
                  autoResize
                />
              </View>
            </View>
          )}
          {paragraphs && (
            <NoteBottomSection
              toc={!!toc}
              fullParagraph={!!fullParagraph}
              path={path}
              paragraphs={paragraphs}
              root={title}
              onPress={handlePress}
              style={focusStyles.presentationBottom}
              hideTitle
              preventRoot
            />
          )}
        </View>
      </ScrollView>

      <View
        style={[
          commonStyles.card,
          {
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 100,
            padding: 4,
            margin: 0,
            borderRadius: 20,
            opacity: 0.85,
            flexDirection: 'row',
            alignItems: 'center',
          },
        ]}
      >
        <HeaderIconButton
          name="arrows-v"
          color={isScrollable ? '#FFFFFF' : commonStyles.icon.color}
          onPress={() => setIsScrollable(!isScrollable)}
        />
        <HeaderIconButton name="window-restore" onPress={() => setFocusMode(false, queryClient)} />
      </View>
    </>
  );
};

export const FullNoteSection = FocusPageSection;
export default FocusPageSection;
