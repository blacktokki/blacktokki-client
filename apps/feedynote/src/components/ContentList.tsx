import * as React from 'react';
import { Content } from '../types';
import { navigate } from '@blacktokki/navigation';
import { Text, useResizeContext } from '@blacktokki/core';
import { FlatList, ScrollView, TouchableOpacity, View } from 'react-native';
import { TimeLineRow } from './TimeLine';
import { Card } from 'react-native-paper';
import useInfiniteContentList from '../hooks/useInfiniteContentList';

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
  return data.map(v=>({...v, time:{content:updatedFormat(v.updated)}, pressAction: ()=>navigate('NoteScreen', {id:v.id})})).map((item, index)=>{
    return <TimeLineRow 
      key={index}
      event={item}
    /> 
  })
})

const _cardPadding = (isLandscape:boolean) => isLandscape?20:4
const _cardMaxWidth = (isLandscape:boolean) => isLandscape?230:190


const CardPage = React.memo(({data}: {data:Content[]})=>{
  const window  = useResizeContext()
  const cardMaxWidth = _cardMaxWidth(window==="landscape")
  const fSize = window==='landscape'?2:0

  return [...data.sort((a, b)=>a.updated < b.updated?1:-1), null, null]?.map((item, index)=>{
    if (item === null){
      return <View key={index} style={{flexBasis:window==='landscape'?'33%':'50%', maxWidth:cardMaxWidth}}/>
    }
    const content = item.description
    const onPress = ()=>navigate('NoteScreen', {id:item.id})
    return <TouchableOpacity key={index} style={{flexBasis:window==='landscape'?'33%':'50%', padding:_cardPadding(window==='landscape'), paddingRight:0, minWidth:cardMaxWidth, maxWidth:cardMaxWidth}} onPress={onPress}>
        <Card onPress={onPress} style={{aspectRatio:1/Math.sqrt(2), borderRadius:6, marginVertical:10, marginHorizontal:8, overflow:'hidden'}}>
          <Card.Content>
          <Text style={{fontSize:12+fSize, opacity: 0.4}}>{content}</Text>
          </Card.Content>
        </Card>
        <View style={{flexDirection:'row', marginTop:10, justifyContent:'space-between', alignItems:'center', width:'100%'}}>
          <Text style={{fontSize:14+fSize}}>{item.title}</Text>
          <Text style={{fontSize:12+fSize, opacity: 0.4, textAlign:'right'}}>{updatedFormat(item.updated)}</Text>
            
        </View>
    </TouchableOpacity>
  })
})

const ContentList = ({ parentContent } : { parentContent:Content }) => {
  const {data, fetchNextPage} = useInfiniteContentList(parentContent.id, parentContent.type as "NOTEV2" )
  const window  = useResizeContext()
  return data && (
    parentContent.type!=='NOTEV2'?
    <FlatList
      data={data.pages}
      renderItem={({item})=><TimelinePage data={item.current}/>}
      style={{height:0}}
      onEndReached={()=>{
        fetchNextPage()
      }}
    />:
    <ScrollView 
      style={{ height:0}} 
      contentContainerStyle={{flexDirection:'row', justifyContent:'center'}}
    >
      <View style={{backgroundColor:'transparent', flexBasis:'100%', maxWidth:(_cardMaxWidth(window==='landscape') + 5)  * (window==='landscape'?5:3), flexWrap:'wrap', flexDirection:'row', paddingRight:_cardPadding(window==='landscape'), justifyContent:window==='landscape'?undefined:'center'}}>
        {data.pages.map((item, index)=><CardPage key={index} data={item.current}/>)}
      </View>
      {/* {window === 'landscape' && <View style={{backgroundColor:'transparent', flexBasis:'0%', flexGrow:1, maxWidth:240}}></View>} */}
    </ScrollView>)
};

export default ContentList;