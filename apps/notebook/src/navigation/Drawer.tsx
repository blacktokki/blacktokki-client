import React from 'react';
import ContentGroupSection, { AddNoteButton } from '../screens/main/home/ContentGroupSection';
import { ScrollView } from 'react-native';
import { List } from 'react-native-paper';
import { useLangContext, View } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';

export default ()=>{
    const {lang} = useLangContext()
    return <View style={{flex:1}}>
        <List.Item left={_props=><List.Icon {..._props} icon={"home"} />} title={lang("Home")} onPress={()=>navigate('Home')} />
        <View style={{flex:1}}>
            <View style={{minHeight:'35%', maxHeight:'65%', flexShrink:1, flexGrow:0.1}}>
                <List.Subheader style={{}} selectable={false}>{lang("Open Editors")}</List.Subheader>
                <ScrollView>
                    <ContentGroupSection type={'PAGE'} />
                </ScrollView>
            </View>
            <View style={{minHeight:'35%', maxHeight:'65%', flexShrink:0.1, flexGrow:1}}>
                <View style={{flexDirection:'row'}}>
                    <List.Subheader style={{flex:1}} selectable={false}>{lang("Notes")}</List.Subheader>
                    <AddNoteButton/>
                </View>
                <ScrollView >
                    <ContentGroupSection type={'NOTE'} extra={false} />
                </ScrollView>
            </View>
        </View>
    </View>
}