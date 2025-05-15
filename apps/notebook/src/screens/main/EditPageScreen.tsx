import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useNotePage, useCreateOrUpdatePage, useNotePages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme } from '@blacktokki/core';
import { Editor } from '@blacktokki/editor';
import { getFilteredPages, titleFormat } from '../../components/SearchBar';

type EditPageScreenRouteProp = RouteProp<NavigationParamList, 'EditPage'>;

export const EditPageScreen: React.FC = () => {
  const route = useRoute<EditPageScreenRouteProp>();
  const { title } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  
  const { data: page, isLoading } = useNotePage(title);
  const { data: pages = [] } = useNotePages();
  const getChildrenPages = (keyword:string) => pages
    .filter(v=>v.title.startsWith(title + '/'))
    .map(v=>({type:'_CHILDNOTE' as '_CHILDNOTE', name:v.title.split(title + '/')[1], title:v.title}))
    .filter(v=>v.name.toLowerCase().startsWith(keyword.toLowerCase()))
  const [content, setContent] = useState('');
  
  const mutation = useCreateOrUpdatePage();
  const handleSave = () => {
    if (page?.description === content){
      navigation.navigate('NotePage', { title });
      return;
    }
    mutation.mutate(
      { title, description: content },
      {
        onSuccess: () => {
          navigation.navigate('NotePage', { title });
        },
        onError: (error:any) => {
          Alert.alert('오류', error.message || '문서를 저장하는 중 오류가 발생했습니다.');
        }
      }
    );
  };
  
  const handleCancel = () => {
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('NotePage', { title });
  };

  useEffect(()=>{
    if(!isLoading && page?.description){
      setContent(page?.description)
    }
  }, [isLoading])
  
  useFocusEffect(()=>{
    const callback = (event:any) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', callback);
    return () => window.removeEventListener('beforeunload', callback);
  })
  return (
    <View style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Text style={[commonStyles.title, { flex: 1 }]}>
          {title} - 편집
        </Text>
      </View>
      <Editor
        active
        value={content}
        setValue={setContent}
        theme={theme}
        autoComplete={[{
          trigger: '[',
          getMatchedChars: async(pattern) => {
            const childrenPages = getChildrenPages(pattern)
            return [{type:"_NOTELINK", name:pattern, title, section:pattern}, ...(childrenPages.length?childrenPages:[{type:"_CHILDNOTE", name:pattern, title: title + "/" + pattern}]), ...getFilteredPages(pages, pattern)].map(v=>{
              const text = v.type === '_NOTELINK' ? (v.name + `(${titleFormat(v)})`): v.type==='_CHILDNOTE'?v.name:v.title;
              const url = encodeURI(v.type === '_NOTELINK' && v.section ? `?title=${v.title}&section=${v.section}`:`?title=${v.title}`);
              return {
                text,
                value:`<a href=${url}>${text}</a>`,
              }})
          }
        }]}
      />
      
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
