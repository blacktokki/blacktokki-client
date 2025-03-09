import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import Tinymce from '../lib/TinymceWeb';
import { EditorProps } from '../types';

const emptyFunction = () => {};

export default React.memo((props: EditorProps & { active: boolean; onPress?: () => void }) => {
  const [ready, setReady] = useState<boolean>(false);
  useEffect(() => {
    if (!props.active) setReady(false);
  }, [props.active]);
  return (
    <View style={props.active ? { flex: 1 } : { flex: 0 }}>
      <View style={{ flex: 1, height: '100%' }}>
        <Tinymce
          readonly
          theme={props.theme}
          value={`<div class="mceNonEditable" style="width:100%;height:100%">${props.value}</div>`}
          setValue={emptyFunction}
          autoResize={props?.autoResize}
          onPress={props.onPress || emptyFunction}
          onReady={() => {
            if (!ready) {
              setReady(true);
              props.onReady?.();
            }
          }}
        />
      </View>
    </View>
  );
});
