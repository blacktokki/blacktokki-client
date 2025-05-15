import React from 'react';
import ContentGroupSection, { EmptyContentButton, EmptyPageButton } from '../screens/main/home/ContentGroupSection';
import { Platform, ScrollView } from 'react-native';
import { List } from 'react-native-paper';
import { useLangContext, View } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';

export default ()=>{
    const {lang} = useLangContext()
    return <View style={{flex:1}}>
        <List.Item left={_props=><List.Icon {..._props} icon={"home"} />} title={lang("Home")} onPress={()=>navigate('Home')} />
        <EmptyPageButton/>
        <EmptyContentButton/>
        <ScrollView style={Platform.OS==='web'?{scrollbarWidth: 'thin'} as any:{}}>
            <List.Subheader style={{}} selectable={false}>{lang("Open Pages")}</List.Subheader>
            <ContentGroupSection type={'LAST'} />
            <ContentGroupSection type={'PAGE'} />
            <List.Subheader style={{flex:1}} selectable={false}>{lang("Recent Changes")}</List.Subheader>{/* 최근 변경 */}
            <ContentGroupSection type={'NOTE'} noteCount={10}/>
        </ScrollView>
    </View>
}