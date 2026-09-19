import { Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { OntologyRdfExportButton } from './OntologyRdfExportButton';
import { OntologyRdfSource } from './rdf';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';
import { NavigationParamList } from '../../types';

export interface OntologyNavToolbarProps {
  current: 'graph' | 'topic';
  rdfSource?: OntologyRdfSource;
  exportScope?: string | number;
  exportTitle?: string;
}

export const OntologyNavToolbar: React.FC<OntologyNavToolbarProps> = ({
  current,
  rdfSource,
  exportScope,
  exportTitle,
}) => {
  const { lang } = useLangContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';

  const activeColor = isDark ? '#FFAAD4' : '#AD3D76';
  const textColor = commonStyles.text?.color || (isDark ? '#E0E0E0' : '#333333');

  return (
    <View style={[styles.toolbar, { backgroundColor: commonStyles.container?.backgroundColor }]}>
      {/* Optional RDF Export Button */}
      {rdfSource && exportScope !== undefined && exportTitle !== undefined && (
        <OntologyRdfExportButton source={rdfSource} scopeId={exportScope} title={exportTitle} />
      )}

      {/* Graph View Button */}
      <TouchableOpacity
        onPress={() => {
          if (current !== 'graph') {
            navigation.push('Ontology');
          }
        }}
        style={styles.navButton}
        activeOpacity={0.7}
      >
        <Icon
          name="sitemap"
          size={13}
          color={current === 'graph' ? activeColor : textColor}
          style={styles.iconBefore}
        />
        <Text
          style={[
            styles.buttonText,
            {
              color: current === 'graph' ? activeColor : textColor,
              fontWeight: current === 'graph' ? 'bold' : 'normal',
            },
          ]}
        >
          {lang('Graph View') || '그래프 뷰'}
        </Text>
        <Icon
          name="chevron-right"
          size={12}
          color={current === 'graph' ? activeColor : textColor}
          style={styles.iconAfter}
        />
      </TouchableOpacity>

      {/* Ontology Topics Button */}
      <TouchableOpacity
        onPress={() => {
          if (current !== 'topic') {
            navigation.push('OntologyTopic');
          }
        }}
        style={styles.navButton}
        activeOpacity={0.7}
      >
        <Icon
          name="format-list-bulleted"
          size={13}
          color={current === 'topic' ? activeColor : textColor}
          style={styles.iconBefore}
        />
        <Text
          style={[
            styles.buttonText,
            {
              color: current === 'topic' ? activeColor : textColor,
              fontWeight: current === 'topic' ? 'bold' : 'normal',
            },
          ]}
        >
          {lang('Ontology Topics') || '온톨로지 주제'}
        </Text>
        <Icon
          name="chevron-right"
          size={12}
          color={current === 'topic' ? activeColor : textColor}
          style={styles.iconAfter}
        />
      </TouchableOpacity>

      {/* Usage Button */}
      <TouchableOpacity
        onPress={() =>
          navigation.push('NoteViewer', {
            key: 'Usage',
            paragraph: '🕸️ ' + lang('Ontology'),
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
