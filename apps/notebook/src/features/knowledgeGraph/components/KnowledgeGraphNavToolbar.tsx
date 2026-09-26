import { Text, useLangContext } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { OntologyRdfExportButton } from './OntologyRdfExportButton';
import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import { NavigationParamList } from '../../../types';
import { OntologyRdfSource } from '../utils/rdf';

export interface KnowledgeGraphNavToolbarProps {
  current: 'graph' | 'topic';
  rdfSource?: OntologyRdfSource;
  exportScope?: string | number;
  exportTitle?: string;
}

export const KnowledgeGraphNavToolbar: React.FC<KnowledgeGraphNavToolbarProps> = ({
  current,
  rdfSource,
  exportScope,
  exportTitle,
}) => {
  const { lang } = useLangContext();
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { commonStyles, colorScheme } = useNotebookTheme();
  const isDark = colorScheme === 'dark';
  const textColor = commonStyles.text?.color || (isDark ? '#E0E0E0' : '#333333');

  return (
    <View style={[styles.toolbar, { backgroundColor: commonStyles.container?.backgroundColor }]}>
      {/* Optional RDF Export Button */}
      {rdfSource && exportScope !== undefined && exportTitle !== undefined && (
        <OntologyRdfExportButton source={rdfSource} scopeId={exportScope} title={exportTitle} />
      )}

      {/* Usage Button */}
      <TouchableOpacity
        onPress={() =>
          navigation.push('NoteViewer', {
            key: 'Usage',
            paragraph:
              current === 'graph'
                ? '🕸️ ' + (lang('Knowledge Graph') || '지식 그래프')
                : '📑 ' + (lang('Topic Notes') || '주제 노트'),
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
