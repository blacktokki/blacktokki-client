import { StackScreenProps } from '@react-navigation/stack';
import { ScrollView, View } from 'react-native';
import  { CommonButton, View as ThemedView,  useLangContext } from '@blacktokki/core'

import React, { useLayoutEffect,useMemo,useRef,useState } from 'react';
import useContentList, { useContentMutation } from '../../hooks/useContentList';
import { TextInput } from 'react-native-paper';
import { useAuthContext } from '@blacktokki/account';
import { navigate } from '@blacktokki/navigation';
import useContent from '../../hooks/useContent';
import NoteSection from './NoteSection';
import { CellType } from '../../types';

export default function NoteScreen({ navigation, route }: StackScreenProps<any, 'Editor'>) {
  const params = {
    created: route?.params?.id === undefined,
    id: parseInt(route?.params?.id),
    parentId: route?.params?.parentId!==undefined?parseInt(route?.params?.parentId):undefined
  } as { created:true, parentId:number } | { created:false, id:number }
  const cellRef: Parameters<typeof NoteSection>[0]['cellRef'] = useRef()
  const { lang } = useLangContext()
  const { auth } = useAuthContext()

  const content = useContent(params.created?undefined:params.id)
  const contents = useContentList(params.created?undefined:params.id)
  const cellContents = useMemo(()=>{
    return (params.created?[]:contents)?.map(v=>({type:v.type as CellType, content:v.input, output:v.description || '', executionCount:null}))
  }, [contents])

  const contentMutation = useContentMutation()
  const [input, setInput] = useState<string>(lang("New Page"))
  const onSave = ()=>{
    if (!auth.user || (content?.input == input)){
        return;
    }
    let promise
    if (params.created){
        promise = contentMutation.create({userId:auth.user.id, parentId:params.parentId, type:'PAGE', order: 0, input:input || '', title:input || '', description: ''}).then(v=>{
            navigate("EditorScreen", {id:v})
        })
    }
    else if (content!==undefined){
        promise = contentMutation.update({id: content.id, updated: {...content, input:input || '', title:input || ''}})
    }
    promise?.then(()=>{
      const userId = auth.user?.id
      const created = userId &&  cellRef.current?cellRef.current.cells.map(v=>({userId, parentId:params.created?params.parentId:params.id, type:v.type, order:0, input:v.content, description:v.output, title:v.content })):undefined
      created && contentMutation.updateCells({created, deleteIds:[]})
    })
  }

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
              <CommonButton title={lang('save')} onPress={onSave} style={{paddingTop:8, marginRight:10}}/>
              <CommonButton title={'🗑️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>contentMutation.delete(content.id).then(v=>back())}/>
            </View>,
            headerShown: false
          });
      }
  }, [navigation, content]);

  const back = ()=>{
    if(navigation.canGoBack())
        navigation.goBack()
      else{
        navigation.navigate('HomeScreen', {tab:1})
      }
  }
  
  return <ThemedView style={{width:"100%", height:"100%"}}>
    {input!==undefined && <TextInput mode='outlined' value={input} onChangeText={setInput} style={{borderRadius:20, margin:1}}/>}
    <ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1}}>
      {cellContents !==undefined && <NoteSection init={cellContents} cellRef={cellRef}/>}
    </ScrollView>
  </ThemedView>
}
