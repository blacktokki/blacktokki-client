import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useNotebookTheme } from '../../../hooks/useNotebookTheme';
import {
  ContentListItem,
  CountBadge,
  RenderIcon,
} from '../../../screens/main/home/ContentGroupSection';
import { useKnowledgeGraphData } from '../useKnowledgeGraphData';

const KnowledgeGraphButton: React.FC = () => {
  const { lang } = useLangContext();
  const { commonStyles } = useNotebookTheme();
  const { axioms } = useKnowledgeGraphData();
  const violationCount = axioms?.violations.length || 0;

  return (
    <ContentListItem
      title={lang('Knowledge Graph') || '지식 그래프'}
      onPress={() => navigate('KnowledgeGraph')}
      left={
        commonStyles.listItemTitle?.fontSize
          ? RenderIcon('sitemap')
          : (p) => (
              <View style={[p.style, styles.iconContainer]}>
                <Icon name="sitemap" size={18} color={p.color} />
              </View>
            )
      }
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

export default KnowledgeGraphButton;
