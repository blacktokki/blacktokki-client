import * as React from 'react';
import { List } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';
import { Colors, useColorScheme, useLangContext } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import { Content } from '../types';

type ContentGroupListProps = {
  type: 'LIBRARY' | 'TIMELINE',
  timeline?: undefined
} | {
  type: 'FEED'| 'SEARCH',
  timeline: Content
}

const ContentGroupList = ( props : ContentGroupListProps) => {
  const [expanded, setExpanded] = React.useState(props.type!=='FEED');
  const theme = useColorScheme()
  const data = useContentList(expanded?(props.timeline?props.timeline.id:0):undefined, expanded?props.type:undefined);
  const { lang } = useLangContext()
  const handlePress = () => setExpanded(!expanded);
  return (
      <List.Accordion
        title={lang(props.timeline?props.timeline.title:props.type==='LIBRARY'?"Libraries":"Timelines")}
        left={_props => props.timeline?undefined:<List.Icon {..._props} icon={props.type==='LIBRARY'?"library":"timeline"} />}
        expanded={expanded}
        onPress={handlePress}
        style={props.timeline?{backgroundColor:Colors[theme].background}:undefined}
      >
        {props.timeline?undefined:<List.Item title={lang(props.type==='LIBRARY'?'New Library':'New Timeline')} onPress={()=>navigate('ContentListScreen', {type:props.type})} left={()=><List.Icon icon='plus'/>} style={{padding:0}}/>}
        {data && data.map(v=>props.type == 'TIMELINE'?
          <ContentGroupList type={v.type as 'FEED'|'SEARCH'} timeline={v}/>:
          <List.Item key={v.id} title={v.title} onPress={()=>navigate('ContentListScreen', {id:v.id})} style={{padding:10}} />
        )}
      </List.Accordion>
  );
};

export default ContentGroupList;