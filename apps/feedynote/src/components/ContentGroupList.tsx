import * as React from 'react';
import { List, TouchableRipple } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';
import { useLangContext, useResizeContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import { Content } from '../types';


type ContentSubGroupProps = {
  timeline: Content
}

type ContentGroupListProps = {
  type: 'NOTEV2' | 'TIMELINEV2'
}

const getItemPadding = (isLandscape:boolean)=>{
  return isLandscape?5:8
}

const ContentGroupList = ( props : ContentGroupListProps) => {
  const data = useContentList(0, props.type);
  const { lang } = useLangContext()
  const window = useResizeContext()
  const itemPadding = getItemPadding(window==='landscape')
  return (
    <List.Section>
      <View style={{flexDirection:'row'}}>
        {props.type==='TIMELINEV2'?
          <TouchableRipple style={{flex:1}} onPress={()=>navigate('ContentListScreen', {id:"*"})}>
            <List.Subheader style={{flex:1, margin:itemPadding-1}} selectable={false}>{lang("Timelines")}</List.Subheader>
          </TouchableRipple>:
          <List.Subheader style={{flex:1}} selectable={false}>{lang("Notes")}</List.Subheader>
        }
        <TouchableRipple style={{position:'absolute', right:0}} onPress={()=>navigate('ContentListScreen', {type:props.type})}><List.Icon icon='plus' style={{margin:itemPadding}}/></TouchableRipple>
      </View>
        {data && data.map(v=>
          <List.Item key={v.id} left={(_props)=><List.Icon {..._props} icon={props.type==='TIMELINEV2'?"timeline":"notebook"} />} title={v.title} onPress={()=>navigate('ContentListScreen', {id:v.id})} style={{padding:itemPadding }} />
        )}
    </List.Section>
  );
};

export default ContentGroupList;