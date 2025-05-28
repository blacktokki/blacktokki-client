import { useColorScheme } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { useNavigation } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import HeaderSelectBar, { Paragraph } from '../../components/HeaderSelectBar';
import { onLink, titleFormat } from '../../components/SearchBar';
import { getSplitTitle } from '../../hooks/useProblem';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export const NotePageHeader = ({
  title,
  onPress,
  paragraph,
  updated,
}: {
  title: string;
  onPress: (title: string, hasChild: boolean) => void;
  pressable?: boolean;
  paragraph?: string;
  updated?: string;
}) => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const splitTitle = getSplitTitle(title);
  const pressableTextColor = theme === 'dark' ? '#FFFFFF88' : '#00000088';
  return (
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity onPress={() => onPress(splitTitle[0], splitTitle.length === 2)}>
        <Text
          style={[
            commonStyles.title,
            styles.title,
            paragraph || splitTitle.length === 2 ? { color: pressableTextColor } : {},
          ]}
          numberOfLines={1}
        >
          {splitTitle[0]}
        </Text>
      </TouchableOpacity>
      {splitTitle.length === 2 && (
        <>
          <Text style={[commonStyles.title, styles.title, { flex: 0 }]}>/</Text>
          <TouchableOpacity onPress={() => onPress(title, false)}>
            <Text
              style={[
                commonStyles.title,
                styles.title,
                paragraph ? { color: pressableTextColor } : {},
              ]}
              numberOfLines={1}
            >
              {splitTitle[1]}
            </Text>
          </TouchableOpacity>
        </>
      )}
      {!!paragraph && (
        <Text style={[commonStyles.title, styles.title, { marginLeft: 5 }]} numberOfLines={1}>
          {titleFormat({ title: '', paragraph })}
        </Text>
      )}
      {updated && <Text style={[commonStyles.text, styles.updated]}>{'(' + updated + ')'}</Text>}
    </View>
  );
};

export const NotePageSection = ({
  active,
  description,
}: {
  active: boolean;
  description?: string;
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
    </View>
  );
};

export const NoteBottomSection = ({
  toc,
  fullParagraph,
  paragraph,
  paragraphs,
  root,
  onPress,
}: {
  toc: boolean;
  fullParagraph: boolean;
  paragraph?: string;
  paragraphs: Paragraph[];
  root: string;
  onPress: (paragraph: Paragraph) => void;
}) => {
  const idx = paragraphs.findIndex((v) => v.title === paragraph);
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
    <HeaderSelectBar data={paragraphs} path={paragraph || ''} root={root} onPress={onPress} />
  ) : (
    !!paragraph && (
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
                style={[{ flexDirection: reverse ? 'row-reverse' : 'row', paddingVertical: 16 }]}
              >
                <Icon name={icon} size={16} color={iconColor} style={{ alignSelf: 'center' }} />
                <Text style={[commonStyles.text, { fontWeight: 'bold', marginHorizontal: 16 }]}>
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
  title: {
    flex: 1,
    fontSize: 20,
  },
  updated: { marginLeft: 5, fontStyle: 'italic' },
  card: { padding: 0, marginBottom: 0 },
  inactiveCard: { flex: 1, position: 'absolute' },
});

export const pageStyles = StyleSheet.create({
  container: { paddingRight: 12, scrollbarGutter: 'stable' },
  contentContainer: { flexGrow: 1 },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
});
