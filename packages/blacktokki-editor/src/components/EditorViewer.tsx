import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import Tinymce from '../lib/TinymceWeb';
import { EditorProps } from '../types';

const emptyFunction = () => {};

export default (
  props: EditorProps & { active: boolean; onPress?: () => void; onLink?: (url: string) => void }
) => {
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
          value={props.value}
          setValue={emptyFunction}
          autoResize={props?.autoResize}
          onPress={props.onPress || emptyFunction}
          onLink={props.onLink}
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
};
