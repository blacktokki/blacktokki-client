import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useNotePage, useCreateOrUpdatePage } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme } from '@blacktokki/core';
import { Editor } from '@blacktokki/editor';

type EditPageScreenRouteProp = RouteProp<NavigationParamList, 'EditPage'>;

export const EditPageScreen: React.FC = () => {
  const route = useRoute<EditPageScreenRouteProp>();
  const { title } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  
  const { data: page, isLoading } = useNotePage(title);
  const [content, setContent] = useState('');
  
  const mutation = useCreateOrUpdatePage();
  const handleSave = () => {
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
