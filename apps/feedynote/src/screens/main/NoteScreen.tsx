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
import { toRaw } from '@blacktokki/editor';

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
    return (params.created?[]:contents)?.map(v=>({type:v.type as CellType, content:v.title, output:v.description || '', executionCount:v.option.EXECUTION_COUNT?parseInt(v.option.EXECUTION_COUNT, 10):null, status:v.option.EXECUTION_STATUS}))
  }, [contents])
  const contentMutation = useContentMutation()
  const [title, setTitle] = useState<string>()
  const [editPage, setEditPage] = useState(false)
  const onSaveTitle = () => {
        if (!auth.user){
          return;
      }
      let promise
      const description = cellRef.current? cellRef.current.cells.map((v, i)=>{
        let str = toRaw(v.content).replaceAll(/\r\n/g, '');
        if(str.length > 32){
          str = str.substring(0, 32 - 2) + '...';
        }
        return str
      }).join('\r\n'):''
      if (params.created){
          promise = contentMutation.create({userId:auth.user.id, parentId:params.parentId, type:'PAGE', order: 0, title:title || '', description, option:{}}).then((v)=>{
            navigate("NoteScreen", {id:v});
            return v
          })
      }
      else if (content!==undefined){
        promise = contentMutation.update({id: content.id, updated: {...content, title:title || content.title, description}}).then(()=>params.id)
      }
      return promise
  }

  const onSave = ()=>{
    const promise = onSaveTitle()
    promise?.then((parentId)=>{
      const userId = auth.user?.id
      const created = userId && cellRef.current? cellRef.current.cells.map((v, i)=>({
        userId, parentId, type:v.type, order:i, description:v.output, title:v.content, option:{EXECUTION_COUNT:v.executionCount!==null?`${v.executionCount}`:undefined, EXECUTION_STATUS: v.status} })):[]
      const deleteIds = contents!==undefined?contents.map(v=>v.id):[]
      return contentMutation.updateCells({created, deleteIds})
    })
  }

  useLayoutEffect(()=>{
      if(params.created){
        setEditPage(false)
        setTitle(lang("New Page"))
      }
      else if (content){
        setEditPage(false)
        setTitle(content.title)
      }
    }, [content])

  useLayoutEffect(() => {
    if (params.created || content){
        navigation.setOptions({
            title,
            headerRight: () => <View style={{flexDirection: 'row'}}>
              <CommonButton title={'✏️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>setEditPage(true)}/>
              <CommonButton title={lang('save')} onPress={onSave} style={{paddingTop:8, marginRight:10}}/>
              {content && <CommonButton title={'🗑️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>contentMutation.delete(content.id).then(v=>back())}/>}
            </View>,
            headerShown: !editPage
          });
      }
  }, [navigation, content, contents, title, editPage]);

  const back = ()=>{
    if(navigation.canGoBack())
        navigation.goBack()
      else{
        navigation.navigate('HomeScreen', {tab:1})
      }
  }
  
  return <ThemedView style={{width:"100%", height:"100%"}}>
     <ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1}}>
     {editPage ? <>
        {title!==undefined && <TextInput mode='outlined' value={title} onChangeText={setTitle} style={{borderRadius:20, margin:1}}/>}
        <CommonButton title={lang('save')} onPress={onSaveTitle} style={{height:65, paddingVertical:20}}/>
        <CommonButton title={lang('cancel')} onPress={()=>setEditPage(false)} style={{height:65, paddingVertical:20}}/>
        {content && <CommonButton title={lang('delete')} textStyle={{color:'red'}} style={{height:65, paddingVertical:20}} onPress={()=>contentMutation.delete(content.id).then(v=>back())}/>}
      </>:
      cellContents !==undefined && <NoteSection init={cellContents} cellRef={cellRef}/>}
    </ScrollView>
  </ThemedView>
}
