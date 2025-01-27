import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import Editor from '../lib/tinymce/Editor';
import { EditorProps } from '../types';
// import Editor from '../lib/tinymce/EditorView';


export default (props:EditorProps & {active:boolean}) => {
	const [ready, setReady] = useState<boolean>(false)
  useEffect(()=>{
    if(!props.active)
      setReady(false)
  }, [props.active])
  return <View style={props.active?{flex:1, height:'100%'}:{display:'none'}}>
    	  <Editor
          theme={props.theme}
          value={props.value}
          setValue={props.setValue}
          onReady={()=>{
            if(!ready){
              setReady(true); props.onReady?.()
            }
          }}/>
      </View>
};