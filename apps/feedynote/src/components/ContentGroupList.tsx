import * as React from 'react';
import { List, TouchableRipple } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';
import { useLangContext, useResizeContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import {useOpenedContext} from '../hooks/useNotebookContext';

const ContentGroupList = ( props : {type:'NOTEV2'|'PAGE'}) => {
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
  const itemPadding = window==='landscape'?5:8
  return (
    <List.Section>
      <View style={{flexDirection:'row'}}>
        <List.Subheader style={{flex:1}} selectable={false}>{props.type==='NOTEV2'?lang("Notes"):lang("Open Editors")}</List.Subheader>
        {props.type==='NOTEV2' && <TouchableRipple style={{position:'absolute', right:0}} onPress={()=>navigate('ContentListScreen', {type:'NOTEV2'})}><List.Icon icon='plus' style={{margin:itemPadding}}/></TouchableRipple>}
      </View>
        {data && data.map(v=>
          <List.Item key={v.id || v.parentId} left={(_props)=><List.Icon {..._props} icon={props.type==='NOTEV2'?"notebook":"file-document"} />} title={v.title} onPress={()=>navigate(props.type==='NOTEV2'?'ContentListScreen':'NoteScreen', v.id!==undefined?{id:v.id}:{parentId:v.parentId})} style={{padding:itemPadding }} />
        )}
    </List.Section>
  );
};

export default ContentGroupList;