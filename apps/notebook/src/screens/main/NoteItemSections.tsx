import { EditorViewer } from '@blacktokki/editor';
import { push, setDrawerVisible } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import DiffMatchPatch from 'diff-match-patch';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  GestureResponderEvent,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import Icon2 from 'react-native-vector-icons/MaterialCommunityIcons';

import { updatedFullFormat } from './home/ContentGroupSection';
import HeaderSelectBar, { Paragraph } from '../../components/HeaderSelectBar';
import { onLink, titleFormat } from '../../components/SearchBar';
import { getSplitTitle } from '../../hooks/useNoteStorage';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export const diffToSnapshot = (original: string, delta: string) => {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_fromDelta(original, delta);
  return dmp.diff_text2(diffs);
};

export const NotePageHeader = ({
  title,
  onPress,
  paragraph,
  archive,
  board,
}: {
  title: string;
  onPress: (title: string, hasChild: boolean) => void;
  pressable?: boolean;
  paragraph?: string;
  archive?: { updated: string; previous?: number; next?: number };
  board?: string;
}) => {
  const { commonStyles } = useNotebookTheme();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const splitTitle = getSplitTitle(title);
  return (
    <View style={styles.header}>
      {board && (
        <TouchableOpacity
          onPress={() => push('RecentPages', { title: board })}
          style={[commonStyles.title, { marginRight: 5 }]}
        >
          <Icon2
            name="view-dashboard"
            size={pageStyles.title.fontSize}
            color={commonStyles.pressibleText.color}
          />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => onPress(splitTitle[0], splitTitle.length === 2)}
        style={styles.headerItem}
      >
        <Text
          style={[
            commonStyles.title,
            pageStyles.title,
            paragraph || splitTitle.length === 2 ? commonStyles.pressibleText : {},
          ]}
          numberOfLines={1}
        >
          {splitTitle[0]}
        </Text>
      </TouchableOpacity>
      {splitTitle.length === 2 && (
        <View style={styles.headerItem}>
          <Text style={[commonStyles.title, pageStyles.title, { flex: 0 }]}>/</Text>
          <TouchableOpacity onPress={() => onPress(title, false)}>
            <Text
              style={[
                commonStyles.title,
                pageStyles.title,
                paragraph ? commonStyles.pressibleText : {},
              ]}
              numberOfLines={1}
            >
              {splitTitle[1]}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.headerItem}>
        {!!paragraph && (
          <Text style={[commonStyles.title, pageStyles.title, { marginLeft: 5 }]} numberOfLines={1}>
            {titleFormat({ title: '', paragraph })}
          </Text>
        )}
        {archive && (
          <View style={[commonStyles.header, styles.archiveHeader]}>
            {archive.previous !== undefined && (
              <HeaderIconButton
                onPress={() =>
                  navigation.navigate('NotePage', { title, archiveId: archive.previous })
                }
                name="chevron-left"
              />
            )}
            <Text style={[commonStyles.text, { marginLeft: 5, fontStyle: 'italic' }]}>
              {updatedFullFormat(archive.updated)}
            </Text>
            {archive.next !== undefined && (
              <HeaderIconButton
                onPress={() => navigation.navigate('NotePage', { title, archiveId: archive.next })}
                name="chevron-right"
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
};

export const HeaderIconButton: React.FC<{
  name: string;
  onPress: (event: GestureResponderEvent) => void;
  size?: number;
  color?: string;
}> = ({ name, onPress, size = 16, color }) => {
  const { commonStyles } = useNotebookTheme();
  const iconColor = color || commonStyles.icon.color;

  return (
    <TouchableOpacity onPress={onPress} style={pageStyles.actionButton}>
      <Icon name={name} size={size} color={iconColor} />
    </TouchableOpacity>
  );
};

export const NotePageSection = ({
  active,
  description,
  children,
}: {
  active: boolean;
  description?: string;
  children?: React.ReactNode;
}) => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles, colorScheme } = useNotebookTheme();
  return (
    <View
      style={
        active && description
          ? [
              commonStyles.card,
              {
                backgroundColor: createCommonStyles(colorScheme).card.backgroundColor,
              },
            ]
          : { flex: 1, position: 'absolute' }
      }
    >
      <EditorViewer
        active
        value={description || ''}
        theme={colorScheme}
        onLink={(url) => onLink(url, navigation)}
        autoResize
      />
      {children}
    </View>
  );
};

export const NoteBottomSection = ({
  toc,
  fullParagraph,
  path,
  paragraphs,
  root,
  onPress,
  style,
  hideTitle,
  preventRoot,
}: {
  toc: boolean;
  fullParagraph: boolean;
  path?: string;
  paragraphs: Paragraph[];
  root: string;
  onPress: (paragraph: Paragraph) => void;
  style?: StyleProp<ViewStyle>;
  hideTitle?: boolean;
  preventRoot?: boolean;
}) => {
  const idx = paragraphs.findIndex((v) => v.path === (path || ''));
  const isRoot = !path || idx === 0;
  const { commonStyles } = useNotebookTheme();
  const firstParagraph = paragraphs.find((v, i) => i > 0 && v.level > 0) || paragraphs[1];
  const prevParagraph =
    idx > 0
      ? paragraphs.findLast(
          (v, i) =>
            i < idx &&
            (!preventRoot || i > 0) &&
            (fullParagraph ? paragraphs[idx]?.level >= v.level : true)
        )
      : undefined;
  const nextParagraph = isRoot
    ? firstParagraph
    : idx > 0
    ? paragraphs.find(
        (v, i) => i > idx && (fullParagraph ? paragraphs[idx]?.level >= v.level : true)
      )
    : undefined;

  const moveParagraphs = [
    {
      icon: 'arrow-left',
      moveParagraph: prevParagraph,
      reverse: false,
    },
    {
      icon: 'arrow-right',
      moveParagraph: nextParagraph,
      reverse: true,
    },
  ];
  return toc ? (
    <HeaderSelectBar data={paragraphs} path={path || ''} root={root} onPress={onPress} />
  ) : (
    (!!path || (preventRoot && !!firstParagraph)) && (
      <View style={[styles.bottomContainer, style]}>
        {moveParagraphs.map(({ moveParagraph, icon, reverse }) =>
          moveParagraph !== undefined ? (
            <TouchableOpacity
              key={icon}
              focusable={false}
              accessibilityLabel={moveParagraph.level === 0 ? root : moveParagraph.title}
              onPress={() => onPress(moveParagraph)}
              style={[
                styles.bottomButton,
                { flexDirection: reverse ? 'row-reverse' : 'row' },
                hideTitle && { paddingHorizontal: 8 },
                { outlineStyle: 'none' } as any,
              ]}
            >
              <Icon
                name={icon}
                size={16}
                color={commonStyles.icon.color}
                style={{ alignSelf: 'center' }}
              />
              {!hideTitle && (
                <Text
                  ellipsizeMode="tail"
                  style={[commonStyles.text, { fontWeight: 'bold', marginHorizontal: 16 }]}
                >
                  {moveParagraph.level === 0 ? root : moveParagraph.title}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View key={icon} style={styles.bottomButton} />
          )
        )}
      </View>
    )
  );
};

export const FullNoteSection = ({
  description,
  children,
  onClose,
  toc,
  fullParagraph,
  path,
  paragraphs,
  root,
  onPress,
  bottom,
}: {
  description?: string;
  children?: React.ReactNode;
  onClose: () => void;
  toc?: boolean;
  fullParagraph?: boolean;
  path?: string;
  paragraphs?: Paragraph[];
  root?: string;
  onPress?: (paragraph: Paragraph) => void;
  bottom?: React.ReactNode;
}) => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const [isScrollable, setIsScrollable] = useState(false);

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

  const handlePress = (targetParagraph: Paragraph) => {
    if (targetParagraph.level === 0) {
      return;
    }
    onPress?.(targetParagraph);
  };

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
        onClose();
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
  }, [onClose, nextParagraph, prevParagraph, onPress]);

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={isScrollable}
        //@ts-ignore
        style={[
          commonStyles.container,
          styles.presentationContainer,
          !isScrollable && { overflow: 'hidden' },
        ]}
        contentContainerStyle={[
          pageStyles.contentContainer,
          styles.presentationContent,
          !isScrollable && { height: '100%', overflow: 'hidden' },
        ]}
      >
        <View
          style={[
            styles.presentationWrapper,
            !isScrollable && { height: '100%', overflow: 'hidden' },
          ]}
        >
          {children ? (
            children
          ) : (
            <View
              style={
                description
                  ? [
                      commonStyles.card,
                      {
                        backgroundColor: createCommonStyles(colorScheme).card.backgroundColor,
                      },
                      pageStyles.presentationCard,
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
          {paragraphs && root && onPress ? (
            <NoteBottomSection
              toc={!!toc}
              fullParagraph={!!fullParagraph}
              path={path}
              paragraphs={paragraphs}
              root={root}
              onPress={handlePress}
              style={styles.presentationBottom}
              hideTitle
              preventRoot
            />
          ) : (
            bottom
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
        <HeaderIconButton name="window-restore" onPress={onClose} />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    maxWidth: '100%',
    flexBasis: 0,
    flexGrow: 1,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  headerItem: { maxWidth: '100%', flexDirection: 'row' },
  archiveHeader: { zIndex: 1, alignItems: 'flex-start', marginBottom: 0 },
  bottomContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bottomButton: {
    flex: 1,
    paddingVertical: 16,
    maxWidth: '50%',
  },
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
});

export const pageStyles = StyleSheet.create({
  header: { zIndex: 1, alignItems: 'flex-start' },
  title: {
    flex: 1,
    fontSize: 20,
  },
  //@ts-ignore
  container: { paddingRight: 12, scrollbarGutter: 'stable' },
  contentContainer: { flexGrow: 1 },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexBasis: 117,
  },
  actionButton: {
    padding: 8,
    paddingTop: 5,
    marginLeft: 8,
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
