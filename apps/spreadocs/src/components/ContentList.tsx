import * as React from 'react';
import { Content } from '../types';
import { navigate } from '@blacktokki/navigation';
import { Colors, Text, useColorScheme, useResizeContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import { TouchableOpacity } from 'react-native';

const regexForStripHTML = /<\/?[^>]*>/gi;

const headerWidth = 14 * 2

const ContentList = ({ parentContent } : { parentContent:Content }) => {
  const isTimeline = parentContent.type === 'TIMELINE'
  const feedContentData = useContentList(undefined, isTimeline?"FEEDCONTENT":undefined)
  const childrenData = useContentList(parentContent.id)
  const childIds = childrenData? new Set(childrenData.map(v=>v.id)):undefined
  const data = isTimeline? feedContentData?.filter(v=>childIds?.has(v.parentId)) :childrenData

  const window  = useResizeContext()
  const theme = useColorScheme()
  const headerColor = Colors[theme].headerBottomColor
  return <View style={{borderLeftWidth:window=='landscape'?0:1, borderTopWidth:1, borderColor:Colors.borderColor}}>
    <View style={{flexDirection:'row', borderRightWidth:1, borderBottomWidth:1, borderColor:Colors.borderColor}}>
      <View style={{alignItems:'center', justifyContent:'center', width:headerWidth, height:headerWidth, borderRightWidth:1, borderColor:Colors.borderColor, backgroundColor:headerColor}}>
        <View style={{borderWidth:headerWidth/2 -4, width:headerWidth-8, height:headerWidth-8, borderColor:headerColor, borderRightColor:'gray', borderBottomColor:'gray'}}/>
      </View>
      <TouchableOpacity style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor:headerColor}}>
        <Text style={{fontSize:14}}>A</Text>
      </TouchableOpacity>
    </View>
    {data && data.map(v=>{
      const updated = v.updated.slice(0, 16)
      const date = updated.slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      return <View key={v.id} style={{flexDirection:'row', borderRightWidth:1, borderBottomWidth:1, borderColor:Colors.borderColor}}>
        <View style={{justifyContent:'center', alignItems:'center', width:headerWidth, borderRightWidth:1, borderColor:Colors.borderColor, backgroundColor:headerColor}}>
          <Text style={{fontSize:14}}>{v.order}</Text>
        </View>
        <TouchableOpacity onPress={()=>navigate('EditorScreen', {id:v.id})} style={{flex:1}}>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}>
            <Text style={{fontSize:20}}>{v.title}</Text>
            <Text style={{fontSize:14}}>{date==today?updated.slice(11):date}</Text>
          </View>
          <Text>{v.description?.replaceAll(/<hr\s*[\/]?>\n/gi, '').replaceAll(/&nbsp;/gi, ' ').replaceAll(/<br\s*[\/]?>/gi, '\r\n').replaceAll(regexForStripHTML, '')}</Text>
        </TouchableOpacity>
      </View>
    })}
  </View>
};

export default ContentList;