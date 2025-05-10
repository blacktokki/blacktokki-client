import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/FontAwesome';
import { NavigationParamList } from '../../types';
import { useNotePage, useSnapshotPages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { SearchBar, titleFormat, urlToNoteLink } from '../../components/SearchBar';
import HeaderSelectBar, { NodeData, parseHtmlToSections } from '../../components/HeaderSelectBar';

type NotePageScreenRouteProp = RouteProp<NavigationParamList, 'NotePage'>;

export const sectionDescription = (paragraph:NodeData[], section:string, rootTitle:boolean) => {
  const path = paragraph.find(v=>v.title===section)?.path
  return path?paragraph.filter(v=>v.path.startsWith(path)).map(v=>((rootTitle || v.path!==path)?v.header:"") + v.description).join(""):""
}

export const getSplitTitle = (title:string) => {
  const splitTitle = title.split("/")
  if (splitTitle.length<2) {
    return [title]
  }
  return [splitTitle.slice(0, splitTitle.length -1).join("/"), splitTitle[splitTitle.length -1]]
}

export const NotePageScreen: React.FC = () => {
  const route = useRoute<NotePageScreenRouteProp>();
  const { title, section, archiveId } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const commonStyles = createCommonStyles(theme);
  const [toc, toggleToc] = useState(false)
  

  const { data: page, isLoading } = useNotePage(title);
  const { data:archives } = useSnapshotPages()
  const archive = archiveId?archives?.find(v=>v.id===archiveId &&v.description !== page?.description):undefined

  const handleEdit = () => {
    console.log('@', title)
    navigation.navigate('EditPage', { title });
  };
  
  const handleMovePage = () => {
    navigation.navigate('MovePage', { title, section });
  };

  const paragraph = parseHtmlToSections(page?.description||'');
  const [description, setDescription] = useState<string>()
  useEffect(()=>{
    if(description === undefined) {
      setDescription(archive?archive.description:section?sectionDescription(paragraph, section, true) :page?.description)
    }
    else {
      return () => setDescription(undefined);
    }
  }, [page, archive, section, description])

  useEffect(()=>{
    toggleToc(false)
  }, [route])
  const splitTitle = getSplitTitle(title)

  return (<>
    {_window === 'portrait' && <SearchBar/>}
    <ScrollView style={[
      commonStyles.container, 
      //@ts-ignore
      {paddingRight:12, scrollbarGutter: 'stable'}]}>
      <View style={commonStyles.header}>
        <View style={{flexDirection:'row'}}>
          <TouchableOpacity onPress={()=>navigation.navigate('NotePage', { title:splitTitle[0] })}>
            <Text style={[commonStyles.title, styles.pageTitle]} numberOfLines={1}>{splitTitle[0]}</Text>
          </TouchableOpacity>
          {splitTitle.length === 2 && <Text style={[commonStyles.title, styles.pageTitle]} numberOfLines={1}>{"/"+splitTitle[1]}</Text>}
          {section && <Text style={[commonStyles.title, styles.pageTitle, {marginLeft:5}]} numberOfLines={1}>{titleFormat({title:"", section})}</Text>}
          {archive && <Text style={[commonStyles.text, {marginLeft:5, fontStyle:'italic'}]}>{"(" + archive.updated + ")"}</Text>}
        </View>
        <View style={styles.actionButtons}>
          {!section && <>
            <TouchableOpacity onPress={()=>navigation.navigate("Archive", { title })} style={styles.actionButton}>
              <Icon name="history" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
            </TouchableOpacity>
          </>}
          {!!description && !archive && <>
            <TouchableOpacity onPress={()=>toggleToc(!toc)} style={styles.actionButton}>
              <Icon name="list" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleMovePage} style={styles.actionButton}>
              <Icon name="exchange" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
            </TouchableOpacity>
          </>}
          {!!description && !archive && !section && <>
            <TouchableOpacity onPress={handleEdit} style={styles.actionButton}>
              <Icon name="pencil" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
            </TouchableOpacity>
          </>}
        </View>
      </View>
      <View style={commonStyles.flex}>
        {isLoading ? (
          <View style={[commonStyles.card, commonStyles.centerContent]}>
            <ActivityIndicator size="large" color="#3498DB" />
          </View>
        ) : <>
          <View style={!toc && description?[commonStyles.card, {flex:1, padding:0}]:{flex:1, position:'absolute'}}>
            <EditorViewer
              active
              value={description || ''}
              theme={theme}
              onLink={(url)=>{
                const noteLink = urlToNoteLink(url);
                if(noteLink){
                  navigation.navigate("NotePage", noteLink)
                }
                else{
                  window.open(url, '_blank');
                }
              }}
              autoResize
            /> 
          </View>
          {toc? <HeaderSelectBar data={paragraph} path={section || ''} root={title} onPress={(item)=>navigation.navigate('NotePage', {title, section:item.title})}/>
          :page?.description ? undefined : (
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
  </>);
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