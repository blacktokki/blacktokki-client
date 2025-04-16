import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useMovePage, useNotePage } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme } from '@blacktokki/core';

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;

export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title } = route.params;
  const [newTitle, setNewTitle] = useState('');
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const { data: page, isLoading } = useNotePage(title);
  const commonStyles = createCommonStyles(theme);
  
  const mutation = useMovePage();
  
  const handleMove = () => {
    if (!newTitle.trim()) {
      Alert.alert('오류', '새 노트 제목을 입력하세요.');
      return;
    }
    
    if (newTitle.trim() === title) {
      Alert.alert('오류', '현재 제목과 동일합니다.');
      return;
    }
    
    mutation.mutate(
      { oldTitle: title, newTitle: newTitle.trim() },
      {
        onSuccess: (data) => {
          navigation.reset({
            index: 1,
            routes: [
              { name: 'Home' },
              { name: 'NotePage', params: { title: data.newTitle } },
            ],
          });
        },
        onError: (error:any) => {
          Alert.alert('오류', error.message || '노트 이동 중 오류가 발생했습니다.');
        }
      }
    );
  };
  const handleCancel = () => {
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('NotePage', { title });
  };

  useEffect(()=>{
    if(!isLoading && !page){
      handleCancel()
    }
  }, [page, isLoading])

  return (
    <View style={commonStyles.container}>      
      <View style={commonStyles.card}>
        <Text style={commonStyles.text}>현재 노트 제목:</Text>
        <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>{title}</Text>
        
        <Text style={commonStyles.text}>새 노트 제목:</Text>
        <TextInput
          style={[commonStyles.input, { marginTop: 8 }]}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="새 노트 제목을 입력하세요"
          placeholderTextColor={theme === 'dark' ? '#777777' : '#999999'}
        />
        
        <Text style={[commonStyles.smallText, { marginBottom: 16 }]}>
          문서를 이동하면 기존 제목의 문서는 새 제목으로 변경됩니다.
        </Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[commonStyles.button, styles.cancelButton]} 
            onPress={handleCancel}
          >
            <Text style={commonStyles.buttonText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[commonStyles.button, styles.moveButton]} 
            onPress={handleMove}
            disabled={!newTitle.trim() || newTitle.trim() === title}
          >
            <Text style={commonStyles.buttonText}>이동</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
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
  moveButton: {
    flex: 1,
    marginLeft: 8,
  },
});