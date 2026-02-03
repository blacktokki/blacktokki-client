import { useColorScheme } from '@blacktokki/core';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { parseHtmlToParagraphs } from '../../components/HeaderSelectBar';
import { toNoteParams } from '../../components/SearchBar';
import { useNotePages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { NavigationParamList } from '../../types';

export default () => {
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const { data: pages = [] } = useNotePages();
  const randomPages = pages.filter((v) => v.description);
  return (
    randomPages && (
      <TouchableOpacity
        style={commonStyles.searchButton}
        onPress={() => {
          const page = randomPages[Math.floor(Math.random() * randomPages.length)];
          const paragraphs = parseHtmlToParagraphs(page.description || '');
          const paragraph = paragraphs[Math.floor(Math.random() * paragraphs.length)].title;
          navigation.push(
            'NotePage',
            toNoteParams(page.title, paragraph.length >= 0 ? paragraph : undefined)
          );
        }}
      >
        <Icon name={'random'} size={18} color="#FFFFFF" />
      </TouchableOpacity>
    )
  );
};
