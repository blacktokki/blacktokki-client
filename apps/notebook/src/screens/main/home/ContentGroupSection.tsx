import * as React from 'react';
import { List, TouchableRipple } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';

import MaterialCommunityIcon from 'react-native-paper/src/components/MaterialCommunityIcon';
import { Colors, useColorScheme, useLangContext, useResizeContext, View } from '@blacktokki/core';
import { Content } from '../../../types';
import { I18nManager } from 'react-native';
import { useRecentPages, useWikiPages } from '../../../hooks/useWikiStorage';

const getItemPadding = (isLandscape:boolean)=>{
  return isLandscape?5:8
}

const ContentGroupList = (props:{note:Content}) => {
  const theme = useColorScheme()
  const { lang } = useLangContext()
  const [expanded, setExpanded] = React.useState(false);
  const window = useResizeContext()
  const data:any[] = []
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
        title={props.note.title}
        expanded={expanded && data!==undefined}
        style={{padding:itemPadding}}
        onPress={()=>navigate('ContentListScreen', {id:props.note.id})}
        left={(_props)=><List.Icon {..._props} icon={expanded?'chevron-down' : 'chevron-right'} />}
        right={()=>undefined}
      >
        {data && data.slice(0, 10).map(v=><List.Item key={v.id} left={(_props)=><List.Icon {..._props} icon={"file-document"} />} title={v.title} onPress={()=>navigate('NoteScreen', {id:v.id})} style={{padding:itemPadding}} />)}
        {((data?.length || 0) > 10) && <List.Item left={(_props)=><List.Icon {..._props} icon={"file-document-multiple"} />} title={lang("more...")} onPress={()=>navigate("ContentListScreen", {id: props.note.id})} style={{padding:itemPadding}}  />}
      </List.Accordion>
      <TouchableRipple style={{position:'absolute', justifyContent:'center', paddingLeft: 8 + itemPadding, width:40 + itemPadding * 2, height:40 + itemPadding*2 }} onPress={handlePress}>
          <Left isExpanded={expanded}/>
      </TouchableRipple>
    </View>
}

export const AddNoteButton = () => {
  const window = useResizeContext()
  const itemPadding = getItemPadding(window==='landscape')
  return <TouchableRipple style={{position:'absolute', right:0}} onPress={()=>navigate('ContentListScreen', {type:'NOTE'})}><List.Icon icon='plus' style={{margin:itemPadding}}></List.Icon></TouchableRipple>
}


const ContentGroupSection = ( props : {type:'PAGE'}| {type:'NOTE', extra:boolean}) => {
  const { lang } = useLangContext()
  const notes = useWikiPages()
  const pages = useRecentPages()
  const data = (props.type === 'NOTE'? notes:pages).data
  const window = useResizeContext()
  const itemPadding = getItemPadding(window==='landscape')
  return (
    <List.Section>
        {data && data.map(v=>
          (props.type==='NOTE' && props.extra)?
          <ContentGroupList key={v.id} note={v as Content}/>:
          <List.Item key={v.id} left={(_props)=><List.Icon {..._props} icon={props.type==='NOTE'?"notebook":"file-document-edit"} />} title={v.title} onPress={()=>navigate('WikiPage', {title:v.title})} style={{padding:itemPadding }} />
        )}
    </List.Section>
  );
};

export default ContentGroupSection;