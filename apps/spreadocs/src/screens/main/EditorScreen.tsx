import { StackScreenProps } from '@react-navigation/stack';
import { Linking, ScrollView, TouchableOpacity, View } from 'react-native';
import { Editor, EditorHtml } from '@blacktokki/editor';
import  { Colors, CommonButton, Text, View as ThemedView, useColorScheme, useLangContext } from '@blacktokki/core'
import Hyperlink from "react-native-hyperlink";

import React, { useLayoutEffect,useState } from 'react';
import useContentList, { useContentMutation } from '../../hooks/useContentList';
import { TextInput } from 'react-native-paper';
import { useAuthContext } from '@blacktokki/account';
import { navigate } from '@blacktokki/navigation';
import { Content } from '../../types';
import useContent from '../../hooks/useContent';
import usePreview from '../../hooks/usePreview';

export default function EditorScreen({ navigation, route }: StackScreenProps<any, 'Editor'>) {
  const params = {
    created: route?.params?.id === undefined,
    id: parseInt(route?.params?.id),
    parentId: route?.params?.parentId!==undefined?parseInt(route?.params?.parentId):0
  } as { created:true, parentId:number } | { created:false, id:number }
  const theme = useColorScheme()
  const { lang } = useLangContext()
  const { auth } = useAuthContext()

  const content = useContent(params.created?undefined:params.id)
  const list = useContentList(content?.parentId)

  const contentMutation = useContentMutation()
  const [input, setInput] = useState<string>()
  const [description, setDescription] = useState<string>()
  const [type, setType] = useState<Content['type']>()
  const [editable, setEditable] = useState(false)
  const preview = usePreview('SCRAP', input|| '')
  const onSave = ()=>{
    if (!auth.user || (content?.input == input && content?.description == description) || type===undefined){
        setEditable(false)
        return;
    }
    let promise
    if (params.created){
        promise = contentMutation.create({userId:auth.user.id, parentId:params.parentId, type, order: (list?.length || 0) + 1, input:input || '', title:input || '', description}).then(v=>{
            navigate("EditorScreen", {id:v})
        })
    }
    else if (content!==undefined){
        promise = contentMutation.update({id: content.id, updated: {...content, type, input:input || '', title:input || '', description}})
    }
    promise?.then(()=>{
        setEditable(false)
    })
  }

  const defaultTitle = {
    'NOTE': lang('New Note')
  } as Record<Content['type'], string>

  const onEdit = ()=>{setEditable(true)}
  useLayoutEffect(()=>{
    if(params.created){
      const _type = 'NOTE'
      setEditable(false)
      setInput(defaultTitle[_type])
      setDescription('')
      setType(_type)
    }
    else if (content){
      setEditable(false)
      setInput(content.input)
      setDescription(content.description)
      setType(content.type)
    }
  }, [content])

  useLayoutEffect(() => {
    if (params.created){
      navigation.setOptions({
        headerShown:false,
      })
    }
    else if (content){
        navigation.setOptions({
            title: content.title,
            headerRight: () => <View style={{flexDirection: 'row'}}>
              {content.type === 'FEEDCONTENT'?
                <CommonButton title={'🌐'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>Linking.openURL(content.input)}/>:
                <>
                  <CommonButton title={'✏️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={onEdit}/>
                  <CommonButton title={'🗑️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>contentMutation.delete(content.id).then(v=>back())}/>
                </>}
            </View>,
            headerShown: !editable
          });
      }
  }, [navigation, content, editable]);

  const back = ()=>{
    if(navigation.canGoBack())
        navigation.goBack()
      else{
        navigation.navigate('HomeScreen', {tab:1})
      }
  }
  const editableExact = (params.created || editable)
  return <ThemedView style={{width:"100%", height:"100%"}}>
    {editableExact && input!==undefined && <TextInput mode='outlined' value={input} onChangeText={setInput} style={{borderRadius:20, margin:1}}/>}
    {editableExact && preview?.description && <View style={{height:200}}>
      <EditorHtml content={preview.description}/>
    </View>}
    {type === 'NOTE' && <Editor theme={theme} active={editableExact} value={description || ''} setValue={editableExact?setDescription:()=>{}}/>}
    {editableExact?
      <CommonButton title={lang('save')} onPress={onSave} style={{height:65, paddingVertical:20}}/>:
      <ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1}}>
        <TouchableOpacity style={{flex:1, borderColor:Colors[theme].headerBottomColor, borderBottomWidth:1}} disabled={content?.type==='FEEDCONTENT'} onPress={onEdit} onLongPress={onEdit}>
          {/* @ts-ignore */}
          {content?.type==='FEEDCONTENT' && <Hyperlink linkDefault={ true } style={{wordBreak:"break-word", padding:15}} linkStyle={{color: '#12b886'}}>
            <Text selectable>{content.input}</Text>
          </Hyperlink>}
          <EditorHtml content={description || ''}/>
        </TouchableOpacity>
      </ScrollView>}
    </ThemedView>
}
