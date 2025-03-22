import { StackScreenProps } from '@react-navigation/stack';
import { ScrollView, View } from 'react-native';
import  { CommonButton, View as ThemedView,  useLangContext } from '@blacktokki/core'

import React, { useLayoutEffect,useMemo,useRef,useState } from 'react';
import useContentList, { useContentMutation } from '../../hooks/useContentList';
import { TextInput } from 'react-native-paper';
import { useAuthContext } from '@blacktokki/account';
import { navigate } from '@blacktokki/navigation';
import useContent from '../../hooks/useContent';
import NoteSection, { CellHistory } from './NoteSection';
import { CellType } from '../../types';
import { toRaw } from '@blacktokki/editor';
import { useOpenedContext } from '../../hooks/useNotebookContext';
import { CellItem } from '../../components/Cell';

const useIsSaved = (init:CellItem[]|undefined, cells:CellItem[]|undefined)=>{
  const original = useMemo(()=>JSON.stringify(init?.map(v=>({...v, id:undefined}))), [init])
  const isSaved = useMemo(()=>cells===undefined || original===JSON.stringify(cells?.map(v=>({...v, id:undefined}))), [original, cells])
  return isSaved
}



export default function NoteScreen({ navigation, route }: StackScreenProps<any, 'Editor'>) {
  const params = {
    created: route?.params?.id === undefined,
    id: parseInt(route?.params?.id),
    parentId: route?.params?.parentId!==undefined?parseInt(route?.params?.parentId):undefined
  } as { created:true, parentId:number } | { created:false, id:number }
  const cellRef: Parameters<typeof NoteSection>[0]['cellRef'] = useRef()
  const { lang } = useLangContext()
  const { auth } = useAuthContext()
  const { openedIds, addOpenedIds, deleteOpenedIds } = useOpenedContext()

  const content = useContent(params.created?undefined:params.id)
  const contents = useContentList(params.created?undefined:params.id)
  const init = useMemo(()=>{
    return (params.created?[]:contents)?.map(v=>({id: `${v.id}`, type:v.type as CellType, content:v.title, output:v.description || '', executionCount:v.option.EXECUTION_COUNT?parseInt(v.option.EXECUTION_COUNT, 10):null, status:(v.option.EXECUTION_STATUS || 'idle') as any}))
  }, [contents])
  const [unsaved, _setUnsaved] = useState<Record<number, CellHistory>>({})
  const unsavedKey = params.created?params.parentId:params.id
  const cellsHistory = unsaved[unsavedKey] as (CellHistory | undefined)
  const setHistory = (history?:CellHistory)=>{
    const u = {...unsaved};
    if (history){
      u[unsavedKey] = history
    }
    else{
      delete u[unsavedKey]
    }
    _setUnsaved(u)
  }
  const cells = cellsHistory?.present.map(v=>cellsHistory.cells[v])
  const contentMutation = useContentMutation()
  const [title, setTitle] = useState<string>()
  const [editPage, setEditPage] = useState(false)
  const isSaved = useIsSaved(init, cells)
  const onSaveTitle = () => {
        if (!auth.user){
          return;
      }
      let promise
      const description = cells?cells.map((v, i)=>{
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
      const created = userId && cells ? cells.map((v, i)=>({
        userId, parentId, type:v.type, order:i, description:v.output, title:v.content, option:{EXECUTION_COUNT:v.executionCount!==null?`${v.executionCount}`:undefined, EXECUTION_STATUS: v.status} })):[]
      return contentMutation.updateCells({created, deleted:{parentId}})
    })
  }

  useLayoutEffect(()=>{
    if(init){
        if(params.created){
          setEditPage(false)
          setTitle(lang("New Page"))
          addOpenedIds(params.parentId, true)
          cellsHistory === undefined && setHistory({
            past: [],
            present: [],
            future: [],
            cells: {}
          })
        }
        else if (content){
          setEditPage(false)
          setTitle(content.title)
          addOpenedIds(content.id, false)
          cellsHistory === undefined && setHistory({
            past: [],
            present: init.map(v=>v.id),
            future: [],
            cells: Object.fromEntries(init.map(v=>[v.id, v]))
          })
        }
    }
    }, [init, content])

  useLayoutEffect(() => {
    if (params.created || content){
        navigation.setOptions({
            title:isSaved?title:`${title}*`,
            headerRight: () => <View style={{flexDirection: 'row'}}>
              {!isSaved && <CommonButton title={'💾'} onPress={onSave} style={{paddingTop:8, marginRight:10}}/>}
              <CommonButton title={'✏️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>setEditPage(true)}/>
              <CommonButton title={'❌'} onPress={exit} style={{paddingTop:8, marginRight:10}}/>
            </View>,
            headerShown: !editPage
          });
      }
  }, [navigation, content, contents, title, editPage, isSaved]);

  const back = ()=>{
    if(navigation.canGoBack())
      navigation.goBack()
    else {
      let nextId:any = undefined;
      if(openedIds.length > 0){
        const values = [...openedIds.values()]
        const i = values.findIndex(v=>params.created?v.parentId===params.parentId:v.id===content?.id)
        nextId = values[i>=0?(i===values.length-1?i-1:i+1):(values.length-1)]
      }
      if (nextId!==undefined){
        navigation.navigate('NoteScreen', nextId.created?{parentId:nextId.parentId}:{id:nextId.id})
      }
      else{
        navigation.navigate('HomeScreen', {tab:1})
      }
    }
  }
  const exit = ()=> {
    deleteOpenedIds(unsavedKey, params.created)
    setHistory(undefined)
    back()
  }
  return <ThemedView style={{width:"100%", height:"100%"}}>
     <ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1}}>
     {editPage ? <>
        {title!==undefined && <TextInput mode='outlined' value={title} onChangeText={setTitle} style={{borderRadius:20, margin:1}}/>}
        <CommonButton title={lang('save')} onPress={onSaveTitle} style={{height:65, paddingVertical:20}}/>
        <CommonButton title={lang('cancel')} onPress={()=>setEditPage(false)} style={{height:65, paddingVertical:20}}/>
        {content && <CommonButton title={lang('delete')} textStyle={{color:'red'}} style={{height:65, paddingVertical:20}} onPress={()=>contentMutation.delete(content.id).then(v=>exit())}/>}
      </>:
      cellsHistory !==undefined && <NoteSection cellsHistory={cellsHistory} setHistory={setHistory} cellRef={cellRef}/>}
    </ScrollView>
  </ThemedView>
}
