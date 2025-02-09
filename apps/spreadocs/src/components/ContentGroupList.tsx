import * as React from 'react';
import { List, TouchableRipple } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';
import { Colors, useColorScheme, useLangContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import { Content } from '../types';
import MaterialCommunityIcon from 'react-native-paper/src/components/MaterialCommunityIcon';
import { I18nManager } from 'react-native';

type ContentGroupListProps = {
  type: 'LIBRARY' | 'TIMELINE',
  timeline?: undefined
} | {
  type: 'TIMELINE_SUB',
  timeline: Content
}

const ContentGroupList = ( props : ContentGroupListProps) => {
  const [expanded, setExpanded] = React.useState(props.timeline===undefined);
  const theme = useColorScheme()
  const data = useContentList(expanded?(props.timeline?props.timeline.id:0):undefined, expanded?(props.timeline?undefined:props.type):undefined);
  const { lang } = useLangContext()
  const handlePress = () => setExpanded(!expanded);
  const Right = ({isExpanded}:{isExpanded:boolean}) => {
    return <MaterialCommunityIcon
        name={isExpanded ? 'chevron-up' : 'chevron-down'}
        color={Colors[theme].text}
        size={24}
        direction={I18nManager.getConstants().isRTL ? 'rtl' : 'ltr'}
      />
  }
  return (
    <View>
      <List.Accordion
        title={props.timeline?"........................":lang(props.type==='LIBRARY'?"Libraries":"Timelines")}
        left={_props => props.timeline?undefined:<List.Icon {..._props} icon={props.type==='LIBRARY'?"library":"format-list-group"} />}
        expanded={expanded}
        onPress={props.timeline?undefined:handlePress}
      >
        {props.timeline?undefined:<List.Item title={lang(props.type==='LIBRARY'?'New Library':'New Timeline')} onPress={()=>navigate('ContentListScreen', {type:props.type})} left={()=><List.Icon icon='plus'/>} style={{padding:0}}/>}
        {data && data.map(v=>props.type == 'TIMELINE'?
          <ContentGroupList key={v.id} type={'TIMELINE_SUB'} timeline={v}/>:
          <List.Item key={v.id} title={v.title} onPress={()=>navigate('ContentListScreen', {id:v.id})} style={{padding:10}} />
        )}
      </List.Accordion>
      {props.timeline && <View style={{flexDirection:'row', position:'absolute', width:'100%'}}>
        <List.Item left={_props=><List.Icon {..._props} icon={"timeline"} style={{height:'50%'}}/>} title={props.timeline.title} onPress={()=>navigate('ContentListScreen', {id:props.timeline.id})} style={{flex:1,paddingLeft:0}} />
        <TouchableRipple style={{position:'absolute', right:0, justifyContent:'center', paddingLeft:8, width:40, height:55}} onPress={handlePress}>
                <Right isExpanded={expanded}/>
              </TouchableRipple>
      </View>}
    </View>
  );
};

export default ContentGroupList;