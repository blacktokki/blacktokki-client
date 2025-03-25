import * as React from 'react';
import { Content } from '../types';
import { navigate } from '@blacktokki/navigation';
import { Text } from '@blacktokki/core';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import useContentList from '../hooks/useContentList';
import { toRaw } from '@blacktokki/editor';

const updatedOffset = new Date().getTimezoneOffset()

const updatedFormat = (_updated:string) => {
  const _date = new Date(_updated)
  _date.setMinutes(_date.getMinutes() - updatedOffset)
  const updated = _date.toISOString().slice(0, 16)
    const date = updated.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return date==today?updated.slice(11):date;
}


const ContentList = ({ parentContent } : { parentContent:Content }) => {
  const data = useContentList(parentContent.id)
  return data && (
    <ScrollView style={{flex:1}}>
      {data.map((item, index)=>{
        return <TouchableOpacity
          key={index}
          style={{flexDirection:'row', justifyContent:'space-between', padding:10, borderBottomWidth:1, borderColor:'gray'}}
          onPress={()=>navigate('NoteScreen', {id:item.id})}
        >
          <View style={{flexShrink:1}}>
              <Text style={{fontSize:18}}>{item.title}</Text>
              <Text style={{fontSize:16, opacity: 0.4}} numberOfLines={1} ellipsizeMode='head'>{toRaw(item.description||'')}</Text>
          </View>
          <View>
              <Text style={{fontSize:14, opacity: 0.4, textAlign:'right'}}>{updatedFormat(item.updated)}</Text>
              <Text style={{fontSize:14, textAlign:'right'}}></Text>
          </View>
        </TouchableOpacity>})}
    </ScrollView>)
};

export default ContentList;