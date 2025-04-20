import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/FontAwesome';
import { NavigationParamList } from '../../types';
import { useNotePage } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme } from '@blacktokki/core';
import { EditorViewer, toMarkdown } from '@blacktokki/editor';

type NotePageScreenRouteProp = RouteProp<NavigationParamList, 'NotePage'>;

export const NotePageScreen: React.FC = () => {
  const route = useRoute<NotePageScreenRouteProp>();
  const { title } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  
  const { data: page, isLoading } = useNotePage(title);

  const handleEdit = () => {
    navigation.navigate('EditPage', { title });
  };
  
  const handleMovePage = () => {
    navigation.navigate('MovePage', { title });
  };

  return (
    <ScrollView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Text style={[commonStyles.title, styles.pageTitle]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={handleMovePage} style={styles.actionButton}>
            <Icon name="exchange" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEdit} style={styles.actionButton}>
            <Icon name="pencil" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={commonStyles.flex}>
        {isLoading ? (
          <View style={[commonStyles.card, commonStyles.centerContent]}>
            <ActivityIndicator size="large" color="#3498DB" />
          </View>
        ) : <>
          <View style={page?.description?[commonStyles.card, {flex:1, padding:0}]:{flex:0}}>
            <EditorViewer
              active
              value={page?.description || ''}
              theme={theme}
              autoResize
            /> 
          </View>
          {page?.description ? undefined : (
            <View style={[commonStyles.card, commonStyles.centerContent]}>
              <Text style={commonStyles.text}>
                아직 내용이 없는 문서입니다. 
                '편집' 버튼을 눌러 내용을 추가해보세요.
              </Text>
              <TouchableOpacity onPress={handleEdit} style={commonStyles.button}>
                <Text style={commonStyles.buttonText}>편집하기</Text>
              </TouchableOpacity>
            </View>)}
        </>}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  pageTitle: {
    flex: 1,
    fontSize: 20,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
});