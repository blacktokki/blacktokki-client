import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/FontAwesome';
import { NavigationParamList } from '../../types';
import { useNotePage, useSnapshotPages } from '../../hooks/useNoteStorage';
import { createCommonStyles } from '../../styles';
import { useColorScheme, useResizeContext } from '@blacktokki/core';
import { EditorViewer } from '@blacktokki/editor';
import { onLink, SearchBar, titleFormat } from '../../components/SearchBar';
import HeaderSelectBar, { NodeData, parseHtmlToSections } from '../../components/HeaderSelectBar';
import { useIsFocused } from '@react-navigation/native';

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
  const isFocused = useIsFocused();
  const route = useRoute<NotePageScreenRouteProp>();
  const { title, section, archiveId } = route.params;
  const navigation = useNavigation<StackNavigationProp<NavigationParamList>>();
  const theme = useColorScheme();
  const _window = useResizeContext();
  const commonStyles = createCommonStyles(theme);
  const [toc, toggleToc] = useState(false)
  const [fullSection, toggleFullSection] = useState(false)
  

  const { data: page, isFetching } = useNotePage(title);
  const { data:archives } = useSnapshotPages()
  const archive = archiveId?archives?.find(v=>v.id===archiveId &&v.description !== page?.description):undefined

  const handleEdit = () => {
    navigation.navigate('EditPage', { title });
  };
  
  const handleMovePage = () => {
    navigation.navigate('MovePage', { title, section });
  };

  const paragraph = parseHtmlToSections(page?.description||'');
  const idx = paragraph.findIndex(v=>v.title===section)
  const moveSections = [
    {icon: 'arrow-left', moveSection: paragraph.findLast((v, i)=>i < idx && (fullSection?paragraph[idx]?.level >= v.level:true)), reverse:false},
    {icon: 'arrow-right', moveSection: paragraph.find((v, i)=>i > idx && (fullSection?paragraph[idx]?.level >= v.level:true)), reverse:true}
  ]
  const [description, setDescription] = useState<string>()
  useEffect(()=>{
    setDescription(archive?archive.description:(section?(fullSection?sectionDescription(paragraph, section, true):paragraph.find(v=>v.title===section)?.description):page?.description)?.trim())
  }, [page, archive, section, fullSection])
  useEffect(()=>{
    toggleToc(false)
  }, [route])
  const splitTitle = getSplitTitle(title)
  const iconColor = theme === 'dark' ? '#E4E4E4' : '#333333'
  const pressableTextColor = theme === 'dark' ? '#FFFFFF88' : '#00000088'
  return isFocused && (<>
    {_window === 'portrait' && <SearchBar/>}
    <ScrollView 
      //@ts-ignore
      style={[commonStyles.container, {paddingRight:12, scrollbarGutter: 'stable'}]}
      contentContainerStyle={{flexGrow:1}}
    >
      <View style={commonStyles.header}>
        <View style={{flexDirection:'row'}}>
          <TouchableOpacity onPress={()=>(splitTitle.length === 2?navigation.push:navigation.navigate)('NotePage', { title:splitTitle[0] })} >
            <Text style={[commonStyles.title, styles.pageTitle, section || splitTitle.length === 2 ? {color: pressableTextColor}: {}]} numberOfLines={1}>{splitTitle[0]}</Text>
          </TouchableOpacity>
           {splitTitle.length === 2 && <>
            <Text style={[commonStyles.title, styles.pageTitle, {flex:0}]}>/</Text>
            <TouchableOpacity onPress={()=>navigation.navigate('NotePage', { title })}> 
              <Text style={[commonStyles.title, styles.pageTitle, section?{color: pressableTextColor}:{}]} numberOfLines={1}>{splitTitle[1]}</Text>
            </TouchableOpacity>
          </>}
          {!!section && <Text style={[commonStyles.title, styles.pageTitle, {marginLeft:5}]} numberOfLines={1}>{titleFormat({title:"", section})}</Text>}
          {archive && <Text style={[commonStyles.text, {marginLeft:5, fontStyle:'italic'}]}>{"(" + archive.updated + ")"}</Text>}
        </View>
        <View style={styles.actionButtons}>
          {!section && <>
            <TouchableOpacity onPress={()=>navigation.navigate('Archive', { title })} style={styles.actionButton}>
              <Icon name="history" size={16} color={iconColor} />
            </TouchableOpacity>
          </>}
          {!!section && <>
            <TouchableOpacity onPress={()=>toggleFullSection(!fullSection)} style={styles.actionButton}>
              <Icon name={fullSection?"compress":"expand"} size={16} color={iconColor} />
            </TouchableOpacity>
          </>}
          {!!(section || description) && !archive && <>
            <TouchableOpacity onPress={()=>toggleToc(!toc)} style={styles.actionButton}>
              <Icon name="list" size={16} color={iconColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleMovePage} style={styles.actionButton}>
              <Icon name="exchange" size={16} color={iconColor} />
            </TouchableOpacity>
          </>}
          {!!(section || description) && !archive && !section && <>
            <TouchableOpacity onPress={handleEdit} style={styles.actionButton}>
              <Icon name="pencil" size={16} color={iconColor} />
            </TouchableOpacity>
          </>}
        </View>
      </View>
      <View style={commonStyles.flex}>
          <View style={!toc && description?[commonStyles.card, {padding:0, marginBottom:0}]:{flex:1, position:'absolute'}}>
            <EditorViewer
              active
              value={description || ''}
              theme={theme}
              onLink={(url)=>onLink(url, navigation)}
              autoResize
            />
          </View>
          {(isFetching || description===undefined) ? <View style={[commonStyles.card, commonStyles.centerContent]}>
            <ActivityIndicator size="large" color="#3498DB" />
          </View>
          :toc? <HeaderSelectBar data={paragraph} path={section || ''} root={title} onPress={(item)=>navigation.navigate('NotePage', {title, section:item.title})}/>
          :page?.description ? (!!section && <View style={{flex:1, flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end'}}>
            {moveSections.map(({moveSection, icon, reverse})=>moveSection!==undefined && <TouchableOpacity 
                key={icon} 
                onPress={()=>navigation.navigate('NotePage', moveSection.level===0?{title}:{title, section:moveSection.title})} 
                style={[{flexDirection: reverse?'row-reverse':'row', paddingVertical:16}]}
            >
              <Icon name={icon} size={16} color={iconColor} style={{alignSelf:'center'}} />
              <Text style={[commonStyles.text, {fontWeight:'bold', marginHorizontal:16}]}>{moveSection.level===0?title:moveSection.title}</Text>
            </TouchableOpacity>)}
            
          </View>) : (
            <View style={[commonStyles.card, commonStyles.centerContent]}>
              <Text style={commonStyles.text}>
                아직 내용이 없는 문서입니다. 
                '편집' 버튼을 눌러 내용을 추가해보세요.
              </Text>
              <TouchableOpacity onPress={handleEdit} style={commonStyles.button}>
                <Text style={commonStyles.buttonText}>편집하기</Text>
              </TouchableOpacity>
            </View>)}
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