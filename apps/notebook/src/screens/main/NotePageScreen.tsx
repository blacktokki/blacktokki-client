import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/FontAwesome';
import { NavigationParamList } from '../../types';
import { useNotePage } from '../../hooks/useNoteStorage';
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

export const NotePageScreen: React.FC = () => {
  const route = useRoute<NotePageScreenRouteProp>();
  const { title, section } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const commonStyles = createCommonStyles(theme);
  const [toc, toggleToc] = useState(false)
  

  const { data: page, isLoading } = useNotePage(title);

  const handleEdit = () => {
    navigation.navigate('EditPage', { title });
  };
  
  const handleMovePage = () => {
    navigation.navigate('MovePage', { title, section });
  };

  const paragraph = parseHtmlToSections(page?.description||'');
  const [description, setDescription] = useState<string>()
  useEffect(()=>{
    if(description === undefined) {
      setDescription(section?sectionDescription(paragraph, section, true) :page?.description)
    }
    else {
      return () => setDescription(undefined);
    }
  }, [page, section, description])

  useEffect(()=>{
    toggleToc(false)
  }, [route])

  return (<>
    {_window === 'portrait' && <SearchBar/>}
    <ScrollView style={[
      commonStyles.container, 
      //@ts-ignore
      {paddingRight:12, scrollbarGutter: 'stable'}]}>
      <View style={commonStyles.header}>
        <TouchableOpacity onPress={()=>navigation.navigate('NotePage', { title })}>
          <Text style={[commonStyles.title, styles.pageTitle]} numberOfLines={1}>
            {titleFormat({title, section})}
          </Text>
        </TouchableOpacity>
        {!!page?.description && <View style={styles.actionButtons}>
          <TouchableOpacity onPress={()=>toggleToc(!toc)} style={styles.actionButton}>
            <Icon name="list" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMovePage} style={styles.actionButton}>
            <Icon name="exchange" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
          </TouchableOpacity>
          {section
          ?undefined
          :<>
            <TouchableOpacity onPress={handleEdit} style={styles.actionButton}>
              <Icon name="pencil" size={16} color={theme === 'dark' ? '#E4E4E4' : '#333333'} />
            </TouchableOpacity>
          </>}
        </View>}
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