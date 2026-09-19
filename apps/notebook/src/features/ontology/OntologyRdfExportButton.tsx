import { Text, useLangContext } from '@blacktokki/core';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { exportTurtleFile } from './exportRdf';
import { OntologyRdfSource, serializeOntologyToTurtle } from './rdf';
import { useNotebookTheme } from '../../hooks/useNotebookTheme';

interface OntologyRdfExportButtonProps {
  source: OntologyRdfSource;
  scopeId: string | number;
  title: string;
}

export const OntologyRdfExportButton: React.FC<OntologyRdfExportButtonProps> = ({
  source,
  scopeId,
  title,
}) => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const turtle = serializeOntologyToTurtle(source, {
        scopeId,
        title,
        includeInferred: true,
      });
      await exportTurtleFile(turtle, title);
    } catch (error) {
      console.error('RDF export failed:', error);
      Alert.alert(lang('RDF Export'), lang('RDF export failed.'));
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, lang, scopeId, source, title]);

  return (
    <TouchableOpacity
      accessibilityLabel={lang('Export RDF')}
      disabled={isExporting}
      onPress={handleExport}
      style={[styles.button, { opacity: isExporting ? 0.5 : 1 }]}
      activeOpacity={0.7}
    >
      <Icon name="semantic-web" size={13} color={commonStyles.text?.color} />
      <Text style={[styles.label, { color: commonStyles.text?.color }]}>
        {lang(isExporting ? 'Exporting RDF...' : 'Export RDF')}
      </Text>
      <Icon
        name="chevron-right"
        size={12}
        color={commonStyles.text?.color}
        style={{ marginLeft: 2 }}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  label: {
    marginLeft: 4,
    fontSize: 13,
  },
});
