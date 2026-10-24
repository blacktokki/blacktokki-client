import { Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { NavigationParamList } from '../../../types';
export const KnowledgeGraphNavToolbar: React.FC<{ view?: 'graph' | 'relations' }> = ({
  view = 'graph',
}) => {
  const { lang } = useLangContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const textColor = commonStyles.text?.color || (isDark ? '#E0E0E0' : '#333333');
  const graphView = view === 'graph';

  return (
    <View style={[styles.toolbar, { backgroundColor: commonStyles.container?.backgroundColor }]}>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => navigation.navigate(graphView ? 'RelationAnalysis' : 'KnowledgeGraph')}
        style={styles.navButton}
        activeOpacity={0.7}
      >
        <Icon
          name={graphView ? 'text-box-search-outline' : 'sitemap'}
          size={16}
          color={textColor}
          style={styles.iconBefore}
        />
        <Text style={[styles.buttonText, { color: textColor }]}>
          {lang(graphView ? 'Keywords and Relationships' : 'Knowledge Graph')}
        </Text>
        <Icon name="chevron-right" size={12} color={textColor} style={styles.iconAfter} />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() =>
          navigation.push('NoteViewer', {
            key: 'Usage',
            paragraph: graphView
              ? '🕸️ ' + (lang('Knowledge Graph') || '지식 그래프')
              : '🏷️ ' + lang('Keywords and Relationships'),
          })
        }
        style={styles.navButton}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: textColor }]}>{lang('Usage')}</Text>
        <Icon name="chevron-right" size={12} color={textColor} style={styles.iconAfter} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  toolbar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 16,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  buttonText: {
    fontSize: 13,
  },
  iconBefore: {
    marginRight: 4,
  },
  iconAfter: {
    marginLeft: 2,
  },
});

export default KnowledgeGraphNavToolbar;
