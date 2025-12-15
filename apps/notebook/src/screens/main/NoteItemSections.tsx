import { useColorScheme } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { push } from '@blacktokki/navigation';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import Icon2 from 'react-native-vector-icons/MaterialCommunityIcons';

import HeaderSelectBar, { Paragraph } from '../../components/HeaderSelectBar';
import { onLink, titleFormat } from '../../components/SearchBar';
import { getSplitTitle } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export const NotePageHeader = ({
  title,
  onPress,
  paragraph,
  archive,
  kanban,
}: {
  title: string;
  onPress: (title: string, hasChild: boolean) => void;
  pressable?: boolean;
  paragraph?: string;
  archive?: { updated: string; previous?: number; next?: number };
  kanban?: string;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const splitTitle = getSplitTitle(title);
  const iconColor = getIconColor(theme);
  const pressableTextColor = theme === 'dark' ? '#FFFFFF88' : '#00000088';
  return (
    <View
      style={{
        flexDirection: 'row',
        maxWidth: '100%',
        flexBasis: 0,
        flexGrow: 1,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {kanban && (
        <TouchableOpacity
          onPress={() => push('KanbanPage', { title: kanban })}
          style={[commonStyles.title, { marginRight: 5 }]}
        >
          <Icon2
            name="view-dashboard"
            size={pageStyles.title.fontSize}
            color={pressableTextColor}
          />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => onPress(splitTitle[0], splitTitle.length === 2)}
        style={{ maxWidth: '100%' }}
      >
        <Text
          style={[
            commonStyles.title,
            pageStyles.title,
            paragraph || splitTitle.length === 2 ? { color: pressableTextColor } : {},
          ]}
          numberOfLines={1}
        >
          {splitTitle[0]}
        </Text>
      </TouchableOpacity>
      {splitTitle.length === 2 && (
        <View style={{ maxWidth: '100%', flexDirection: 'row' }}>
          <Text style={[commonStyles.title, pageStyles.title, { flex: 0 }]}>/</Text>
          <TouchableOpacity onPress={() => onPress(title, false)}>
            <Text
              style={[
                commonStyles.title,
                pageStyles.title,
                paragraph ? { color: pressableTextColor } : {},
              ]}
              numberOfLines={1}
            >
              {splitTitle[1]}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ maxWidth: '100%', flexDirection: 'row' }}>
        {!!paragraph && (
          <Text style={[commonStyles.title, pageStyles.title, { marginLeft: 5 }]} numberOfLines={1}>
            {titleFormat({ title: '', paragraph })}
          </Text>
        )}
        {archive && (
          <View
            style={[commonStyles.header, { zIndex: 1, alignItems: 'flex-start', marginBottom: 0 }]}
          >
            {archive.previous !== undefined && (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('NotePage', { title, archiveId: archive.previous })
                }
                style={pageStyles.actionButton}
              >
                <Icon name="chevron-left" size={16} color={iconColor} />
              </TouchableOpacity>
            )}
            <Text style={[commonStyles.text, { marginLeft: 5, fontStyle: 'italic' }]}>
              {archive.updated}
            </Text>
            {archive.next !== undefined && (
              <TouchableOpacity
                onPress={() => navigation.navigate('NotePage', { title, archiveId: archive.next })}
                style={pageStyles.actionButton}
              >
                <Icon name="chevron-right" size={16} color={iconColor} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
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
    <View style={active && description ? [commonStyles.card, styles.card] : styles.inactiveCard}>
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
  const iconColor = getIconColor(theme);
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
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        {moveParagraphs.map(
          ({ moveParagraph, icon, reverse }) =>
            moveParagraph !== undefined && (
              <TouchableOpacity
                key={icon}
                onPress={() => onPress(moveParagraph)}
                style={[
                  {
                    flex: 1,
                    flexDirection: reverse ? 'row-reverse' : 'row',
                    paddingVertical: 16,
                    maxWidth: '50%',
                  },
                ]}
              >
                <Icon name={icon} size={16} color={iconColor} style={{ alignSelf: 'center' }} />
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

export const getIconColor = (theme: 'light' | 'dark') => (theme === 'dark' ? '#E4E4E4' : '#333333');

const styles = StyleSheet.create({
  updated: { marginLeft: 5, fontStyle: 'italic' },
  card: { padding: 0, marginBottom: 0 },
  inactiveCard: { flex: 1, position: 'absolute' },
});

export const pageStyles = StyleSheet.create({
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
    flexBasis: 156,
  },
  actionButton: {
    padding: 8,
    paddingTop: 5,
    marginLeft: 8,
  },
});
