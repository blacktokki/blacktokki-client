import * as React from 'react';
import { Content } from '../types';
import { navigate } from '@blacktokki/navigation';
import { Colors, Text, useColorScheme, useResizeContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import { ScrollView, TouchableOpacity } from 'react-native';
import TimeLine from './TimeLine';
import { Card } from 'react-native-paper';

const regexForStripHTML = /<\/?[^>]*>/gi;

const updatedFormat = (_updated:string) => {
  const updated = _updated.slice(0, 16)
    const date = updated.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return date==today?updated.slice(11):date;
}

const ContentList = ({ parentContent } : { parentContent:Content }) => {
  const isTimeline = parentContent.type === 'TIMELINE'
  const feedContentData = useContentList(undefined, isTimeline?"FEEDCONTENT":undefined)
  const childrenData = useContentList(parentContent.id)
  const childIds = childrenData? new Set(childrenData.map(v=>v.id)):undefined
  const data = (isTimeline? feedContentData?.filter(v=>childIds?.has(v.parentId)) :(childrenData?[...childrenData]:undefined))?.reverse()

  const window  = useResizeContext()
  const theme = useColorScheme()
  const cardPadding = 20
  const cardMaxWidth = 270
  return data && (
    parentContent.type!=='LIBRARY'?//<></>:
    <TimeLine data={data.map(v=>({...v, time:{content:updatedFormat(v.updated)}, pressAction: ()=>navigate('EditorScreen', {id:v.id})}))}/>:
    <ScrollView style={{flex:1, backgroundColor:Colors[theme].background}} contentContainerStyle={{alignItems:'center'}}>
      <View style={{flexWrap:'wrap', flexDirection:'row', paddingRight:cardPadding,justifyContent:'center', maxWidth:1280, width:'100%'}}>
      {[...data, null, null, null]?.map((item, index)=>{
          if (item === null){
            return <View key={index} style={{flexBasis:window==='landscape'?'33%':'50%', maxWidth:cardMaxWidth}}/>
          }
          const content = item.description?.replaceAll(/\n/g, "").replaceAll(/<hr\s*[\/]?>\n/gi, '').replaceAll(/&nbsp;/gi, ' ').replaceAll(/<br\s*[\/]?>/gi, '\r\n').replaceAll(regexForStripHTML, '')
          const onPress = ()=>navigate('EditorScreen', {id:item.id})
          return <TouchableOpacity key={index} style={{flexBasis:window==='landscape'?'33%':'50%', padding:cardPadding, paddingRight:0, maxWidth:cardMaxWidth}} onPress={onPress}>
              <Card onPress={onPress} style={{aspectRatio:1/Math.sqrt(2), borderRadius:6, marginVertical:10, marginHorizontal:8}}>
                <Card.Content style={{overflow:'hidden'}}>
                <Text style={{fontSize:16, opacity: 0.4}}>{content}</Text>
                </Card.Content>
              </Card>
              <View style={{flexDirection:'row', marginTop:10, justifyContent:'space-between', alignItems:'center', width:'100%'}}>
                <Text style={{fontSize:18}}>{item.title}</Text>
                <Text style={{fontSize:14, opacity: 0.4, textAlign:'right'}}>{updatedFormat(item.updated)}</Text>
                  
              </View>
          </TouchableOpacity>
      })}
      </View>
    </ScrollView>)
};

export default ContentList;