import React from 'react';
import ContentGroupSection, { AddNoteButton } from '../screens/main/home/ContentGroupSection';
import { ScrollView } from 'react-native';
import { List } from 'react-native-paper';
import { useLangContext, View } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';

export default ()=>{
    const {lang} = useLangContext()
    return <View style={{flex:1}}>
        <List.Item left={_props=><List.Icon {..._props} icon={"home"} />} title={lang("Home")} onPress={()=>navigate('HomeScreen')} />
        <List.Subheader style={{}} selectable={false}>{lang("Open Editors")}</List.Subheader>
        <ScrollView style={{minHeight:'30%', maxHeight:'60%', flexShrink:1, flexGrow:0.1}}>
            <ContentGroupSection type={'PAGE'} />
        </ScrollView>
        <View style={{flexDirection:'row'}}>
            <List.Subheader style={{flex:1}} selectable={false}>{lang("Notes")}</List.Subheader>
            <AddNoteButton/>
        </View>
        <ScrollView style={{minHeight:'30%', maxHeight:'60%', flexShrink:0.1, flexGrow:1}}>
            <ContentGroupSection type={'NOTEV2'} extra={true} />
        </ScrollView>
    </View>
}