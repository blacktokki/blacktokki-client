import * as React from 'react';
import { List, TouchableRipple } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';

import MaterialCommunityIcon from 'react-native-paper/src/components/MaterialCommunityIcon';
import { Colors, useColorScheme, useLangContext, useResizeContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import {useOpenedContext} from '../hooks/useNotebookContext';
import { Content } from '../types';
import { I18nManager } from 'react-native';

const getItemPadding = (isLandscape:boolean)=>{
  return isLandscape?5:8
}

const ContentSubGroupList = (props:{note:Content}) => {
  const theme = useColorScheme()
  const [expanded, setExpanded] = React.useState(false);
  const window = useResizeContext()
  const data = useContentList(expanded?props.note.id:undefined);
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
        {(data?.length || 0 > 10) && <List.Item left={(_props)=><List.Icon {..._props} icon={"file-document-multiple"} />} title={"more..."} onPress={()=>navigate("ContentListScreen", {id: props.note.id})} style={{padding:itemPadding}}  />}
      </List.Accordion>
      <TouchableRipple style={{position:'absolute', justifyContent:'center', paddingLeft: 8 + itemPadding, width:40 + itemPadding * 2, height:40 + itemPadding*2 }} onPress={handlePress}>
          <Left isExpanded={expanded}/>
      </TouchableRipple>
    </View>
}


const ContentGroupList = ( props : {type:'PAGE'}| {type:'NOTEV2', extra:boolean}) => {
  const { lang } = useLangContext()
  const notes = useContentList(undefined, 'NOTEV2');
  const pages = useContentList(undefined, props.type==='PAGE'?'PAGE':undefined);
  const { openedIds } = useOpenedContext()
  const data = props.type === 'NOTEV2'? notes:openedIds.map((v)=>v.created?{
    parentId:v.parentId,
    title:lang("New Page") + `(${notes?.find(v2=>v2.id===v.parentId)?.title})`
  }:{
    id:v.id,
    title:pages?.find(v2=>v2.id===v.id)?.title
  })
  const window = useResizeContext()
  const itemPadding = getItemPadding(window==='landscape')
  return (
    <List.Section>
      <View style={{flexDirection:'row'}}>
        <List.Subheader style={{flex:1}} selectable={false}>{props.type==='NOTEV2'?lang("Notes"):lang("Open Editors")}</List.Subheader>
        {props.type==='NOTEV2' && <TouchableRipple style={{position:'absolute', right:0}} onPress={()=>navigate('ContentListScreen', {type:'NOTEV2'})}><List.Icon icon='plus' style={{margin:itemPadding}}/></TouchableRipple>}
      </View>
        {data && data.map(v=>
          (props.type==='NOTEV2' && props.extra)?
          <ContentSubGroupList key={v.id} note={v as Content}/>:
          <List.Item key={v.id || v.parentId} left={(_props)=><List.Icon {..._props} icon={props.type==='NOTEV2'?"notebook":"file-document-edit"} />} title={v.title} onPress={()=>navigate(props.type==='NOTEV2'?'ContentListScreen':'NoteScreen', v.id!==undefined?{id:v.id}:{parentId:v.parentId})} style={{padding:itemPadding }} />
        )}
    </List.Section>
  );
};

export default ContentGroupList;