import { StackScreenProps } from '@react-navigation/stack';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Editor, EditorHtml } from '@blacktokki/editor';
import  { Colors, CommonButton, View as ThemedView, useColorScheme, useLangContext, useResizeContext } from '@blacktokki/core'

import React, { useState } from 'react';

export default function EditorScreen({ navigation, route }: StackScreenProps<any, 'Login'>) {
  const theme = useColorScheme()
  const { lang } = useLangContext()
  const windowType = useResizeContext()
  const [description, setDescription] = useState('')
  const onSave = ()=>{}
  const onEdit = ()=>{}
  const editable = false;
  return <ThemedView style={{width:"100%", height:"100%"}}>
    <Editor theme={theme} active={editable} value={description} setValue={setDescription}/>
    {editable?<>
            <CommonButton title={lang('save')} onPress={onSave}
                style={{height:65, paddingVertical:20}}
            />
        </>:
        <>
        <TouchableOpacity style={{flex:1, borderColor:Colors[theme].headerBottomColor, borderBottomWidth:1}} onPress={onEdit} onLongPress={onEdit}>
            <EditorHtml content={description}/>
        </TouchableOpacity>
        <ThemedView style={[
            {alignItems:'center', justifyContent:'flex-end', width:'100%',flexDirection:'row'},
            windowType=='landscape'?{bottom:0, paddingTop:15, paddingBottom:10, paddingHorizontal:19}:{backgroundColor:'transparent'}
        ]}>
        {onEdit && <CommonButton title={'✏️'} style={{height:40, paddingTop:8}} onPress={onEdit}/>}
    </ThemedView>
    </>}
    </ThemedView>
}
