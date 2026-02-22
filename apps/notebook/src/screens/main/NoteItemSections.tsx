import { useColorScheme } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { push } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import DiffMatchPatch from 'diff-match-patch';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import Icon2 from 'react-native-vector-icons/MaterialCommunityIcons';

import HeaderSelectBar, { Paragraph } from '../../components/HeaderSelectBar';
import { onLink, titleFormat } from '../../components/SearchBar';
import { getSplitTitle } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';
import { updatedFullFormat } from './home/ContentGroupSection';

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
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const splitTitle = getSplitTitle(title);
  return (
    <View style={styles.header}>
      {board && (
        <TouchableOpacity
          onPress={() => push('BoardPage', { title: board })}
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
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
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
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  return (
    <View
      style={
        active && description
          ? [commonStyles.card, { padding: 0, marginBottom: 0 }]
          : { flex: 1, position: 'absolute' }
      }
    >
      <EditorViewer
        active
        value={description || ''}
        theme={theme}
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
}: {
  toc: boolean;
  fullParagraph: boolean;
  path?: string;
  paragraphs: Paragraph[];
  root: string;
  onPress: (paragraph: Paragraph) => void;
}) => {
  const idx = paragraphs.findIndex((v) => v.path === path);
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const moveParagraphs = [
    {
      icon: 'arrow-left',
      moveParagraph: paragraphs.findLast(
        (v, i) => i < idx && (fullParagraph ? paragraphs[idx]?.level >= v.level : true)
      ),
      reverse: false,
    },
    {
      icon: 'arrow-right',
      moveParagraph: paragraphs.find(
        (v, i) => i > idx && (fullParagraph ? paragraphs[idx]?.level >= v.level : true)
      ),
      reverse: true,
    },
  ];
  return toc ? (
    <HeaderSelectBar data={paragraphs} path={path || ''} root={root} onPress={onPress} />
  ) : (
    !!path && (
      <View style={styles.bottomContainer}>
        {moveParagraphs.map(
          ({ moveParagraph, icon, reverse }) =>
            moveParagraph !== undefined && (
              <TouchableOpacity
                key={icon}
                onPress={() => onPress(moveParagraph)}
                style={[styles.bottomButton, { flexDirection: reverse ? 'row-reverse' : 'row' }]}
              >
                <Icon
                  name={icon}
                  size={16}
                  color={commonStyles.icon.color}
                  style={{ alignSelf: 'center' }}
                />
                <Text
                  ellipsizeMode="tail"
                  style={[commonStyles.text, { fontWeight: 'bold', marginHorizontal: 16 }]}
                >
                  {moveParagraph.level === 0 ? root : moveParagraph.title}
                </Text>
              </TouchableOpacity>
            )
        )}
      </View>
    )
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
});
