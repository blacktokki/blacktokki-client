import React, { useRef, useEffect } from 'react';
import { EditorProps } from '../../types';
import { Platform } from 'react-native';
import WebView from 'react-native-webview';
const PATH = `${process.env.PUBLIC_URL}/editor.html`


export default (props:EditorProps) => {
  const initRef = useRef(false) 
  const webViewRef = useRef<any>(null)
  const setRef = (ref:any)=>{
    if (ref!=null && webViewRef.current == null){
      props.onReady?.()
    }
    webViewRef.current=ref;
  }

  const send = (data:any)=>{
    if(webViewRef.current){
      if (Platform.OS == 'web')
        webViewRef.current.contentWindow.postMessage(data, undefined)
      else
        webViewRef.current.postMessage(data)
    }
  }
  
  const listener = (event:any)=>{
    if(!initRef.current){
      initRef.current = true
      return send(props.value)
    }
    if(Platform.OS == 'web'){
      try{
        props.setValue(event.data)
      }
      catch(e){
      }
    }
    else{
      props.setValue(event.nativeEvent.data)
    }
  }

  
  useEffect(()=>{
      if(Platform.OS == 'web'){
        window.addEventListener('message', listener)
        return ()=>window.removeEventListener('message', listener)
      }
    }, [])

	return Platform.OS == 'web'?
  <iframe ref={setRef} src={PATH} height="100%" width="100%" style={{border:0, minHeight:320}}/>:
  <WebView
          ref={setRef}
          source={{ uri: PATH}}
          originWhitelist={['*']}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabledAndroid
          useWebkit
          startInLoadingState={true}
          style={{flex:1}}
          onMessage={listener}
      />
};
