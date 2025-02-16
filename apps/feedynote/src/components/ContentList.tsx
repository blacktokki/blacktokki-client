import * as React from 'react';
import { Content } from '../types';
import { navigate } from '@blacktokki/navigation';
import { Colors, Text, useColorScheme, useResizeContext, View } from '@blacktokki/core';
import { FlatList, ScrollView, TouchableOpacity } from 'react-native';
import { TimeLineRow } from './TimeLine';
import { Card } from 'react-native-paper';
import useInfiniteContentList from '../hooks/useInfiniteContentList';

const regexForStripHTML = /<\/?[^>]*>/gi;

const updatedOffset = new Date().getTimezoneOffset()

const updatedFormat = (_updated:string) => {
  const _date = new Date(_updated)
  _date.setMinutes(_date.getMinutes() - updatedOffset)
  const updated = _date.toISOString().slice(0, 16)
    const date = updated.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return date==today?updated.slice(11):date;
}


const TimelinePage = React.memo(({data}: {data:Content[]})=>{
  return data.map(v=>({...v, time:{content:updatedFormat(v.updated)}, pressAction: ()=>navigate('EditorScreen', {id:v.id})})).map((item, index)=>{
    return <TimeLineRow 
      key={index}
      event={item}
    /> 
  })
})

const cardPadding = (isLandscape:boolean) => isLandscape?20:0

const CardPage = React.memo(({data}: {data:Content[]})=>{
  const window  = useResizeContext()
  const cardMaxWidth = window==="landscape"? 230:205

  return [...data]?.map((item, index)=>{
    if (item === null){
      return <View key={index} style={{flexBasis:window==='landscape'?'33%':'50%', maxWidth:cardMaxWidth}}/>
    }
    const content = item.description?.replaceAll(/\n/g, "").replaceAll(/<hr\s*[\/]?>\n/gi, '').replaceAll(/&nbsp;/gi, ' ').replaceAll(/<br\s*[\/]?>/gi, '\r\n').replaceAll(regexForStripHTML, '')
    const onPress = ()=>navigate('EditorScreen', {id:item.id})
    return <TouchableOpacity key={index} style={{flexBasis:window==='landscape'?'33%':'50%', padding:cardPadding(window==='landscape'), paddingRight:0, minWidth:cardMaxWidth, maxWidth:cardMaxWidth}} onPress={onPress}>
        <Card onPress={onPress} style={{aspectRatio:1/Math.sqrt(2), borderRadius:6, marginVertical:10, marginHorizontal:8, overflow:'hidden'}}>
          <Card.Content>
          <Text style={{fontSize:16, opacity: 0.4}}>{content}</Text>
          </Card.Content>
        </Card>
        <View style={{flexDirection:'row', marginTop:10, justifyContent:'space-between', alignItems:'center', width:'100%'}}>
          <Text style={{fontSize:18}}>{item.title}</Text>
          <Text style={{fontSize:14, opacity: 0.4, textAlign:'right'}}>{updatedFormat(item.updated)}</Text>
            
        </View>
    </TouchableOpacity>
  })
})

const ContentList = ({ parentContent } : { parentContent:Content }) => {
  const {data, fetchNextPage} = useInfiniteContentList(parentContent.id, parentContent.type as "TIMELINE" |"LIBRARY"| "FEED" )
  const window  = useResizeContext()
  const theme = useColorScheme()
  return data && (
    parentContent.type!=='LIBRARY'?
    <FlatList
      data={data.pages}
      renderItem={({item})=><TimelinePage data={item.current}/>}
      style={{height:0}}
      onEndReached={()=>{
        fetchNextPage()
      }}
    />:
    <ScrollView 
      style={{backgroundColor:Colors[theme].background, height:0}} 
      contentContainerStyle={{flexDirection:'row', justifyContent:'center'}}
    >
      <View style={{flexBasis:'100%', maxWidth:1280, flexWrap:'wrap', flexDirection:'row', paddingRight:cardPadding(window==='landscape')}}>
        {data.pages.map((item, index)=><CardPage key={index} data={item.current}/>)}
      </View>
      {window === 'landscape' && <View style={{flexBasis:'0%', flexGrow:1, maxWidth:240}}></View>}
    </ScrollView>)
};

export default ContentList;