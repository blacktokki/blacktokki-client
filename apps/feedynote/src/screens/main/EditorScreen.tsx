import { StackScreenProps } from '@react-navigation/stack';
import { Linking, ScrollView, View } from 'react-native';
import { Editor, EditorHtml } from '@blacktokki/editor';
import  { CommonButton, View as ThemedView, useColorScheme, useLangContext } from '@blacktokki/core'

import React, { useLayoutEffect,useState } from 'react';
import useContentList, { useContentMutation } from '../../hooks/useContentList';
import { TextInput } from 'react-native-paper';
import { useAuthContext } from '@blacktokki/account';
import { navigate } from '@blacktokki/navigation';
import { Content } from '../../types';
import useContent from '../../hooks/useContent';
import usePreview, { renderDescription } from '../../hooks/usePreview';


const Scrap = React.memo((props:{url:string, replacer:(template:string)=>void})=>{
  const preview = usePreview('SCRAP', props.url)
  return preview?.description && <View style={{height:155, flexDirection:'row'}}>
    <EditorHtml content={preview.description}/>
    <CommonButton title={'✨'} onPress={()=>props.replacer(preview.description)} style={{height:155, paddingTop:65}}/>
  </View>
})


const _tmp = (re:RegExp, description :string)=>{
  let str = description;
  let index = 0;
  let match;
  let arr = []
  while ((match = new RegExp(re).exec(str)) != null) {
    arr.push({index, str:str.substring(0, match.index)})
    const end = match.index + match[0].length
    arr.push({index:index + match.index, str:str.substring(match.index, end)})
    index += end;
    str = str.substring(end)
  }
  arr.push({index, str})
  return arr
}


const _extractUrl = (description:string)=>{
  const arr:{pos:number, url:string}[] = []
  const re = /https?:\/\/(?:www\\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi
  _tmp(/(<a .*?href="(.*?)".*?>(.*)<\/a>|<img .*?src="(.*?)".*?\/>)/, description).forEach((v, i)=>{
    if (i % 2 == 1){
      return;
    }
    _tmp(re, v.str).forEach((v2, i2)=>{
      if( i2 % 2 == 1){
        arr.push({pos:v.index + v2.index, url:v2.str})
      }
    })
  })
  return arr
}

const renderScrap = (setDescription:(d:string)=>void, description?:string) => {
  if (description === undefined){
    return undefined
  }
  return _extractUrl(description).map((v, k)=><Scrap key={k} url={v.url} replacer={(template)=>{
    setDescription(description.substring(0, v.pos) + template + description.substring(v.pos + v.url.length))
  }}/>)
}


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
    {type === 'NOTE' && <Editor theme={theme} active={editableExact} value={description || ''} setValue={editableExact?setDescription:()=>{}}/>}
    {editableExact && <>
      {renderScrap(setDescription, description)}
      <CommonButton title={lang('save')} onPress={onSave} style={{height:65, paddingVertical:20}}/>
    </>}
    <ScrollView style={{flex:editableExact?0:1}} contentContainerStyle={{flexGrow:1}}>
      <EditorHtml content={content?.type==='FEEDCONTENT'?renderDescription({...content, url:content.input}): description || ''} onPress={content?.type==='FEEDCONTENT'?undefined:onEdit}/>
    </ScrollView>
    </ThemedView>
}
