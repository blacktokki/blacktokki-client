import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet, FlatList, ScrollView } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { NavigationParamList } from '../../types';
import { useCreateOrUpdatePage, useMovePage, useNotePage } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { SearchBar } from '../../components/SearchBar';

type MovePageScreenRouteProp = RouteProp<NavigationParamList, 'MovePage'>;

interface NodeData {
  path: string;
  title: string;
  level: number;
  header: string;
  description: string;
}

function parseHtmlToSections(html: string): NodeData[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const result: NodeData[] = [{path:"", title:"", header:"", level:0, description:""}];

  const headings: string[] = ["H1", "H2", "H3", "H4", "H5", "H6"];
  const headerStack: { level: number; title: string }[] = [];

  let current: NodeData | null = null;
  let cursor = doc.body.firstChild;

  const flushCurrent = () => {
    if (current) {
      result.push(current);
      current = null;
    }
  };

  while (cursor) {
    if (cursor.nodeType === Node.ELEMENT_NODE) {
      const el = cursor as HTMLElement;
      if (headings.includes(el.tagName)) {
        flushCurrent();

        const level = parseInt(el.tagName.substring(1));
        const title = el.textContent?.trim() || "";

        // 헤더 스택 업데이트
        while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
          headerStack.pop();
        }
        headerStack.push({ level, title });

        const path = headerStack.map(h => h.title).join(" > ");

        current = {
          path,
          title,
          level,
          header: el.outerHTML,
          description: "",
        };
      } else if (current) {
        current.description += el.outerHTML;
      } else {
        // 헤더 밖의 내용 처리
        result[0].description += el.outerHTML;
      }
    } else if (cursor.nodeType === Node.TEXT_NODE && current) {
      current.description += cursor.textContent || "";
    }

    cursor = cursor.nextSibling;
  }

  flushCurrent();
  return result;
}


function HeaderSelectBar(props:{root:string, path:string, setPath:(path:string)=>void, data:NodeData[]}){
  const theme = useColorScheme();
  const commonStyles = createCommonStyles(theme);
  const renderItem = (item:NodeData) => <TouchableOpacity
    style={styles.resultItem}
    onPress={() => props.setPath(item.path)}
  >
    {item.level===0 && <Icon name="file-text-o" size={18} color="#FFFFFF"/>}
    <Text style={[props.path===item.path?commonStyles.title:commonStyles.text, styles.resultText, {left:item.level * 10 + 10}]}>{item.level===0?props.root:item.title}</Text>
  </TouchableOpacity>
  return <View style={[styles.resultsContainer, theme === 'dark' ? styles.darkResults : styles.lightResults]}>
    <FlatList
      data={props.data}
      keyExtractor={(item) => item.path}
      renderItem={({ item }) => renderItem(item)}
      ItemSeparatorComponent={() => <View style={commonStyles.resultSeparator} />}
    />
  </View>
}

export const MovePageScreen: React.FC = () => {
  const route = useRoute<MovePageScreenRouteProp>();
  const { title } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const window = useResizeContext()
  const [newTitle, setNewTitle] = useState(title);
  const { data: page, isLoading } = useNotePage(title);
  const paragraph = parseHtmlToSections(page?.description|| '')
  const [path,setPath] = useState('')
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
    setNewPath('')
  }, [newTitle])

  const paragraphItem = paragraph.find(v=>v.path===path)
  const newParagraphItem = newParagraph.find(v=>v.path===newPath)
  const moveDisabled = !newTitle.trim() || newParagraphItem === undefined
  return (
    <ScrollView style={commonStyles.container}>
      <View style={commonStyles.card}>
        <View style={{flexDirection:window==='landscape'?'row':'column'}}>
          <View>
            <Text style={commonStyles.text}>현재 노트 제목:</Text>
            <Text style={[commonStyles.title, { marginTop: 8, marginBottom: 16 }]}>{title}</Text>
            <Text style={commonStyles.text}>현재 노트 문단:</Text>
            <HeaderSelectBar path={path} setPath={setPath} root={page?.title || ''} data={paragraph}/>
            <Text style={commonStyles.text}>새 노트 제목:</Text>
            <SearchBar handlePress={setNewTitle}/>
            <Text style={commonStyles.text}>새 노트 문단:</Text>
            <HeaderSelectBar path={newPath} setPath={setNewPath} root={newPage?.title || ''} data={newParagraph}/>
          </View>
          <View style={{flex:1}}>
            <Text style={commonStyles.text}> 미리보기:</Text>
            <TouchableOpacity
              style={[commonStyles.button, styles.moveButton, {flex:0, flexDirection:'row', alignItems:'center', paddingTop:24, paddingBottom:16}]} 
              onPress={()=>setPreview(!preview)}
            >
              <Text style={commonStyles.title}>{title}{paragraphItem?.level!==0?( "/"+paragraphItem?.title):""}</Text>
              <Text style={[commonStyles.text, {marginBottom:8,  fontSize:14}]}>  ▶  </Text>
              <Text style={commonStyles.title}>{newTitle}{newParagraphItem?.level!==0?( "/"+(newParagraphItem?.title || "?")):""}</Text>   
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
  backButton: {
    padding: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultsContainer: {
    borderWidth: 1,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 16
  },
  lightResults: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCCCCC',
  },
  darkResults: {
    backgroundColor: '#222222',
    borderColor: '#444444',
  },
  resultItem: {
    padding: 10,
    flexDirection:'row'
  },
  resultText: {
    fontSize: 14,
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