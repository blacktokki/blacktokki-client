import { StackScreenProps } from '@react-navigation/stack';
import { ScrollView,  View } from 'react-native';
import  { CommonButton, Text, View as ThemedView, useLangContext } from '@blacktokki/core'

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
    id:  route?.params?.id==="*"?"*":parseInt(route?.params?.id),
    type: route?.params?.type
  } as { created:true, type:'NOTEV2'|'TIMELINEV2' } | { created:false, id:number| "*" }
  const { lang } = useLangContext()
  const { auth } = useAuthContext()

  const rootlist = useContentList(0);
  const schedulelist = useContentList(undefined, "TIMELINEV2")
  const list = rootlist!==undefined && schedulelist!==undefined ? [...rootlist, ...schedulelist]: undefined
  const contentMutation = useContentMutation()
  const content = params.created?undefined:list?.find(v=>v.id===params.id)
  const [input, setInput] = useState<string>()
  const [editable, setEditable] = useState(false)
  const type = params.created?params.type:content?.type
  const back = ()=>{
    if(navigation.canGoBack())
        navigation.goBack()
      else{
        navigation.navigate('HomeScreen', {tab:1})
      }
  }
  const onSave = ()=>{
    if (!auth.user || (content?.input == input) || type===undefined){
        setEditable(false)
        return;
    }
    let promise
    const title = input || ''
    if (params.created){
        const typedList = list?.filter(v=>v.type == params.type)
        promise = contentMutation.create({userId:auth.user.id, parentId:0, type, order: (typedList?.length || 0) + 1, input:input || '', title}).then(v=>{
            navigate("ContentListScreen", {id:v})
        })
    }
    else if (content!==undefined){
        promise = contentMutation.update({id: content.id, updated: {...content, type, input:input || '', title}})
    }
    promise?.then(()=>{
        setEditable(false)
    })
  }

  const defaultTitle = {
    'NOTEV2': lang('New Note'),
    'TIMELINEV2': lang('New Timeline')
  } as Record<Content['type'], string>

  const onEdit = ()=>{setEditable(true)}
  useLayoutEffect(()=>{
    if(params.created){
      setEditable(false)
      setInput(defaultTitle[params.type])
    }
    else if (content){
      setEditable(false)
      setInput(content.input)
    }
  }, [content, type])

  useLayoutEffect(() => {
    if (params.created){
      navigation.setOptions({
        headerShown:false,
      })
    }
    else {
        navigation.setOptions({
            title: content?.title || lang("All Timelines"),
            headerRight: () => <View style={{flexDirection: 'row'}}>
              {content?.type==='NOTEV2' && <CommonButton title={'⊕'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>navigate('NoteScreen', {parentId:content.id})}/>}
              {(!content && !params.created) ? 
                <CommonButton title={'⊕'} style={{height:40, paddingTop:8, marginRight:10}} onPress={()=>navigate('ContentListScreen', {type:"TIMELINEV2"})}/>:
                <CommonButton title={'✏️'} style={{height:40, paddingTop:8, marginRight:10}} onPress={onEdit}/>}
            </View>,
            headerShown: !editable
          });
      }
  }, [navigation, content, type, editable]);

  const editableExact = (params.created || editable)

  return <ThemedView style={{width:"100%", height:"100%", backgroundColor:'transparent'}}>
    {editableExact?
      <>
        {input!==undefined && <TextInput mode='outlined' value={input} onChangeText={setInput} style={{borderRadius:20, margin:1}}/>}
        <CommonButton title={lang('save')} onPress={onSave} style={{height:65, paddingVertical:20}}/>
        <CommonButton title={lang('cancel')} onPress={params.created?back:()=>setEditable(false)} style={{height:65, paddingVertical:20}}/>
        {content && <CommonButton title={lang('delete')} textStyle={{color:'red'}} style={{height:65, paddingVertical:20}} onPress={()=>contentMutation.delete(content.id).then(v=>back())}/>}
      </>:
      <ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1}}>
        {content && <ContentList parentContent={content}/>}
      </ScrollView>}
    </ThemedView>
}
