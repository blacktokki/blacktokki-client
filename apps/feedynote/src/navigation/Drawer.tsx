import React from 'react';
import ContentGroupList from '../components/ContentGroupList';
import { ScrollView } from 'react-native';
import { List } from 'react-native-paper';
import { useLangContext } from '@blacktokki/core';
import { navigate } from '@blacktokki/navigation';

export default ()=>{
    const {lang} = useLangContext()
    return <ScrollView style={{flex:1}}>
        <List.Item left={_props=><List.Icon {..._props} icon={"home"} />} title={lang("Home")} onPress={()=>navigate('HomeScreen')} />
        <ContentGroupList type={'NOTEV2'}/>
    </ScrollView>
}