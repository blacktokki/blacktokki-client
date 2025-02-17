import React, { useState, useEffect } from 'react';
import { View } from 'react-native';

import Tinymce from '../lib/TinymceWeb';
import { EditorProps } from '../types';

export default (props: EditorProps & { active: boolean }) => {
  const [ready, setReady] = useState<boolean>(false);
  useEffect(() => {
    if (!props.active) setReady(false);
  }, [props.active]);
  return (
    <View style={props.active ? { flex: 1, height: '100%' } : { display: 'none' }}>
      <Tinymce
        theme={props.theme}
        value={props.value}
        setValue={props.setValue}
        onReady={() => {
          if (!ready) {
            setReady(true);
            props.onReady?.();
          }
        }}
      />
    </View>
  );
};
