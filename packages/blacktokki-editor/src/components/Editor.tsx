import React, { useState, useEffect } from 'react';
import { View } from 'react-native';

import Tinymce from '../lib/TinymceWeb';
import { AutoCompleteProps, EditorProps } from '../types';

export default (
  props: EditorProps & AutoCompleteProps & { active: boolean; setValue: (v: string) => void }
) => {
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
        autoResize={props?.autoResize}
        pasteAutocomplete={props?.pasteAutocomplete}
        autoComplete={props?.autoComplete}
        onReady={() => {
          if (!ready) {
            setReady(true);
          }
        }}
      />
    </View>
  );
};
