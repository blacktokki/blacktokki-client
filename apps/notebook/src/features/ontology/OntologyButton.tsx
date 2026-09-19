import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useOntologyData } from './useOntologyData';
import { CountBadge } from '../../screens/main/home/ContentGroupSection';

export const OntologyButton: React.FC = () => {
  const { lang } = useLangContext();
  const { axioms } = useOntologyData();
  const violationCount = axioms?.violations.length || 0;

  return (
    <List.Item
      title={lang('Ontology')}
      onPress={() => navigate('Ontology')}
      left={(p) => (
        <View style={[p.style, styles.iconContainer]}>
          <Icon name="sitemap" size={18} color={p.color} />
        </View>
      )}
      right={() => <CountBadge count={violationCount} />}
    />
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 0,
    marginRight: 4,
    alignSelf: 'center',
  },
});

export default OntologyButton;
