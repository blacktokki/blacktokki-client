import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
//@ts-ignore
import Icon from 'react-native-vector-icons/FontAwesome';
import { NavigationParamList } from '../../types';
import { useWikiPage, useCreateOrUpdatePage } from '../../hooks/useWikiStorage';
import { createCommonStyles } from '../../styles';
import { AutocompleteInput } from '../../components/AutoCompleteInput'
import { useColorScheme } from '@blacktokki/core';

type EditPageScreenRouteProp = RouteProp<NavigationParamList, 'EditPage'>;

export const EditPageScreen: React.FC = () => {
  const route = useRoute<EditPageScreenRouteProp>();
  const { title } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  
  const { data: page } = useWikiPage(title, true);
  const [content, setContent] = useState(page?.description || '');
  
  const mutation = useCreateOrUpdatePage();
  
  const handleSave = () => {
    mutation.mutate(
      { title, description: content },
      {
        onSuccess: () => {
          navigation.navigate('WikiPage', { title });
        },
        onError: (error:any) => {
          Alert.alert('오류', error.message || '문서를 저장하는 중 오류가 발생했습니다.');
        }
      }
    );
  };
  
  const handleCancel = () => {
    navigation.goBack();
  };
  
  const insertMarkdownFormat = (format: string) => {
    let newContent = content;
    switch (format) {
      case 'bold':
        newContent += '**굵은 텍스트**';
        break;
      case 'italic':
        newContent += '*기울임 텍스트*';
        break;
      case 'heading':
        newContent += '\n## 제목\n';
        break;
      case 'link':
        newContent += '[[링크 텍스트]]';
        break;
      case 'list':
        newContent += '\n- 항목 1\n- 항목 2\n- 항목 3\n';
        break;
      case 'code':
        newContent += '\n```\n코드 블록\n```\n';
        break;
      case 'quote':
        newContent += '\n> 인용문\n';
        break;
      default:
        break;
    }
    setContent(newContent);
  };

  return (
    <View style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Text style={[commonStyles.title, { textAlign: 'center', flex: 1 }]}>
          {title} 편집
        </Text>
      </View>
      <View style={styles.formatToolbar}>
        <TouchableOpacity style={styles.formatButton} onPress={() => insertMarkdownFormat('bold')}>
          <Icon name="bold" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.formatButton} onPress={() => insertMarkdownFormat('italic')}>
          <Icon name="italic" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.formatButton} onPress={() => insertMarkdownFormat('heading')}>
          <Icon name="header" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.formatButton} onPress={() => insertMarkdownFormat('link')}>
          <Icon name="link" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.formatButton} onPress={() => insertMarkdownFormat('list')}>
          <Icon name="list-ul" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.formatButton} onPress={() => insertMarkdownFormat('code')}>
          <Icon name="code" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.formatButton} onPress={() => insertMarkdownFormat('quote')}>
          <Icon name="quote-right" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.editorContainer}>
        <AutocompleteInput
          value={content}
          onChangeText={setContent}
          placeholder="마크다운을 사용하여 문서 내용을 작성하세요."
          style={styles.editor}
        />
      </ScrollView>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[commonStyles.button, styles.cancelButton]} 
          onPress={handleCancel}
        >
          <Text style={commonStyles.buttonText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[commonStyles.button, styles.saveButton]} 
          onPress={handleSave}
        >
          <Text style={commonStyles.buttonText}>저장</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  formatToolbar: {
    flexDirection: 'row',
    marginBottom: 12,
    justifyContent: 'space-around',
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 4,
  },
  formatButton: {
    padding: 8,
    borderRadius: 4,
  },
  editorContainer: {
    flex: 1,
    marginBottom: 16,
  },
  editor: {
    minHeight: 300,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#95A5A6',
  },
  saveButton: {
    flex: 1,
    marginLeft: 8,
  },
});
