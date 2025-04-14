import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
//@ts-ignore
import Icon from 'react-native-vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../types';
import { useWikiPages } from '../hooks/useWikiStorage';
import { useColorScheme } from '@blacktokki/core';

type WikiLinkProps = {
  title: string;
};

export const WikiLink: React.FC<WikiLinkProps> = ({ title }) => {
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const { data: pages = [] } = useWikiPages();
  
  const pageExists = pages.some(page => page.title === title);
  
  return (
    <TouchableOpacity
      style={styles.linkContainer}
      onPress={() => navigation.navigate('WikiPage', { title })}
    >
      <Icon 
        name={pageExists ? 'file-text-o' : 'file-o'} 
        size={14} 
        color={theme === 'dark' ? '#88B1D9' : '#2C73B5'}
        style={styles.icon}
      />
      <Text
        style={[
          styles.linkText,
          theme === 'dark' ? styles.darkLinkText : styles.lightLinkText,
          !pageExists && styles.newPage
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  linkText: {
    fontWeight: '500',
  },
  lightLinkText: {
    color: '#2C73B5',
  },
  darkLinkText: {
    color: '#88B1D9',
  },
  newPage: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },
});