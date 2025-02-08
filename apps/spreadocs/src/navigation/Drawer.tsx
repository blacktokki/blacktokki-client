import React from 'react';
import ContentGroupList from '../components/ContentGroupList';
import { ScrollView } from 'react-native';

export default ()=>{
    return <ScrollView style={{flex:1}}>
        <ContentGroupList type={'TIMELINE'}/>
        <ContentGroupList type={'LIBRARY'}/>
    </ScrollView>
}