import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useCreateOrUpdatePage, useMovePage, useNotePage } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { SearchBar, titleFormat } from '../../components/SearchBar';
import HeaderSelectBar, { parseHtmlToSections } from '../../components/HeaderSelectBar';

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;


export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title, section } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const window = useResizeContext()
  const [newTitle, setNewTitle] = useState(title);
  const { data: page, isLoading } = useNotePage(title);
  const paragraph = parseHtmlToSections(page?.description|| '')
  const path = paragraph.find(v=>v.title === section)?.path || ''
  const { data: newPage } = useNotePage(newTitle);
  const newParagraph = parseHtmlToSections(newPage?.description || '').filter(v=>title!==newTitle || path===v.path || !v.path.startsWith(path))
  const [newPath,setNewPath] = useState('')
  const [preview, setPreview] = useState<boolean>()
  const commonStyles = createCommonStyles(theme);

  const mutation = useCreateOrUpdatePage()
  const moveMutation = useMovePage();
  const {sourceDescription, targetDescription} = useMemo(()=>{
    const moveParagraph = paragraph.filter(v=>v.path.startsWith(path))
    const moveDescription = moveParagraph.map(v=>v.header + v.description).join('');
    const sourceParagraph = paragraph.filter(v=>!v.path.startsWith(path))
    const sourceDescription = sourceParagraph.map(v=>v.header + v.description).join('')
    const targetParagraph = page?.title === newPage?.title?sourceParagraph:newParagraph;
    const targetIndex = targetParagraph.findLastIndex(v=>v.path.startsWith(newPath))
    const targetDescription = newPage === undefined?moveDescription:[
      ...targetParagraph.slice(0, targetIndex+1).map(v=>v.header + v.description),
      ...moveParagraph.map(v=>(v.path===path && v.description===''?'':v.header) + v.description),
      ...targetParagraph.slice(targetIndex+1).map(v=>v.header + v.description)].join('')
      return {sourceDescription, targetDescription}
  }, [paragraph, newParagraph, path, newPath])
  
  const handleMove = () => {
    if (newPage === undefined){
      moveMutation.mutate(
        { oldTitle: title, newTitle: newTitle.trim(), description:path===''?undefined:targetDescription },
        {
          onSuccess: (data) => {
            navigation.navigate({ name: 'NotePage', params: { title: data.newTitle } });
          },
          onError: (error:any) => {
            Alert.alert('오류', error.message || '노트 이동 중 오류가 발생했습니다.');
          }
        }
      );
    }
    else {
      if (page?.title === newPage.title && path === newPath){
        handleCancel()
      }
      mutation.mutate(
        { title:newPage.title, description:targetDescription },
        {
          onSuccess: (data) => {
            if (page?.title !== newPage.title){
              mutation.mutate(
                { title, description:sourceDescription }
              )
            }
            navigation.navigate({ name: 'NotePage', params: { title: data.title } });
          },
          onError: (error:any) => {
            Alert.alert('오류', error.message || '노트 이동 중 오류가 발생했습니다.');
          }
        },
      )
    }
  };
  const handleCancel = () => {
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('NotePage', { title });
  };

  useEffect(()=>{
    if(!isLoading && !page){
      handleCancel()
    }
    page && setNewTitle(page.title);
  }, [page, isLoading])
  useEffect(()=>{
    if (!isLoading){
      setNewPath(path)
    }
  }, [section, isLoading])
  const paragraphItem = paragraph.find(v=>v.path===path)
  const newParagraphItem = newParagraph.find(v=>v.path===newPath)
  const moveDisabled = !newTitle.trim() || newParagraphItem === undefined
  return (
    <ScrollView style={commonStyles.container}>
      <View style={commonStyles.card}>
        <View style={{flexDirection:window==='landscape'?'row':'column', zIndex:1}}>
          <View style={{zIndex:1}}>
            <Text style={commonStyles.text}>{section?"현재 노트 제목 및 문단:":"현재 노트 제목:"}</Text>
            <Text style={[commonStyles.title, styles.columns]}>{titleFormat({title, section})}</Text>
            <Text style={commonStyles.text}>새 노트 제목 및 문단:</Text>
            <SearchBar handlePress={setNewTitle} useRandom={false}/>
            <View style={styles.columns}>
              <HeaderSelectBar path={newPath} onPress={(item)=>setNewPath(item.path)} root={newPage?.title || ''} data={newParagraph}/>
            </View>
          </View>
          <View style={{flex:1}}>
            <Text style={commonStyles.text}> 미리보기:</Text>
            <TouchableOpacity
              style={[commonStyles.button, styles.moveButton, {flex:0, flexDirection:'row', alignItems:'center', paddingTop:24, paddingBottom:16}]} 
              onPress={()=>setPreview(!preview)}
            >
              <Text style={commonStyles.title}>{titleFormat({title, section:paragraphItem?.title})}</Text>
              <Text style={[commonStyles.text, {marginBottom:8,  fontSize:14}]}>  ➜  </Text>
              <Text style={commonStyles.title}>{titleFormat({title:newTitle, section:newParagraphItem?.title})}</Text>   
            </TouchableOpacity>
              {preview!==undefined && <View style={{display:preview?'flex':'none'}}>
              <EditorViewer
                  active
                  value={targetDescription}
                  theme={theme}
                  autoResize
                />
              </View>}
          </View>
        </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[commonStyles.button, styles.cancelButton]} 
            onPress={handleCancel}
          >
            <Text style={commonStyles.buttonText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[commonStyles.button, moveDisabled?styles.cancelButton:styles.moveButton]} 
            onPress={handleMove}
            disabled={moveDisabled}
          >
            <Text style={commonStyles.buttonText}>이동</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  columns: { 
    marginTop: 8, 
    marginBottom: 16 
  },
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