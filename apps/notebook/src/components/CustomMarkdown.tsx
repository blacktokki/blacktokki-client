import React from 'react';
import { View, StyleSheet } from 'react-native';
import Markdown, { MarkdownProps } from 'react-native-markdown-display';
import { WikiLink } from './WikiLink';
import { useColorScheme } from '@blacktokki/core';

type CustomMarkdownProps = Omit<MarkdownProps, 'rules'> & {children:React.ReactNode};

export const CustomMarkdown: React.FC<CustomMarkdownProps> = (props) => {
  const theme = useColorScheme();

  const markdownStyles = {
    body: {
      color: theme === 'dark' ? '#E4E4E4' : '#333333',
      fontSize: 16,
      lineHeight: 24,
    },
    heading1: {
      borderBottomWidth: 1,
      borderBottomColor: theme === 'dark' ? '#444444' : '#DDDDDD',
      color: theme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 12,
      paddingBottom: 8,
    },
    heading2: {
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 16,
      marginBottom: 8,
      color: theme === 'dark' ? '#FFFFFF' : '#000000',
    },
    heading3: {
      fontSize: 18,
      fontWeight: 'bold',
      marginTop: 12,
      marginBottom: 6,
      color: theme === 'dark' ? '#FFFFFF' : '#000000',
    },
    link: {
      color: theme === 'dark' ? '#88B1D9' : '#2C73B5',
    },
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: theme === 'dark' ? '#555555' : '#CCCCCC',
      paddingLeft: 12,
      marginLeft: 0,
      marginRight: 0,
      backgroundColor: theme === 'dark' ? '#2A2A2A' : '#F5F5F5',
      paddingVertical: 8,
      paddingRight: 8,
    },
    code_block: {
      backgroundColor: theme === 'dark' ? '#2A2A2A' : '#F5F5F5',
      borderRadius: 4,
      padding: 10,
    },
    code_inline: {
      backgroundColor: theme === 'dark' ? '#2A2A2A' : '#F5F5F5',
      color: theme === 'dark' ? '#E4E4E4' : '#333333',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    hr: {
      backgroundColor: theme === 'dark' ? '#444444' : '#DDDDDD',
      height: 1,
      marginVertical: 16,
    },
    table: {
      borderWidth: 1,
      borderColor: theme === 'dark' ? '#444444' : '#DDDDDD',
      marginVertical: 12,
    },
    thead: {
      backgroundColor: theme === 'dark' ? '#2A2A2A' : '#F5F5F5',
    },
    tr: {
      borderBottomWidth: 1,
      borderColor: theme === 'dark' ? '#444444' : '#DDDDDD',
    },
    th: {
      padding: 8,
      borderRightWidth: 1,
      borderColor: theme === 'dark' ? '#444444' : '#DDDDDD',
    },
    td: {
      padding: 8,
      borderRightWidth: 1,
      borderColor: theme === 'dark' ? '#444444' : '#DDDDDD',
    },
  };

  const rules = {
    link: (node: any, children: any, parent: any, styles: any) => {
      const linkText = node.children[0].content;
      // Check if it's an internal wiki link (not starting with http)
      if (!node.attributes.href.startsWith('http')) {
        return <WikiLink key={node.key} title={linkText} />;
      }
      // Keep default behavior for external links
      return (
        <View key={node.key} style={styles.link}>
          {children}
        </View>
      );
    },
  };

  return (
    <Markdown style={markdownStyles} rules={rules} {...props}>
      {props.children}
    </Markdown>
  );
};