import * as React from 'react';
import { List, TouchableRipple } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';
import { Colors, Text, useColorScheme, useLangContext, useResizeContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import { Content } from '../types';
import MaterialCommunityIcon from 'react-native-paper/src/components/MaterialCommunityIcon';
import { I18nManager } from 'react-native';


type ContentSubGroupProps = {
  timeline: Content
}

type ContentGroupListProps = {
  type: 'LIBRARY' | 'TIMELINE'
}

const getItemPadding = (isLandscape:boolean)=>{
  return isLandscape?5:8
}

const ContentSubGroupList = (props:ContentSubGroupProps) => {
  const theme = useColorScheme()
  const [expanded, setExpanded] = React.useState(false);
  const window = useResizeContext()
  const data = useContentList(expanded?props.timeline.id:undefined);
  const handlePress = () => setExpanded(!expanded);
  const itemPadding = getItemPadding(window==='landscape')
  const Left = ({isExpanded}:{isExpanded:boolean}) => {
    return <MaterialCommunityIcon
        name={isExpanded ? 'chevron-down' : 'chevron-right'}
        color={Colors[theme].text}
        size={24}
        direction={I18nManager.getConstants().isRTL ? 'rtl' : 'ltr'}
      />
  }
  return <View>
      <List.Accordion
        title={props.timeline.title}
        expanded={expanded && data!==undefined}
        style={{padding:itemPadding}}
        onPress={()=>navigate('ContentListScreen', {id:props.timeline.id})}
        left={(_props)=><List.Icon {..._props} icon={expanded?'chevron-down' : 'chevron-right'} />}
        right={()=>undefined}
      >
        {data && data.map(v=><List.Item key={v.id} left={(_props)=><List.Icon {..._props} icon={"timeline"} />} title={v.title} onPress={()=>navigate('ContentListScreen', {id:v.id})} style={{padding:itemPadding}} />)}
      </List.Accordion>
      <TouchableRipple style={{position:'absolute', justifyContent:'center', paddingLeft: 8 + itemPadding, width:40 + itemPadding * 2, height:40 + itemPadding*2 }} onPress={handlePress}>
          <Left isExpanded={expanded}/>
      </TouchableRipple>
    </View>
}

const ContentGroupList = ( props : ContentGroupListProps) => {
  const data = useContentList(0, props.type);
  const { lang } = useLangContext()
  const window = useResizeContext()
  const itemPadding = getItemPadding(window==='landscape')
  return (
    <List.Section>
      <View style={{flexDirection:'row'}}>
        <List.Subheader style={{flex:1}} selectable={false}>{lang(props.type==='LIBRARY'?"Libraries":"Timelines")}</List.Subheader>
        <TouchableRipple onPress={()=>navigate('ContentListScreen', {type:props.type})}><List.Icon icon='plus' style={{margin:itemPadding}}/></TouchableRipple>
      </View>
        {data && data.map(v=>props.type == 'TIMELINE'?
            <ContentSubGroupList key={v.id} timeline={v}/>:
            <List.Item key={v.id} left={(_props)=><List.Icon {..._props} icon={"library"} />} title={v.title} onPress={()=>navigate('ContentListScreen', {id:v.id})} style={{padding:itemPadding }} />
        )}
    </List.Section>
  );
};

export default ContentGroupList;