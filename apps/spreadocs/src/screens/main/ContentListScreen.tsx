import { StackScreenProps } from '@react-navigation/stack';
import { ScrollView,  View } from 'react-native';
import  { CommonButton, View as ThemedView, useLangContext } from '@blacktokki/core'

import React, { useLayoutEffect,useState } from 'react';
import useContentList, { useContentMutation } from '../../hooks/useContentList';
import { TextInput } from 'react-native-paper';
import { useAuthContext } from '@blacktokki/account';
import { navigate } from '@blacktokki/navigation';
import { Content } from '../../types';
import ContentList from '../../components/ContentList';

export default function ContentListScreen({ navigation, route }: StackScreenProps<any, 'ContentList'>) {
  const params = {
    created: route?.params?.id === undefined,
    id: parseInt(route?.params?.id),
    type: route?.params?.type
  } as { created:true, type:'LIBRARY'|'TIMELINE' } | { created:false, id:number }
  const { lang } = useLangContext()
  const { auth } = useAuthContext()

  const list = useContentList(0);
  const contentMutation = useContentMutation()
  const content = params.created?undefined:list?.find(v=>v.id===params.id)
  const [input, setInput] = useState<string>()
  const [type, setType] = useState<Content['type']>()
  const [editable, setEditable] = useState(false)
  const onSave = ()=>{
    if (!auth.user || (content?.input == input) || type===undefined){
        setEditable(false)
        return;
    }
    let promise
    if (params.created){
        const typedList = list?.filter(v=>v.type == params.type)
        promise = contentMutation.create({userId:auth.user.id, parentId:0, type, order: (typedList?.length || 0) + 1, input:input || ''}).then(v=>{
            navigate("ContentListScreen", {id:v})
        })
    }
    else if (content!==undefined){
        promise = contentMutation.update({id: content.id, updated: {...content, type, input:input || ''}})
    }
    promise?.then(()=>{
        setEditable(false)
    })
  }

  const defaultTitle = {
    'LIBRARY': lang('New Library'),
    'TIMELINE': lang('New Timelines')
  } as Record<Content['type'], string>

  const onEdit = ()=>{setEditable(true)}
  useLayoutEffect(()=>{
    if(params.created){
      setEditable(false)
      setInput(defaultTitle[params.type])
      setType(params.type)
    }
    else if (content){
      setEditable(false)
      setInput(content.input)
      setType(type)
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
              {content.type==='LIBRARY' && <CommonButton title={'⊕'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>navigate('EditorScreen', {parentId:content.id})}/>}
              <CommonButton title={'✏️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={onEdit}/>
              <CommonButton title={'🗑️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>contentMutation.delete(content.id).then(v=>back())}/>
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
    {editableExact?
      <>
        {input!==undefined && <TextInput mode='outlined' value={input} onChangeText={setInput} style={{borderRadius:20, margin:1}}/>}
        <CommonButton title={lang('save')} onPress={onSave} style={{height:65, paddingVertical:20}}/>
      </>:
      <ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1}}>
        {content && <ContentList parentContent={content}/>}
      </ScrollView>}
    </ThemedView>
}
