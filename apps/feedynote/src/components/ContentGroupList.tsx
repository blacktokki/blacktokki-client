import * as React from 'react';
import { List, TouchableRipple } from 'react-native-paper';
import { navigate } from '@blacktokki/navigation';
import { useLangContext, useResizeContext, View } from '@blacktokki/core';
import useContentList from '../hooks/useContentList';
import useNotebookContext from '../hooks/useNotebookContext';

const ContentGroupList = ( props : {type:'NOTEV2'|'PAGE'}) => {
  const _data = useContentList(undefined, props.type);
  const { openedIds } = useNotebookContext()
  const data = props.type === 'NOTEV2'? _data: _data?.filter(v=>openedIds.has(v.id))
  const { lang } = useLangContext()
  const window = useResizeContext()
  const itemPadding = window==='landscape'?5:8
  return (
    <List.Section>
      <View style={{flexDirection:'row'}}>
        <List.Subheader style={{flex:1}} selectable={false}>{props.type==='NOTEV2'?lang("Notes"):lang("Open Editors")}</List.Subheader>
        {props.type==='NOTEV2' && <TouchableRipple style={{position:'absolute', right:0}} onPress={()=>navigate('ContentListScreen', {type:'NOTEV2'})}><List.Icon icon='plus' style={{margin:itemPadding}}/></TouchableRipple>}
      </View>
        {data && data.map(v=>
          <List.Item key={v.id} left={(_props)=><List.Icon {..._props} icon={props.type==='NOTEV2'?"notebook":"file-document"} />} title={v.title} onPress={()=>navigate(props.type==='NOTEV2'?'ContentListScreen':'NoteScreen', {id:v.id})} style={{padding:itemPadding }} />
        )}
    </List.Section>
  );
};

export default ContentGroupList;